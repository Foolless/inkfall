/**
 * The completability solver.
 *
 * One of the four load-bearing tests (PLAN.md). It walks a level's geometry and
 * proves you can get from the start to the exit **at the Spent tier**, on two
 * pips. Because a player can always arrive at any section Spent, a section that
 * needs three pips is a genuine unfairness bug — and it is invisible to a
 * developer who always plays at Full.
 *
 * ## What it models, and what it does not
 *
 * This is a **geometry** solver, not a simulation. It knows how far Nib can
 * travel in one flight and what terrain is in the way. It does not know about
 * enemy patrol phases, clam timing, or whether a jump is hard. A level that
 * passes is *possible*; whether it is *fair* is still a human question.
 *
 * Two deliberate choices keep it useful rather than merely green:
 *
 * **The reach numbers understate Nib.** They are rounded down from the feel
 * guarantees (PRD §4.3), so the solver believes he is slightly worse than he
 * is. A solver that overstated reach would bless a level nobody can finish;
 * one that understates it only ever forces a designer to be more generous.
 *
 * **A flight is one edge.** Nodes are places Nib can come to rest, and ink
 * refills for free while grounded or in water, so pips only bind *within* a
 * single flight. An edge costing more pips than the tier holds simply does not
 * exist. That is exactly the question PRD §12.8 asks.
 */

import { DISPLAY, SPENT, TIERS, UPGRADES, type TierIndex } from './constants.js'
import { Tile, tileAt, type TileMap } from './tilemap.js'
import { spawnClam, type Clam } from './hazards.js'
import { hasUpgrade, maskOf, type UpgradeId } from './upgrades.js'
import type { LoadedLevel } from '../content/levels/format.js'

const T = DISPLAY.TILE

/**
 * How far Nib gets in one flight, per pip spent, in tiles.
 *
 * Rounded down from the guarantees: a full-run jump clears 4 across and 3 up;
 * a jump plus one horizontal dash clears 7; a jump plus an up-dash reaches 6.
 * Everything beyond one dash is estimated conservatively.
 */
export interface Envelope {
  /** Highest reachable, in tiles above the source. */
  up: number
  /** Horizontal span available when climbing that high. */
  upSpan: number
  /** Horizontal span available on a level or slightly rising flight. */
  span: number
  /** How far a fall can carry, horizontally, at this cost. */
  fallSpan: number
}

export const ENVELOPES: readonly Envelope[] = [
  // 0 pips — a plain run jump.
  { up: 3, upSpan: 4, span: 4, fallSpan: 4 },
  // 1 pip — jump plus one dash, in whichever direction it is spent.
  { up: 6, upSpan: 3, span: 7, fallSpan: 8 },
  // 2 pips — two dashes in one flight.
  { up: 8, upSpan: 5, span: 10, fallSpan: 12 },
  // 3 pips — only reachable with Deep Jet's fourth pip.
  { up: 10, upSpan: 6, span: 13, fallSpan: 14 },
  // 4 pips.
  { up: 12, upSpan: 7, span: 16, fallSpan: 16 },
]

/** The furthest a fall can drop, in tiles. Terminal velocity, one screen-ish. */
const MAX_FALL = 20

export interface ReachOptions {
  tier?: TierIndex
  /**
   * Ids from PRD §8.5.
   *
   * Four of the five change what the solver believes about a level, and each
   * one in a different register: **Deep Jet** widens the envelope, **Ink Bomb**
   * and **Heat Shell** open terrain, and **Cling** adds places to rest. Ink
   * Shot changes nothing here, because killing a Drifter has never been what
   * made a gap crossable.
   */
  upgrades?: readonly string[]
}

export interface ReachResult {
  /** Tile indices Nib can come to rest in. */
  reachable: ReadonlySet<number>
  reachedExit: boolean
  /** Pearls this configuration cannot get to, by their slot id. */
  unreachablePearls: number[]
  /** Every checkpoint reachable? A conch you cannot touch is a dead conch. */
  reachedCheckpoints: boolean
  /** How many pips a single flight may spend under these options. */
  maxPips: number
}

