/**
 * The personal-best ghost. PRD §8.4: "a translucent silhouette of the player's
 * personal best for the current level. Off by default."
 *
 * ## What is recorded, and what is not
 *
 * Positions, sampled every few frames — not an input log. An input log would be
 * smaller and, in a deterministic engine, exact; it would also mean a ghost
 * recorded before a physics change replays as a squid walking into a wall.
 * Positions are what the ghost *is*, and they survive retuning.
 *
 * ## Why it does not live in the save file
 *
 * A ghost is a few thousand numbers per level and the progress save is a few
 * hundred bytes. Storing them together would mean a quota error while writing a
 * ghost could take somebody's pearls with it, so they go under their own keys
 * and every failure to read or write one is silently survivable. Progress is
 * precious; a silhouette is not.
 */

import { DISPLAY } from './constants.js'

/** One position every this many frames. Six is 10 Hz — smooth enough to read. */
export const GHOST_INTERVAL = 6

export interface GhostTrack {
  /** The level this was recorded on, so a mismatched track is never drawn. */
  level: string
  /** Total frames the run took, for the label and for sanity checks. */
  frames: number
  /** Interleaved x, y pairs, one per `GHOST_INTERVAL` frames. Integers. */
  points: readonly number[]
}

/**
 * The cap, in samples. A level runs 3-6 minutes (§7.1), so 4,000 samples is
 * about eleven minutes of recording — generous for a bad run and a hard stop
 * for a player who parks on a checkpoint and goes to lunch.
 */
export const GHOST_MAX_SAMPLES = 4_000

export interface GhostRecorder {
  points: number[]
  /** Frames seen so far, so sampling does not depend on anything external. */
  frames: number
}

export function createRecorder(): GhostRecorder {
  return { points: [], frames: 0 }
}

export function resetRecorder(r: GhostRecorder): void {
  r.points.length = 0
  r.frames = 0
}

/**
 * Take a sample if this frame is one. Called once per simulation step.
 *
 * Rounds to whole pixels: the ghost is drawn at integer coordinates anyway
 * (§9.1's pixel grid), and halving the digits halves the stored size.
 */
export function sample(r: GhostRecorder, x: number, y: number): void {
  if (r.frames % GHOST_INTERVAL === 0 && r.points.length / 2 < GHOST_MAX_SAMPLES) {
    r.points.push(Math.round(x), Math.round(y))
  }
  r.frames++
}

export function finishRecording(r: GhostRecorder, level: string): GhostTrack {
  return { level, frames: r.frames, points: [...r.points] }
}

/**
 * Where the ghost is at a given frame of the current run.
 *
 * Held at the last sample once the ghost has finished rather than disappearing:
 * a player who is behind their PB should see the silhouette waiting at the exit,
 * which is the most useful thing it can tell them. Returns null when the track
 * is empty or belongs to another level.
 */
export function ghostAt(track: GhostTrack | null, level: string, frame: number): { x: number; y: number } | null {
  if (!track || track.level !== level || track.points.length < 2) return null
  const last = track.points.length / 2 - 1
  const i = Math.min(last, Math.floor(frame / GHOST_INTERVAL))
  return { x: track.points[i * 2]!, y: track.points[i * 2 + 1]! }
}

/**
 * Is a decoded blob actually a track?
 *
 * Everything from storage is untrusted — it may have been written by an older
 * build, hand-edited, or truncated by a full quota — and a ghost is never worth
 * a crash. Anything that fails here is simply not drawn.
 */
export function isTrack(value: unknown): value is GhostTrack {
  if (typeof value !== 'object' || value === null) return false
  const t = value as Partial<GhostTrack>
  if (typeof t.level !== 'string' || typeof t.frames !== 'number') return false
  if (!Array.isArray(t.points) || t.points.length % 2 !== 0) return false
  if (t.points.length / 2 > GHOST_MAX_SAMPLES) return false
  const limit = DISPLAY.TILE * 4_000
  return t.points.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit)
}
