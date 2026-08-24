/**
 * Hookline — the fishing hook. Worlds 3 and 5. PRD §6.1 #8.
 *
 * Teaches hazard-as-platform, which is the single most useful idea World 3 has:
 * the thing that kills you on contact has a flat top you are meant to stand on.
 * §7.4 B2 crosses a twenty-tile gap on three of them and there is no other way
 * across.
 *
 * Three states on a fixed loop — descend, sweep, retract — and no reaction to
 * the player at all. That is the whole reason it works as a platform: a hook
 * that noticed you would be a hazard, and a hazard cannot be a floor.
 *
 * The ride band is four pixels of the hook's own top. Above it, you are
 * standing on a moving platform; below it, you are dead. That line is drawn
 * generously in the player's favour and the sprite draws the barbs *below* it,
 * so the safe surface is the part that looks flat.
 */

import { ENEMIES } from '../constants.js'
import type { Box } from '../collision.js'
import type { Enemy } from './types.js'

export const HOOK_DROPPING = 0
export const HOOK_SWEEPING = 1
export const HOOK_RETRACTING = 2

/** Total loop length. Authored phases are offsets into this. */
export const HOOK_CYCLE = ENEMIES.HOOK_DROP + ENEMIES.HOOK_SWEEP + ENEMIES.HOOK_RETRACT

export function hookPhase(e: Enemy): number {
  return ((e.clock % HOOK_CYCLE) + HOOK_CYCLE) % HOOK_CYCLE
}

/**
 * Position is *computed* from the clock, never integrated.
 *
 * A hook Nib is standing on has to be in exactly the same place on frame ten
 * thousand of a replay as on frame ten, and an integrated position drifts. It
 * is also what lets a level place three hooks a third of a cycle apart and get
 * a staircase rather than three things that were once a staircase.
 */
export function updateHookline(e: Enemy): void {
  e.clock++
  const t = hookPhase(e)
  const drop = e.amplitude

  if (t < ENEMIES.HOOK_DROP) {
    e.state = HOOK_DROPPING
    const k = t / ENEMIES.HOOK_DROP
    e.x = e.homeX
    e.y = e.homeY + drop * k
  } else if (t < ENEMIES.HOOK_DROP + ENEMIES.HOOK_SWEEP) {
    e.state = HOOK_SWEEPING
    const k = (t - ENEMIES.HOOK_DROP) / ENEMIES.HOOK_SWEEP
    e.x = e.homeX + e.dirX * e.reach * k
    e.y = e.homeY + drop
  } else {
    e.state = HOOK_RETRACTING
    const k = (t - ENEMIES.HOOK_DROP - ENEMIES.HOOK_SWEEP) / ENEMIES.HOOK_RETRACT
    e.x = e.homeX + e.dirX * e.reach
    e.y = e.homeY + drop * (1 - k)
  }

  e.facing = e.dirX > 0 ? 1 : -1
}

/** The flat top, which is footing. Handed to the collision sweep as a solid. */
export function hookPlatform(e: Enemy): Box {
  return { x: e.x, y: e.y, w: e.w, h: ENEMIES.HOOK_RIDE_BAND }
}

/** Everything below the ride band, which is instant death at any tier. */
export function hookBarbs(e: Enemy): Box {
  return {
    x: e.x,
    y: e.y + ENEMIES.HOOK_RIDE_BAND,
    w: e.w,
    h: e.h - ENEMIES.HOOK_RIDE_BAND,
  }
}
