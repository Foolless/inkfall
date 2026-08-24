/**
 * Enemy dispatch.
 *
 * The only place that knows the whole roster. Everything else takes an `Enemy`
 * and asks it questions, which is what keeps "one enemy, one lesson" (PRD §6.1)
 * from turning into a switch statement in six files.
 *
 * Four questions get asked from here, and the answers are the roster table in
 * §6.1 read column by column: can it be stomped, what does ink do to it and
 * where must the bolt land, does touching it kill, and what extra boxes does it
 * put into the world. A thirteenth enemy is a case in each of those and a new
 * file — never an edit anywhere else.
 */

import type { Box } from '../collision.js'
import type { TileMap } from '../tilemap.js'
import type { ProjectileKind } from '../projectiles.js'
import { updateDrifter } from './drifter.js'
import { isStompable, updatePuffer } from './puffer.js'
import { updateSnapper } from './snapper.js'
import { updateBarbTurret } from './barb-turret.js'
import { updateWhipkelp, whipkelpArm, whipkelpBase } from './whipkelp.js'
import { updateEel } from './eel.js'
import { updateGhostDiver } from './ghost-diver.js'
import { hookBarbs, hookPlatform, updateHookline } from './hookline.js'
import { snailRear, snailShell, updateMagmaSnail } from './magma-snail.js'
import { updateCinderMoth } from './cinder-moth.js'
import { updateBoneShrimp, updateShrimpVent, ventMouth } from './bone-shrimp.js'
import { lure, updateLightless } from './lightless.js'
import { hurtBox, type Enemy, type EnemyKind, type InkEffect } from './types.js'

export interface EnemyStepContext {
  map: TileMap
  collapsed: ReadonlySet<number>
  /** Nib's hitbox. Anything that reacts to him reads this and nothing else. */
  player: Box
  /**
   * Put a projectile into the world. Optional so a bare physics fixture can
   * step an enemy without standing up a projectile pool it does not want.
   */
  fire?: (kind: ProjectileKind, x: number, y: number, vx: number, vy: number) => void
  /** Let a vent produce a shrimp. Returns false when the world refuses. */
  spawn?: (kind: EnemyKind, x: number, y: number) => boolean
}

export function updateEnemy(ctx: EnemyStepContext, e: Enemy): void {
  if (!e.alive) return
  if (e.stun > 0) {
    // Stunned by the ink cloud Nib expels when he is hit, or by a bolt. Frozen,
    // not skipped: the clock stops too, so a Drifter resumes its sine where it
    // left off rather than teleporting along the curve.
    e.stun--
    return
  }

  switch (e.kind) {
    case 'snapper':
      updateSnapper(ctx.map, e, ctx.collapsed)
      break
    case 'drifter':
      updateDrifter(e)
      break
    case 'puffer':
      updatePuffer(ctx.map, e, ctx.player, ctx.collapsed)
      break
    case 'barbTurret':
      updateBarbTurret(e, (vx, vy) => ctx.fire?.('barb', e.x + e.w / 2, e.y + e.h / 2, vx, vy))
      break
    case 'whipkelp':
      updateWhipkelp(e)
      break
    case 'eel':
      updateEel(e, ctx.player)
      break
    case 'ghostDiver':
      updateGhostDiver(e, ctx.player)
      break
    case 'hookline':
      updateHookline(e)
      break
    case 'magmaSnail':
      updateMagmaSnail(ctx.map, e, ctx.collapsed)
      break
    case 'cinderMoth':
      updateCinderMoth(e, (x, y) => ctx.fire?.('ember', x, y, 0, 0))
      break
    case 'boneShrimp':
      updateBoneShrimp(ctx.map, e, ctx.player, ctx.collapsed)
      break
    case 'lightless':
      updateLightless(e, ctx.player)
      break
    case 'shrimpVent':
      updateShrimpVent(e, (x, y) => ctx.spawn?.('boneShrimp', x, y) ?? false)
      break
  }
}

/**
 * Can Nib kill this by landing on it? PRD §6.1's "Stomp?" column.
 *
 * Armour is the general answer and the Puffer is the interesting one: it is the
 * only enemy in the game whose answer changes while you are in the air toward
 * it, which is the entire reason it exists.
 */
