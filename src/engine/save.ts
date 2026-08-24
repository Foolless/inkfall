/**
 * Save data: one versioned `localStorage` key, keyed on stable strings.
 *
 * The failure this module exists to prevent is the only one that destroys a
 * player's progress irrecoverably. So three rules run through everything below:
 *
 *   1. **Never clear the key automatically.** A blob we cannot read is copied
 *      to `.bak` and left alone. A bug in a parser must not be the reason
 *      someone loses forty hours.
 *   2. **Never drop what we do not recognise.** Unknown level ids are preserved
 *      exactly, so an older build cannot silently delete a newer build's
 *      progress by round-tripping the file.
 *   3. **A newer save is not a corrupt save.** If the version is ahead of this
 *      build, we play on defaults and refuse to write, rather than helpfully
 *      overwriting the future with the past.
 *
 * Storage is injected rather than reached for, so every one of these paths —
 * including a `localStorage` that throws — is testable without a browser.
 */

export const SAVE_KEY = 'inkfall.save.v1'
export const BACKUP_KEY = 'inkfall.save.v1.bak'
export const CURRENT_VERSION = 1

/** The slice of the Storage API this needs. `localStorage` satisfies it. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  /**
   * Optional: only the ghost store removes anything, and the save itself never
   * does. A blob we cannot read is copied to `.bak` and left exactly where it
   * was — deleting somebody's progress is not a recovery strategy.
   */
  removeItem?(key: string): void
}

export interface Progress {
  /** Stable level ids, order-independent. Never an index (PRD §12.7). */
  cleared: string[]
  unlocked: string[]
  upgrades: string[]
  /** Level id -> which of its three pearls have been found. */
  pearls: Record<string, boolean[]>
  trueEndingSeen: boolean
}

export interface HighScore {
  score: number
  character: string
  /** ISO date, stamped by the caller — nothing in here reads the clock. */
  date: string
  levelsCleared: number
  deaths: number
}

export interface Records {
  highScores: HighScore[]
  /** Character -> level id -> best seconds. `fullRun` is a reserved id. */
  bestTimes: Record<string, Record<string, number | null>>
}

export interface Settings {
  keybinds: Record<string, string[]>
  timerDisplay: 'off' | 'level' | 'run' | 'both'
  ghost: boolean
  screenShake: number
  flashReduction: boolean
  musicVolume: number
  sfxVolume: number
  assistMode: boolean
  /**
   * World 5's light radius in tiles. §13 offers 5 / 7 / 10.
   *
   * A setting rather than a chapter property, unlike `Chapter.dark` — the
   * chapter says the world *is* dark, and this says how much of it one
   * particular player needs to be able to see.
   */
  lightRadius: number
}

export interface SaveData {
  version: number
  progress: Progress
  characters: { unlocked: string[]; selected: string }
  records: Records
  settings: Settings
}

export function defaultSave(): SaveData {
  return {
    version: CURRENT_VERSION,
    progress: { cleared: [], unlocked: ['w01-tidepools'], upgrades: [], pearls: {}, trueEndingSeen: false },
    characters: { unlocked: ['nib'], selected: 'nib' },
    records: { highScores: [], bestTimes: { nib: {} } },
    settings: {
      keybinds: {},
      timerDisplay: 'off',
      ghost: false,
      screenShake: 1,
      flashReduction: false,
      musicVolume: 0.7,
      sfxVolume: 0.9,
      assistMode: false,
      lightRadius: 5,
    },
  }
}

export type LoadStatus =
  /** No save existed. A first run. */
  | 'fresh'
  /** Read and used as-is. */
  | 'loaded'
  /** Read from an older schema and brought forward. */
  | 'migrated'
  /** Unreadable. The blob is in `.bak`; the key is untouched. */
  | 'corrupt'
  /** Written by a newer build. Playable, but this build must not write. */
  | 'tooNew'

export interface LoadResult {
  data: SaveData
  status: LoadStatus
  /** One non-blocking line for the player. Empty when nothing went wrong. */
  message: string
  /** False when writing would destroy something we could not understand. */
  writable: boolean
}

