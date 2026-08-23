import { describe, expect, test } from 'vitest'
import { Act } from '../src/engine/input.js'
import { PHYSICS, WATER } from '../src/game/constants.js'
import { update } from '../src/game/world.js'
import { blank, Driver, settle, TILE, worldWith } from './helpers.js'

/** A pool eight tiles deep with dry ledges either side. */
function pool(): string[] {
  return [
    'S.......................',
    '........................',
    '####~~~~~~~~~~~~~~~~####',
    '....~~~~~~~~~~~~~~~~....',
    '....~~~~~~~~~~~~~~~~....',
    '....~~~~~~~~~~~~~~~~....',
    '########################',
  ]
}

describe('water physics', () => {
  test('sinking is far slower than falling', () => {
    const dry = new Driver(settle(worldWith(['S.......................', '........................', '........................', '########################'])))
    const wet = new Driver(worldWith(pool()))
    wet.p.x = 5 * TILE
    wet.p.y = 3 * TILE
    wet.step(0, 40)

    dry.p.y = 0
    dry.step(0, 40)
    expect(wet.p.inWater).toBe(true)
    expect(Math.abs(wet.p.vy)).toBeLessThan(Math.abs(PHYSICS.TERMINAL_FALL))
    expect(wet.p.vy).toBeLessThanOrEqual(WATER.TERMINAL_FALL + 1e-9)
  })

  test('terminal velocity in water is the water constant', () => {
    const d = new Driver(worldWith(pool()))
    d.p.x = 5 * TILE
    d.p.y = 2 * TILE + 2
    d.step(0, 120)
    expect(d.p.vy).toBeLessThanOrEqual(WATER.TERMINAL_FALL + 1e-9)
  })

  test('entry damping stops you cannonballing through a pool', () => {
    const d = new Driver(worldWith(pool()))
    d.p.x = 5 * TILE
    d.p.y = 0
    // Fall from dry air into the water and catch the frame of entry.
    let entryVy = Infinity
    let prevWet = d.p.inWater
    for (let i = 0; i < 200; i++) {
      d.step(0)
      if (d.p.inWater && !prevWet) {
        entryVy = d.p.vy
        break
      }
      prevWet = d.p.inWater
    }
    expect(entryVy).toBeLessThan(PHYSICS.TERMINAL_FALL)
  })

  test('a swim stroke rises, and does not stack while held', () => {
    const d = new Driver(worldWith(pool()))
    d.p.x = 5 * TILE
    d.p.y = 4 * TILE
    d.step(0, 20)
    expect(d.p.inWater).toBe(true)

    d.tap(Act.Jump, Act.Jump)
    expect(d.p.vy).toBeCloseTo(WATER.SWIM_STROKE + WATER.GRAVITY, 5)

    // Holding jump must not produce a second stroke on the next frame.
    const after = d.p.vy
    d.step(Act.Jump)
    expect(d.p.vy).toBeGreaterThan(after)
  })

  test('horizontal speed in water is capped lower than on land', () => {
    const d = new Driver(worldWith(pool()))
    d.p.x = 5 * TILE
    d.p.y = 4 * TILE
    d.step(Act.Right | Act.Run, 60)
    expect(d.p.inWater).toBe(true)
    expect(Math.abs(d.p.vx)).toBeLessThanOrEqual(WATER.SWIM_MAX_X + 1e-6)
    expect(WATER.SWIM_MAX_X).toBeLessThan(PHYSICS.RUN_MAX)
  })

  test('ink refills faster in water than on land', () => {
    const d = new Driver(worldWith(pool()))
    d.p.x = 5 * TILE
    d.p.y = 4 * TILE
    d.step(0, 5)
    d.p.ink = 0
    d.p.inkTimer = 0
    d.step(0, 21)
    expect(d.p.ink).toBe(1) // would still be 0 on land at frame 21
  })
})

describe('currents', () => {
  test('a rightward current pushes a stationary player right', () => {
    const tiles = ['S...........', '..>>>>>>....', '############']
    const w = worldWith(tiles)
    w.player.x = 3 * TILE
    w.player.y = 1 * TILE + 2
    const before = w.player.x
    for (let i = 0; i < 30; i++) update(w, blank())
    expect(w.player.x).toBeGreaterThan(before)
  })

  test('a leftward current pushes the other way', () => {
    const tiles = ['S...........', '..<<<<<<....', '############']
    const w = worldWith(tiles)
    w.player.x = 6 * TILE
    w.player.y = 1 * TILE + 2
    const before = w.player.x
    for (let i = 0; i < 30; i++) update(w, blank())
    expect(w.player.x).toBeLessThan(before)
  })

  test('an updraft lifts a player who would otherwise sink', () => {
    const tiles = ['S...........', '....~~~~....', '....~uu~....', '....~uu~....', '############']
    const w = worldWith(tiles)
    w.player.x = 5 * TILE + 4
    w.player.y = 3 * TILE
    const before = w.player.y
    for (let i = 0; i < 40; i++) update(w, blank())
    expect(w.player.y).toBeLessThan(before)
  })

  test('a dash beats a current — that is the point of spending a pip', () => {
    const tiles = ['S...........', '..<<<<<<<<..', '############']
    const drift = worldWith(tiles)
    drift.player.x = 8 * TILE
    drift.player.y = 1 * TILE + 2
    const driftD = new Driver(drift)
    driftD.step(Act.Right, 20)

    const dash = worldWith(tiles)
    dash.player.x = 8 * TILE
    dash.player.y = 1 * TILE + 2
    const dashD = new Driver(dash)
    dashD.tap(Act.Dash, Act.Right)
    dashD.step(Act.Right, 19)

    expect(dashD.p.x).toBeGreaterThan(driftD.p.x)
  })
})