export function canStomp(e: Enemy): boolean {
  if (!e.alive || e.armoured || e.harmless) return false
  switch (e.kind) {
    // Not everything unstompable is armoured. A Drifter is a bell of stinging
    // threads with no top at all, and a Whipkelp's base is a knot on the sea
    // floor with an arm over it — landing on either is a mistake, and being
    // able to ink one of them does not make it a platform.
    case 'drifter':
    case 'whipkelp':
      return false
    case 'puffer':
      return isStompable(e)
    default:
      return true
  }
}

/** What an ink bolt does to this thing. */
export function inkEffect(e: Enemy): InkEffect {
  return e.alive ? e.ink : 'none'
}

/**
 * Where a bolt has to land for that effect.
 *
 * Three enemies have a weak point rather than a weak body, and all three are
 * built around it: the Whipkelp's base, the Snail's rear, the Lightless's lure.
 * For everything else the answer is "anywhere", and returning the hurtbox
 * rather than null keeps the caller a single expression.
 */
export function inkTarget(e: Enemy): Box {
  switch (e.kind) {
    case 'whipkelp':
      return whipkelpBase(e)
    case 'magmaSnail':
      return snailRear(e)
    case 'lightless':
      return lure(e)
    case 'shrimpVent':
      return ventMouth(e)
    default:
      return hurtBox(e)
  }
}

/**
 * Everything about this enemy that hurts on contact, beyond its own box.
 *
 * Only the Whipkelp has one: the arm is a separate box from the base and is the
 * half you are *not* meant to attack. Returned as null the rest of the time so
 * the combat pass pays nothing for a feature one enemy uses.
 */
export function extraHurtBox(e: Enemy): Box | null {
  return e.kind === 'whipkelp' ? whipkelpArm(e) : null
}

/**
 * The part of a lethal enemy that actually kills.
 *
 * A Hookline is instant death everywhere except the flat top you ride, so
 * "lethal" cannot simply mean its whole box — that would make the platform a
 * platform you die on.
 */
export function lethalBox(e: Enemy): Box | null {
  if (!e.alive || !e.lethal) return null
  return e.kind === 'hookline' ? hookBarbs(e) : hurtBox(e)
}

/**
 * Boxes this enemy contributes to the collision sweep.
 *
 * The same mechanism closed crush clams already use: a solid that is not
 * terrain goes through the identical sub-stepped sweep, because a separate pass
 * is how a thing that is solid on Tuesday tunnels through on Wednesday.
 */
export function enemySolids(enemies: readonly Enemy[], into: Box[]): Box[] {
  into.length = 0
  for (const e of enemies) {
    if (!e.alive) continue
    if (e.kind === 'hookline') into.push(hookPlatform(e))
    else if (e.kind === 'magmaSnail') into.push(snailShell(e))
  }
  return into
}

export * from './types.js'
export { updateSnapper } from './snapper.js'
export { updateDrifter, drifterYAt } from './drifter.js'
export { updatePuffer, isStompable } from './puffer.js'
export { updateBarbTurret, isFlaring, turretPhase } from './barb-turret.js'
export { updateWhipkelp, whipkelpArm, whipkelpBase, armExtension, WHIPKELP_LASHING, WHIPKELP_IDLE } from './whipkelp.js'
export { updateEel, seesPlayer, socketEel, EEL_SOCKETED, EEL_FLARING, EEL_LUNGING, EEL_RETREATING } from './eel.js'
export { updateGhostDiver, GHOST_ROOM_TILES } from './ghost-diver.js'
export {
  updateHookline,
  hookPlatform,
  hookBarbs,
  hookPhase,
  HOOK_CYCLE,
  HOOK_DROPPING,
  HOOK_SWEEPING,
  HOOK_RETRACTING,
} from './hookline.js'
export { updateMagmaSnail, snailRear, snailShell } from './magma-snail.js'
export { updateCinderMoth } from './cinder-moth.js'
export { updateBoneShrimp, updateShrimpVent, ventMouth } from './bone-shrimp.js'
export {
  updateLightless,
  lure,
  inLight,
  lureRadius,
  LIGHTLESS_LURKING,
  LIGHTLESS_WINDING,
  LIGHTLESS_CHARGING,
  LIGHTLESS_RECOVERING,
} from './lightless.js'
