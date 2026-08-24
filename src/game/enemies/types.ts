/**
 * The shared enemy model.
 *
 * One flat struct rather than a class per species. Two reasons: the update loop
 * must not allocate (PRD §12.6), and every behaviour has to be a pure function
 * of frame count and position for replay determinism to hold. A struct of
 * numbers is trivially both.
 *
 * `kind` dispatches to one file per species, per PRD §12.2.
 *
 * ## Why the flags rather than subclasses
 *
 * Twelve enemies (PRD §6.1) ask four questions between them, and every one of
 * them is asked from the combat pass rather than from inside the species:
 *
 *   - can it be **stomped**?           Snapper yes, Drifter never, Puffer sometimes
 *   - what does **ink** do to it?      kill, stun, or nothing — and *where* it must land
 *   - does touching it **kill**?       a Hookline does; everything else costs a tier
 *   - can it be **stunned** at all?    a Ghost Diver cannot be solved, only left
 *
 * Answering those with fields keeps `combat.ts` one readable pass instead of a
 * twelve-armed switch, and it means adding a thirteenth enemy is a row in a
 * table rather than an edit in four files.
 */

import { DISPLAY, ENEMIES } from '../constants.js'
import type { Box } from '../collision.js'
import type { EntityDef } from '../../content/levels/format.js'

const T = DISPLAY.TILE

export type EnemyKind =
  | 'snapper'
  | 'drifter'
  | 'puffer'
  | 'barbTurret'
  | 'whipkelp'
  | 'eel'
  | 'ghostDiver'
  | 'hookline'
  | 'magmaSnail'
  | 'cinderMoth'
  | 'boneShrimp'
  | 'lightless'
  | 'shrimpVent'

export const ENEMY_KINDS: readonly EnemyKind[] = [
  'snapper',
  'drifter',
  'puffer',
  'barbTurret',
  'whipkelp',
  'eel',
  'ghostDiver',
  'hookline',
  'magmaSnail',
  'cinderMoth',
  'boneShrimp',
  'lightless',
  'shrimpVent',
]

export function isEnemyKind(t: string): t is EnemyKind {
  return (ENEMY_KINDS as readonly string[]).includes(t)
}

/** What an ink bolt does on contact. PRD §6.1's "Ink?" column, as a type. */
export type InkEffect = 'kill' | 'stun' | 'none'

export interface Enemy extends Box {
  kind: EnemyKind
  vx: number
  vy: number
  facing: 1 | -1
  alive: boolean
  /** Frames since spawn. Sine floats, inflate cycles and turret timers read this. */
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
  /** Armour resists a Charged dash and a stomp alike. */
  armoured: boolean

  // ── The state machines ─────────────────────────────────────────────────────
  /**
   * A small integer per species, never a string.
   *
   * Numeric because the determinism hash is a `Float64Array` of the whole
   * simulation, and a number is a number in a way `'lunging'` is not.
   */
  state: number
  /** Frames left in the current state. */
  timer: number
  /** Which way it acts: a turret's barrel, an eel's socket, a hook's sweep. */
  dirX: number
  dirY: number
  /** Authored reach in pixels — a lash arc, a lunge, a hook's sweep width. */
  reach: number
  /** Authored offset into the cycle, so two of a thing are a rhythm. */
  phase: number

  // ── The four questions the combat pass asks ────────────────────────────────
  /** Contact kills outright rather than costing a tier. Hooklines only. */
  lethal: boolean
  /** Contact does nothing at all. A shrimp vent is a hole, not a creature. */
  harmless: boolean
  /** Immune to the shrink cloud. A Ghost Diver cannot be solved, only left. */
  stunProof: boolean
  /** Ignores terrain entirely — floats, or walks through walls. */
  phasing: boolean
  /** What an ink bolt does, and whether it must land somewhere specific. */
  ink: InkEffect
  /** Live children this thing is responsible for. A vent counts its shrimp. */
  spawned: number
}

/** Hurtboxes are smaller than sprites, which is most of what makes this fair. */
interface Species {
  w: number
  h: number
  /** Floaters hang in the middle of their tile; walkers stand on its floor. */
  floats: boolean
  armoured?: boolean
  lethal?: boolean
  harmless?: boolean
  stunProof?: boolean
  phasing?: boolean
  ink?: InkEffect
}

