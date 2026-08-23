import { describe, expect, test } from 'vitest'
import { Act } from '../src/engine/input.js'
import { INK, TIERS } from '../src/game/constants.js'
import { setTier } from '../src/game/player.js'
import { Driver, flatGround, settle, TILE, worldWith } from './helpers.js'

/**
 * Jump, then dash at the apex, holding `dir` throughout — the way a player
 * actually crosses a long gap. Jump stays held through the rise so the
 * variable-height jump cut does not fire.
 */
function jumpDash(d: Driver, dir: number, dashDir: number, dashOffset = 0): { dx: number; height: number } {
  const startX = d.p.x
  const startY = d.p.y
  let maxDx = 0
  let maxH = 0

  d.tap(Act.Jump, Act.Jump | dir)
  // Rise to the apex, offset by `dashOffset` frames for the timing-window test.
  for (let i = 0; i < 200 && d.p.vy < 0; i++) d.step(Act.Jump | dir)
  for (let i = 0; i < Math.abs(dashOffset); i++) d.step(dashOffset < 0 ? Act.Jump | dir : dir)
  d.tap(Act.Dash, dashDir | Act.Jump)

  for (let i = 0; i < 400; i++) {
    maxDx = Math.max(maxDx, Math.abs(d.p.x - startX))
    maxH = Math.max(maxH, startY - d.p.y)
    if (d.p.grounded && i > 4) break
    d.step(d.p.vy < 0 ? dir | Act.Jump : dir)
  }
  return { dx: maxDx, height: maxH }
}

describe('feel guarantees', () => {
  test('2. a standing jump plus one horizontal dash clears 7 tiles', () => {
    const d = new Driver(settle(worldWith(flatGround(300))))
    const { dx } = jumpDash(d, Act.Right, Act.Right)
    expect(dx).toBeGreaterThanOrEqual(7 * TILE)
  })

  test('3. a jump plus an up-dash reaches 6 tiles', () => {
    const d = new Driver(settle(worldWith(flatGround(300))))
    const { height } = jumpDash(d, 0, Act.Up)
    expect(height).toBeGreaterThanOrEqual(6 * TILE)
  })

  /**
   * Guarantee 2 has to survive imprecise timing or level design cannot lean on
   * it. Dashing from six frames before the apex to six after must all clear the
   * gap; only a dash taken immediately off the ground falls short, because a
   * horizontal dash zeroes vertical velocity and costs the remaining airtime.
   */
  test('2 survives a forgiving timing window around the apex', () => {
    for (const offset of [-6, -3, 0, 3, 6]) {
      const d = new Driver(settle(worldWith(flatGround(300))))
      const { dx } = jumpDash(d, Act.Right, Act.Right, offset)
      expect(dx, `dash ${offset} frames from apex`).toBeGreaterThanOrEqual(7 * TILE)
    }
  })

  test('2 and 3 assume a 3-pip budget, so they are stated for Full and Charged only', () => {
    for (const tier of [1, 2] as const) {
      const w = settle(worldWith(flatGround(300)))
      setTier(w.map, w.player, tier)
      const d = new Driver(w)
      d.step(0, 5)
      expect(jumpDash(d, Act.Right, Act.Right).dx, `tier ${tier}`).toBeGreaterThanOrEqual(7 * TILE)
    }
  })
})

describe('the ink meter', () => {
  test('a dash costs exactly one pip', () => {
    const d = new Driver(settle(worldWith(flatGround())))
    expect(d.p.ink).toBe(3)
    d.tap(Act.Dash, Act.Right)
    expect(d.p.ink).toBe(2)
  })

  test('dashing with no ink does nothing at all', () => {
    const d = new Driver(settle(worldWith(flatGround())))
    d.p.ink = 0
    const before = { vx: d.p.vx, vy: d.p.vy }
    d.tap(Act.Dash, Act.Right)
    expect(d.p.dashFrames).toBe(0)
    expect(d.p.vx).not.toBe(before.vx + INK.DASH_SPEED)
  })

  test('pips refill on the ground at the documented rate', () => {
    const d = new Driver(settle(worldWith(flatGround())))
    d.p.ink = 0
    d.p.inkTimer = 0
    d.step(0, INK.REFILL_GROUND)
    expect(d.p.ink).toBe(1)
    d.step(0, INK.REFILL_GROUND)
    expect(d.p.ink).toBe(2)
  })

  test('pips never refill in the air — hang time must not be farmable', () => {
    const d = new Driver(settle(worldWith(flatGround())))
    d.p.ink = 0
    d.tap(Act.Jump, Act.Jump)
    const airborneFrames = 20
    for (let i = 0; i < airborneFrames; i++) {
      d.step(Act.Jump)
      expect(d.p.grounded).toBe(false)
      expect(d.p.ink).toBe(0)
    }
  })

  test('the meter never exceeds the tier maximum', () => {
    const d = new Driver(settle(worldWith(flatGround())))
    d.step(0, 300)
    expect(d.p.ink).toBe(TIERS[1]!.inkMax)
    setTier(d.world.map, d.p, 0)
    expect(d.p.ink).toBeLessThanOrEqual(TIERS[0]!.inkMax)
  })
})

