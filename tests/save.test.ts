import { describe, expect, test } from 'vitest'
import {
  applyMigrations,
  BACKUP_KEY,
  CURRENT_VERSION,
  defaultSave,
  loadSave,
  pearlsFound,
  recordClear,
  recordHighScore,
  SAVE_KEY,
  totalPearls,
  writeSave,
  type Migration,
  type SaveData,
  type StorageLike,
} from '../src/engine/save.js'

/** An in-memory Storage that can be made to fail on demand. */
class FakeStorage implements StorageLike {
  readonly items = new Map<string, string>()
  failReads = false
  failWrites = false

  constructor(seed: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(seed)) this.items.set(k, v)
  }

  getItem(key: string): string | null {
    if (this.failReads) throw new Error('storage disabled')
    return this.items.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('quota exceeded')
    this.items.set(key, value)
  }
}

const seeded = (data: unknown) => new FakeStorage({ [SAVE_KEY]: JSON.stringify(data) })

describe('a first run', () => {
  test('with no save, starts fresh and writable', () => {
    const r = loadSave(new FakeStorage())
    expect(r.status).toBe('fresh')
    expect(r.writable).toBe(true)
    expect(r.message).toBe('')
    expect(r.data).toEqual(defaultSave())
  })

  test('the defaults unlock World 1 and nothing else', () => {
    const d = defaultSave()
    expect(d.progress.unlocked).toEqual(['w01-tidepools'])
    expect(d.progress.cleared).toEqual([])
    expect(d.characters.selected).toBe('nib')
  })
})

describe('a round trip', () => {
  test('what goes in comes back out', () => {
    const storage = new FakeStorage()
    const data = recordClear(defaultSave(), 'w01-tidepools', { pearls: [true, false, true], seconds: 187.42 })
    expect(writeSave(storage, data)).toBe(true)

    const r = loadSave(storage)
    expect(r.status).toBe('loaded')
    expect(r.data.progress.cleared).toEqual(['w01-tidepools'])
    expect(r.data.progress.pearls['w01-tidepools']).toEqual([true, false, true])
    expect(r.data.records.bestTimes.nib!['w01-tidepools']).toBe(187.42)
  })

  test('a write that fails reports it rather than throwing — a full disk must not end a run', () => {
    const storage = new FakeStorage()
    storage.failWrites = true
    expect(writeSave(storage, defaultSave())).toBe(false)
  })

  test('storage that throws on read degrades to unwritable defaults', () => {
    const storage = new FakeStorage()
    storage.failReads = true
    const r = loadSave(storage)
    expect(r.status).toBe('corrupt')
    expect(r.writable).toBe(false)
    expect(r.data).toEqual(defaultSave())
  })
})

/**
 * The one failure that destroys progress irrecoverably.
 *
 * Every case here asserts the same two things: the original key is untouched,
 * and the unreadable blob was copied somewhere the player can get at it.
 */
describe('a corrupt save', () => {
  const blob = '{"version":1,"progress":' // truncated mid-write

  test('is copied to .bak, and the original key is never cleared', () => {
    const storage = new FakeStorage({ [SAVE_KEY]: blob })
    const r = loadSave(storage)
    expect(r.status).toBe('corrupt')
    expect(r.writable).toBe(false)
    expect(r.message).not.toBe('')
    expect(storage.items.get(BACKUP_KEY)).toBe(blob)
    expect(storage.items.get(SAVE_KEY)).toBe(blob)
  })

  test('a subsequent write is refused by the caller, not silently allowed', () => {
    const storage = new FakeStorage({ [SAVE_KEY]: blob })
    expect(loadSave(storage).writable).toBe(false)
  })

  test.each([
    ['not JSON at all', 'nonsense{{{'],
    ['a bare number', '42'],
    ['a JSON array', '[1,2,3]'],
    ['null', 'null'],
    ['an object with no version', '{"progress":{}}'],
    ['a non-numeric version', '{"version":"one"}'],
    ['a fractional version', '{"version":1.5}'],
    ['a version of zero', '{"version":0}'],
  ])('%s is treated as corrupt', (_name, raw) => {
    const storage = new FakeStorage({ [SAVE_KEY]: raw })
    const r = loadSave(storage)
    expect(r.status).toBe('corrupt')
    expect(storage.items.get(SAVE_KEY)).toBe(raw)
    expect(storage.items.get(BACKUP_KEY)).toBe(raw)
  })

  test('a backup write that also fails still leaves the original intact', () => {
    const storage = new FakeStorage({ [SAVE_KEY]: blob })
    storage.failWrites = true
    const r = loadSave(storage)
    expect(r.status).toBe('corrupt')
    expect(storage.items.get(SAVE_KEY)).toBe(blob)
  })
})

