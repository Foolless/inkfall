/**
 * Everything in flight.
 *
 * Four things travel through the air in this game and they share one struct:
 * Nib's **ink bolt** and **ink bomb** (PRD §8.5), a Barb Turret's **barb**, and
 * a Cinder Moth's **ember** (§6.1). They are one module because they are one
 * problem — a small box, a velocity, a clock, and a rule for what it does when
 * it stops — and four modules would be four places for the same tunnelling bug
 * to live.
 *
 * Pooled and reused, never allocated mid-flight (PRD §12.6). `alive` is the
 * only thing that decides whether a slot is in play, so a level with forty
 * barbs in it costs forty structs once and nothing per frame thereafter.
 *
 * Ownership is a boolean rather than a source pointer. A bolt cannot hurt Nib
 * and a barb cannot hurt an eel, and that is the whole of what either needs to
 * know — carrying a reference to the thing that fired it would only invite
 * questions about what happens when that thing dies mid-flight.
 */

import { boxesOverlap, moveX, moveY, type Box } from './collision.js'
import { DISPLAY, ENEMIES, UPGRADES } from './constants.js'
import { Tile, tileAt, type TileMap } from './tilemap.js'

const T = DISPLAY.TILE

export type ProjectileKind = 'bolt' | 'bomb' | 'barb' | 'ember'

export interface Projectile extends Box {
  kind: ProjectileKind
  vx: number
  vy: number
  alive: boolean
  /** Frames since it was fired. Fuse, lifetime and burn all read this. */
  clock: number
  /** True for anything Nib threw. Decides who it is allowed to hurt. */
  friendly: boolean
  /**
   * Raised on the single frame a bomb goes off, and cleared by whoever reads
   * it. A blast is an event, and an event that lingers gets applied twice.
   */
  detonated: boolean
  /** True once an ember has landed and is burning where it sits. */
  settled: boolean
}

/** Hitboxes, in pixels. All small: a projectile you cannot dodge is a wall. */
export const PROJECTILE_SIZE: Record<ProjectileKind, { w: number; h: number }> = {
  bolt: { w: 6, h: 6 },
  bomb: { w: 8, h: 8 },
  barb: { w: 6, h: 4 },
  ember: { w: 8, h: 6 },
}

function blank(): Projectile {
  return {
    kind: 'bolt',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    vx: 0,
    vy: 0,
    alive: false,
    clock: 0,
    friendly: false,
    detonated: false,
    settled: false,
  }
}

/**
 * Take a dead slot, or grow the pool by one.
 *
 * Growth happens on the first frame a level needs an extra slot and never
 * again, so the steady state — which is what §12.6's zero-allocation budget is
 * actually about — allocates nothing.
 */
export function fire(
  pool: Projectile[],
  kind: ProjectileKind,
  x: number,
  y: number,
  vx: number,
  vy: number,
  friendly: boolean,
): Projectile {
  let p = pool.find((q) => !q.alive)
  if (!p) {
    p = blank()
    pool.push(p)
  }
  const size = PROJECTILE_SIZE[kind]
  p.kind = kind
  p.x = x - size.w / 2
  p.y = y - size.h / 2
  p.w = size.w
  p.h = size.h
  p.vx = vx
  p.vy = vy
  p.alive = true
  p.clock = 0
  p.friendly = friendly
  p.detonated = false
  p.settled = false
  return p
}

export function updateProjectiles(map: TileMap, pool: Projectile[], collapsed: ReadonlySet<number>): void {
  for (const p of pool) {
    if (!p.alive) continue
    p.clock++
    switch (p.kind) {
      case 'bolt':
        stepBolt(map, p, collapsed)
        break
      case 'bomb':
        stepBomb(map, p, collapsed)
        break
      case 'barb':
        stepBarb(map, p, collapsed)
        break
      case 'ember':
        stepEmber(map, p, collapsed)
        break
    }
  }
}

/**
 * The ink bolt. Lobbed, not fired: it arcs.
 *
 * The arc is the balance. A flat hitscan bolt would make every Drifter room in
 * World 2 a shooting gallery, and §6.1 wants the jellyfish to still be a thing
 * you route around — the ink is a key, not a rifle.
 */