describe('dash mechanics', () => {
  test('the dash locks velocity, then hands back a fraction of it', () => {
    const d = new Driver(settle(worldWith(flatGround(300))))
    d.tap(Act.Jump, Act.Jump)
    d.step(Act.Jump, 2)
    d.tap(Act.Dash, Act.Right)

    expect(d.p.vx).toBeCloseTo(INK.DASH_SPEED, 5)
    // Gravity is suspended for the whole lock: DASH_LOCK_FRAMES of full speed.
    for (let i = 1; i <= INK.DASH_LOCK_FRAMES - 2; i++) {
      d.step(Act.Right)
      expect(d.p.vx, `lock frame ${i}`).toBeCloseTo(INK.DASH_SPEED, 5)
      expect(d.p.vy, `lock frame ${i}`).toBe(0)
    }
    d.step(Act.Right) // final lock frame: moves at full speed, then hands back
    expect(d.p.vx).toBeCloseTo(INK.DASH_SPEED * INK.DASH_CARRYOVER, 5)
  })

  test('a cooldown prevents chaining dashes back to back', () => {
    const d = new Driver(settle(worldWith(flatGround(300))))
    d.tap(Act.Jump, Act.Jump)
    d.tap(Act.Dash, Act.Right)
    d.step(Act.Right, INK.DASH_LOCK_FRAMES)
    const inkAfterFirst = d.p.ink
    d.tap(Act.Dash, Act.Right) // still cooling down
    expect(d.p.ink).toBe(inkAfterFirst)
    expect(d.p.dashFrames).toBe(0)
  })

  test('with no direction held, the dash goes where Nib is facing', () => {
    const d = new Driver(settle(worldWith(flatGround(300))))
    d.step(Act.Left, 6)
    expect(d.p.facing).toBe(-1)
    d.tap(Act.Dash)
    expect(d.p.vx).toBeCloseTo(-INK.DASH_SPEED, 5)
  })

  test('a diagonal dash has the same speed as a straight one', () => {
    const straight = new Driver(settle(worldWith(flatGround(300))))
    straight.tap(Act.Jump, Act.Jump)
    straight.tap(Act.Dash, Act.Right)
    const s = Math.hypot(straight.p.vx, straight.p.vy)

    const diag = new Driver(settle(worldWith(flatGround(300))))
    diag.tap(Act.Jump, Act.Jump)
    diag.tap(Act.Dash, Act.Right | Act.Up)
    const dgn = Math.hypot(diag.p.vx, diag.p.vy)

    expect(dgn).toBeCloseTo(s, 5)
    expect(diag.p.vx).toBeGreaterThan(0)
    expect(diag.p.vy).toBeLessThan(0)
  })

  test('all eight directions are reachable', () => {
    const dirs: Array<[number, number, number]> = [
      [Act.Right, 1, 0],
      [Act.Left, -1, 0],
      [Act.Up, 0, -1],
      [Act.Down, 0, 1],
      [Act.Right | Act.Up, 1, -1],
      [Act.Right | Act.Down, 1, 1],
      [Act.Left | Act.Up, -1, -1],
      [Act.Left | Act.Down, -1, 1],
    ]
    for (const [mask, sx, sy] of dirs) {
      const d = new Driver(settle(worldWith(flatGround(300))))
      d.tap(Act.Jump, Act.Jump)
      d.step(Act.Jump, 2)
      d.tap(Act.Dash, mask)
      expect(Math.sign(d.p.vx), `x for mask ${mask}`).toBe(sx)
      expect(Math.sign(d.p.vy), `y for mask ${mask}`).toBe(sy)
    }
  })

  test('dashing into a wall stops the dash rather than sticking to it', () => {
    const tiles = ['S.........#'.padEnd(20, '.'), ...Array(2).fill('..........#'.padEnd(20, '.')), '#'.repeat(20)]
    const d = new Driver(settle(worldWith(tiles), 60))
    d.tap(Act.Dash, Act.Right)
    d.step(Act.Right, 40)
    expect(d.p.x + d.p.w).toBeLessThanOrEqual(10 * TILE + 0.001)
  })
})
