import { describe, expect, test } from 'vitest'
import { Act } from '../src/engine/input.js'
import { INK } from '../src/game/constants.js'
import { parseTiles } from '../src/game/tilemap.js'
import { createWorld, HINT_FRAMES, update } from '../src/game/world.js'
import { greybox } from '../src/content/greybox.js'
import { blank, Driver, flatGround, settle, TILE, worldWith } from './helpers.js'

/**
 * Gate 1 said the game "needs a double jump or dash upwards".
 *
 * It already had one — Up + X reaches nearly eight tiles. The finding was
 * discoverability, not capability: the dash reads as horizontal-only, so nobody
 * tries the other seven directions. These tests cover the three things that
 * changed in response, so the fix cannot quietly rot.
 */
describe('aiming the dash upward', () => {
  test('holding Up aims the dash straight up', () => {
    const d = new Driver(settle(worldWith(flatGround(60))))
    d.tap(Act.Dash, Act.Up)
    expect(d.p.vy).toBeCloseTo(-INK.DASH_SPEED, 5)
    expect(d.p.vx).toBe(0)
  })

  /**
   * The forgiveness that matters. Up and X almost never land on the same frame
   * from a real keyboard, and before the buffer a one-frame gap silently gave a
   * horizontal dash — which is exactly what a playtester experiences as "there
   * is no up-dash".
   */
  test('Up released a few frames before X still dashes up', () => {
    for (let gap = 0; gap < INK.DASH_DIR_BUFFER; gap++) {
      const d = new Driver(settle(worldWith(flatGround(60))))
      d.tap(Act.Jump, Act.Jump | Act.Up)
      d.step(Act.Jump, gap) // Up already released
      d.tap(Act.Dash, Act.Jump)
      expect(d.p.vy, `gap of ${gap} frames`).toBeLessThan(0)
    }
  })

  test('but the buffer expires, so a stale Up does not hijack a later dash', () => {
    const d = new Driver(settle(worldWith(flatGround(60))))
    d.tap(Act.Jump, Act.Jump | Act.Up)
    d.step(Act.Jump, INK.DASH_DIR_BUFFER + 4)
    d.tap(Act.Dash, Act.Jump)
    expect(d.p.vy).toBe(0)
    expect(Math.abs(d.p.vx)).toBeCloseTo(INK.DASH_SPEED, 5)
  })

  test('a downward dash is unaffected by the buffer', () => {
    const d = new Driver(settle(worldWith(flatGround(60))))
    d.tap(Act.Jump, Act.Jump)
    d.tap(Act.Dash, Act.Down)
    expect(d.p.vy).toBeCloseTo(INK.DASH_SPEED, 5)
  })
})

describe('the grey box teaches the up-dash', () => {
  const map = parseTiles(greybox.tiles)

  /** Nib settled on the recovery floor at the foot of the 6-tile face. */
  function atTheGate() {
    const w = createWorld(greybox)
    w.player.x = 32 * TILE
    w.player.y = 12 * TILE
    for (let i = 0; i < 40; i++) update(w, blank())
    return w
  }

  test('there is a gate that cannot be cleared without dashing upward', () => {
    // The face at x=34 rises 5 tiles above the floor at x=28-33. A jump alone
    // tops out at ~3.2 tiles, so this is not passable by jumping.
    const floorTop = 14
    const ledgeTop = 9
    expect(floorTop - ledgeTop).toBe(5)

    const w = atTheGate()
    const d = new Driver(w)
    // Run at the wall holding jump for ten seconds: never gets on top.
    for (let i = 0; i < 600; i++) d.step(Act.Right | Act.Run | Act.Jump)
    expect(d.p.y + d.p.h).toBeGreaterThan(ledgeTop * TILE)
  })

  test('the gate has ground beneath it, so a miss costs a retry not a life', () => {
    const w = atTheGate()
    const d = new Driver(w)
    for (let i = 0; i < 600; i++) d.step(Act.Right | Act.Run | Act.Jump)
    expect(d.p.alive).toBe(true)
    expect(d.p.deaths).toBe(0)
  })

  /**
   * The technique a player will actually use: hold Right the whole way, jump,
   * and dash up-right at the apex. That dash is diagonal, so it delivers only
   * half its speed vertically — which is precisely why the face is five tiles
   * rather than the six a pure vertical dash reaches.
   */
  test('an up-right dash from the recovery floor lands on the ledge', () => {
    const d = new Driver(atTheGate())
    d.tap(Act.Jump, Act.Jump | Act.Right)
    for (let i = 0; i < 40 && d.p.vy < 0; i++) d.step(Act.Jump | Act.Right)
    d.tap(Act.Dash, Act.Up | Act.Right)

    let landed = false
    for (let i = 0; i < 90; i++) {
      d.step(Act.Right)
      if (d.p.grounded && d.p.y + d.p.h === 9 * TILE) landed = true
    }
    expect(landed).toBe(true)
  })

  test('the up-dash hint sits before the gate, not after it', () => {
    const hint = greybox.hints?.[0]
    expect(hint).toBeDefined()
    expect(hint!.tx).toBeLessThan(34)
    expect(hint!.text).toMatch(/X/)
  })

  test('the map is still rectangular after the rebuild', () => {
    expect(new Set(greybox.tiles.map((r) => r.length)).size).toBe(1)
    expect(map.width).toBeGreaterThan(100)
  })
})

describe('one-time hints', () => {
  const level = {
    id: 'hint',
    name: 'hint',
    chapter: 'test',
    order: 0,
    tiles: ['S.........', '##########'],
    hints: [{ tx: 1, ty: 0, text: 'TEST', radius: 3 }],
  }

  test('a hint fires on approach and expires', () => {
    const w = createWorld(level)
    expect(w.hints[0]!.frames).toBe(0)
    update(w, blank())
    expect(w.hints[0]!.frames).toBeGreaterThan(0)

    for (let i = 0; i < HINT_FRAMES + 2; i++) update(w, blank())
    expect(w.hints[0]!.frames).toBe(0)
    expect(w.hints[0]!.spent).toBe(true)
  })

  test('a spent hint never fires again — once ever, per the PRD', () => {
    const w = createWorld(level)
    for (let i = 0; i < HINT_FRAMES + 10; i++) update(w, blank())
    expect(w.hints[0]!.spent).toBe(true)
    for (let i = 0; i < 60; i++) update(w, blank())
    expect(w.hints[0]!.frames).toBe(0)
  })

  test('a distant hint does not fire', () => {
    const far = { ...level, hints: [{ tx: 40, ty: 0, text: 'TEST', radius: 2 }] }
    const w = createWorld(far)
    for (let i = 0; i < 60; i++) update(w, blank())
    expect(w.hints[0]!.frames).toBe(0)
  })

  test('a level with no hints is fine', () => {
    const w = createWorld({ id: 'none', name: 'none', chapter: 't', order: 0, tiles: ['S...', '####'] })
    expect(w.hints).toEqual([])
  })
})
