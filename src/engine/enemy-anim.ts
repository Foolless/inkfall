/**
 * Which cel an enemy is showing.
 *
 * Presentation, like Nib's animation state machine, and for the same reason:
 * nothing here may feed back into the simulation. Unlike Nib's, this needs no
 * state at all — every enemy's cycle is a function of the world frame and the
 * enemy's own clock, both of which the simulation already owns.
 */

import * as art from '../content/sprites/enemies.js'
import type { SpriteDef } from '../content/sprites/format.js'
import type { Enemy } from '../game/enemies/index.js'

/** Frames each cel holds. Slow enough to read, fast enough to look alive. */
const WALK_HOLD = 8

export function enemyFrame(e: Enemy, frame: number): SpriteDef {
  switch (e.kind) {
    case 'snapper':
      // Driven by the world frame rather than the crab's own clock, so a stunned
      // crab visibly stops scuttling instead of freezing mid-stride.
      return (frame / WALK_HOLD) % 2 < 1 ? art.snapper0 : art.snapper1
    case 'drifter':
      return (e.clock / WALK_HOLD) % 2 < 1 ? art.drifter0 : art.drifter1
    case 'puffer':
      return e.inflated > 0 ? art.pufferInflated : art.pufferDeflated
  }
}
