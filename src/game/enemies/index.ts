/**
 * Enemy dispatch.
 *
 * The only place that knows the whole roster. Everything else takes an `Enemy`
 * and asks it questions, which is what keeps "one enemy, one lesson" (PRD §6.1)
 * from turning into a switch statement in six files.
 */

import type { Box } from '../collision.js'
import type { TileMap } from '../tilemap.js'
import { updateDrifter } from './drifter.js'
import { isStompable, updatePuffer } from './puffer.js'
import { updateSnapper } from './snapper.js'
import type { Enemy } from './types.js'

export interface EnemyStepContext {
  map: TileMap
  collapsed: ReadonlySet<number>
  /** Nib's hitbox. Only the Puffer reads it, and only for its trigger radius. */
  player: Box
}

export function updateEnemy(ctx: EnemyStepContext, e: Enemy): void {
  if (!e.alive) return
  if (e.stun > 0) {
    // Stunned by the ink cloud Nib expels when he is hit. Frozen, not skipped:
    // the clock stops too, so a Drifter resumes its sine where it left off
    // rather than teleporting along the curve.
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
  }
}

/**
 * Can Nib kill this by landing on it?
 *
 * A Drifter never; a Puffer only while deflated; a Snapper always. This is the
 * single question every World 1 room is really asking.
 */
export function canStomp(e: Enemy): boolean {
  if (!e.alive) return false
  if (e.kind === 'drifter') return false
  if (e.kind === 'puffer') return isStompable(e)
  return true
}

export * from './types.js'
export { updateSnapper } from './snapper.js'
export { updateDrifter, drifterYAt } from './drifter.js'
export { updatePuffer, isStompable } from './puffer.js'
