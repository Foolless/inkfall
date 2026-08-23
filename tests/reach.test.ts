import { describe, expect, test } from 'vitest'
import { analyseReach, clearanceTiles, ENVELOPES } from '../src/game/reach.js'
import { loadCampaignLevel, loadLevel, type LevelDef } from '../src/content/levels/format.js'
import { campaign } from '../src/content/levels/index.js'
import { CHARGED_TIER, FULL, SPENT } from '../src/game/constants.js'
import { levelFrom } from './helpers.js'

const analyse = (tiles: string[], opts = {}, entities: LevelDef['entities'] = []) =>
  analyseReach(loadLevel(levelFrom(tiles, 'reach', entities)), opts)

/**
 * The solver's own behaviour, before it is trusted with a real level.
 *
 * A completability test that is wrong in the permissive direction is worse than
 * no test at all: it blesses a level nobody can finish. So these check the
 * *refusals* as hard as the successes.
 */
describe('what one flight can and cannot cross', () => {
  const gapOf = (n: number) => ['S' + '.'.repeat(n + 9), '#'.repeat(1) + '.'.repeat(n) + '#'.repeat(9)]

  test('a four-tile jump needs no ink', () => {
    const r = analyse(gapOf(3), { tier: SPENT })
    expect(r.reachable.size).toBeGreaterThan(1)
  })

  test('a gap wider than a run jump but inside one dash is crossable on two pips', () => {
    // dx 7 is exactly feel guarantee 2: standing jump plus one horizontal dash.
    const wide = ['S' + '.'.repeat(15), '#' + '.'.repeat(6) + '#'.repeat(9)]
    const r = analyse(wide, { tier: SPENT })
    const far = [...r.reachable].some((id) => id % 16 >= 7)
    expect(far).toBe(true)
  })

  test('a gap beyond two pips is refused at Spent and allowed at Full', () => {
    // dx 11: past the two-pip span of 10, inside the three-pip span of 13.
    const chasm = ['S' + '.'.repeat(19), '#' + '.'.repeat(10) + '#'.repeat(9)]
    const columnsOf = (tier: typeof SPENT | typeof FULL) => {
      const r = analyse(chasm, { tier })
      return Math.max(...[...r.reachable].map((id) => id % 20))
    }
    expect(columnsOf(SPENT)).toBeLessThan(11)
    expect(columnsOf(FULL)).toBeGreaterThanOrEqual(11)
  })

  test('the envelopes never shrink as pips are added', () => {
    for (let i = 1; i < ENVELOPES.length; i++) {
      const prev = ENVELOPES[i - 1]!
      const next = ENVELOPES[i]!
      expect(next.up).toBeGreaterThanOrEqual(prev.up)
      expect(next.span).toBeGreaterThanOrEqual(prev.span)
      expect(next.fallSpan).toBeGreaterThanOrEqual(prev.fallSpan)
    }
  })

  /** Rounded down from the feel guarantees, on purpose. */
  test('the no-ink envelope understates the run jump rather than overstating it', () => {
    expect(ENVELOPES[0]!.span).toBeLessThanOrEqual(4)
    expect(ENVELOPES[0]!.up).toBeLessThanOrEqual(3)
    expect(ENVELOPES[1]!.span).toBeLessThanOrEqual(7)
    expect(ENVELOPES[1]!.up).toBeLessThanOrEqual(6)
  })
})

describe('terrain the solver must respect', () => {
  test('a wall between two ledges blocks the flight', () => {
    const walled = ['S...#.....', '....#.....', '####.#####']
    const r = analyse(walled, { tier: SPENT })
    const beyond = [...r.reachable].some((id) => id % 10 > 4)
    expect(beyond).toBe(false)
  })

  test('a one-tile-thick slab can be landed on — a straight-line check could not', () => {
    // The line from the floor to the top of the slab passes through the slab.
    const slab = ['S.........', '..........', '...###....', '..........', '##########']
    const r = analyse(slab, { tier: SPENT })
    const onSlab = r.reachable.has(1 * 10 + 4)
    expect(onSlab).toBe(true)
  })

  test('urchins are never stood on and never flown through', () => {
    const spikes = ['S.........', '..........', '####^^####']
    const r = analyse(spikes, { tier: SPENT })
    for (const id of r.reachable) {
      const x = id % 10
      const y = Math.floor(id / 10)
      expect(y === 1 && (x === 4 || x === 5)).toBe(false)
    }
  })

  test('water is standable and swimming is free in every direction', () => {
    const pool = ['S.........', '.~~~~~~~~.', '.~~~~~~~~.', '##########']
    const r = analyse(pool, { tier: SPENT })
    expect(r.reachable.has(2 * 10 + 8)).toBe(true)
  })

  test('crumbling sand counts as footing — it holds for 24 frames', () => {
    const bridge = ['.S........', '.cccccccc.', '..........', '..........']
    const r = analyse(bridge, { tier: SPENT })
    const acrossTheBridge = [...r.reachable].filter((id) => Math.floor(id / 10) === 0).length
    expect(acrossTheBridge).toBeGreaterThan(5)
  })

  test('a level whose start is in the void reports nothing reachable', () => {
    const r = analyse(['S.........', '..........'], { tier: SPENT })
    expect(r.reachable.size).toBe(0)
    expect(r.reachedExit).toBe(false)
  })
})

