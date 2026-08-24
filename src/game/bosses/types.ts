/**
 * The shape every boss has. PRD §6.3.
 *
 * Five bosses, one contract: **three hits, three phases, one arena, no health
 * bar**. The phase is *derived* from the hit count rather than stored, so the
 * two can never disagree — a boss whose phase and damage drift apart is a boss
 * that behaves differently depending on how it got there, which is the exact
 * opposite of practisable.
 *
 * Nothing here rolls dice. Every window below is a frame counter and every
 * choice is `beat % n`, because a boss that cannot be practised is not a NES
 * boss. The one thing that reads the player at all is *aim* — the King charges
 * toward you, the Captain drifts toward you — and never *whether*.
 *
 * ## Parts
 *
 * The King is one box. The other four are not: the Warden has four arms and a
 * core, the Captain has a lantern that may be one of three, the Vent Lord has
 * five vents, the Kraken has tentacles, a beak and an eye. Rather than four
 * bespoke structs, a boss carries a flat list of `BossPart`s — each one a box
 * with a clock and an `open` flag saying whether it is the thing you can hurt
 * right now.
 *
 * That flag is the whole damage model. `open` is true on exactly the part the
 * fight currently wants you to hit, and the combat pass never has to know which
 * boss it is looking at.
 */

import type { Box } from '../collision.js'
import type { TileMap } from '../tilemap.js'

export type BossState = 'waking' | 'idle' | 'charging' | 'exposed' | 'throwing' | 'dying' | 'dead'

/** What a part is. Presentation reads it; the combat pass only reads `open`. */
export type PartKind = 'arm' | 'core' | 'lantern' | 'head' | 'tentacle' | 'sucker' | 'beak' | 'eye' | 'vent'

/** How the open part must be hit. The one thing a boss teaches the player. */
export type PartHit = 'stomp' | 'ink' | 'dash'

export interface BossPart extends Box {
  kind: PartKind
  /** Slot index within its set — arm 0..3, vent 0..4. Stable and hashable. */
  index: number
  alive: boolean
  /**
   * True when this is the part the fight currently wants hit.
   *
   * Exactly one meaning across five bosses, which is what lets combat.ts stay
   * one pass: if it is open and you hit it the way it asks, that counts.
   */
  open: boolean
  /** How this part has to be hit while it is open. */
  hit: PartHit
  /**
   * Does touching this cost a tier?
   *
   * An arm does; the core it guards does not. That split is the whole reason
   * the combat pass can treat five bosses identically — "the part you hit" and
   * "the part that hits you" are different flags on the same struct.
   */
  hurtful: boolean
  state: number
  timer: number
  vx: number
  vy: number
  homeX: number
  homeY: number
}

export interface Boss extends Box {
  id: string
  state: BossState
  /** Frames left in the current state. */
  timer: number
  /** Hits landed. Three ends it; the phase is derived from this. */
  hits: number
  vx: number
  vy: number
  facing: 1 | -1
  /** Alternates the pattern, so what comes next is learnable. */
  beat: number
  /** True once this phase's summons have been let out. Only ever once. */
  spawnedGuards: boolean
  parts: BossPart[]
  /**
   * A force this boss applies to the whole arena.
   *
   * The Warden's Phase 3 downdraft and the Captain's tilting floor are the same
   * idea seen twice: the arena itself pushes, and the player has to spend
   * something to stand still. Read by the world and applied to Nib.
   */
  arenaForceX: number
  arenaForceY: number
  /** Rows of magma the Vent Lord has raised. The arena shrinks as you win. */
  floorRise: number
}

export interface BossStepContext {
  map: TileMap
  arena: Box
  player: Box
  rocks: Rock[]
  /** Called once when a phase begins, to let its summons out. */
  summonGuards: () => void
  /** Put a projectile into the world, for bosses that throw something. */
  fire?: (kind: 'bolt' | 'bomb' | 'barb' | 'ember', x: number, y: number, vx: number, vy: number) => void
}

export interface Rock extends Box {
  vx: number
  vy: number
  alive: boolean
}

/** 1, 2 or 3. Derived from the hit count so the two can never disagree. */
export function phaseOf(b: Boss): 1 | 2 | 3 {
  return Math.min(3, b.hits + 1) as 1 | 2 | 3
}

/** Every boss that is not the King starts from this. */
export function baseBoss(id: string, box: Box): Boss {
  return {
    id,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    state: 'waking',
    timer: 0,
    hits: 0,
    vx: 0,
    vy: 0,
    facing: -1,
    beat: 0,
    spawnedGuards: false,
    parts: [],
    arenaForceX: 0,
    arenaForceY: 0,
    floorRise: 0,
  }
}

export function part(kind: PartKind, index: number, hit: PartHit, box: Box, hurtful = false): BossPart {
  return {
    kind,
    index,
    alive: true,
    open: false,
    hit,
    hurtful,
    state: 0,
    timer: 0,
    vx: 0,
    vy: 0,
    homeX: box.x,
    homeY: box.y,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
  }
}

/**
 * Is the fight actually running?
 *
 * A boss that is waking, dying or dead has no open parts and no hazards,
 * whatever its parts happen to say. §6.3 wants every fight to have a beginning,
 * and a Warden whose arms could be shot during the wake-up would not have one —
 * a player could take the first hit off it before it had moved.
 */
export function isFighting(b: Boss): boolean {
  return b.state !== 'waking' && b.state !== 'dying' && b.state !== 'dead'
}

/** The part the fight currently wants hit, if any. */
export function openPart(b: Boss): BossPart | null {
  if (!isFighting(b)) return null
  return b.parts.find((p) => p.alive && p.open) ?? null
}

/** Every part the fight currently wants hit. The Warden opens four at once. */
export function openParts(b: Boss): BossPart[] {
  if (!isFighting(b)) return []
  return b.parts.filter((p) => p.alive && p.open)
}

/**
 * Can this boss be damaged at all right now?
 *
 * The King answers with his own state, because he *is* the part. Everything
 * else answers with whether it has opened something.
 */
export function isVulnerable(b: Boss): boolean {
  if (b.id === 'hermitKing') return b.state === 'exposed'
  return openPart(b) !== null
}
