import { DISPLAY, MAX_SUBSTEP } from './constants.js'
import { Tile, tileAt, type TileId, type TileMap } from './tilemap.js'

const T = DISPLAY.TILE
/** Keeps a box resting exactly on a surface from reading as overlapping it. */
const EPS = 1e-6

export interface Box {
  /** Top-left corner of the hitbox, in pixels. */
  x: number
  y: number
  w: number
  h: number
}

export interface SolidQuery {
  /** True while resolving downward motion — one-way platforms only exist then. */
  downward: boolean
  /** The box's bottom edge before this step, for the one-way "came from above" test. */
  prevBottom: number
  /** Crumble tiles that have collapsed and are not currently solid. */
  collapsed?: ReadonlySet<number> | undefined
}

export function isSolid(map: TileMap, tx: number, ty: number, q: SolidQuery): boolean {
  const t: TileId = tileAt(map, tx, ty)
  if (t === Tile.SOLID || t === Tile.SLICK) return true
  if (t === Tile.CRUMBLE) return !q.collapsed?.has(ty * map.width + tx)
  if (t === Tile.ONEWAY) {
    // Passable from every direction except landing on top of it.
    return q.downward && q.prevBottom <= ty * T + EPS
  }
  return false
}

export function overlapsSolid(map: TileMap, box: Box, q: SolidQuery): boolean {
  const x0 = Math.floor(box.x / T)
  const x1 = Math.floor((box.x + box.w - EPS) / T)
  const y0 = Math.floor(box.y / T)
  const y1 = Math.floor((box.y + box.h - EPS) / T)
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (isSolid(map, tx, ty, q)) return true
    }
  }
  return false
}

/**
 * Move the box horizontally, stopping at the first solid it meets.
 *
 * Motion is split into sub-steps no larger than MAX_SUBSTEP (half a tile), so
 * nothing can pass through a one-tile wall no matter how fast it is going —
 * the case tests/collision.test.ts hammers from every angle.
 *
 * Returns true if the move was blocked.
 */
export function moveX(map: TileMap, box: Box, dx: number, collapsed?: ReadonlySet<number>): boolean {
  if (dx === 0) return false
  const q: SolidQuery = { downward: false, prevBottom: box.y + box.h, collapsed }
  const sign = Math.sign(dx)
  let remaining = Math.abs(dx)

  while (remaining > 0) {
    const step = Math.min(remaining, MAX_SUBSTEP)
    remaining -= step
    box.x += step * sign

    if (overlapsSolid(map, box, q)) {
      if (sign > 0) {
        box.x = Math.floor((box.x + box.w - EPS) / T) * T - box.w
      } else {
        box.x = (Math.floor(box.x / T) + 1) * T
      }
      return true
    }
  }
  return false
}

export interface MoveYResult {
  blocked: boolean
  /** True when the box was stopped by ground beneath it. */
  landed: boolean
  /** Tile index the box landed on, or -1. Used to start crumble timers. */
  landedTile: number
}

export function moveY(map: TileMap, box: Box, dy: number, collapsed?: ReadonlySet<number>): MoveYResult {
  const result: MoveYResult = { blocked: false, landed: false, landedTile: -1 }
  if (dy === 0) return result

  const sign = Math.sign(dy)
  const q: SolidQuery = { downward: sign > 0, prevBottom: box.y + box.h, collapsed }
  let remaining = Math.abs(dy)

  while (remaining > 0) {
    const step = Math.min(remaining, MAX_SUBSTEP)
    remaining -= step
    box.y += step * sign

    if (overlapsSolid(map, box, q)) {
      if (sign > 0) {
        const ty = Math.floor((box.y + box.h - EPS) / T)
        box.y = ty * T - box.h
        result.landed = true
        result.landedTile = ty * map.width + Math.floor((box.x + box.w / 2) / T)
      } else {
        box.y = (Math.floor(box.y / T) + 1) * T
      }
      result.blocked = true
      return result
    }
    // A one-way platform must not "catch" the box mid-sub-step from below.
    q.prevBottom = box.y + box.h
  }
  return result
}

/** True when solid ground sits directly under the box. */
export function isGrounded(map: TileMap, box: Box, collapsed?: ReadonlySet<number>): boolean {
  const probe: Box = { x: box.x, y: box.y + 1, w: box.w, h: box.h }
  const q: SolidQuery = { downward: true, prevBottom: box.y + box.h, collapsed }
  return overlapsSolid(map, probe, q)
}

/** Every tile the box currently overlaps, for hazard / water / current tests. */
export function forEachOverlappedTile(map: TileMap, box: Box, fn: (t: TileId, tx: number, ty: number) => void): void {
  const x0 = Math.floor(box.x / T)
  const x1 = Math.floor((box.x + box.w - EPS) / T)
  const y0 = Math.floor(box.y / T)
  const y1 = Math.floor((box.y + box.h - EPS) / T)
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) fn(tileAt(map, tx, ty), tx, ty)
  }
}

/** Water is tested at the box's centre so you are "in" it only once submerged. */
export function centreTile(map: TileMap, box: Box): TileId {
  return tileAt(map, Math.floor((box.x + box.w / 2) / T), Math.floor((box.y + box.h / 2) / T))
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}
