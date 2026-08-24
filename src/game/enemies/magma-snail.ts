/**
 * Magma Snail — the corridor block. World 4. PRD §6.1 #9.
 *
 * Teaches positioning, and *ink as a key rather than a weapon*. Its face and
 * its shell are armoured: a stomp bounces, a Charged dash bounces, and an ink
 * bolt to the front does nothing at all. Five pixels of exposed rear is the
 * only answer, and getting behind a thing that fills the corridor it is walking
 * down is the actual puzzle.
 *
 * At 0.3 px/f it is the slowest walker in the game. That is not padding — a
 * fast snail would be dodged, and this enemy exists to be *got around*.
 */

import { DISPLAY, ENEMIES } from '../constants.js'
import { isGrounded, isSolid, moveX, moveY, type Box } from '../collision.js'
import type { TileMap } from '../tilemap.js'
import { hasPatrol, type Enemy } from './types.js'

const T = DISPLAY.TILE

export function updateMagmaSnail(map: TileMap, e: Enemy, collapsed: ReadonlySet<number>): void {
  e.vx = e.facing * ENEMIES.SNAIL_SPEED
  e.vy = Math.min(e.vy + ENEMIES.GRAVITY, ENEMIES.TERMINAL_FALL)

  if (moveX(map, e, e.vx, { collapsed })) turn(e)
  else if (isGrounded(map, e, { collapsed }) && wouldWalkOffLedge(map, e, collapsed)) {
    turn(e)
    e.x -= e.vx
  }

  if (moveY(map, e, e.vy, { collapsed }).blocked) e.vy = 0

  if (hasPatrol(e)) {
    if (e.x < e.patrolLo) {
      e.x = e.patrolLo
      turn(e)
    } else if (e.x > e.patrolHi) {
      e.x = e.patrolHi
      turn(e)
    }
  }
  e.clock++
}

function turn(e: Enemy): void {
  e.facing = -e.facing as 1 | -1
  e.vx = e.facing * ENEMIES.SNAIL_SPEED
}

function wouldWalkOffLedge(map: TileMap, e: Enemy, collapsed: ReadonlySet<number>): boolean {
  const leadX = e.facing > 0 ? e.x + e.w + 1 : e.x - 1
  const tx = Math.floor(leadX / T)
  const ty = Math.floor((e.y + e.h + 1) / T)
  return !isSolid(map, tx, ty, { downward: true, prevBottom: e.y + e.h, collapsed })
}

/**
 * The soft rear. Behind it, whichever way "behind" currently is.
 *
 * Derived from `facing` rather than authored, so a snail that turns around at a
 * ledge turns its weak spot around with it. A fixed rear would make the puzzle
 * a memory test instead of a positioning one.
 */
export function snailRear(e: Enemy): Box {
  const w = ENEMIES.SNAIL_REAR
  return e.facing > 0 ? { x: e.x, y: e.y, w, h: e.h } : { x: e.x + e.w - w, y: e.y, w, h: e.h }
}

/**
 * The shell is footing. §7.5 C2 asks the player to use one as a platform, which
 * only means anything if the game agrees that its top is solid.
 */
export function snailShell(e: Enemy): Box {
  return { x: e.x, y: e.y, w: e.w, h: 4 }
}
