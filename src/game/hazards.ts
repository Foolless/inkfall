/**
 * Hazards with state.
 *
 * Static hazards are tiles — urchin spikes are `HAZARD`, collapsing sand is
 * `CRUMBLE`, and both are already in the tilemap. What lives here is the one
 * World 1 hazard that has a clock: the crush clam.
 *
 * **Hazards are instant death at any tier** (PRD §4.4). Geometry kills;
 * creatures cost. That split is what keeps the world readable — a player who
 * learns it once never has to ask whether a thing will cost them a pip or a
 * life.
 */

import { DISPLAY, HAZARDS } from './constants.js'
import { boxesOverlap, type Box } from './collision.js'
import type { EntityDef } from '../content/levels/format.js'
import { kill, type Player } from './player.js'

const T = DISPLAY.TILE

export type ClamState = 'open' | 'slamming' | 'closed'

export interface Clam extends Box {
  /** Frames into the cycle, offset by the authored phase. */
  clock: number
  /**
   * The authored offset, kept so a respawn restores the rhythm the designer
   * wrote rather than resetting every clam in the corridor to the same beat.
   */
  phase: number
}

/** Two tiles wide, one tall. Big enough to stand on, big enough to fall into. */
export const CLAM_SIZE = { w: T * 2, h: T }

export function spawnClam(def: EntityDef & { type: 'clam' }): Clam {
  return {
    x: def.x * T,
    y: def.y * T,
    w: CLAM_SIZE.w,
    h: CLAM_SIZE.h,
    // Authored phase offsets a clam within the cycle, which is how a corridor
    // of three clams becomes a rhythm puzzle rather than three copies of one.
    clock: def.phase ?? 0,
    phase: def.phase ?? 0,
  }
}

export const CLAM_CYCLE = HAZARDS.CLAM_OPEN + HAZARDS.CLAM_SLAM + HAZARDS.CLAM_CLOSED

export function clamState(c: Clam): ClamState {
  const t = ((c.clock % CLAM_CYCLE) + CLAM_CYCLE) % CLAM_CYCLE
  if (t < HAZARDS.CLAM_OPEN) return 'open'
  if (t < HAZARDS.CLAM_OPEN + HAZARDS.CLAM_SLAM) return 'slamming'
  return 'closed'
}

/**
 * The generous telegraph the honest-difficulty pillar demands.
 *
 * Twenty frames of shudder before six frames of slam. The slam is fast because
 * a slow one is not frightening; the warning is long because a death you could
 * not have seen coming is the one thing the game promises never to do.
 */
export function isTelegraphing(c: Clam): boolean {
  const t = ((c.clock % CLAM_CYCLE) + CLAM_CYCLE) % CLAM_CYCLE
  return clamState(c) === 'open' && t >= HAZARDS.CLAM_OPEN - HAZARDS.CLAM_TELEGRAPH
}

/** Closed, the shell is footing. Open, there is nothing there to stand on. */
export function isClamSolid(c: Clam): boolean {
  return clamState(c) === 'closed'
}

/** Open or slamming, the mouth is instant death — at any tier, like every hazard. */
export function isClamDeadly(c: Clam): boolean {
  return clamState(c) !== 'closed'
}

export function updateClam(c: Clam): void {
  c.clock++
}

/** Every clam currently acting as a platform, for the collision sweep. */
export function clamSolids(clams: readonly Clam[], into: Box[]): Box[] {
  into.length = 0
  for (const c of clams) if (isClamSolid(c)) into.push(c)
  return into
}

/**
 * Standing where a clam is about to close kills you when it does.
 *
 * Checked after the clams tick and after Nib moves, so the frame a shell slams
 * shut on him is the frame he dies — not the one after, when he would already
 * have been drawn safely inside a closed shell.
 */
export function checkClams(clams: readonly Clam[], p: Player): boolean {
  if (!p.alive) return false
  for (const c of clams) {
    if (!isClamDeadly(c) || !boxesOverlap(p, c)) continue
    kill(p)
    return true
  }
  return false
}
