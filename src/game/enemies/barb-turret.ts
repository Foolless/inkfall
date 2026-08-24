/**
 * Barb Turret — the barnacle. World 2. PRD §6.1 #4.
 *
 * Teaches timing windows in a corridor. It is bolted to a wall, it never moves,
 * it cannot be killed by anything, and it fires a barb along exactly one axis
 * every hundred frames with a twenty-frame flare first.
 *
 * Being unkillable is the lesson. Two turrets on offset cycles five tiles apart
 * (§7.3 B1) is a *rhythm*, and a rhythm stops being a rhythm the moment the
 * player can delete half of it. Nothing here is negotiable by the player except
 * when they choose to move.
 */

import { ENEMIES } from '../constants.js'
import type { Enemy } from './types.js'

/** Where in the cycle it is, always in [0, TURRET_CYCLE). */
export function turretPhase(e: Enemy): number {
  const c = ENEMIES.TURRET_CYCLE
  return ((e.clock % c) + c) % c
}

/**
 * The flare. Twenty frames of it, immediately before the shot.
 *
 * The honest-difficulty pillar in miniature, again: the barb is fast because a
 * slow one is not frightening, and the warning is long because a death the
 * player could not have seen coming is the one thing the game promises never
 * to do.
 */
export function isFlaring(e: Enemy): boolean {
  return turretPhase(e) >= ENEMIES.TURRET_CYCLE - ENEMIES.TURRET_TELEGRAPH
}

export function updateBarbTurret(e: Enemy, fire: (vx: number, vy: number) => void): void {
  e.clock++
  // Fires on the wrap rather than on a countdown, so an authored phase offset
  // means exactly what a level designer expects it to: this turret is N frames
  // behind that one, forever.
  if (turretPhase(e) === 0) fire(e.dirX * ENEMIES.BARB_SPEED, e.dirY * ENEMIES.BARB_SPEED)
}
