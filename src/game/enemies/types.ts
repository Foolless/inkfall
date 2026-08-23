/**
 * The shared enemy model.
 *
 * One flat struct rather than a class per species. Two reasons: the update loop
 * must not allocate (PRD §12.6), and every behaviour has to be a pure function
 * of frame count and position for replay determinism to hold. A struct of
 * numbers is trivially both.
 *
 * `kind` dispatches to one file per species, per PRD §12.2.
 */

import { DISPLAY } from '../constants.js'
import type { Box } from '../collision.js'
import type { EntityDef } from '../../content/levels/format.js'

const T = DISPLAY.TILE

export type EnemyKind = 'snapper' | 'drifter' | 'puffer'

export const ENEMY_KINDS: readonly EnemyKind[] = ['snapper', 'drifter', 'puffer']

export function isEnemyKind(t: string): t is EnemyKind {
  return (ENEMY_KINDS as readonly string[]).includes(t)
}

export interface Enemy extends Box {
  kind: EnemyKind
  vx: number
  vy: number
  facing: 1 | -1
  alive: boolean
  /** Frames since spawn. Sine floats and inflate cycles read this. */
  clock: number
  /** Frames of stun left, from the ink cloud Nib expels when he is hit. */
  stun: number
  /** Spawn position and size in pixels — what a respawn restores exactly. */
  homeX: number
  homeY: number
  spawnW: number
  spawnH: number
  /** Patrol bounds in pixels. Equal bounds mean "no explicit patrol". */
  patrolLo: number
  patrolHi: number
  amplitude: number
  period: number
  /** Puffer only: frames left inflated. Zero means deflated and stompable. */
  inflated: number
  /**
   * Armour resists a Charged dash. Nothing in World 1 is armoured; the flag
   * exists so that adding a Barb Turret in Phase 3 is a field, not a refactor.
   */
  armoured: boolean
}

/** Hurtboxes are smaller than sprites, which is most of what makes this fair. */
const SIZES: Record<EnemyKind, { w: number; h: number; floats: boolean }> = {
  snapper: { w: 14, h: 12, floats: false },
  drifter: { w: 12, h: 12, floats: true },
  puffer: { w: 12, h: 10, floats: false },
}

/**
 * A Puffer's spike ball, grown around its own bottom centre.
 *
 * Smaller than the 24x20 sprite that draws it, like every hurtbox in the game —
 * the spikes stick out further than the thing that hurts you.
 */
export const PUFFER_INFLATED = { w: 20, h: 16 }

export function spawnEnemy(def: EntityDef & { type: EnemyKind }): Enemy {
  const size = SIZES[def.type]
  const x = def.x * T + (T - size.w) / 2
  // Walkers stand on the floor of their tile; floaters hang in the middle of it.
  const y = size.floats ? def.y * T + (T - size.h) / 2 : def.y * T + (T - size.h)

  const patrol = def.type === 'snapper' ? def.patrol : undefined
  return {
    kind: def.type,
    x,
    y,
    w: size.w,
    h: size.h,
    vx: 0,
    vy: 0,
    facing: -1, // crabs enter walking left, away from the player's approach
    alive: true,
    clock: 0,
    stun: 0,
    homeX: x,
    homeY: y,
    spawnW: size.w,
    spawnH: size.h,
    patrolLo: patrol ? patrol[0] * T : x,
    patrolHi: patrol ? patrol[1] * T + T - size.w : x,
    amplitude: (def.type === 'drifter' ? (def.amplitude ?? 3) : 0) * T,
    period: def.type === 'drifter' ? (def.period ?? 120) : 0,
    inflated: 0,
    armoured: false,
  }
}

/** True when the patrol bounds were authored rather than defaulted. */
export function hasPatrol(e: Enemy): boolean {
  return e.patrolHi > e.patrolLo
}

/**
 * The band across an enemy's head that reads as a stomp.
 *
 * Sits *above* the hurtbox, per PRD §12.4: the stompable top extends a couple
 * of pixels higher than the box that hurts you, so a near-miss lands in the
 * player's favour.
 */
export function stompBox(e: Enemy, band: number): Box {
  return { x: e.x, y: e.y - 2, w: e.w, h: band }
}

/** Everything Nib can be hurt by touching. Inflated Puffers grow this. */
export function hurtBox(e: Enemy): Box {
  return { x: e.x, y: e.y, w: e.w, h: e.h }
}
