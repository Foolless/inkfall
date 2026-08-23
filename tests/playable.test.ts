import { describe, expect, test } from 'vitest'
import { Act } from '../src/engine/input.js'
import { SPENT } from '../src/game/constants.js'
import { setTier } from '../src/game/player.js'
import { createWorld, type World } from '../src/game/world.js'
import { loadCampaignLevel } from '../src/content/levels/format.js'
import { tidepools } from '../src/content/levels/w01-tidepools.js'
import { analyseReach } from '../src/game/reach.js'
import { Driver, TILE } from './helpers.js'

/**
 * The bridge between the solver and the simulation.
 *
 * `reach.ts` proves World 1 is completable from its *geometry*. These drive the
 * real physics through the same moves, in the real level, and check they
 * arrive. Without them the reachability test is a claim about a model rather
 * than about the game — and the model is deliberately conservative, so a
 * disagreement in either direction is worth knowing about.
 *
 * Every run below is at the **Spent** tier on two pips, because that is the
 * budget a player can always turn up with.
 */
const level = loadCampaignLevel(tidepools)

function at(tx: number, ty: number): World {
  const w = createWorld(level)
  setTier(w.map, w.player, SPENT)
  const p = w.player
  p.x = tx * TILE + 2
  p.y = ty * TILE + (TILE - p.h)
  p.vx = 0
  p.vy = 0
  p.prevY = p.y
  return w
}

interface Attempt {
  /** Jump when Nib's leading edge reaches this pixel — the lip of the ledge. */
  jumpAt: number
  /** Frames into the rise before the pip is spent. Guarantee 2's apex window. */
  dashDelay: number
  dashDir: number
  run?: boolean
}

/**
 * Run right, jump at the lip, dash a few frames into the rise, ride it out.
 *
 * The jump is triggered by position rather than by a frame count on purpose:
 * counting frames is how the first version of this test ran off the cliff
 * before it ever pressed jump.
 */
function attempt(d: Driver, a: Attempt): void {
  const held = Act.Right | (a.run === false ? 0 : Act.Run)

  for (let i = 0; i < 240; i++) {
    if (d.p.x + d.p.w >= a.jumpAt) break
    d.step(held)
  }
  d.tap(Act.Jump, held | Act.Jump)
  for (let i = 0; i < a.dashDelay; i++) d.step(held | Act.Jump)
  d.tap(Act.Dash, a.dashDir | Act.Dash)

  for (let i = 0; i < 200; i++) {
    d.step(Act.Right)
    if (d.p.grounded || !d.p.alive) return
  }
}

/** A crude swimmer: hold toward the target, stroke when below it. */
function swimTo(d: Driver, tx: number, ty: number, frames = 400): void {
  const targetX = tx * TILE
  const targetY = ty * TILE
  for (let i = 0; i < frames; i++) {
    const p = d.p
    let held = 0
    if (p.x + p.w / 2 < targetX) held |= Act.Right
    else if (p.x + p.w / 2 > targetX + TILE) held |= Act.Left
    if (p.y > targetY + 4) d.tap(Act.Jump, held | Act.Jump)
    else d.step(held)
    if (!p.alive) return
  }
}

describe('A1 — the gap that teaches the dash', () => {
  /** The shelf ends at tile 13; the far side starts at tile 19. */
  const LIP = 14 * TILE

  test('a run jump alone falls short, which is the whole lesson', () => {
    const w = at(8, 18)
    const d = new Driver(w)
    for (let i = 0; i < 240; i++) {
      if (d.p.x + d.p.w >= LIP) break
      d.step(Act.Right | Act.Run)
    }
    d.tap(Act.Jump, Act.Right | Act.Run | Act.Jump)
    for (let i = 0; i < 200 && d.p.alive && !d.p.grounded; i++) d.step(Act.Right | Act.Run)
    expect(w.player.alive && w.player.x > 19 * TILE).toBe(false)
  })

  test('a jump plus one dash clears it, on two pips', () => {
    const w = at(8, 18)
    const d = new Driver(w)
    attempt(d, { jumpAt: LIP, dashDelay: 5, dashDir: Act.Right })

    expect(w.player.alive).toBe(true)
    expect(w.player.x).toBeGreaterThan(19 * TILE)
    expect(w.player.grounded).toBe(true)
  })
})

