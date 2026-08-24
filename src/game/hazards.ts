/**
 * Hazards with state.
 *
 * Static hazards are tiles — urchin spikes are `HAZARD`, collapsing sand is
 * `CRUMBLE`, magma is `MAGMA`, and all of them are already in the tilemap.
 * What lives here is everything that has a *clock*: the crush clam, a bubble
 * stream, a rising surface, and the abyss's pressure rooms.
 *
 * **Hazards are instant death at any tier** (PRD §4.4). Geometry kills;
 * creatures cost. That split is what keeps the world readable — a player who
 * learns it once never has to ask whether a thing will cost them a pip or a
 * life. Two things in this file are deliberate exceptions and both are exempt
 * for the same reason: they are *enemy output* rather than terrain. A Cinder
 * Moth's ember costs a tier (§6.2), and Heat Shell turns heat off entirely.
 */

import { DISPLAY, HAZARDS } from './constants.js'
import { boxesOverlap, type Box } from './collision.js'
import type { EntityDef } from '../content/levels/format.js'
import { kill, type Player } from './player.js'

const T = DISPLAY.TILE

export type ClamState = 'open' | 'slamming' | 'closed'

export interface Clam extends Box {
  /** Frames into the cycle, offset by the authored phase. */
  clock: number
  /**
   * The authored offset, kept so a respawn restores the rhythm the designer
   * wrote rather than resetting every clam in the corridor to the same beat.
   */
  phase: number
}

/** Two tiles wide, one tall. Big enough to stand on, big enough to fall into. */
export const CLAM_SIZE = { w: T * 2, h: T }

export function spawnClam(def: EntityDef & { type: 'clam' }): Clam {
  return {
    x: def.x * T,
    y: def.y * T,
    w: CLAM_SIZE.w,
    h: CLAM_SIZE.h,
    // Authored phase offsets a clam within the cycle, which is how a corridor
    // of three clams becomes a rhythm puzzle rather than three copies of one.
    clock: def.phase ?? 0,
    phase: def.phase ?? 0,
  }
}

export const CLAM_CYCLE = HAZARDS.CLAM_OPEN + HAZARDS.CLAM_SLAM + HAZARDS.CLAM_CLOSED

export function clamState(c: Clam): ClamState {
  const t = ((c.clock % CLAM_CYCLE) + CLAM_CYCLE) % CLAM_CYCLE
  if (t < HAZARDS.CLAM_OPEN) return 'open'
  if (t < HAZARDS.CLAM_OPEN + HAZARDS.CLAM_SLAM) return 'slamming'
  return 'closed'
}

/**
 * The generous telegraph the honest-difficulty pillar demands.
 *
 * Twenty frames of shudder before six frames of slam. The slam is fast because
 * a slow one is not frightening; the warning is long because a death you could
 * not have seen coming is the one thing the game promises never to do.
 */
export function isTelegraphing(c: Clam): boolean {
  const t = ((c.clock % CLAM_CYCLE) + CLAM_CYCLE) % CLAM_CYCLE
  return clamState(c) === 'open' && t >= HAZARDS.CLAM_OPEN - HAZARDS.CLAM_TELEGRAPH
}

/** Closed, the shell is footing. Open, there is nothing there to stand on. */
export function isClamSolid(c: Clam): boolean {
  return clamState(c) === 'closed'
}

/** Open or slamming, the mouth is instant death — at any tier, like every hazard. */
export function isClamDeadly(c: Clam): boolean {
  return clamState(c) !== 'closed'
}

export function updateClam(c: Clam): void {
  c.clock++
}

/** Every clam currently acting as a platform, for the collision sweep. */
export function clamSolids(clams: readonly Clam[], into: Box[]): Box[] {
  into.length = 0
  for (const c of clams) if (isClamSolid(c)) into.push(c)
  return into
}

/**
 * Standing where a clam is about to close kills you when it does.
 *
 * Checked after the clams tick and after Nib moves, so the frame a shell slams
 * shut on him is the frame he dies — not the one after, when he would already
 * have been drawn safely inside a closed shell.
 */
export function checkClams(clams: readonly Clam[], p: Player): boolean {
  if (!p.alive) return false
  for (const c of clams) {
    if (!isClamDeadly(c) || !boxesOverlap(p, c)) continue
    kill(p)
    return true
  }
  return false
}

// ── Bubble streams ──────────────────────────────────────────────────────────

/**
 * A column of rising bubbles. Worlds 2 and 3. PRD §6.2.
 *
 * Each bubble is one frame of contact and an upward carry, and then it is gone
 * until the column recycles it. §7.3 C2 is a bubble ladder up a strong
 * downdraft: the bubbles pop after one use, so a mistimed jump means falling
 * the whole shaft, and the room is a rhythm rather than a staircase.
 *
 * Positions are **computed from the clock**, never integrated, for the same
 * reason a Drifter's sine is: a bubble Nib is standing on must be in exactly
 * the same place on frame ten thousand of a replay as on frame ten. The only
 * mutable state is which pass of the column each bubble was popped on, which
 * is what makes "pop after 1 use" survive the recycle without a spawn queue.
 */
export interface Bubble {
  /** Centre column, in pixels. */
  x: number
  /** The bottom of the column — where bubbles are born. */
  bottom: number
  /** How tall the column is, in pixels. */
  height: number
  clock: number
  phase: number
  /** How many bubbles are in flight at once. Derived from the height. */
  count: number
  /** Per bubble: the pass number it was popped on, or -1 for never. */
  popped: number[]
}

export const BUBBLE_SIZE = 8

