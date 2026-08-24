/**
 * Eel — the socket lunger. Worlds 2 and 5. PRD §6.1 #6.
 *
 * Teaches baiting and punishing. It sits in a hole in the wall doing nothing at
 * all until Nib crosses its line, then flares for forty frames, lunges five
 * tiles at 3.2 px/f, and spends ninety frames crawling back.
 *
 * That ninety-frame retract *is* the room. §7.3 C1 is three sockets in a
 * flooded tunnel: you step into the line on purpose, you back off, and you pass
 * while it is reeling in. An eel that re-armed instantly would be a wall.
 *
 * It cannot be killed. An ink bolt stuns it for ninety frames, which buys the
 * same window without asking the player to bait — the Ink Shot is a key here,
 * not a weapon, and that is the shape of every upgrade in §8.5.
 */

import { DISPLAY, ENEMIES } from '../constants.js'
import type { Box } from '../collision.js'
import type { Enemy } from './types.js'

const T = DISPLAY.TILE

export const EEL_SOCKETED = 0
export const EEL_FLARING = 1
export const EEL_LUNGING = 2
export const EEL_RETREATING = 3

/**
 * Has Nib crossed the line the eel watches?
 *
 * A band rather than a ray: the socket is a tile tall and Nib is a moving
 * target, so a strictly-equal row test would make the trigger depend on which
 * pixel he happened to be standing on. The band is a tile and a half, which is
 * generous in the direction of "it noticed you", because an eel that fails to
 * notice you is not frightening.
 */
export function seesPlayer(e: Enemy, player: Box): boolean {
  const eyeY = e.y + e.h / 2
  const py = player.y + player.h / 2
  if (Math.abs(py - eyeY) > ENEMIES.EEL_SIGHT_BAND * T) return false

  const ahead = e.dirX > 0 ? player.x - (e.homeX + e.w) : e.homeX - (player.x + player.w)
  return ahead >= 0 && ahead <= e.reach
}

export function updateEel(e: Enemy, player: Box): void {
  e.clock++
  if (e.timer > 0) e.timer--

  switch (e.state) {
    case EEL_SOCKETED:
      if (seesPlayer(e, player)) {
        e.state = EEL_FLARING
        e.timer = ENEMIES.EEL_TELEGRAPH
      }
      break

    case EEL_FLARING:
      // Committed the moment it flares. Backing out of the line after the
      // telegraph starts is the *player's* option, not the eel's — that is what
      // makes baiting a decision rather than a coin toss.
      if (e.timer === 0) {
        e.state = EEL_LUNGING
        e.vx = e.dirX * ENEMIES.EEL_LUNGE_SPEED
      }
      break

    case EEL_LUNGING: {
      e.x += e.vx
      const travelled = Math.abs(e.x - e.homeX)
      if (travelled >= e.reach) {
        e.x = e.homeX + e.dirX * e.reach
        e.state = EEL_RETREATING
        e.timer = ENEMIES.EEL_RETREAT
        e.vx = 0
      }
      break
    }

    case EEL_RETREATING: {
      // Reels in over the whole ninety frames rather than snapping home, so the
      // window the player is passing through is visible the entire time.
      const t = 1 - e.timer / ENEMIES.EEL_RETREAT
      e.x = e.homeX + e.dirX * e.reach * (1 - t)
      if (e.timer === 0) {
        e.x = e.homeX
        e.state = EEL_SOCKETED
      }
      break
    }
  }
}

/** Stunned mid-lunge, it drops back into its socket rather than hanging out. */
export function socketEel(e: Enemy): void {
  e.x = e.homeX
  e.vx = 0
  e.state = EEL_SOCKETED
  e.timer = 0
}
