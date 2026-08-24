/**
 * Bone Shrimp, and the vents that produce them. World 5. PRD §6.1 #11.
 *
 * Teaches crowd management and resource drain. Individually they are the
 * weakest thing in the game — one stomp, one bolt, no armour. Collectively they
 * are §7.6 B1: six vents against three pips, which is arithmetic the player
 * loses. The room is not asking you to fight. It is asking you to *route*.
 *
 * A vent stops producing the moment it is inked shut, which is the one lever
 * the player has. Everything about the numbers below is chosen so that closing
 * vents is always better than killing shrimp: a vent costs one pip forever, a
 * shrimp costs one pip until the next one arrives.
 */

import { DISPLAY, ENEMIES } from '../constants.js'
import { isGrounded, isSolid, moveX, moveY } from '../collision.js'
import type { Box } from '../collision.js'
import type { TileMap } from '../tilemap.js'
import { hasPatrol, type Enemy } from './types.js'

const T = DISPLAY.TILE

/**
 * Shrimp chase, but only horizontally and only on the floor.
 *
 * Chasing is what makes a swarm feel like a swarm; staying on the floor is what
 * keeps it survivable. A flying shrimp would be a Drifter that multiplies, and
 * §6.1's "one enemy, one lesson" says that is one enemy too many.
 */
export function updateBoneShrimp(map: TileMap, e: Enemy, player: Box, collapsed: ReadonlySet<number>): void {
  e.clock++

  const toward = player.x + player.w / 2 < e.x + e.w / 2 ? -1 : 1
  e.facing = toward as 1 | -1
  e.vx = e.facing * ENEMIES.SHRIMP_SPEED
  e.vy = Math.min(e.vy + ENEMIES.GRAVITY, ENEMIES.TERMINAL_FALL)

  // It turns at a wall or a ledge like anything else that walks, so a swarm
  // pools at the bottom of a shaft rather than pouring off the edge of it.
  if (moveX(map, e, e.vx, collapsed)) e.facing = -e.facing as 1 | -1
  else if (isGrounded(map, e, collapsed) && wouldWalkOffLedge(map, e, collapsed)) e.x -= e.vx

  if (moveY(map, e, e.vy, collapsed).blocked) e.vy = 0

  if (hasPatrol(e)) {
    if (e.x < e.patrolLo) e.x = e.patrolLo
    else if (e.x > e.patrolHi) e.x = e.patrolHi
  }
}

function wouldWalkOffLedge(map: TileMap, e: Enemy, collapsed: ReadonlySet<number>): boolean {
  const leadX = e.facing > 0 ? e.x + e.w + 1 : e.x - 1
  const tx = Math.floor(leadX / T)
  const ty = Math.floor((e.y + e.h + 1) / T)
  return !isSolid(map, tx, ty, { downward: true, prevBottom: e.y + e.h, collapsed })
}

/**
 * A vent. It is scenery until you count how many shrimp it has produced.
 *
 * The cap — four *alive at once* from any one vent — belongs to the world,
 * which is the only thing that can see how many are still alive. This used to
 * also keep its own running total and stop at four, which made it a **lifetime**
 * cap: killing four shrimp retired the vent permanently, and §7.6 B1's whole
 * lever is that inking a vent is what shuts it up. `spawned` is kept as a
 * counter because the renderer pulses the mouth on it, but it gates nothing.
 */
export function updateShrimpVent(e: Enemy, spawn: (x: number, y: number) => boolean): void {
  e.clock++
  const c = ENEMIES.VENT_CYCLE
  if (((e.clock % c) + c) % c !== 0) return
  if (spawn(e.x + e.w / 2, e.y)) e.spawned++
}

/** The mouth of the vent — where a bolt has to land to shut it. */
export function ventMouth(e: Enemy): Box {
  return { x: e.x + 2, y: e.y + 2, w: e.w - 4, h: e.h - 4 }
}

export { T as SHRIMP_TILE }