/**
 * The tier that was supposed to be the difference, and is not.
 *
 * Full is 12x14 and Spent is 10x10 against 16px tiles, so both fit through a
 * one-tile opening. PRD §7.1's small-only passages cannot be built from plain
 * geometry at these numbers. The solver derives this from the hitbox rather
 * than assuming it, so it will start telling the truth on its own the day the
 * tier boxes change.
 */
describe('clearance', () => {
  test('every drawn tier needs exactly one clear tile', () => {
    expect(clearanceTiles(SPENT)).toBe(1)
    expect(clearanceTiles(FULL)).toBe(1)
    expect(clearanceTiles(CHARGED_TIER)).toBe(1)
  })

  test('so a one-tile gap does not exclude Full Nib', () => {
    const crawl = ['S.........', '##.....###', '..........', '##########']
    const spent = analyse(crawl, { tier: SPENT }).reachable.size
    const full = analyse(crawl, { tier: FULL }).reachable.size
    expect(full).toBe(spent)
  })
})

/**
 * The gate itself. Every shipped level, at two pips, in CI on every push.
 *
 * A player can always arrive at any section Spent, so a section that needs
 * three pips is a genuine unfairness bug — and it is invisible to a developer
 * who always plays at Full.
 */
describe('every campaign level is completable at the Spent tier', () => {
  for (const def of campaign()) {
    describe(def.id, () => {
      const level = loadCampaignLevel(def)

      test('reaches the exit or the boss door on two pips', () => {
        const r = analyseReach(level, { tier: SPENT })
        expect(r.maxPips).toBe(2)
        expect(r.reachedExit).toBe(true)
      })

      test('every conch can be touched on two pips', () => {
        expect(analyseReach(level, { tier: SPENT }).reachedCheckpoints).toBe(true)
      })

      test('every Ink Bulb and Ink Core can be got to at the tier that needs it', () => {
        const r = analyseReach(level, { tier: FULL, upgrades: ['deepJet'] })
        const width = level.map.width
        const missed = level.entities
          .filter((e) => e.type === 'inkBulb' || e.type === 'inkCore')
          .filter((e) => {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) if (r.reachable.has((e.y + dy) * width + e.x + dx)) return false
            }
            return true
          })
        expect(missed).toEqual([])
      })

      test('runs inside the CI budget', () => {
        const started = process.hrtime.bigint()
        analyseReach(level, { tier: SPENT })
        const ms = Number(process.hrtime.bigint() - started) / 1e6
        // PRD §12.7 budgets 30s for five levels now and 2 min at fifty.
        expect(ms).toBeLessThan(2_000)
      })
    })
  }
})

describe('World 1 pearls', () => {
  const level = loadCampaignLevel(campaign().find((d) => d.id === 'w01-tidepools')!)

  test('the first two are findable on the run that meets them', () => {
    expect(analyseReach(level, { tier: SPENT }).unreachablePearls).toEqual([2])
  })

  /**
   * PRD §7.2: pearl 3 is across a twelve-tile gap and needs Deep Jet, earned in
   * World 5. This is the assertion that the backtracking engine actually has
   * something to unlock — without it, "requires a later upgrade" is a comment.
   */
  test('the third needs Deep Jet, and is out of reach at every tier without it', () => {
    expect(analyseReach(level, { tier: SPENT }).unreachablePearls).toContain(2)
    expect(analyseReach(level, { tier: FULL }).unreachablePearls).toContain(2)
    expect(analyseReach(level, { tier: CHARGED_TIER }).unreachablePearls).toContain(2)
    expect(analyseReach(level, { tier: FULL, upgrades: ['deepJet'] }).unreachablePearls).toEqual([])
  })
})
