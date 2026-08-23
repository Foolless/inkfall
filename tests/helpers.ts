import { Act, frameFromMasks, type InputFrame } from '../src/engine/input.js'
import { DISPLAY, PHYSICS } from '../src/game/constants.js'
import { createWorld, update, type LevelDef, type World } from '../src/game/world.js'

export const TILE = DISPLAY.TILE

/** A flat floor with plenty of headroom, for pure movement measurement. */
export function flatGround(width = 200): string[] {
  const rows: string[] = []
  for (let y = 0; y < 20; y++) {
    if (y < 18) rows.push(y === 17 ? 'S'.padEnd(width, '.') : '.'.repeat(width))
    else rows.push('#'.repeat(width))
  }
  return rows
}

export function levelFrom(tiles: string[], id = 'test'): LevelDef {
  return { id, name: id, chapter: 'test', order: 0, tiles }
}

export function worldWith(tiles: string[]): World {
  return createWorld(levelFrom(tiles))
}

/** Drop the player onto the ground so tests start from a settled state. */
export function settle(w: World, frames = 30): World {
  for (let i = 0; i < frames; i++) update(w, blank())
  return w
}

let prevMask = 0
export function blank(): InputFrame {
  const f = frameFromMasks(0, prevMask)
  prevMask = 0
  return f
}

/**
 * A tiny input driver that tracks the previous frame's mask, so `pressed`
 * edges behave exactly as they do from the keyboard.
 */
export class Driver {
  private prev = 0
  constructor(readonly world: World) {}

  step(held = 0, count = 1): this {
    for (let i = 0; i < count; i++) {
      update(this.world, frameFromMasks(held, this.prev))
      this.prev = held
    }
    return this
  }

  /** Hold `held` but re-press `tap` on the first frame only. */
  tap(tap: number, held = 0): this {
    update(this.world, frameFromMasks(held | tap, this.prev & ~tap))
    this.prev = held | tap
    return this
  }

  get p() {
    return this.world.player
  }
}

export function accelerateToRunSpeed(d: Driver, dir: number = Act.Right): void {
  const held = dir | Act.Run
  for (let i = 0; i < 240; i++) {
    d.step(held)
    if (Math.abs(d.p.vx) >= PHYSICS.RUN_MAX - 1e-9) return
  }
  throw new Error(`never reached run speed (got ${d.p.vx})`)
}

export interface Arc {
  maxHeight: number
  maxHorizontalDistance: number
  frames: number
}

/**
 * Jump and measure the resulting arc until the player is grounded again.
 *
 * Jump is held for the whole rise, because that is what a player does and what
 * the guarantees describe. Releasing it engages the variable-height jump cut,
 * which is a different (and separately tested) thing.
 */
export function measureJump(d: Driver, held: number, limit = 600): Arc {
  const startX = d.p.x
  const startY = d.p.y
  let maxHeight = 0
  let maxDx = 0

  d.tap(Act.Jump, held | Act.Jump)
  for (let i = 0; i < limit; i++) {
    maxHeight = Math.max(maxHeight, startY - d.p.y)
    maxDx = Math.max(maxDx, Math.abs(d.p.x - startX))
    if (d.p.grounded && i > 2) return { maxHeight, maxHorizontalDistance: maxDx, frames: i }
    d.step(d.p.vy < 0 ? held | Act.Jump : held)
  }
  throw new Error('never landed')
}
