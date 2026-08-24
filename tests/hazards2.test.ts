import { describe, expect, test } from 'vitest'
import { HAZARDS } from '../src/game/constants.js'
import {
  bubbleBox,
  checkPressure,
  pressureLoad,
  riseAt,
  spawnBubble,
  spawnPressure,
  spawnRise,
  updateBubble,
  updateRise,
} from '../src/game/hazards.js'
import { createPlayer, type Player } from '../src/game/player.js'
import { update } from '../src/game/world.js'
import { blank, Driver, TILE, worldWith } from './helpers.js'

/**
 * The hazards Phase 3 added. PRD §6.2.
 *
 * Three of them, and each is a *clock* rather than a shape: a bubble that pops,
 * a surface that climbs, a room that punishes stillness. The clam already
 * covered "a shape with a clock"; these cover the rest.
 */
describe('bubble streams', () => {
  const stream = spawnBubble({ type: 'bubble', x: 4, y: 6, height: 5 })

  test('bubbles rise, and the column recycles them', () => {
    const b = spawnBubble({ type: 'bubble', x: 4, y: 6, height: 5 })
    const first = bubbleBox(b, 0)!
    for (let i = 0; i < 30; i++) updateBubble(b)
    expect(bubbleBox(b, 0)!.y).toBeLessThan(first.y)
  })

  test('the column holds more bubbles the taller it is', () => {
    const shortColumn = spawnBubble({ type: 'bubble', x: 4, y: 6, height: 2 })
    const tallColumn = spawnBubble({ type: 'bubble', x: 4, y: 6, height: 8 })
    expect(tallColumn.count).toBeGreaterThan(shortColumn.count)
  })

  /**
   * The property that makes §7.3 C2 a rhythm rather than a staircase: a bubble
   * is one frame of contact and then it is gone until the column comes round.
   */
  test('riding one pops it, and it stays popped for that pass', () => {
    const w = worldWith(['S..........', '...........', '...........', '###########'], [
      { type: 'bubble', x: 4, y: 2, height: 2 },
    ])
    const b = w.bubbles[0]!
    const box = bubbleBox(b, 0)!
    w.player.x = box.x - 2
    w.player.y = box.y - 2
    update(w, blank())
    expect(bubbleBox(b, 0)).toBeNull()
  })

  test('the carry is a fixed lift, not a bonus on top of your own speed', () => {
    const w = worldWith(['S..........', '...........', '...........', '###########'], [
      { type: 'bubble', x: 4, y: 2, height: 2 },
    ])
    const b = w.bubbles[0]!
    const box = bubbleBox(b, 0)!
    w.player.x = box.x - 2
    w.player.y = box.y - 2
    w.player.vy = 5 // arriving fast
    update(w, blank())
    expect(w.player.vy).toBeCloseTo(HAZARDS.BUBBLE_CARRY, 5)
  })

  test('a bubble that has not been touched is still there', () => {
    expect(bubbleBox(stream, 0)).not.toBeNull()
  })
})

