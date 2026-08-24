/**
 * Whipkelp — the anchored stalk. World 2. PRD §6.1 #5.
 *
 * Teaches *attacking the right part of a thing*. The arm that lashes across
 * four tiles cannot be hurt and cannot be stomped; the base it grows out of
 * dies to a single ink bolt. A player who shoots the arm has learned nothing;
 * a player who shoots the base has learned the whole lesson.
 *
 * §7.3 B2 puts four of them over a pit and calls both routes viable: shoot the
 * bases, or thread the arcs. That is only true if the arcs are honestly
 * readable, which is why the arm extends and retracts visibly over forty frames
 * rather than snapping out — a whip you cannot see coming is not a route.
 */

import { ENEMIES } from '../constants.js'
import { DISPLAY } from '../constants.js'
import type { Box } from '../collision.js'
import type { Enemy } from './types.js'

const T = DISPLAY.TILE

export const WHIPKELP_IDLE = 0
export const WHIPKELP_LASHING = 1

export function whipkelpPhase(e: Enemy): number {
  const c = ENEMIES.WHIPKELP_CYCLE
  return ((e.clock % c) + c) % c
}

export function updateWhipkelp(e: Enemy): void {
  e.clock++
  const t = whipkelpPhase(e)
  e.state = t < ENEMIES.WHIPKELP_LASH ? WHIPKELP_LASHING : WHIPKELP_IDLE
  e.timer = e.state === WHIPKELP_LASHING ? ENEMIES.WHIPKELP_LASH - t : 0
}

/**
 * How far out the arm is, 0 to 1 and back over the lash.
 *
 * Symmetric on purpose: the retract is as long as the reach, so the safe
 * moment after an arc is exactly as wide as the safe moment before it. An
 * asymmetric whip would mean one direction through the grove was free and the
 * other was not, which is a difficulty the player cannot see.
 */
export function armExtension(e: Enemy): number {
  if (e.state !== WHIPKELP_LASHING) return 0
  const t = whipkelpPhase(e) / ENEMIES.WHIPKELP_LASH
  return 1 - Math.abs(1 - t * 2)
}

/**
 * The lashing arm, as a box, or null while the stalk is coiled.
 *
 * One tile tall and anchored to the top of the base, because the pit it hangs
 * over is crossed at head height and a whip that swept the floor would be
 * unavoidable rather than timed.
 */
export function whipkelpArm(e: Enemy): Box | null {
  if (!e.alive || e.state !== WHIPKELP_LASHING) return null
  const length = armExtension(e) * e.reach
  if (length < 2) return null
  const y = e.y - T / 2
  return e.dirX > 0
    ? { x: e.x + e.w, y, w: length, h: T }
    : { x: e.x - length, y, w: length, h: T }
}

/** The base — the only part ink can kill, and the whole point of the enemy. */
export function whipkelpBase(e: Enemy): Box {
  return { x: e.x, y: e.y + e.h / 2, w: e.w, h: e.h / 2 }
}