describe('a save from a newer build', () => {
  test('is playable but never written over — a newer save is not a corrupt one', () => {
    const storage = seeded({ version: CURRENT_VERSION + 1, progress: { cleared: ['w09-somewhere'] } })
    const r = loadSave(storage)
    expect(r.status).toBe('tooNew')
    expect(r.writable).toBe(false)
    expect(r.message).toMatch(/newer version/i)
    // Not corrupt, so nothing was copied to .bak either.
    expect(storage.items.has(BACKUP_KEY)).toBe(false)
  })
})

describe('a migration that fails is survivable', () => {
  /**
   * The ladder throwing is tested directly below; this is the same failure
   * arriving through `loadSave`, which is the only path a player ever takes.
   * The rule is the same as for an unparseable blob: fall back to defaults,
   * keep the original as `.bak`, and never clear the key.
   */
  test('loadSave falls back to defaults and keeps the original', () => {
    // Version 0, so the ladder actually has a rung to climb.
    const blob = JSON.stringify({ version: 0, progress: { cleared: ['w01-tidepools'] } })
    const storage = new FakeStorage({ [SAVE_KEY]: blob })
    const broken: Record<number, Migration> = {
      0: () => {
        throw new Error('version 0 save failed to migrate')
      },
    }

    const result = loadSave(storage, broken)
    expect(result.status).toBe('corrupt')
    expect(result.writable).toBe(false)
    expect(result.data).toEqual(defaultSave())
    expect(result.message).toMatch(/backup/i)
    expect(storage.items.get(SAVE_KEY)).toBe(blob)
    expect(storage.items.get(BACKUP_KEY)).toBe(blob)
  })
})

describe('migration', () => {
  const ladder: Record<number, Migration> = {
    1: (raw) => ({ ...raw, version: 2, progress: { ...(raw.progress as object), upgrades: ['inkShot'] } }),
    2: (raw) => ({ ...raw, version: 3, characters: { unlocked: ['nib', 'octo'], selected: 'nib' } }),
  }

  test('walks a save forward one version at a time', () => {
    const out = applyMigrations({ version: 1, progress: { cleared: ['w01-tidepools'] } }, 1, 3, ladder)
    expect(out.version).toBe(3)
    expect((out.progress as { upgrades: string[] }).upgrades).toEqual(['inkShot'])
    expect((out.characters as { unlocked: string[] }).unlocked).toEqual(['nib', 'octo'])
    expect((out.progress as { cleared: string[] }).cleared).toEqual(['w01-tidepools'])
  })

  test('a save already at the target version passes through untouched', () => {
    const raw = { version: 3, progress: {} }
    expect(applyMigrations(raw, 3, 3, ladder)).toBe(raw)
  })

  /** A half-migrated save is worse than an unreadable one: it looks fine. */
  test('a missing step throws rather than returning a partial result', () => {
    expect(() => applyMigrations({ version: 1 }, 1, 4, ladder)).toThrow(/version 3/)
  })

  test('a step that throws is reported against its own version', () => {
    const broken: Record<number, Migration> = {
      1: () => {
        throw new Error('boom')
      },
    }
    expect(() => applyMigrations({ version: 1 }, 1, 2, broken)).toThrow(/version 1 save failed/)
  })

  test('a step that returns something that is not a save is rejected', () => {
    const bad: Record<number, Migration> = { 1: () => [] as unknown as Record<string, unknown> }
    expect(() => applyMigrations({ version: 1 }, 1, 2, bad)).toThrow(/not a save/)
  })

  test('the version is always stamped to this build on write', () => {
    const storage = new FakeStorage()
    writeSave(storage, { ...defaultSave(), version: 99 } as SaveData)
    expect(JSON.parse(storage.items.get(SAVE_KEY)!).version).toBe(CURRENT_VERSION)
  })
})

/**
 * Rule 2: never drop what we do not recognise.
 *
 * This is what lets someone play build 12, open build 11, and still have their
 * build-12 progress when they go back to build 12.
 */