/**
 * How tall an opening Nib needs, in tiles.
 *
 * Both drawn tiers are shorter than one 16px tile — Full is 12x14, Spent is
 * 10x10 — so both need exactly one clear tile, and **a one-tile gap does not
 * exclude Full Nib**. PRD §7.1's small-only passages cannot be built from plain
 * geometry at these numbers; see the open questions in the PRD. This is derived
 * from the hitbox rather than assumed, so it becomes true on its own the day
 * the tier boxes change.
 */
export function clearanceTiles(tier: TierIndex): number {
  return Math.ceil(TIERS[tier]!.h / T)
}

function isGroundTile(map: TileMap, tx: number, ty: number): boolean {
  const t = tileAt(map, tx, ty)
  // Crumble counts: it holds for at least 24 frames, which is a platform.
  // Cracked and fused count too — they are walls until an upgrade removes
  // them, and a wall is something to stand on.
  return (
    t === Tile.SOLID ||
    t === Tile.SLICK ||
    t === Tile.ONEWAY ||
    t === Tile.CRUMBLE ||
    t === Tile.CRACKED ||
    t === Tile.FUSED ||
    t === Tile.KNOT
  )
}

function isBlocking(map: TileMap, tx: number, ty: number, small: boolean): boolean {
  const t = tileAt(map, tx, ty)
  // A crack is solid to everyone but Spent Nib, which is what makes a
  // small-only shortcut expressible — and assertable.
  if (t === Tile.CRACK) return !small
  // The upgrade-opened terrain is solid here too; `opened()` is what lets a
  // solver holding the right upgrade walk through it.
  return (
    t === Tile.SOLID ||
    t === Tile.SLICK ||
    t === Tile.CRUMBLE ||
    t === Tile.CRACKED ||
    t === Tile.FUSED ||
    t === Tile.KNOT
  )
}

/**
 * Magma is a hazard like urchins are. Superheated water is not.
 *
 * §7.5 C1 crosses hot pools in stages against a ninety-frame scald timer, which
 * is a *timing* problem, and this solver is deliberately not a timing solver
 * (see the header). Treating hot water as passable is the honest reading:
 * whether the crossing is fair is a human question, whether it exists is this
 * one.
 */
function isDeadly(map: TileMap, tx: number, ty: number): boolean {
  const t = tileAt(map, tx, ty)
  return t === Tile.HAZARD || t === Tile.MAGMA
}

function isFluidTile(map: TileMap, tx: number, ty: number): boolean {
  const t = tileAt(map, tx, ty)
  return t === Tile.WATER || t === Tile.HOT || (t >= Tile.CURRENT_R && t <= Tile.CURRENT_D)
}

/**
 * Footing that is not terrain.
 *
 * Two things in the game are platforms without being tiles, and both are
 * platforms *some of the time*: a crush clam's shell while it is closed, and a
 * Hookline's flat top for the whole of its sweep. Timing is a human problem;
 * existence is the solver's, and a corridor whose only footing is closed shells
 * (PRD §7.2 C2) or a twenty-tile gap crossed on three hooks (§7.4 B2) has to
 * pass — those rooms are built on nothing else.
 *
 * A hook contributes every tile along its path rather than its current
 * position, because over one cycle it visits all of them and Nib can wait.
 */
function entityGround(level: LoadedLevel, clams: readonly Clam[]): { footing: Set<number>; solid: Set<number> } {
  const footing = new Set<number>()
  const solid = new Set<number>()
  const key = (tx: number, ty: number) => ty * 100000 + tx

  // A closed clam is footing *and* a wall — its shell fills the cell, so Nib
  // cannot be inside one. A hook is only ever footing: the space its top sweeps
  // through is the space he is standing in.
  for (const c of clams) {
    const ty = Math.floor(c.y / T)
    for (let tx = Math.floor(c.x / T); tx < Math.floor((c.x + c.w) / T); tx++) {
      footing.add(key(tx, ty))
      solid.add(key(tx, ty))
    }
  }

  for (const e of level.entities) {
    if (e.type !== 'hookline') continue
    const span = e.span ?? 6
    const drop = e.drop ?? 5
    const dir = e.dir === 'left' ? -1 : 1
    // The whole swept rectangle: it descends `drop` rows and travels `span`
    // columns, and every cell in that path is somewhere the top has been.
    for (let dx = 0; dx <= span; dx++) {
      for (let dy = 0; dy <= drop; dy++) footing.add(key(e.x + dir * dx, e.y + dy))
    }
  }
  return { footing, solid }
}

