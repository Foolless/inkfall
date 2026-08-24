/**
 * Which cel an enemy is showing.
 *
 * Presentation, like Nib's animation state machine, and for the same reason:
 * nothing here may feed back into the simulation. Unlike Nib's, this needs no
 * state at all — every enemy's cycle is a function of the world frame and the
 * enemy's own clock and state, all of which the simulation already owns.
 *
 * Every enemy whose behaviour has a *readable* state gets a cel per state
 * rather than a walk cycle: a flaring turret, a lashing stalk, a charging
 * angler. The animation is the telegraph, so it is worth more frames than
 * scuttling is.
 */

import * as art from '../content/sprites/enemies.js'
import * as kelp from '../content/sprites/kelp.js'
import * as wreck from '../content/sprites/wreck.js'
import * as vents from '../content/sprites/vents.js'
import * as abyss from '../content/sprites/abyss.js'
import type { SpriteDef } from '../content/sprites/format.js'
import {
  isFlaring,
  LIGHTLESS_LURKING,
  WHIPKELP_LASHING,
  EEL_SOCKETED,
  type Enemy,
} from '../game/enemies/index.js'

/** Frames each cel holds. Slow enough to read, fast enough to look alive. */
const WALK_HOLD = 8

/** Alternate between two cels on the given clock. */
function flip<T>(clock: number, a: T, b: T, hold = WALK_HOLD): T {
  return (clock / hold) % 2 < 1 ? a : b
}

export function enemyFrame(e: Enemy, frame: number): SpriteDef {
  switch (e.kind) {
    case 'snapper':
      // Driven by the world frame rather than the crab's own clock, so a stunned
      // crab visibly stops scuttling instead of freezing mid-stride.
      return flip(frame, art.snapper0, art.snapper1)
    case 'drifter':
      return flip(e.clock, art.drifter0, art.drifter1)
    case 'puffer':
      return e.inflated > 0 ? art.pufferInflated : art.pufferDeflated

    case 'barbTurret':
      return isFlaring(e) ? kelp.turretFlare : kelp.turretIdle
    case 'whipkelp':
      return e.state === WHIPKELP_LASHING ? kelp.whipkelpLashing : kelp.whipkelpCoiled
    case 'eel':
      return e.state === EEL_SOCKETED ? kelp.eelSocketed : kelp.eelFlaring

    case 'ghostDiver':
      // Slower than everything else, because it is slower than everything else.
      return flip(frame, wreck.ghostDiver0, wreck.ghostDiver1, WALK_HOLD * 3)
    case 'hookline':
      return wreck.hookline

    case 'magmaSnail':
      return flip(frame, vents.magmaSnail0, vents.magmaSnail1, WALK_HOLD * 2)
    case 'cinderMoth':
      return flip(frame, vents.cinderMoth0, vents.cinderMoth1, 5)

    case 'boneShrimp':
      return flip(frame, abyss.boneShrimp0, abyss.boneShrimp1, 5)
    case 'lightless':
      return e.state === LIGHTLESS_LURKING ? abyss.lightlessLurking : abyss.lightlessCharging
    case 'shrimpVent':
      return e.alive ? abyss.shrimpVentOpen : abyss.shrimpVentSealed
  }
}