describe('forward compatibility', () => {
  test('unknown level ids survive a load', () => {
    const storage = seeded({
      version: 1,
      progress: {
        cleared: ['w01-tidepools', 'w09-nowhere'],
        pearls: { 'w09-nowhere': [true, true, false] },
      },
    })
    const r = loadSave(storage)
    expect(r.data.progress.cleared).toContain('w09-nowhere')
    expect(r.data.progress.pearls['w09-nowhere']).toEqual([true, true, false])
  })

  test('unknown top-level keys survive a load', () => {
    const storage = seeded({ version: 1, futureThing: { a: 1 } })
    const r = loadSave(storage)
    expect((r.data as unknown as { futureThing: unknown }).futureThing).toEqual({ a: 1 })
  })

  test('unknown settings survive, and known ones fall back when absent', () => {
    const storage = seeded({ version: 1, settings: { assistMode: true, futureSetting: 'yes' } })
    const r = loadSave(storage)
    expect(r.data.settings.assistMode).toBe(true)
    expect(r.data.settings.musicVolume).toBe(0.7)
    expect((r.data.settings as unknown as { futureSetting: string }).futureSetting).toBe('yes')
  })

  test('a wrong-typed field falls back rather than poisoning the run', () => {
    const storage = seeded({ version: 1, progress: { cleared: 'w01-tidepools', trueEndingSeen: 'yes' } })
    const r = loadSave(storage)
    expect(r.data.progress.cleared).toEqual([])
    expect(r.data.progress.trueEndingSeen).toBe(false)
  })

  test('non-string entries are filtered out of an id list', () => {
    const storage = seeded({ version: 1, progress: { cleared: ['w01-tidepools', 7, null] } })
    expect(loadSave(storage).data.progress.cleared).toEqual(['w01-tidepools'])
  })

  test('a pearl list that is not a list is dropped, not coerced into truthiness', () => {
    const storage = seeded({ version: 1, progress: { pearls: { 'w01-tidepools': 'true' } } })
    expect(loadSave(storage).data.progress.pearls['w01-tidepools']).toBeUndefined()
  })
})

describe('recording a clear', () => {
  test('adds the level once, however many times it is cleared', () => {
    let d = recordClear(defaultSave(), 'w01-tidepools', { pearls: [false, false, false], seconds: 200 })
    d = recordClear(d, 'w01-tidepools', { pearls: [false, false, false], seconds: 190 })
    expect(d.progress.cleared).toEqual(['w01-tidepools'])
  })

  /** Found once is found forever: a later run that misses one never un-finds it. */
  test('pearls accumulate across runs', () => {
    let d = recordClear(defaultSave(), 'w01-tidepools', { pearls: [true, false, false], seconds: 200 })
    d = recordClear(d, 'w01-tidepools', { pearls: [false, true, false], seconds: 200 })
    expect(d.progress.pearls['w01-tidepools']).toEqual([true, true, false])
    expect(pearlsFound(d, 'w01-tidepools')).toBe(2)
  })

  test('a best time only improves', () => {
    let d = recordClear(defaultSave(), 'w01-tidepools', { pearls: [], seconds: 200 })
    d = recordClear(d, 'w01-tidepools', { pearls: [], seconds: 240 })
    expect(d.records.bestTimes.nib!['w01-tidepools']).toBe(200)
    d = recordClear(d, 'w01-tidepools', { pearls: [], seconds: 180 })
    expect(d.records.bestTimes.nib!['w01-tidepools']).toBe(180)
  })

  test('best times are per character', () => {
    let d = recordClear(defaultSave(), 'w01-tidepools', { pearls: [], seconds: 200, character: 'nib' })
    d = recordClear(d, 'w01-tidepools', { pearls: [], seconds: 300, character: 'octo' })
    expect(d.records.bestTimes.nib!['w01-tidepools']).toBe(200)
    expect(d.records.bestTimes.octo!['w01-tidepools']).toBe(300)
  })

  test('totals count pearls across every level', () => {
    let d = recordClear(defaultSave(), 'w01-tidepools', { pearls: [true, true, false], seconds: 1 })
    d = recordClear(d, 'w02-kelp', { pearls: [true, false, false], seconds: 1 })
    expect(totalPearls(d)).toBe(3)
  })

  test('recording a clear does not mutate the save it was given', () => {
    const before = defaultSave()
    recordClear(before, 'w01-tidepools', { pearls: [true, true, true], seconds: 10 })
    expect(before.progress.cleared).toEqual([])
    expect(before.progress.pearls).toEqual({})
  })
})

describe('high scores', () => {
  const entry = (score: number) => ({ score, character: 'nib', date: '2026-08-23', levelsCleared: 1, deaths: 0 })

  test('keeps the top ten, highest first', () => {
    let d = defaultSave()
    for (let i = 1; i <= 15; i++) d = recordHighScore(d, entry(i * 100))
    expect(d.records.highScores).toHaveLength(10)
    expect(d.records.highScores[0]!.score).toBe(1500)
    expect(d.records.highScores[9]!.score).toBe(600)
  })

  test('a score too low to place is simply not kept', () => {
    let d = defaultSave()
    for (let i = 1; i <= 10; i++) d = recordHighScore(d, entry(1000 + i))
    d = recordHighScore(d, entry(5))
    expect(d.records.highScores.some((h) => h.score === 5)).toBe(false)
  })

  test('a run is stamped with its character, so a leaderboard row is unambiguous', () => {
    const d = recordHighScore(defaultSave(), { ...entry(100), character: 'cuttle' })
    expect(d.records.highScores[0]!.character).toBe('cuttle')
  })
})