export function analyseReach(level: LoadedLevel, options: ReachOptions = {}): ReachResult {
  const { map } = level
  const tier = options.tier ?? 0
  const held = maskOf(options.upgrades)
  const has = (id: UpgradeId) => hasUpgrade(held, id)
  const maxPips = TIERS[tier]!.inkMax + (has('deepJet') ? UPGRADES.DEEP_JET_PIPS : 0)
  const clearance = clearanceTiles(tier)
  const small = tier === SPENT

  // Terrain an upgrade opens is simply *not there* as far as geometry goes.
  // Modelling it as removed rather than as a special case is what keeps the
  // solver honest in both directions: without the upgrade the wall is a wall,
  // and the level has to be finishable anyway.
  const opened = (tx: number, ty: number): boolean => {
    const t = tileAt(map, tx, ty)
    if (t === Tile.KNOT) return has('inkShot')
    if (t === Tile.CRACKED) return has('inkBomb')
    if (t === Tile.FUSED) return has('heatShell')
    return false
  }

  /**
   * Magma is a hazard like urchins are — unless Heat Shell is held.
   *
   * §8.5 buys ninety frames of standing in it, which is enough to cross one
   * pool and not enough to live in one. That is a *timing* question and this
   * solver is deliberately not a timing solver (see the header), so with the
   * shell a magma tile is passable and whether the crossing is fair stays a
   * human question. Without it, magma is exactly as fatal as a spike.
   */
  const deadly = (tx: number, ty: number): boolean => {
    const t = tileAt(map, tx, ty)
    if (t === Tile.MAGMA) return !has('heatShell')
    return isDeadly(map, tx, ty)
  }

  const clams = level.entities
    .filter((e): e is typeof e & { type: 'clam' } => e.type === 'clam')
    .map(spawnClam)
  const carried = entityGround(level, clams)
  const isFooting = (tx: number, ty: number) => carried.footing.has(ty * 100000 + tx)
  const fillsTheCell = (tx: number, ty: number) => carried.solid.has(ty * 100000 + tx)

  /** Can Nib occupy this cell — enough clear headroom, and nothing lethal? */
  const open = (tx: number, ty: number): boolean => {
    if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return false
    for (let i = 0; i < clearance; i++) {
      if (opened(tx, ty - i)) continue
      if (isBlocking(map, tx, ty - i, small) || deadly(tx, ty - i)) return false
      if (fillsTheCell(tx, ty - i)) return false
    }
    return true
  }

  const ground = (tx: number, ty: number): boolean =>
    !opened(tx, ty) && (isGroundTile(map, tx, ty) || isFooting(tx, ty))

  /**
   * Cling turns a wall into somewhere to rest.
   *
   * Understated on purpose, like every number in this file: the solver grants a
   * grip only where there is wall directly beside the cell, and it does not
   * model the sixty-frame limit or the pip a re-grip costs. Both of those make
   * the real thing *harder* than the model, which is the safe direction — a
   * solver that overstated reach would bless a shaft nobody can climb.
   */
  const clingable = (tx: number, ty: number): boolean =>
    has('cling') && (ground(tx - 1, ty) || ground(tx + 1, ty))

  /** Can he come to rest here — ground under his feet, or water around him? */
  const standable = (tx: number, ty: number): boolean => {
    if (!open(tx, ty)) return false
    if (isFluidTile(map, tx, ty)) return true
    if (ground(tx, ty + 1)) return true
    return clingable(tx, ty)
  }

  // Index rest points by column, so an edge search looks at a handful of
  // candidates rather than the whole grid.
  const byColumn: number[][] = Array.from({ length: map.width }, () => [])
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (standable(tx, ty)) byColumn[tx]!.push(ty)
    }
  }

  const envelope = ENVELOPES[Math.min(maxPips, ENVELOPES.length - 1)]!
  const start = findStandingSpot(level.start.x, level.start.y, standable, map.height)
  const reachable = new Set<number>()
  if (start === null) {
    return { reachable, reachedExit: false, unreachablePearls: [0, 1, 2], reachedCheckpoints: false, maxPips }
  }

  const index = (tx: number, ty: number) => ty * map.width + tx
  const queue: number[] = [index(start.x, start.y)]
  reachable.add(queue[0]!)

  while (queue.length > 0) {
    const node = queue.pop()!
    const x = node % map.width
    const y = Math.floor(node / map.width)

    const spanLimit = Math.max(envelope.span, envelope.fallSpan)
    for (let nx = Math.max(0, x - spanLimit); nx <= Math.min(map.width - 1, x + spanLimit); nx++) {
      for (const ny of byColumn[nx]!) {
        const id = index(nx, ny)
        if (reachable.has(id)) continue
        if (!withinEnvelope(x, y, nx, ny, envelope)) continue
        if (!pathClear(open, x, y, nx, ny)) continue
        reachable.add(id)
        queue.push(id)
      }
    }

    // Swimming is cheap and omnidirectional; treat adjacency in water as free
    // rather than trying to fit it into a jump envelope.
    if (isFluidTile(map, x, y)) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx
        const ny = y + dy
        if (!open(nx, ny) || !isFluidTile(map, nx, ny)) continue
        const id = index(nx, ny)
        if (reachable.has(id)) continue
        reachable.add(id)
        queue.push(id)
      }
    }
  }

  const exitReached =
    level.exit !== null &&
    [...reachable].some((id) => {
      const tx = id % map.width
      const ty = Math.floor(id / map.width)
      return Math.abs(tx - level.exit!.x) <= 1 && Math.abs(ty - level.exit!.y) <= 1
    })

  const unreachablePearls = level.entities
    .filter((e): e is typeof e & { type: 'pearl' } => e.type === 'pearl')
    .filter((p) => !touches(reachable, map.width, p.x, p.y))
    .map((p) => p.id)

  const reachedCheckpoints = level.checkpoints.every((c) => touches(reachable, map.width, c.x, c.y))

  return { reachable, reachedExit: exitReached, unreachablePearls, reachedCheckpoints, maxPips }
}

