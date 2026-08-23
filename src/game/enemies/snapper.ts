/**
 * Snapper — the crab. World 1. PRD §6.1 #1.
 *
 * Teaches baseline stomp timing, which means it must be the most predictable
 * thing in the game: constant speed, turns at walls and at ledges, never leaves
 * its platform. A player who dies to a Snapper made a timing error, and can see
 * that they did.
 */

import { DISPLAY, ENEMIES } from '../constants.js'
import { isGrounded, moveX, moveY, type Box } from '../collision.js'
import { isSolid } from '../collision.js'
import type { TileMap } from '../tilemap.js'
import { hasPatrol, type Enemy } from './types.js'

const T = DISPLAY.TILE

export function updateSnapper(map: TileMap, e: Enemy, collapsed: ReadonlySet<number>): void {
  e.vx = e.facing * ENEMIES.SNAPPER_SPEED

  // Gravity first, so a crab whose platform crumbles away falls off it.
  e.vy = Math.min(e.vy + ENEMIES.GRAVITY, ENEMIES.TERMINAL_FALL)

  if (moveX(map, e, e.vx, { collapsed })) turn(e)
  else if (isGrounded(map, e, { collapsed }) && wouldWalkOffLedge(map, e, collapsed)) {
    turn(e)
    // Step back onto the platform: the probe found the gap before the crab did.
    e.x -= e.vx
  }

  const yres = moveY(map, e, e.vy, { collapsed })
  if (yres.blocked) e.vy = 0

  clampToPatrol(e)
  e.clock++
}

function turn(e: Enemy): void {
  e.facing = -e.facing as 1 | -1
  e.vx = e.facing * ENEMIES.SNAPPER_SPEED
}

/** Probe the tile under the leading bottom corner. No floor there means turn. */
function wouldWalkOffLedge(map: TileMap, e: Enemy, collapsed: ReadonlySet<number>): boolean {
  const leadX = e.facing > 0 ? e.x + e.w + 1 : e.x - 1
  const tx = Math.floor(leadX / T)
  const ty = Math.floor((e.y + e.h + 1) / T)
  return !isSolid(map, tx, ty, { downward: true, prevBottom: e.y + e.h, collapsed })
}

/**
 * An authored patrol is a hard bound, checked after the move.
 *
 * Doing it here rather than as part of the sweep means a crab pushed by a
 * collapsing floor still turns around at the right tile instead of silently
 * escaping the range its designer gave it.
 */
function clampToPatrol(e: Enemy): void {
  if (!hasPatrol(e)) return
  if (e.x < e.patrolLo) {
    e.x = e.patrolLo
    turn(e)
  } else if (e.x > e.patrolHi) {
    e.x = e.patrolHi
    turn(e)
  }
}

/** Exported for the debug overlay and the reachability solver. */
export function snapperFootprint(e: Enemy): Box {
  return { x: e.x, y: e.y, w: e.w, h: e.h }
}
