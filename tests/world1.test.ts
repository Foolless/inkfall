import { describe, expect, test } from 'vitest'
import { loadCampaignLevel } from '../src/content/levels/format.js'
import { tidepools } from '../src/content/levels/w01-tidepools.js'
import { chapterOf } from '../src/content/chapters.js'
import { tilesetOf } from '../src/content/tilesets/index.js'
import { Tile, tileAt } from '../src/game/tilemap.js'
import { createWorld, HINT_FRAMES, update } from '../src/game/world.js'
import { RULES } from '../src/game/constants.js'
import { blank, TILE } from './helpers.js'

const level = loadCampaignLevel(tidepools)
const count = (type: string) => level.entities.filter((e) => e.type === type).length

/**
 * World 1 against its own beat sheet (PRD §7.2).
 *
 * These are content assertions, not engine ones. They exist because a level is
 * edited far more often than it is read, and the cheapest way to notice that a
 * conch has drifted or a Drifter has been deleted is to say out loud what the
 * room is supposed to contain.
 */
describe('the shape of the level', () => {
  test('it loads as a campaign level, with everything that implies', () => {
    expect(() => loadCampaignLevel(tidepools)).not.toThrow()
  })

  test('its id is stable, and save data keys on it', () => {
    expect(tidepools.id).toBe('w01-tidepools')
  })

  test('it belongs to a chapter that owns a tileset, and declares none itself', () => {
    const chapter = chapterOf(tidepools.chapter)
    expect(tilesetOf(chapter.tileset)).not.toBeNull()
    expect((tidepools as unknown as Record<string, unknown>).tileset).toBeUndefined()
  })

  test('it runs three to five minutes, so par is set for that', () => {
    expect(tidepools.par).toBeGreaterThanOrEqual(180)
    expect(tidepools.par).toBeLessThanOrEqual(360)
  })

  test('two conches through the level and one at the boss door', () => {
    expect(level.checkpoints).toHaveLength(RULES.CHECKPOINTS_PER_LEVEL + 1)
  })

  test('it ends in the Hermit King', () => {
    expect(tidepools.boss).toBe('hermitKing')
  })
})

describe('the roster is World 1 and only World 1', () => {
  test('Snapper, Drifter and Puffer, and nothing from a later world', () => {
    const kinds = new Set(level.entities.map((e) => e.type))
    expect(kinds.has('snapper')).toBe(true)
    expect(kinds.has('drifter')).toBe(true)
    expect(kinds.has('puffer')).toBe(true)
    for (const k of kinds) {
      expect(['snapper', 'drifter', 'puffer', 'clam', 'shell', 'pearl', 'inkBulb', 'inkCore', 'hint']).toContain(k)
    }
  })

  test('every hazard World 1 promises is somewhere in the grid', () => {
    const present = new Set(level.map.tiles)
    expect(present.has(Tile.HAZARD), 'urchins').toBe(true)
    expect(present.has(Tile.CRUMBLE), 'collapsing sand').toBe(true)
    expect(present.has(Tile.WATER), 'the tide pool').toBe(true)
    expect(count('clam'), 'crush clams').toBe(3)
  })
})

describe('the beats', () => {
  /** PRD §7.1: no enemies on the first screen. Ever. */
  test('the first screen is empty of enemies', () => {
    const firstScreen = level.entities.filter(
      (e) => e.x < 20 && ['snapper', 'drifter', 'puffer', 'clam'].includes(e.type),
    )
    expect(firstScreen).toEqual([])
  })

  test('A1 opens on a gap a run jump cannot clear', () => {
    // Row 19 is the main floor. Measure the first contiguous hole in it.
    let width = 0
    for (let x = 0; x < 40; x++) {
      if (tileAt(level.map, x, 19) === Tile.SOLID) {
        if (width > 0) break
      } else width++
    }
    expect(width).toBeGreaterThan(4) // a full-run jump clears four
    expect(width).toBeLessThanOrEqual(6)
  })

  test('A2 stacks three ledges four tiles apart, which only an up-dash climbs', () => {
    const topOf = (x: number) => {
      for (let y = 0; y < level.map.height; y++) if (tileAt(level.map, x, y) === Tile.SOLID) return y
      return -1
    }
    expect(topOf(36)).toBe(15)
    expect(topOf(43)).toBe(11)
    // x48 rather than 50: the pearl shelf hangs above the middle of this ledge.
    expect(topOf(48)).toBe(7)
  })

  test('the Ink Bulb is taught in A4, before anything has taken a tier off you', () => {
    const firstBulb = level.entities.filter((e) => e.type === 'inkBulb').sort((a, b) => a.x - b.x)[0]!
    expect(firstBulb.x).toBeLessThan(94) // still in section A
  })

  test('B3 is a two-tile tunnel, so a Puffer cannot simply be jumped over', () => {
    // Above the Puffers, the ceiling comes down to row 16.
    expect(tileAt(level.map, 168, 16)).toBe(Tile.SOLID)
    expect(tileAt(level.map, 168, 17)).toBe(Tile.EMPTY)
    expect(tileAt(level.map, 168, 18)).toBe(Tile.EMPTY)
  })

  test('C1 hangs its collapsing bridge directly over the urchins', () => {
    expect(tileAt(level.map, 193, 17)).toBe(Tile.CRUMBLE)
    expect(tileAt(level.map, 193, 20)).toBe(Tile.HAZARD)
  })

  test('the clams are offset, so three of them are a rhythm rather than three copies', () => {
    const phases = level.entities
      .filter((e): e is typeof e & { type: 'clam' } => e.type === 'clam')
      .map((c) => c.phase ?? 0)
    expect(new Set(phases).size).toBe(3)
  })

  /** The level's thesis: four gaps, and a Snapper standing on the pip you need. */
  test('C3 puts a Snapper on one of the gauntlet platforms', () => {
    const gauntlet = level.entities.filter((e) => e.type === 'snapper' && e.x > 250)
    expect(gauntlet).toHaveLength(1)
    expect(tileAt(level.map, gauntlet[0]!.x, 19)).toBe(Tile.SOLID)
  })

  test('the last gap is the widest in the level', () => {
    const holes: number[] = []
    let run = 0
    for (let x = 0; x < level.map.width; x++) {
      if (tileAt(level.map, x, 19) === Tile.SOLID) {
        if (run > 0) holes.push(run)
        run = 0
      } else run++
    }
    const gauntlet = holes.slice(-4)
    expect(Math.max(...gauntlet)).toBe(gauntlet[gauntlet.length - 1])
  })
})