/** version -> a function that brings that version's shape up to version + 1. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>
export const MIGRATIONS: Record<number, Migration> = {
  // v1 is the first shipped schema, so there is nothing to come forward from
  // yet. The machinery is here and tested (tests/save.test.ts injects its own)
  // because retrofitting a migration path onto live saves is the expensive
  // version of this problem.
}

export function loadSave(storage: StorageLike, migrations: Record<number, Migration> = MIGRATIONS): LoadResult {
  let raw: string | null
  try {
    raw = storage.getItem(SAVE_KEY)
  } catch {
    // A storage that throws on read — private mode, a disabled site setting.
    return { data: defaultSave(), status: 'corrupt', message: 'Save unavailable; progress will not persist.', writable: false }
  }

  if (raw === null) return { data: defaultSave(), status: 'fresh', message: '', writable: true }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return corrupt(storage, raw, 'Save file unreadable. Your old file has been kept as a backup.')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return corrupt(storage, raw, 'Save file unreadable. Your old file has been kept as a backup.')
  }

  const record = parsed as Record<string, unknown>
  const version = typeof record.version === 'number' ? record.version : NaN
  if (!Number.isInteger(version) || version < 1) {
    return corrupt(storage, raw, 'Save file has no version. Your old file has been kept as a backup.')
  }

  if (version > CURRENT_VERSION) {
    // Not corrupt — just from the future. Play on defaults and do not write,
    // because the only way to "fix" this is to destroy the newer file.
    return {
      data: defaultSave(),
      status: 'tooNew',
      message: 'This save was made by a newer version of INKFALL. Progress will not be saved.',
      writable: false,
    }
  }

  let current: Record<string, unknown>
  try {
    current = applyMigrations(record, version, CURRENT_VERSION, migrations)
  } catch (err) {
    return corrupt(storage, raw, `${(err as Error).message} Your old file has been kept as a backup.`)
  }

  return {
    data: coerce(current),
    status: version < CURRENT_VERSION ? 'migrated' : 'loaded',
    message: '',
    writable: true,
  }
}

/**
 * Walk a save forward one version at a time.
 *
 * Separate from `loadSave` so the ladder can be tested across versions this
 * build does not have yet — the alternative is a migration path whose first
 * real exercise is the day it runs against someone's actual progress.
 *
 * Throws rather than returning a partial result: a half-migrated save is worse
 * than an unreadable one, because it looks fine.
 */
export function applyMigrations(
  raw: Record<string, unknown>,
  from: number,
  to: number,
  migrations: Record<number, Migration>,
): Record<string, unknown> {
  let current = raw
  for (let v = from; v < to; v++) {
    const step = migrations[v]
    if (!step) throw new Error(`No way to upgrade a version ${v} save.`)
    let next: unknown
    try {
      next = step(current)
    } catch {
      throw new Error(`Migrating a version ${v} save failed.`)
    }
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      throw new Error(`The version ${v} migration produced something that is not a save.`)
    }
    current = next as Record<string, unknown>
  }
  return current
}

function corrupt(storage: StorageLike, raw: string, message: string): LoadResult {
  // Copy first, and never touch SAVE_KEY. If the backup write fails too there
  // is nothing more to be done, and losing the backup must not also lose the
  // original.
  try {
    storage.setItem(BACKUP_KEY, raw)
  } catch {
    /* out of quota, or storage is read-only. The original is still intact. */
  }
  return { data: defaultSave(), status: 'corrupt', message, writable: false }
}

/**
 * Fill in what is missing without throwing away what is not understood.
 *
 * Deliberately lenient in one direction only: a missing or wrong-typed field
 * falls back to its default, but a field this build has never heard of is
 * copied through untouched. That asymmetry is what lets someone play build 12,
 * open build 11, and still have their build-12 progress when they go back.
 */
function coerce(raw: Record<string, unknown>): SaveData {
  const base = defaultSave()
  const progress = obj(raw.progress)
  const characters = obj(raw.characters)
  const records = obj(raw.records)
  const settings = obj(raw.settings)

  return {
    ...raw, // unknown top-level keys survive
    version: CURRENT_VERSION,
    progress: {
      ...progress,
      cleared: strings(progress.cleared, base.progress.cleared),
      unlocked: strings(progress.unlocked, base.progress.unlocked),
      upgrades: strings(progress.upgrades, base.progress.upgrades),
      pearls: pearlMap(progress.pearls),
      trueEndingSeen: bool(progress.trueEndingSeen, false),
    },
    characters: {
      ...characters,
      unlocked: strings(characters.unlocked, base.characters.unlocked),
      selected: typeof characters.selected === 'string' ? characters.selected : base.characters.selected,
    },
    records: {
      ...records,
      highScores: Array.isArray(records.highScores) ? (records.highScores as HighScore[]) : [],
      bestTimes: typeof records.bestTimes === 'object' && records.bestTimes !== null
        ? (records.bestTimes as Records['bestTimes'])
        : base.records.bestTimes,
    },
    settings: { ...base.settings, ...settings } as Settings,
  } as SaveData
}

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function strings(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return [...fallback]
  return v.filter((x): x is string => typeof x === 'string')
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

/**
 * Pearl flags, keyed by level id.
 *
 * Ids are **not** checked against the level registry. A level this build does
 * not know about is a level from a newer build, and forgetting its pearls is
 * exactly the data loss rule 2 forbids.
 */
function pearlMap(v: unknown): Record<string, boolean[]> {
  const out: Record<string, boolean[]> = {}
  for (const [id, flags] of Object.entries(obj(v))) {
    if (!Array.isArray(flags)) continue
    out[id] = flags.map((f) => f === true)
  }
  return out
}

/** Returns false rather than throwing: a full disk must not end a run. */
export function writeSave(storage: StorageLike, data: SaveData): boolean {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: CURRENT_VERSION }))
    return true
  } catch {
    return false
  }
}

