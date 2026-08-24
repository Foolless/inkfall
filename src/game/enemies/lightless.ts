/**
 * Lightless — the anglerfish. World 5. PRD §6.1 #12.
 *
 * "Everything you've learned, in the dark." It is invisible. The only thing on
 * screen is its lure, which is also the only thing that can be hit, and it is
 * also the trigger: enter the light and it charges at 4.0 px/f, the fastest
 * anything in the game moves.
 *
 * That triple duty — the only light, the only weak point, the only trigger — is
 * why the enemy works. §7.6 C2 is five of them in a dark room where the safe
 * path is lit only by their own lures, and §7.6's pearl ③ sits *inside* one
 * radius: to take it you have to walk into the thing that kills you.
 *
 * The wind-up is twenty-four frames, which is short. It is the one enemy in the
 * game whose telegraph is genuinely tight, and it is allowed to be because the
 * lure told you exactly where it was long before you stepped in.
 */

import { DISPLAY, ENEMIES } from '../constants.js'
import type { Box } from '../collision.js'
import type { Enemy } from './types.js'

const T = DISPLAY.TILE

export const LIGHTLESS_LURKING = 0
export const LIGHTLESS_WINDING = 1
export const LIGHTLESS_CHARGING = 2
export const LIGHTLESS_RECOVERING = 3

/**
 * The lure, hanging in front of the fish.
 *
 * Small, and offset by the fish's facing, so a player who reads the room can
 * tell which way it will come from. The light radius is drawn around this box
 * rather than around the body, which is what makes the body's invisibility
 * honest rather than unfair.
 */
export function lure(e: Enemy): Box {
  const lx = e.facing > 0 ? e.x + e.w - 2 : e.x - 4
  return { x: lx, y: e.y + 2, w: 6, h: 6 }
}

/** Is Nib inside the lure's light? The trigger, and the only warning. */
export function inLight(e: Enemy, player: Box): boolean {
  const l = lure(e)
  const dx = player.x + player.w / 2 - (l.x + l.w / 2)
  const dy = player.y + player.h / 2 - (l.y + l.h / 2)
  return Math.hypot(dx, dy) <= e.reach
}

export function updateLightless(e: Enemy, player: Box): void {
  e.clock++
  if (e.timer > 0) e.timer--

  switch (e.state) {
    case LIGHTLESS_LURKING:
      if (inLight(e, player)) {
        // Turns to face him first. A charge that started before it aimed would
        // be a coin toss, and nothing in this game rolls dice.
        e.facing = player.x + player.w / 2 < e.x + e.w / 2 ? -1 : 1
        e.state = LIGHTLESS_WINDING
        e.timer = ENEMIES.LIGHTLESS_WINDUP
      }
      break

    case LIGHTLESS_WINDING:
      if (e.timer === 0) {
        e.state = LIGHTLESS_CHARGING
        e.timer = ENEMIES.LIGHTLESS_CHARGE_FRAMES
        e.vx = e.facing * ENEMIES.LIGHTLESS_CHARGE
      }
      break

    case LIGHTLESS_CHARGING:
      // Straight, through terrain, for a fixed number of frames. It commits
      // absolutely, which is the only reason a 4.0 px/f charge is survivable:
      // the answer is always "be somewhere else along one axis".
      e.x += e.vx
      if (e.timer === 0) {
        e.vx = 0
        e.state = LIGHTLESS_RECOVERING
        e.timer = ENEMIES.LIGHTLESS_RECOVER
      }
      break

    case LIGHTLESS_RECOVERING: {
      // Drifts home over the recovery, so a room of them settles back into the
      // arrangement the level authored rather than into wherever they ended up.
      const k = 1 - e.timer / ENEMIES.LIGHTLESS_RECOVER
      e.x += (e.homeX - e.x) * k * 0.12
      if (e.timer === 0) {
        e.x = e.homeX
        e.state = LIGHTLESS_LURKING
      }
      break
    }
  }
}

/** The light this thing casts, in pixels. Read by the darkness renderer. */
export function lureRadius(e: Enemy): number {
  return e.alive ? e.reach + T : 0
}
