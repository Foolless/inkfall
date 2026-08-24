/**
 * Ghost Diver — the drowned diver. World 3. PRD §6.1 #7.
 *
 * Teaches pressure: *you cannot solve this, only leave*. It drifts at Nib at
 * half a pixel a frame, through solid walls, and nothing in the game touches
 * it. Not a stomp, not a Charged dash, not an ink bolt, not the shrink cloud.
 *
 * It is deliberately the slowest thing in the game. §7.4 B1 puts the room's
 * exit eight tiles away and says it "takes exactly long enough to be
 * terrifying" — the diver is not a threat you fight or dodge, it is a clock
 * you notice. Making it faster would turn it into an ordinary enemy; making it
 * killable would delete it entirely.
 *
 * It despawns once Nib has left its room, because a diver that followed you for
 * the rest of the level would stop being a room and start being a tax.
 */

import { DISPLAY, ENEMIES } from '../constants.js'
import type { Box } from '../collision.js'
import type { Enemy } from './types.js'

const T = DISPLAY.TILE

/** How far Nib must get from where it started before it gives up. */
export const GHOST_ROOM_TILES = 22

export function updateGhostDiver(e: Enemy, player: Box): void {
  e.clock++

  const cx = e.x + e.w / 2
  const cy = e.y + e.h / 2
  const dx = player.x + player.w / 2 - cx
  const dy = player.y + player.h / 2 - cy
  const len = Math.hypot(dx, dy) || 1

  // Straight at him, through everything. No collision call at all: terrain is
  // not a thing this enemy has an opinion about.
  e.vx = (dx / len) * ENEMIES.GHOST_SPEED
  e.vy = (dy / len) * ENEMIES.GHOST_SPEED
  e.x += e.vx
  e.y += e.vy
  e.facing = dx < 0 ? -1 : 1

  if (Math.abs(player.x - e.homeX) > GHOST_ROOM_TILES * T) e.alive = false
}
