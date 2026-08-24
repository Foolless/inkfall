import { describe, expect, test } from 'vitest'
import { INK, MAX_SUBSTEP, PHYSICS } from '../src/game/constants.js'
import { isGrounded, moveX, moveY, type Box } from '../src/game/collision.js'
import { parseTiles } from '../src/game/tilemap.js'
import { TILE } from './helpers.js'

const box = (x: number, y: number, w = 12, h = 14): Box => ({ x, y, w, h })

/** A 5x5-tile room: solid border, plus an interior wall column at x=2
 *  spanning rows 1-2, so a player-sized box meets it face on. */
const room = parseTiles(['#####', '#S#.#', '#.#.#', '#...#', '#####'])

describe('tunnelling', () => {
  /**
   * The load-bearing collision test. Motion is sub-stepped to at most half a
   * tile precisely so that nothing can pass through a one-tile wall, no matter
   * how fast it is going — and the fastest thing in the game is a dash.
   */
  const speeds = [INK.DASH_SPEED, INK.DASH_SPEED_WATER, PHYSICS.TERMINAL_FALL, 50, 500, 5000]

  test.each(speeds)('nothing passes through a wall at %d px/frame moving right', (speed) => {
    const b = box(1 * TILE, 1 * TILE)
    moveX(room, b, speed)
    expect(b.x + b.w).toBeLessThanOrEqual(2 * TILE + 1e-6)
  })

  test.each(speeds)('nothing passes through a wall at %d px/frame moving left', (speed) => {
    const b = box(3 * TILE + 4, 2 * TILE)
    moveX(room, b, -speed)
    expect(b.x).toBeGreaterThanOrEqual(3 * TILE - 1e-6)
  })

  test.each(speeds)('nothing passes through a floor at %d px/frame', (speed) => {
    const b = box(1 * TILE + 2, 1 * TILE)
    // Apply the same step repeatedly: slow speeds need several frames to reach
    // the floor, fast ones should be caught on the first.
    for (let i = 0; i < 200; i++) {
      moveY(room, b, speed)
      expect(b.y + b.h).toBeLessThanOrEqual(4 * TILE + 1e-6)
    }
    expect(b.y + b.h).toBe(4 * TILE)
  })

  test.each(speeds)('nothing passes through a ceiling at %d px/frame', (speed) => {
    const b = box(1 * TILE + 2, 3 * TILE - 14)
    for (let i = 0; i < 200; i++) {
      moveY(room, b, -speed)
      expect(b.y).toBeGreaterThanOrEqual(1 * TILE - 1e-6)
    }
    expect(b.y).toBe(1 * TILE)
  })

  test('a diagonal sweep at dash speed is blocked on both axes', () => {
    const b = box(1 * TILE, 1 * TILE)
    moveX(room, b, 400)
    moveY(room, b, 400)
    expect(b.x + b.w).toBe(2 * TILE)
    expect(b.y + b.h).toBe(4 * TILE)
  })

  test('sub-steps are never larger than half a tile', () => {
    expect(MAX_SUBSTEP).toBeLessThanOrEqual(TILE / 2)
  })
})

describe('resolution', () => {
  test('a blocked move snaps flush to the tile edge, not near it', () => {
    const b = box(1 * TILE, 1 * TILE)
    moveX(room, b, 100)
    expect(b.x + b.w).toBe(2 * TILE)
  })

  test('an unobstructed move travels the full distance', () => {
    const open = parseTiles(['#####', '#S..#', '#...#', '#...#', '#####'])
    const b = box(1 * TILE, 1 * TILE, 8, 8)
    const blocked = moveX(open, b, 5.5)
    expect(blocked).toBe(false)
    expect(b.x).toBeCloseTo(1 * TILE + 5.5, 9)
  })

  test('zero-distance moves are a no-op', () => {
    const b = box(20, 20)
    expect(moveX(room, b, 0)).toBe(false)
    expect(moveY(room, b, 0).blocked).toBe(false)
    expect(b.x).toBe(20)
    expect(b.y).toBe(20)
  })

  test('landing reports the tile that was landed on', () => {
    const b = box(1 * TILE + 2, 1 * TILE)
    const r = moveY(room, b, 100)
    expect(r.landed).toBe(true)
    expect(r.landedTile).toBe(4 * room.width + 1)
  })
})

describe('one-way platforms', () => {
  const oneway = parseTiles(['......', '..S...', '......', '--------'.slice(0, 6), '......', '######'])

  test('you land on top of a one-way when falling', () => {
    const b = box(1 * TILE, 1 * TILE, 8, 8)
    const r = moveY(oneway, b, 40)
    expect(r.landed).toBe(true)
    expect(b.y + b.h).toBe(3 * TILE)
  })

  test('you pass up through a one-way when rising', () => {
    const b = box(1 * TILE, 4 * TILE, 8, 8)
    const r = moveY(oneway, b, -40)
    expect(r.blocked).toBe(false)
    expect(b.y).toBeCloseTo(4 * TILE - 40, 9)
  })

  test('a one-way never blocks horizontal movement', () => {
    const b = box(0, 3 * TILE, 8, 8)
    expect(moveX(oneway, b, 60)).toBe(false)
  })

  test('a one-way does not catch a box already below it', () => {
    // Starting below the platform and falling: it must not snap up onto it.
    const b = box(1 * TILE, 3 * TILE + 8, 8, 8)
    const r = moveY(oneway, b, 20)
    expect(b.y + b.h).toBe(5 * TILE)
    expect(r.landed).toBe(true)
  })
})

describe('grounding', () => {
  test('a box resting on solid ground reads as grounded', () => {
    const b = box(1 * TILE + 2, 4 * TILE - 14)
    expect(isGrounded(room, b)).toBe(true)
  })

  test('a box in mid-air does not', () => {
    const b = box(1 * TILE + 2, 1 * TILE)
    expect(isGrounded(room, b)).toBe(false)
  })
})

describe('crumble tiles', () => {
  const bridge = parseTiles(['......', '..S...', 'cccccc', '......', '######'])

  test('an intact crumble tile is solid', () => {
    const b = box(1 * TILE, 1 * TILE, 8, 8)
    expect(moveY(bridge, b, 40).landed).toBe(true)
  })

  test('a collapsed crumble tile is not', () => {
    const collapsed = new Set([2 * bridge.width + 1])
    const b = box(1 * TILE, 1 * TILE, 8, 8)
    const r = moveY(bridge, b, 20, { collapsed })
    expect(r.landed).toBe(false)
  })
})
