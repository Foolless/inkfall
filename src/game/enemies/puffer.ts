/**
 * Puffer. World 1. PRD §6.1 #3.
 *
 * Teaches patience: read the state before committing. It inflates into a spike
 * ball when Nib comes within three tiles and deflates ninety frames later, and
 * it is stompable only while deflated.
 *
 * The inflate timer does **not** re-arm while Nib stays close. That is the
 * whole lesson — if proximity kept it inflated forever, the honest answer would
 * be "walk away", and the room would have taught nothing about timing.
 */

import { DISPLAY, ENEMIES } from '../constants.js'
import { isGrounded, moveY } from '../collision.js'
import type { TileMap } from '../tilemap.js'
import { PUFFER_INFLATED, type Enemy } from './types.js'
import type { Box } from '../collision.js'

const T = DISPLAY.TILE

/** Deflated footprint, remembered so inflating and deflating is reversible. */
const DEFLATED = { w: 12, h: 10 }

export function updatePuffer(map: TileMap, e: Enemy, player: Box, collapsed: ReadonlySet<number>): void {
  // Measured between the boxes, not between the centres: "within three tiles"
  // should mean three tiles of clear water, not three tiles minus two half
  // sprites. Centre-to-centre makes the trigger knife-edge at exactly 3.
  const gapX = Math.max(0, Math.abs(player.x + player.w / 2 - (e.x + e.w / 2)) - (player.w + e.w) / 2)
  const gapY = Math.max(0, Math.abs(player.y + player.h / 2 - (e.y + e.h / 2)) - (player.h + e.h) / 2)
  const near = Math.hypot(gapX, gapY) <= ENEMIES.PUFFER_TRIGGER * T

  if (e.inflated > 0) e.inflated--
  else if (near) e.inflated = ENEMIES.PUFFER_INFLATE

  resize(e, e.inflated > 0)

  e.vy = Math.min(e.vy + ENEMIES.GRAVITY, ENEMIES.TERMINAL_FALL)
  if (moveY(map, e, e.vy, { collapsed }).blocked) e.vy = 0
  if (isGrounded(map, e, { collapsed })) e.vy = 0

  e.clock++
}

/** Grow and shrink around the bottom centre, so it never sinks into the floor. */
function resize(e: Enemy, inflated: boolean): void {
  const target = inflated ? PUFFER_INFLATED : DEFLATED
  if (e.w === target.w && e.h === target.h) return
  const cx = e.x + e.w / 2
  const bottom = e.y + e.h
  e.w = target.w
  e.h = target.h
  e.x = cx - e.w / 2
  e.y = bottom - e.h
}

/** A spike ball cannot be landed on. Reading this wrong is the death. */
export function isStompable(e: Enemy): boolean {
  return e.inflated === 0
}