const SIZES: Record<EnemyKind, Species> = {
  snapper: { w: 14, h: 12, floats: false, ink: 'kill' },
  drifter: { w: 12, h: 12, floats: true, phasing: true, ink: 'kill' },
  puffer: { w: 12, h: 10, floats: false, ink: 'kill' },
  /** Armoured barnacle. Nothing kills it; the corridor is the puzzle. */
  barbTurret: { w: 12, h: 12, floats: true, armoured: true, ink: 'none' },
  /** The box is the *base*. The lash arc is computed and hurts separately. */
  whipkelp: { w: 12, h: 14, floats: false, ink: 'kill' },
  eel: { w: 14, h: 12, floats: true, armoured: true, ink: 'stun' },
  /** Through walls, through floors, through everything. */
  ghostDiver: { w: 12, h: 16, floats: true, armoured: true, stunProof: true, phasing: true, ink: 'none' },
  /** Instant death on contact — except the flat top, which is a platform. */
  hookline: { w: 14, h: 12, floats: true, armoured: true, lethal: true, stunProof: true, phasing: true, ink: 'none' },
  /** Armoured front and top; only the exposed rear takes ink. */
  magmaSnail: { w: 20, h: 14, floats: false, armoured: true, ink: 'kill' },
  cinderMoth: { w: 14, h: 12, floats: true, phasing: true, ink: 'kill' },
  boneShrimp: { w: 10, h: 8, floats: false, ink: 'kill' },
  /** Invisible but for the lure, which is also the only thing you can hit. */
  lightless: { w: 20, h: 14, floats: true, armoured: true, phasing: true, ink: 'kill' },
  /** Not a creature. A hole that produces shrimp until it is inked shut. */
  shrimpVent: { w: 14, h: 14, floats: false, armoured: true, harmless: true, stunProof: true, ink: 'kill' },
}

/**
 * A Puffer's spike ball, grown around its own bottom centre.
 *
 * Smaller than the 24x20 sprite that draws it, like every hurtbox in the game —
 * the spikes stick out further than the thing that hurts you.
 */
export const PUFFER_INFLATED = { w: 20, h: 16 }

/** Cardinal directions a turret or an eel can be authored to face. */
export const FACINGS: Record<string, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
}

export function spawnEnemy(def: EntityDef & { type: EnemyKind }): Enemy {
  const size = SIZES[def.type]
  const x = def.x * T + (T - size.w) / 2
  const y = size.floats ? def.y * T + (T - size.h) / 2 : def.y * T + (T - size.h)

  const patrol = 'patrol' in def ? def.patrol : undefined
  const dir = FACINGS['dir' in def && def.dir !== undefined ? def.dir : 'left'] ?? FACINGS.left!
  const phase = 'phase' in def && def.phase !== undefined ? def.phase : 0

  return {
    kind: def.type,
    x,
    y,
    w: size.w,
    h: size.h,
    vx: 0,
    vy: 0,
    facing: dir.x > 0 ? 1 : -1,
    alive: true,
    clock: phase,
    stun: 0,
    homeX: x,
    homeY: y,
    spawnW: size.w,
    spawnH: size.h,
    patrolLo: patrol ? patrol[0] * T : x,
    patrolHi: patrol ? patrol[1] * T + T - size.w : x,
    // "How far it travels off its anchor", which is a sine for a Drifter and a
    // drop distance for a Hookline. One field because it is one idea, and
    // because a struct with a `drop` used by exactly one species is a struct
    // that grows a field per enemy.
    amplitude:
      def.type === 'drifter'
        ? (def.amplitude ?? ENEMIES.DRIFTER_AMPLITUDE) * T
        : def.type === 'hookline'
          ? (def.drop ?? 5) * T
          : 0,
    period: def.type === 'drifter' ? (def.period ?? ENEMIES.DRIFTER_PERIOD) : 0,
    inflated: 0,
    armoured: size.armoured ?? false,
    state: 0,
    timer: 0,
    dirX: dir.x,
    dirY: dir.y,
    reach: reachOf(def) * T,
    phase,
    lethal: size.lethal ?? false,
    harmless: size.harmless ?? false,
    stunProof: size.stunProof ?? false,
    phasing: size.phasing ?? false,
    ink: size.ink ?? 'none',
    spawned: 0,
  }
}

/** Authored reach, in tiles, defaulting to whatever §6.1 gives the species. */
function reachOf(def: EntityDef & { type: EnemyKind }): number {
  if ('reach' in def && def.reach !== undefined) return def.reach
  if ('span' in def && def.span !== undefined) return def.span
  switch (def.type) {
    case 'whipkelp':
      return ENEMIES.WHIPKELP_REACH
    case 'eel':
      return ENEMIES.EEL_REACH
    case 'hookline':
      return 6
    case 'lightless':
      return ENEMIES.LIGHTLESS_LURE_RADIUS
    default:
      return 0
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