// ── Mutations the game actually performs ────────────────────────────────────

/** Record a cleared level, its pearls, and a best time if it beats the old one. */
export function recordClear(
  data: SaveData,
  levelId: string,
  opts: { pearls: readonly boolean[]; seconds: number; character?: string },
): SaveData {
  const character = opts.character ?? data.characters.selected
  const cleared = data.progress.cleared.includes(levelId)
    ? data.progress.cleared
    : [...data.progress.cleared, levelId]

  // Pearls accumulate: found once is found forever, so a later run that misses
  // one never un-finds it.
  const before = data.progress.pearls[levelId] ?? []
  const pearls = opts.pearls.map((found, i) => found || before[i] === true)

  const times = { ...(data.records.bestTimes[character] ?? {}) }
  const previous = times[levelId]
  if (previous === undefined || previous === null || opts.seconds < previous) times[levelId] = opts.seconds

  return {
    ...data,
    progress: { ...data.progress, cleared, pearls: { ...data.progress.pearls, [levelId]: pearls } },
    records: { ...data.records, bestTimes: { ...data.records.bestTimes, [character]: times } },
  }
}

/**
 * Bank permanent upgrades. PRD §8.5: they are kept, never lost.
 *
 * Additive and idempotent. Nothing in the game takes an upgrade away, so this
 * only ever grows the list — a run that skips a level cannot un-grant what an
 * earlier run earned.
 */
export function recordUpgrades(data: SaveData, ids: readonly string[]): SaveData {
  const upgrades = [...data.progress.upgrades]
  for (const id of ids) if (!upgrades.includes(id)) upgrades.push(id)
  if (upgrades.length === data.progress.upgrades.length) return data
  return { ...data, progress: { ...data.progress, upgrades } }
}

/**
 * Unlock a level. Clearing one opens the next, and unlocking is permanent.
 *
 * Kept separate from `recordClear` because they answer different questions —
 * "have I finished this" and "may I start this" — and Phase 4's world map
 * reads the second without caring about the first.
 */
export function recordUnlock(data: SaveData, levelId: string): SaveData {
  if (data.progress.unlocked.includes(levelId)) return data
  return { ...data, progress: { ...data.progress, unlocked: [...data.progress.unlocked, levelId] } }
}

/** Top ten, highest first. Ties keep the earlier entry, which arrived first. */
export function recordHighScore(data: SaveData, entry: HighScore): SaveData {
  const highScores = [...data.records.highScores, entry].sort((a, b) => b.score - a.score).slice(0, 10)
  return { ...data, records: { ...data.records, highScores } }
}

/** Every pearl in the game. Five levels of three (§8.3). */
export const PEARLS_TOTAL = 15

/**
 * What collecting everything is worth. PRD §8.3.
 *
 * All fifteen pearls unlocks **Octo** and the true ending. Octo's *movement* is
 * §8.6's post-1.0 work and is deliberately not built here — but the unlock is
 * recorded now, because the alternative is asking players who finished the
 * collection in v1 to do it again later. A flag costs nothing; a second
 * playthrough costs an evening.
 *
 * Idempotent, like every other writer here: called on every clear, changes the
 * save at most once.
 */
export function checkUnlocks(data: SaveData): SaveData {
  if (totalPearls(data) < PEARLS_TOTAL) return data
  const unlocked = data.characters.unlocked.includes('octo')
    ? data.characters.unlocked
    : [...data.characters.unlocked, 'octo']
  if (unlocked === data.characters.unlocked && data.progress.trueEndingSeen) return data
  return {
    ...data,
    characters: { ...data.characters, unlocked },
    progress: { ...data.progress, trueEndingSeen: true },
  }
}

export function pearlsFound(data: SaveData, levelId: string): number {
  return (data.progress.pearls[levelId] ?? []).filter(Boolean).length
}

export function totalPearls(data: SaveData): number {
  return Object.values(data.progress.pearls).reduce((n, flags) => n + flags.filter(Boolean).length, 0)
}