describe('the collectibles', () => {
  test('three pearls, one per slot', () => {
    const ids = level.entities.filter((e): e is typeof e & { type: 'pearl' } => e.type === 'pearl').map((p) => p.id)
    expect(ids.sort()).toEqual([0, 1, 2])
  })

  test('Ink Bulbs sit inside the PRD range, and one lands soon after each conch', () => {
    const bulbs = level.entities.filter((e) => e.type === 'inkBulb').map((e) => e.x)
    expect(bulbs.length).toBeGreaterThanOrEqual(RULES.INK_BULBS_PER_LEVEL[0])
    expect(bulbs.length).toBeLessThanOrEqual(RULES.INK_BULBS_PER_LEVEL[1])
    // "Within ~15 seconds" of a conch. At run speed that is well over a
    // hundred tiles; 45 is a much tighter reading of the same rule.
    for (const conch of level.checkpoints.map((c) => c.x)) {
      if (conch > level.map.width - 45) continue // the boss door needs no bulb
      const after = bulbs.filter((x) => x > conch && x < conch + 45)
      expect(after.length, `nothing within 45 tiles of the conch at ${conch}`).toBeGreaterThan(0)
    }
  })

  /** W1's only Ink Core is a secret, per §4.4 — hidden-only in Worlds 1 and 2. */
  test('the single Ink Core is hidden behind the Deep Jet gap, not on the path', () => {
    const cores = level.entities.filter((e) => e.type === 'inkCore')
    expect(cores).toHaveLength(1)
    expect(cores[0]!.x).toBeGreaterThan(220)
  })

  /** §7.1: never immediately before a boss door. */
  test('no Ink Core sits near the boss door', () => {
    const door = level.checkpoints[level.checkpoints.length - 1]!.x
    for (const core of level.entities.filter((e) => e.type === 'inkCore')) {
      expect(door - core.x).toBeGreaterThan(40)
    }
  })

  test('shells are laid along the route rather than heaped in one place', () => {
    const xs = level.entities.filter((e) => e.type === 'shell').map((e) => e.x)
    expect(xs.length).toBeGreaterThan(15)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(level.map.width * 0.8)
  })
})

describe('the only words in the game', () => {
  /** PRD §11.3: no tutorial screens, no text boxes. Key hints, once each. */
  test('the prompts sit at the lessons they name', () => {
    const hints = tidepools.hints ?? []
    expect(hints.map((h) => h.text)).toEqual(['[X] INK DASH', 'HOLD \u2191 + X TO DASH UP'])
    // The dash prompt is at A1's gap; the up-dash prompt is at A2's first ledge.
    expect(hints[0]!.tx).toBeGreaterThan(6)
    expect(hints[0]!.tx).toBeLessThan(14)
    expect(hints[1]!.tx).toBeGreaterThan(28)
    expect(hints[1]!.tx).toBeLessThan(34)
  })

  test('each shows once, for three seconds, and never again', () => {
    const w = createWorld(level)
    const hint = w.hints[0]!
    w.player.x = hint.tx * TILE
    w.player.y = hint.ty * TILE
    update(w, blank())
    expect(hint.frames).toBeGreaterThan(0)

    for (let i = 0; i < HINT_FRAMES + 2; i++) update(w, blank())
    expect(hint.frames).toBe(0)
    expect(hint.spent).toBe(true)

    // Walk back over it: nothing. A prompt that reappears reads as a nag.
    w.player.x = hint.tx * TILE
    w.player.y = hint.ty * TILE
    update(w, blank())
    expect(hint.frames).toBe(0)
  })

  test('a hint out of range stays quiet', () => {
    const w = createWorld(level)
    for (let i = 0; i < 30; i++) update(w, blank())
    expect(w.hints[1]!.frames).toBe(0)
  })
})

describe('it actually runs', () => {
  test('the world builds and steps without throwing', () => {
    const w = createWorld(level)
    expect(w.enemies.length).toBeGreaterThan(0)
    expect(w.clams).toHaveLength(3)
    for (let i = 0; i < 600; i++) update(w, blank())
    expect(w.frame).toBeGreaterThan(0)
  })

  test('Nib starts on solid footing and is still alive a second later', () => {
    const w = createWorld(level)
    for (let i = 0; i < 60; i++) update(w, blank())
    expect(w.player.alive).toBe(true)
    expect(w.player.grounded).toBe(true)
  })

  test('nothing spawns on top of anything else', () => {
    const w = createWorld(level)
    for (let i = 0; i < w.enemies.length; i++) {
      for (let j = i + 1; j < w.enemies.length; j++) {
        const a = w.enemies[i]!
        const b = w.enemies[j]!
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
        expect(overlap, `${a.kind} and ${b.kind} overlap at spawn`).toBe(false)
      }
    }
  })
})
