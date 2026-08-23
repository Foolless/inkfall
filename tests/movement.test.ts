import { describe, expect, test } from 'vitest'
import { Act } from '../src/engine/input.js'
import { PHYSICS, TIERS } from '../src/game/constants.js'
import { setTier } from '../src/game/player.js'
import { accelerateToRunSpeed, Driver, flatGround, measureJump, settle, TILE, worldWith } from './helpers.js'

/**
 * The feel guarantees, PRD section 4.3.
 *
 * These are the executable definition of "the movement is correct". Their real
 * value is permission: constants can be retuned aggressively because these will
 * say the moment the jump breaks. They already earned it once — the PRD's
 * original JUMP_IMPULSE of -4.60 failed guarantee 1 by nearly half.
 */
describe('feel guarantees', () => {
  test('1. a full-run jump clears 4 tiles across and 3 tiles up', () => {
    const d = new Driver(settle(worldWith(flatGround())))
    accelerateToRunSpeed(d)
    const arc = measureJump(d, Act.Right | Act.Run)

    expect(arc.maxHeight).toBeGreaterThanOrEqual(3 * TILE)
    expect(arc.maxHorizontalDistance).toBeGreaterThanOrEqual(4 * TILE)
  })

  test('4. Nib stops from run speed within 12 frames', () => {
    const d = new Driver(settle(worldWith(flatGround())))
    accelerateToRunSpeed(d)

    let frames = 0
    while (Math.abs(d.p.vx) > 0 && frames < 60) {
      d.step(0)
      frames++
    }
    expect(frames).toBeLessThanOrEqual(12)
  })

  test('5. jump leaves the ground on the very next frame — no wind-up, ever', () => {
    const d = new Driver(settle(worldWith(flatGround())))
    expect(d.p.grounded).toBe(true)
    d.tap(Act.Jump)
    expect(d.p.grounded).toBe(false)
  })

  test('1, 4 and 5 hold at every tier', () => {
    for (let tier = 0; tier < TIERS.length; tier++) {
      const w = settle(worldWith(flatGround()))
      setTier(w.map, w.player, tier as 0 | 1 | 2)
      const d = new Driver(w)
      d.step(0, 5)

      accelerateToRunSpeed(d)
      const arc = measureJump(d, Act.Right | Act.Run)
      expect(arc.maxHeight, `tier ${tier} height`).toBeGreaterThanOrEqual(3 * TILE)
      expect(arc.maxHorizontalDistance, `tier ${tier} distance`).toBeGreaterThanOrEqual(4 * TILE)

      accelerateToRunSpeed(d)
      let frames = 0
      while (Math.abs(d.p.vx) > 0 && frames < 60) {
        d.step(0)
        frames++
      }
      expect(frames, `tier ${tier} stopping`).toBeLessThanOrEqual(12)
    }
  })
})

describe('jump forgiveness', () => {
  test('coyote time lets you jump just after walking off a ledge', () => {
    // A short ledge, then nothing.
    const tiles = ['S' + '.'.repeat(39), ...Array(2).fill('.'.repeat(40)), '####################' + '.'.repeat(20)]
    const d = new Driver(settle(worldWith(tiles), 60))
    expect(d.p.grounded).toBe(true)

    // Walk off the edge, then jump within the coyote window.
    for (let i = 0; i < 300 && d.p.grounded; i++) d.step(Act.Right)
    expect(d.p.grounded).toBe(false)
    expect(d.p.coyote).toBeGreaterThan(0)
    const yBefore = d.p.vy
    d.tap(Act.Jump, Act.Right)
    expect(d.p.vy).toBeLessThan(yBefore)
  })

  test('coyote time expires', () => {
    const d = new Driver(settle(worldWith(flatGround())))
    d.tap(Act.Jump)
    d.step(Act.Jump, PHYSICS.COYOTE_FRAMES + 4)
    const vy = d.p.vy
    d.tap(Act.Jump)
    // Already airborne with no coyote left: the second press must not lift him.
    expect(d.p.vy).toBeGreaterThan(vy - 1)
  })

  test('a jump pressed just before landing still fires', () => {
    // How long is a jump? Measure first, so we can press at a known moment.
    const probe = new Driver(settle(worldWith(flatGround())))
    const airtime = measureJump(probe, 0).frames

    const d = new Driver(settle(worldWith(flatGround())))
    d.tap(Act.Jump, Act.Jump)
    for (let i = 0; i < airtime - 3; i++) d.step(d.p.vy < 0 ? Act.Jump : 0)
    expect(d.p.grounded).toBe(false)

    d.tap(Act.Jump) // pressed early — the buffer has to remember it
    let jumped = false
    for (let i = 0; i < PHYSICS.JUMP_BUFFER_FRAMES + 3; i++) {
      d.step(0)
      if (d.p.vy < 0) jumped = true
    }
    expect(jumped).toBe(true)
  })

  test('releasing jump early cuts the rise', () => {
    const full = new Driver(settle(worldWith(flatGround())))
    const short = new Driver(settle(worldWith(flatGround())))

    const fullArc = measureJump(full, Act.Jump)

    short.tap(Act.Jump, Act.Jump)
    const y0 = short.p.y
    let peak = 0
    for (let i = 0; i < 200; i++) {
      short.step(i < 3 ? Act.Jump : 0) // release after 3 frames
      peak = Math.max(peak, y0 - short.p.y)
      if (short.p.grounded && i > 2) break
    }
    expect(peak).toBeLessThan(fullArc.maxHeight * 0.7)
  })
})

describe('ground movement', () => {
  test('walking is slower than running', () => {
    const walk = new Driver(settle(worldWith(flatGround())))
    const run = new Driver(settle(worldWith(flatGround())))
    walk.step(Act.Right, 120)
    run.step(Act.Right | Act.Run, 120)
    expect(walk.p.vx).toBeCloseTo(PHYSICS.WALK_MAX, 5)
    expect(run.p.vx).toBeCloseTo(PHYSICS.RUN_MAX, 5)
    expect(run.p.vx).toBeGreaterThan(walk.p.vx)
  })

  test('facing follows input, and holds when input stops', () => {
    const d = new Driver(settle(worldWith(flatGround())))
    d.step(Act.Left, 3)
    expect(d.p.facing).toBe(-1)
    d.step(0, 30)
    expect(d.p.facing).toBe(-1)
    d.step(Act.Right, 3)
    expect(d.p.facing).toBe(1)
  })

  test('opposing directions cancel', () => {
    const d = new Driver(settle(worldWith(flatGround())))
    d.step(Act.Left | Act.Right, 30)
    expect(d.p.vx).toBe(0)
  })
})
