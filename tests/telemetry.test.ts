import { describe, expect, test } from 'vitest'
import {
  BANDS_PER_STRETCH,
  createTelemetry,
  formatReport,
  levelStats,
  observe,
  recordAttempt,
  recordClear,
  report,
  sectionAt,
  sectionRange,
  type Sample,
} from '../src/game/telemetry.js'
import { clearTelemetry, loadTelemetry, TELEMETRY_KEY, writeTelemetry } from '../src/engine/playtest.js'
import type { StorageLike } from '../src/engine/save.js'

/**
 * The playtest harness. PLAN.md Gate 3: "instrument deaths per section during
 * this run; that data drives Phase 4's tuning."
 *
 * Gate 3 round one came back as "I haven't been able to beat it yet" — true,
 * and unactionable, because it names no room. What these tests protect is the
 * property that makes the log worth having: a death is attributed to *where the
 * player was standing when it happened*, not to where they respawned.
 */

const CHECKPOINTS = [30, 60, 90]
const WIDTH = 120

function sample(over: Partial<Sample> = {}): Sample {
  return {
    level: 'w01-tidepools',
    checkpoints: CHECKPOINTS,
    widthTiles: WIDTH,
    x: 0,
    y: 0,
    tile: 16,
    deaths: 0,
    tier: 1,
    assist: false,
    ...over,
  }
}

describe('sections are derived, not authored', () => {
  /**
   * A level's beats live in a comment at the top of its file. Rather than a
   * field five levels would have to declare — §12.7 forbids per-level code —
   * the conches cut the level up and each stretch is split into bands.
   */
  test('the conches cut a level into one more stretch than there are of them', () => {
    expect(sectionAt('x', 0, CHECKPOINTS, WIDTH).stretch).toBe(0)
    expect(sectionAt('x', 35, CHECKPOINTS, WIDTH).stretch).toBe(1)
    expect(sectionAt('x', 65, CHECKPOINTS, WIDTH).stretch).toBe(2)
    expect(sectionAt('x', 100, CHECKPOINTS, WIDTH).stretch).toBe(3)
  })

  test('each stretch is split into bands', () => {
    expect(sectionAt('x', 1, CHECKPOINTS, WIDTH).band).toBe(0)
    expect(sectionAt('x', 15, CHECKPOINTS, WIDTH).band).toBe(1)
    expect(sectionAt('x', 29, CHECKPOINTS, WIDTH).band).toBe(2)
  })

  test('a band reports the tiles it covers, so a number can be read against a level', () => {
    const range = sectionRange({ level: 'x', stretch: 1, band: 0 }, CHECKPOINTS, WIDTH)
    expect(range).toEqual({ fromTile: 30, toTile: 40 })
  })

  test('the far edge of the level lands in the last band, not off the end', () => {
    const at = sectionAt('x', WIDTH, CHECKPOINTS, WIDTH)
    expect(at.stretch).toBe(3)
    expect(at.band).toBe(BANDS_PER_STRETCH - 1)
  })

  test('a level with no conches at all is still one stretch', () => {
    expect(sectionAt('x', 50, [], 100)).toEqual({ level: 'x', stretch: 0, band: 1 })
  })

  test('a position before the start clamps rather than going negative', () => {
    expect(sectionAt('x', -20, CHECKPOINTS, WIDTH).band).toBe(0)
  })
})

describe('a death is charged to where it happened', () => {
  /**
   * The whole reason the position is sampled every frame rather than read when
   * the counter moves: by the time the death is visible, the player is standing
   * at a checkpoint somewhere else entirely.
   */
  test('not to where the player respawned', () => {
    const t = createTelemetry()
    // Playing at tile 70 — stretch 2.
    observe(t, sample({ x: 70 * 16, deaths: 0 }), null)
    // Died, and by the time this is seen he is back at tile 60.
    observe(t, sample({ x: 60 * 16, deaths: 1 }), { deaths: 0, tier: 1 })

    const worst = report(t).worst
    expect(worst).toHaveLength(1)
    expect(worst[0]!.stretch).toBe(2)
    expect(worst[0]!.deaths).toBe(1)
  })

  test('several deaths in one place add up', () => {
    const t = createTelemetry()
    let deaths = 0
    for (let i = 0; i < 5; i++) {
      observe(t, sample({ x: 45 * 16, deaths }), { deaths, tier: 1 })
      deaths++
      observe(t, sample({ x: 45 * 16, deaths }), { deaths: deaths - 1, tier: 1 })
    }
    expect(report(t).worst[0]!.deaths).toBe(5)
    expect(levelStats(t, 'w01-tidepools').deaths).toBe(5)
  })

  test('the first frame of a level cannot invent a death', () => {
    const t = createTelemetry()
    observe(t, sample({ deaths: 7 }), null)
    expect(report(t).totals.deaths).toBe(0)
  })

  test('a tier drop is a hit; a tier gain is an Ink Bulb and is not', () => {
    const t = createTelemetry()
    observe(t, sample({ x: 20 * 16, tier: 1 }), { deaths: 0, tier: 2 })
    expect(report(t).totals.hits).toBe(1)

    observe(t, sample({ x: 20 * 16, tier: 2 }), { deaths: 0, tier: 1 })
    expect(report(t).totals.hits).toBe(1)
  })
})