describe('rising surfaces', () => {
  const player = (x: number, y: number): Player => {
    const p = createPlayer(x, y)
    return p
  }

  test('nothing happens until Nib crosses the trigger column', () => {
    const r = spawnRise({ type: 'rise', x: 10, y: 20, fluid: 'flood', top: 4 })
    const p = player(0, 0)
    for (let i = 0; i < 100; i++) updateRise(r, p)
    expect(r.armed).toBe(false)
    expect(r.y).toBe(r.startY)
  })

  /**
   * Armed by the player, never by the frame counter. A room's timer has to
   * start when the player enters the room, or a slow first playthrough arrives
   * at a room that has already drowned.
   */
  test('crossing it starts the clock', () => {
    const r = spawnRise({ type: 'rise', x: 10, y: 20, fluid: 'flood', top: 4 })
    const p = player(11 * TILE, 0)
    updateRise(r, p)
    expect(r.armed).toBe(true)
    for (let i = 0; i < 60; i++) updateRise(r, p)
    expect(r.y).toBeLessThan(r.startY)
  })

  test('it stops at the row it was authored to stop at', () => {
    const r = spawnRise({ type: 'rise', x: 0, y: 20, fluid: 'magma', top: 4 })
    const p = player(0, 0)
    for (let i = 0; i < 10_000; i++) updateRise(r, p)
    expect(r.y).toBe(4 * TILE)
  })

  test('magma climbs faster than a flood does', () => {
    expect(HAZARDS.RISE_MAGMA).toBeGreaterThan(HAZARDS.RISE_FLOOD)
  })

  test('being under the line is what matters, not being near it', () => {
    const r = spawnRise({ type: 'rise', x: 0, y: 20, fluid: 'flood', top: 4 })
    const p = player(0, 0)
    updateRise(r, p)
    expect(riseAt([r], { x: 0, y: 30 * TILE, w: 12, h: 14 })).toBe(r)
    expect(riseAt([r], { x: 0, y: 0, w: 12, h: 14 })).toBeNull()
  })

  test('a flood is water and a magma rise is death', () => {
    const flood = ['S..........', '...........', '...........', '###########']
    const w = worldWith(flood, [{ type: 'rise', x: 0, y: 3, fluid: 'flood', top: 1 }])
    const d = new Driver(w)
    d.step(0, 60)
    expect(w.rises[0]!.armed).toBe(true)
    expect(d.p.inWater).toBe(true)
    expect(d.p.alive).toBe(true)

    const lava = worldWith(flood, [{ type: 'rise', x: 0, y: 3, fluid: 'magma', top: 1 }])
    const m = new Driver(lava)
    m.step(0, 60)
    expect(m.p.alive).toBe(false)
  })

  /**
   * A flood that kept its level would make the second attempt at a room a
   * different room from the first, which is not what the conch at the door
   * promised. The trigger is off to the right so the respawned player is behind
   * it — otherwise the reset is immediately followed by a re-arm and the test
   * would be measuring the wrong thing.
   */
  test('a respawn puts the surface back where it started, disarmed', () => {
    const w = worldWith(['S..........', '...........', '...........', '###########'], [
      { type: 'rise', x: 5, y: 3, fluid: 'flood', top: 1 },
    ])
    const d = new Driver(w)
    d.step(1 << 1, 200) // walk right past the trigger
    expect(w.rises[0]!.armed).toBe(true)
    expect(w.rises[0]!.y).toBeLessThan(w.rises[0]!.startY)

    w.player.alive = false
    for (let i = 0; i < 120; i++) update(w, blank())
    expect(w.rises[0]!.y).toBe(w.rises[0]!.startY)
    expect(w.rises[0]!.armed).toBe(false)
  })
})

describe('pressure rooms', () => {
  const zone = spawnPressure({ type: 'pressure', x: 0, y: 0, w: 10, h: 10 })

  test('standing still outside a pressure room costs nothing', () => {
    const p = createPlayer(40 * TILE, 0)
    p.stillFrames = 10_000
    expect(pressureLoad([zone], p)).toBe(0)
    expect(checkPressure([zone], p)).toBe(false)
  })

  test('three seconds of stillness inside one is fatal', () => {
    const p = createPlayer(TILE, TILE)
    p.stillFrames = HAZARDS.PRESSURE_FRAMES
    expect(checkPressure([zone], p)).toBe(true)
    expect(p.alive).toBe(false)
  })

  /** The room has to say *move* before it says *dead*. */
  test('the load rises before the kill, so the vignette has something to show', () => {
    const p = createPlayer(TILE, TILE)
    p.stillFrames = HAZARDS.PRESSURE_FRAMES - HAZARDS.PRESSURE_WARN
    const warned = pressureLoad([zone], p)
    expect(warned).toBeGreaterThan(0)
    expect(warned).toBeLessThan(1)
    expect(p.alive).toBe(true)
  })

  test('moving resets it', () => {
    const w = worldWith(['S..........', '###########'], [{ type: 'pressure', x: 0, y: 0, w: 10, h: 1 }])
    const d = new Driver(w)
    d.step(0, HAZARDS.PRESSURE_FRAMES - 30)
    expect(d.p.alive).toBe(true)
    d.step(1 << 1, 20) // walk right
    expect(d.p.stillFrames).toBe(0)
    expect(d.p.alive).toBe(true)
  })

  test('and not moving does not', () => {
    const w = worldWith(['S..........', '###########'], [{ type: 'pressure', x: 0, y: 0, w: 10, h: 1 }])
    const d = new Driver(w)
    d.step(0, HAZARDS.PRESSURE_FRAMES + 10)
    expect(d.p.alive).toBe(false)
  })
})