describe('A2 — the ledges that need an up-dash', () => {
  test('a jump alone does not reach the first ledge, four tiles up', () => {
    const w = at(28, 18)
    const d = new Driver(w)
    for (let i = 0; i < 240; i++) {
      if (d.p.x + d.p.w >= 33 * TILE) break
      d.step(Act.Right | Act.Run)
    }
    d.tap(Act.Jump, Act.Right | Act.Run | Act.Jump)
    for (let i = 0; i < 200 && !d.p.grounded; i++) d.step(Act.Right)
    // Still on the floor at row 19, not on the ledge at row 15.
    expect(w.player.y + w.player.h).toBeGreaterThan(16 * TILE)
  })

  test('a jump plus an up-dash lands on it', () => {
    const w = at(28, 18)
    const d = new Driver(w)
    attempt(d, { jumpAt: 32 * TILE, dashDelay: 4, dashDir: Act.Up | Act.Right })

    expect(w.player.alive).toBe(true)
    expect(w.player.y + w.player.h).toBeCloseTo(15 * TILE, 0)
  })

  test('and the same move again reaches the second, so the staircase works', () => {
    const w = at(35, 14)
    const d = new Driver(w)
    d.step(0, 60) // stand and refill the pip
    attempt(d, { jumpAt: 39 * TILE, dashDelay: 4, dashDir: Act.Up | Act.Right })
    expect(w.player.y + w.player.h).toBeCloseTo(11 * TILE, 0)
  })
})

describe('B1 — the pool', () => {
  test('the water is buoyant: sinking is slow enough to steer', () => {
    const w = at(110, 14)
    const d = new Driver(w)
    d.step(0, 30)
    expect(w.player.inWater).toBe(true)
    expect(w.player.vy).toBeLessThan(2.5) // water terminal, not the land one
  })

  test('Nib can swim down and through the slot to the hidden pearl', () => {
    const w = at(100, 14)
    const d = new Driver(w)
    swimTo(d, 100, 23)
    swimTo(d, 95, 23)

    expect(w.player.alive).toBe(true)
    expect(w.pickups.find((p) => p.kind === 'pearl' && p.id === 1)!.taken).toBe(true)
  })

  test('and swim back out and up onto the far shelf', () => {
    const w = at(120, 20)
    const d = new Driver(w)
    swimTo(d, 125, 13, 600)
    expect(w.player.alive).toBe(true)
    expect(w.player.x).toBeGreaterThan(120 * TILE)
    expect(w.player.y).toBeLessThan(16 * TILE)
  })
})

describe('C3 — the gauntlet', () => {
  test('the first gap is inside one dash', () => {
    const w = at(252, 18)
    const d = new Driver(w)
    attempt(d, { jumpAt: 259 * TILE, dashDelay: 5, dashDir: Act.Right })
    expect(w.player.alive).toBe(true)
    expect(w.player.x).toBeGreaterThan(263 * TILE)
  })
})

/**
 * The solver and the simulation, asked about the same room.
 *
 * If this ever disagrees, one of the two is wrong about the game, and it
 * matters a great deal which.
 */
describe('the solver and the physics agree', () => {
  test('the geometry says the level is completable at Spent', () => {
    const r = analyseReach(level, { tier: SPENT })
    expect(r.reachedExit).toBe(true)
    expect(r.reachedCheckpoints).toBe(true)
    expect(r.maxPips).toBe(2)
  })

  test('and the physics makes the two moves the solver leans on hardest', () => {
    const gap = new Driver(at(8, 18))
    attempt(gap, { jumpAt: 14 * TILE, dashDelay: 5, dashDir: Act.Right })
    expect(gap.p.x, 'A1 gap, a one-pip flight of six tiles').toBeGreaterThan(19 * TILE)

    const ledge = new Driver(at(28, 18))
    attempt(ledge, { jumpAt: 32 * TILE, dashDelay: 4, dashDir: Act.Up | Act.Right })
    expect(ledge.p.y + ledge.p.h, 'A2 ledge, a one-pip rise of four').toBeCloseTo(15 * TILE, 0)
  })
})