describe('the report answers one question first', () => {
  test('the worst section is the first line', () => {
    const t = createTelemetry()
    const die = (tile: number, times: number) => {
      let deaths = levelStats(t, 'w01-tidepools').deaths
      for (let i = 0; i < times; i++) {
        observe(t, sample({ x: tile * 16, deaths }), { deaths, tier: 1 })
        observe(t, sample({ x: tile * 16, deaths: deaths + 1 }), { deaths, tier: 1 })
        deaths++
      }
    }
    die(10, 2)
    die(70, 9)
    die(100, 4)

    const worst = report(t).worst
    expect(worst[0]!.deaths).toBe(9)
    expect(worst[0]!.stretch).toBe(2)
    expect(worst[1]!.deaths).toBe(4)
  })

  test('sections nothing happened in are left out', () => {
    const t = createTelemetry()
    observe(t, sample({ x: 10 * 16 }), null)
    expect(report(t).worst).toEqual([])
  })

  test('attempts, clears and pearls are counted per level', () => {
    const t = createTelemetry()
    recordAttempt(t, 'w02-kelp')
    recordAttempt(t, 'w02-kelp')
    recordClear(t, 'w02-kelp', 2)
    const stats = report(t).levels.find((l) => l.level === 'w02-kelp')!
    expect(stats.attempts).toBe(2)
    expect(stats.clears).toBe(1)
    expect(stats.pearlsFound).toBe(2)
  })

  /** A later run that found fewer pearls must not lower the count. */
  test('the pearl count is the best any attempt managed', () => {
    const t = createTelemetry()
    recordClear(t, 'w02-kelp', 3)
    recordClear(t, 'w02-kelp', 1)
    expect(levelStats(t, 'w02-kelp').pearlsFound).toBe(3)
  })

  /** A run played on Assist is not evidence about the classic difficulty. */
  test('a level is flagged if any attempt at it was assisted', () => {
    const t = createTelemetry()
    observe(t, sample({ level: 'w03-ship', assist: false }), null)
    expect(levelStats(t, 'w03-ship').assisted).toBe(false)
    observe(t, sample({ level: 'w03-ship', assist: true }), { deaths: 0, tier: 1 })
    expect(levelStats(t, 'w03-ship').assisted).toBe(true)
  })

  test('it formats as something readable without a spreadsheet', () => {
    const t = createTelemetry('2026-08-24T10:00')
    recordAttempt(t, 'w01-tidepools')
    observe(t, sample({ x: 70 * 16, deaths: 0 }), null)
    observe(t, sample({ x: 70 * 16, deaths: 1 }), { deaths: 0, tier: 1 })

    const text = formatReport(report(t))
    expect(text).toContain('INKFALL playtest')
    expect(text).toContain('w01-tidepools')
    expect(text).toContain('WORST SECTIONS')
  })
})

describe('the log survives a tab being closed', () => {
  class Mem implements StorageLike {
    data = new Map<string, string>()
    getItem(k: string): string | null {
      return this.data.get(k) ?? null
    }
    setItem(k: string, v: string): void {
      this.data.set(k, v)
    }
    removeItem(k: string): void {
      this.data.delete(k)
    }
  }

  function seeded() {
    const t = createTelemetry('2026-08-24T10:00')
    recordAttempt(t, 'w01-tidepools')
    observe(t, sample({ x: 70 * 16, deaths: 0 }), null)
    observe(t, sample({ x: 70 * 16, deaths: 1 }), { deaths: 0, tier: 1 })
    return t
  }

  test('it round-trips through storage', () => {
    const store = new Mem()
    const t = seeded()
    expect(writeTelemetry(store, t)).toBe(true)

    const back = loadTelemetry(store)!
    expect(back.startedAt).toBe('2026-08-24T10:00')
    expect(report(back).totals.deaths).toBe(1)
    expect(report(back).worst[0]!.stretch).toBe(2)
  })

  /** Its own key, like the ghosts. A playtest log is not worth a save file. */
  test('it never writes to the save key', () => {
    const store = new Mem()
    writeTelemetry(store, seeded())
    expect([...store.data.keys()]).toEqual([TELEMETRY_KEY])
  })

  test('nothing stored means nothing loaded, not a crash', () => {
    expect(loadTelemetry(new Mem())).toBeNull()
  })

  test('junk is discarded rather than repaired', () => {
    const store = new Mem()
    store.setItem(TELEMETRY_KEY, 'not json')
    expect(loadTelemetry(store)).toBeNull()

    store.setItem(TELEMETRY_KEY, JSON.stringify({ startedAt: 'x' }))
    expect(loadTelemetry(store)).toBeNull()
  })

  test('one bad row is dropped and the rest still load', () => {
    const store = new Mem()
    store.setItem(
      TELEMETRY_KEY,
      JSON.stringify({
        startedAt: 'x',
        sections: [{ level: 'a', stretch: 0, band: 0, fromTile: 0, toTile: 5, deaths: 3, hits: 0 }, { nonsense: true }],
        levels: [{ level: 'a', attempts: 1, clears: 0, deaths: 3, hits: 0, frames: 60, pearlsFound: 0, assisted: false }],
      }),
    )
    const back = loadTelemetry(store)!
    expect(back.sections.size).toBe(1)
    expect(back.levels.size).toBe(1)
  })

  /** A playthrough must never be interrupted by the thing watching it. */
  test('a storage that refuses is survivable both ways', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(writeTelemetry(broken, seeded())).toBe(false)
    expect(loadTelemetry(broken)).toBeNull()
    expect(() => clearTelemetry(broken)).not.toThrow()
  })

  test('it can be cleared for a fresh sitting', () => {
    const store = new Mem()
    writeTelemetry(store, seeded())
    clearTelemetry(store)
    expect(loadTelemetry(store)).toBeNull()
  })
})
