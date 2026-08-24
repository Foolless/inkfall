/**
 * Ghost storage. One key per character and level, apart from the save.
 *
 * Every operation here is allowed to fail and none of them may throw. A ghost
 * is a nicety (§8.4 has it off by default); the progress save is somebody's
 * evening. Keeping them in separate keys means a quota error while writing a
 * few thousand coordinates cannot take a pearl with it, and a ghost that will
 * not parse is simply not drawn.
 */

import { isTrack, type GhostTrack } from '../game/ghost.js'
import type { StorageLike } from './save.js'

export const GHOST_PREFIX = 'inkfall.ghost.v1'

export function ghostKey(character: string, levelId: string): string {
  return `${GHOST_PREFIX}.${character}.${levelId}`
}

/** The stored ghost, or null for absent, unreadable, or from another level. */
export function loadGhost(storage: StorageLike, character: string, levelId: string): GhostTrack | null {
  let raw: string | null = null
  try {
    raw = storage.getItem(ghostKey(character, levelId))
  } catch {
    return null
  }
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isTrack(parsed) || parsed.level !== levelId) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Write a ghost. Returns false if it could not be stored, which is not an error.
 *
 * The usual reason is a full quota, and the correct response to that is to keep
 * playing without a silhouette rather than to interrupt somebody mid-run.
 */
export function writeGhost(storage: StorageLike, character: string, track: GhostTrack): boolean {
  try {
    storage.setItem(ghostKey(character, track.level), JSON.stringify(track))
    return true
  } catch {
    return false
  }
}

/** Drop one, for a player who wants their times back but not their shadow. */
export function clearGhost(storage: StorageLike, character: string, levelId: string): void {
  try {
    storage.removeItem?.(ghostKey(character, levelId))
  } catch {
    // Nothing to do and nothing worth saying. The ghost stays where it is.
  }
}