function stepBolt(map: TileMap, p: Projectile, collapsed: ReadonlySet<number>): void {
  p.vy += UPGRADES.SHOT_GRAVITY
  if (moveX(map, p, p.vx, collapsed) || moveY(map, p, p.vy, collapsed).blocked) p.alive = false
  if (p.clock >= UPGRADES.SHOT_LIFE) p.alive = false
}

/**
 * The ink bomb. Twenty frames of fuse, and it goes off wherever it happens
 * to be — mid-air if you mistimed the lob.
 *
 * It stops rather than bouncing when it lands. A bomb that skitters is a bomb
 * whose blast radius the player cannot predict, and the whole point of a
 * 3-tile radius is that you can stand just outside it.
 */
function stepBomb(map: TileMap, p: Projectile, collapsed: ReadonlySet<number>): void {
  if (!p.settled) {
    p.vy += UPGRADES.BOMB_GRAVITY
    if (moveX(map, p, p.vx, collapsed)) p.vx = 0
    if (moveY(map, p, p.vy, collapsed).blocked) {
      p.vx = 0
      p.vy = 0
      p.settled = true
    }
  }
  if (p.clock >= UPGRADES.BOMB_FUSE) {
    p.detonated = true
    p.alive = false
  }
}

/** A barb. Straight, no arc, and it stops at the first thing it meets. */
function stepBarb(map: TileMap, p: Projectile, collapsed: ReadonlySet<number>): void {
  if (moveX(map, p, p.vx, collapsed) || moveY(map, p, p.vy, collapsed).blocked) p.alive = false
  if (p.clock >= ENEMIES.BARB_LIFE) p.alive = false
}

/**
 * An ember, dropped by a Cinder Moth.
 *
 * It falls, lands, and then burns where it landed for a further sixty frames.
 * That second half is the lesson §6.1 gives the moth: a threat that persists
 * after the enemy is gone. The bridge you planned on may not be there.
 */
function stepEmber(map: TileMap, p: Projectile, collapsed: ReadonlySet<number>): void {
  if (!p.settled) {
    p.vy += ENEMIES.EMBER_GRAVITY
    if (moveY(map, p, p.vy, collapsed).blocked) {
      p.vy = 0
      p.settled = true
      p.clock = 0
    }
    // An ember that falls out of the room is simply gone.
    if (p.y > map.height * T) p.alive = false
    return
  }
  if (p.clock >= ENEMIES.EMBER_BURN) p.alive = false
}

/**
 * An ember costs a tier; it does not kill outright.
 *
 * The one deliberate exception to "hazards are instant death" (PRD §6.2), and
 * it is an exception because an ember is an *enemy projectile* rather than
 * geometry. Heat Shell turns it off entirely.
 */
export function isEmberHarmful(p: Projectile): boolean {
  return p.kind === 'ember' && p.alive
}

/** Everything within a bomb's radius, measured from the blast's centre. */
export function blastBox(p: Projectile): Box {
  const r = UPGRADES.BOMB_RADIUS * T
  return { x: p.x + p.w / 2 - r, y: p.y + p.h / 2 - r, w: r * 2, h: r * 2 }
}

/**
 * Cracked terrain the blast opens, as tile indices.
 *
 * Returned rather than applied so the caller decides what to do with them —
 * the world adds them to `collapsed`, which is the same set a fallen crumble
 * tile lives in, and a respawn therefore restores a bombed wall along with
 * everything else the room contained.
 */
export function crackedInBlast(map: TileMap, p: Projectile, into: number[]): number[] {
  into.length = 0
  const box = blastBox(p)
  const x0 = Math.max(0, Math.floor(box.x / T))
  const x1 = Math.min(map.width - 1, Math.floor((box.x + box.w) / T))
  const y0 = Math.max(0, Math.floor(box.y / T))
  const y1 = Math.min(map.height - 1, Math.floor((box.y + box.h) / T))
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tileAt(map, tx, ty) === Tile.CRACKED) into.push(ty * map.width + tx)
    }
  }
  return into
}

/** Live projectiles overlapping a box, for the combat pass. */
export function hits(pool: readonly Projectile[], box: Box, friendly: boolean): Projectile[] {
  return pool.filter((p) => p.alive && p.friendly === friendly && boxesOverlap(p, box))
}