/** A collectible counts as got if Nib can rest in or beside its tile. */
function touches(reachable: ReadonlySet<number>, width: number, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (reachable.has((y + dy) * width + (x + dx))) return true
    }
  }
  return false
}

/** The start marker floats; drop it to the first rest point beneath. */
function findStandingSpot(
  x: number,
  y: number,
  standable: (tx: number, ty: number) => boolean,
  height: number,
): { x: number; y: number } | null {
  for (let ty = y; ty < height; ty++) {
    if (standable(x, ty)) return { x, y: ty }
  }
  return null
}

function withinEnvelope(x: number, y: number, nx: number, ny: number, e: Envelope): boolean {
  const dx = Math.abs(nx - x)
  const rise = y - ny // positive is upward

  if (rise > 0) {
    if (rise > e.up) return false
    // Climbing high and travelling far at once is the thing that does not
    // happen: a dash spends its whole budget on one axis.
    const allowed = rise <= 1 ? e.span : rise <= e.up / 2 ? Math.max(e.upSpan, e.span - rise) : e.upSpan
    return dx <= allowed
  }

  const drop = -rise
  if (drop > MAX_FALL) return false
  return dx <= (drop > 0 ? e.fallSpan : e.span)
}

/**
 * Is there room to travel between two rest points?
 *
 * Modelled as an L rather than a straight line: rise in the source column to
 * the destination's height, then travel across. That is close to how a jump
 * actually works — up, then over — and it fixes the failure a straight line
 * has, which is that the line to any thin platform passes *through* the
 * platform you are trying to land on. A slab one tile thick is unreachable
 * under a straight-line check no matter how close it is.
 *
 * For a fall the same expression reads the other way round: travel across at
 * the source's height, then drop. `min` picks the right corner for both.
 */
function pathClear(
  open: (tx: number, ty: number) => boolean,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const corner = Math.min(y0, y1)

  for (let y = y0; y !== corner; y += corner < y0 ? -1 : 1) {
    if (!open(x0, y)) return false
  }
  const step = x1 >= x0 ? 1 : -1
  for (let x = x0; x !== x1; x += step) {
    if (!open(x, corner)) return false
  }
  for (let y = corner; y !== y1; y += y1 > corner ? 1 : -1) {
    if (!open(x1, y)) return false
  }
  return open(x1, y1)
}