export function spawnBubble(def: EntityDef & { type: 'bubble' }): Bubble {
  const height = (def.height ?? 4) * T
  const phase = def.phase ?? 0
  // One bubble per SPACING frames of travel, so a taller column has more of
  // them rather than the same few spread thinner.
  const count = Math.max(1, Math.round(height / (HAZARDS.BUBBLE_RISE * HAZARDS.BUBBLE_SPACING)))
  return {
    x: def.x * T + T / 2,
    bottom: def.y * T + T,
    height,
    clock: phase,
    phase,
    count,
    popped: new Array<number>(count).fill(-1),
  }
}

export function updateBubble(b: Bubble): void {
  b.clock++
}

/** How far up the column bubble `i` currently is, in pixels travelled. */
function travelled(b: Bubble, i: number): number {
  const spacing = b.height / b.count
  return b.clock * HAZARDS.BUBBLE_RISE + i * spacing
}

/** Which pass of the column bubble `i` is on. Popping is per pass. */
export function bubblePass(b: Bubble, i: number): number {
  return Math.floor(travelled(b, i) / b.height)
}

/** A bubble's box, or null if it has already been used on this pass. */
export function bubbleBox(b: Bubble, i: number): Box | null {
  if (b.popped[i] === bubblePass(b, i)) return null
  const up = travelled(b, i) % b.height
  return { x: b.x - BUBBLE_SIZE / 2, y: b.bottom - up - BUBBLE_SIZE, w: BUBBLE_SIZE, h: BUBBLE_SIZE }
}

/**
 * Ride whatever bubble Nib is touching. Returns true if one carried him.
 *
 * The carry is set as a velocity rather than added to one, so arriving fast
 * and arriving slow give the same lift. A bubble that rewarded a faster
 * approach would make the ladder a speed puzzle, and §7.3 C2 wants it to be a
 * timing one.
 */
export function rideBubbles(bubbles: readonly Bubble[], p: Player): boolean {
  if (!p.alive) return false
  for (const b of bubbles) {
    for (let i = 0; i < b.count; i++) {
      const box = bubbleBox(b, i)
      if (!box || !boxesOverlap(p, box)) continue
      b.popped[i] = bubblePass(b, i)
      p.vy = HAZARDS.BUBBLE_CARRY
      p.jumping = false
      return true
    }
  }
  return false
}

// ── Rising surfaces ─────────────────────────────────────────────────────────

/**
 * A surface that climbs — World 3's flood and World 4's magma. PRD §6.2.
 *
 * One entity for two hazards, because they are one mechanic seen twice: a
 * horizontal line that starts when Nib crosses a trigger column and rises at a
 * fixed rate until it reaches its stop. Water lifts you and magma kills you,
 * and that difference is a field rather than a second module.
 *
 * Modelled as a **line rather than as tiles** on purpose. Rewriting the grid as
 * it rose would mutate the level's own map, which two runs of the same level
 * share — and a hazard that permanently edited its level would make the second
 * attempt a different room from the first.
 */
export interface Rise {
  fluid: 'magma' | 'flood'
  /** Crossing this column, in pixels, starts the clock. */
  triggerX: number
  /** The current surface, in pixels. Falls (numerically) as it rises. */
  y: number
  startY: number
  /** Where it stops. Above `startY`, checked by the level validator. */
  topY: number
  rate: number
  armed: boolean
}

export function spawnRise(def: EntityDef & { type: 'rise' }): Rise {
  return {
    fluid: def.fluid,
    triggerX: def.x * T,
    y: def.y * T,
    startY: def.y * T,
    topY: def.top * T,
    rate: def.rate ?? (def.fluid === 'magma' ? HAZARDS.RISE_MAGMA : HAZARDS.RISE_FLOOD),
    armed: false,
  }
}

export function updateRise(r: Rise, p: Player): void {
  // Armed by Nib reaching the column, never by the frame counter: a room's
  // timer has to start when the player enters the room, or a slow first
  // playthrough arrives at a room that has already drowned.
  if (!r.armed && p.alive && p.x + p.w >= r.triggerX) r.armed = true
  if (!r.armed) return
  r.y = Math.max(r.topY, r.y - r.rate)
}

/** Is this box under an active surface, and what kind? */
export function riseAt(rises: readonly Rise[], box: Box): Rise | null {
  for (const r of rises) {
    if (!r.armed) continue
    if (box.y + box.h / 2 >= r.y) return r
  }
  return null
}

// ── Pressure rooms ──────────────────────────────────────────────────────────

/**
 * The abyss itself. PRD §6.2: stand still for three seconds and it kills you.
 *
 * The vignette closes over the last second, which is the telegraph — the room
 * has to say *move* before it says *dead*, and a pressure room with no warning
 * would be the exact death the honest-difficulty pillar forbids.
 *
 * Bounded to a box rather than applied level-wide because §7.6 says "in two
 * rooms". A level where standing still is always fatal is not tense, it is
 * exhausting, and it would make reading an unfamiliar room impossible.
 */
export type Pressure = Box

export function spawnPressure(def: EntityDef & { type: 'pressure' }): Pressure {
  return { x: def.x * T, y: def.y * T, w: def.w * T, h: def.h * T }
}

/** How close to being crushed Nib is, 0 to 1. Drives the vignette and the kill. */
export function pressureLoad(zones: readonly Pressure[], p: Player): number {
  if (!p.alive) return 0
  const inside = zones.some((z) => boxesOverlap(p, z))
  if (!inside) return 0
  return Math.min(1, p.stillFrames / HAZARDS.PRESSURE_FRAMES)
}

export function checkPressure(zones: readonly Pressure[], p: Player): boolean {
  if (pressureLoad(zones, p) < 1) return false
  kill(p)
  return true
}
