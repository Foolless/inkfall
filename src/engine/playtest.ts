/**
 * Telemetry storage, and getting it out of the browser.
 *
 * Its own key, like the ghosts and for the same reason: a playtest log is
 * useful and a save file is somebody's evening. Every read and write here is
 * allowed to fail silently — a playthrough must never be interrupted by the
 * thing that is only watching it.
 */

import {
  createTelemetry,
  levelStats,
  type SectionStats,
  type Telemetry,
} from '../game/telemetry.js'
import type { StorageLike } from './save.js'

export const TELEMETRY_KEY = 'inkfall.playtest.v1'

/** Maps do not survive JSON, so the two tables are stored as arrays. */
interface StoredTelemetry {
  startedAt: string
  sections: SectionStats[]
  levels: ReturnType<typeof levelStats>[]
}

export function writeTelemetry(storage: StorageLike, t: Telemetry): boolean {
  const stored: StoredTelemetry = {
    startedAt: t.startedAt,
    sections: [...t.sections.values()],
    levels: [...t.levels.values()],
  }
  try {
    storage.setItem(TELEMETRY_KEY, JSON.stringify(stored))
    return true
  } catch {
    return false
  }
}

/**
 * Read a stored log, or null.
 *
 * Everything is validated on the way in and anything malformed is discarded
 * rather than repaired: a playtest log with one bad row is not worth a crash,
 * and it is not worth a wrong number either.
 */
export function loadTelemetry(storage: StorageLike): Telemetry | null {
  let raw: string | null = null
  try {
    raw = storage.getItem(TELEMETRY_KEY)
  } catch {
    return null
  }
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const stored = parsed as Partial<StoredTelemetry>
    if (!Array.isArray(stored.sections) || !Array.isArray(stored.levels)) return null

    const t = createTelemetry(typeof stored.startedAt === 'string' ? stored.startedAt : '')
    for (const s of stored.sections) {
      if (typeof s?.level !== 'string' || typeof s.deaths !== 'number') continue
      t.sections.set(`${s.level}#${s.stretch}.${s.band}`, s)
    }
    for (const l of stored.levels) {
      if (typeof l?.level !== 'string' || typeof l.frames !== 'number') continue
      t.levels.set(l.level, l)
    }
    return t
  } catch {
    return null
  }
}

export function clearTelemetry(storage: StorageLike): void {
  try {
    storage.removeItem?.(TELEMETRY_KEY)
  } catch {
    // Nothing to do. The log stays where it is.
  }
}
