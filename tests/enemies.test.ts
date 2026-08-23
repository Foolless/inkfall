import { describe, expect, test } from 'vitest'
import { Act } from '../src/engine/input.js'
import { CHARGED_TIER, ENEMIES, FULL, INK, PHYSICS, RULES, SPENT } from '../src/game/constants.js'
import { setTier } from '../src/game/player.js'
import { respawn, update, type World } from '../src/game/world.js'
import { canStomp } from '../src/game/enemies/index.js'
import { STOMP_CHAIN } from '../src/game/score.js'
import { Driver, TILE, blank, worldWith } from './helpers.js'

/** A wide flat floor with a ceiling far away, so behaviour is the only variable. */
const floor = (width = 40) => ['.'.repeat(width), '.'.repeat(width), 'S' + '.'.repeat(width - 1), '#'.repeat(width)]

function enemyOf(w: World, kind: string) {
  const e = w.enemies.find((x) => x.kind === kind)
  if (!e) throw new Error(`no ${kind} in this world`)
  return e
}

describe('Snapper — the crab', () => {
  test('walks at its stated speed', () => {
    const w = worldWith(floor(), [{ type: 'snapper', x: 20, y: 2 }])
    const e = enemyOf(w, 'snapper')
    const before = e.x
    for (let i = 0; i < 10; i++) update(w, blank())
    expect(Math.abs(e.x - before)).toBeCloseTo(ENEMIES.SNAPPER_SPEED * 10, 4)
  })

  test('turns at a wall', () => {
    const w = worldWith(['S...........', '#.........#.', '############'], [{ type: 'snapper', x: 3, y: 1 }])
    const e = enemyOf(w, 'snapper')
    expect(e.facing).toBe(-1)
    for (let i = 0; i < 240; i++) update(w, blank())
    // It has bounced off the left wall and is somewhere inside the corridor.
    expect(e.x).toBeGreaterThan(TILE)
    expect(e.x).toBeLessThan(10 * TILE)
  })

  /** The lesson it teaches is predictability. Walking off a ledge is not that. */
  test('turns at a ledge rather than walking off it', () => {
    const w = worldWith(['S..........', '...........', '####.......', '####.......'], [{ type: 'snapper', x: 2, y: 1 }])
    const e = enemyOf(w, 'snapper')
    for (let i = 0; i < 600; i++) update(w, blank())
    expect(e.y).toBeLessThan(3 * TILE) // never fell
    expect(e.x + e.w).toBeLessThanOrEqual(4 * TILE + 1)
  })

  test('an authored patrol is a hard bound', () => {
    const w = worldWith(floor(), [{ type: 'snapper', x: 20, y: 2, patrol: [18, 22] }])
    const e = enemyOf(w, 'snapper')
    let min = e.x
    let max = e.x
    for (let i = 0; i < 900; i++) {
      update(w, blank())
      min = Math.min(min, e.x)
      max = Math.max(max, e.x)
    }
    expect(min).toBeGreaterThanOrEqual(18 * TILE - 0.001)
    expect(max + e.w).toBeLessThanOrEqual(23 * TILE + 0.001)
    expect(max - min).toBeGreaterThan(TILE) // it actually patrolled
  })

  test('falls when the ground under it goes away', () => {
    const w = worldWith(['S....', '.....', '..c..', '.....'], [{ type: 'snapper', x: 2, y: 1 }])
    const e = enemyOf(w, 'snapper')
    const startY = e.y
    for (let i = 0; i < 10; i++) update(w, blank())
    expect(e.y).toBe(startY) // standing on it

    w.collapsed.add(2 * w.map.width + 2)
    for (let i = 0; i < 30; i++) update(w, blank())
    expect(e.y).toBeGreaterThan(startY)
  })

  test('is stompable', () => {
    const w = worldWith(floor(), [{ type: 'snapper', x: 20, y: 2 }])
    expect(canStomp(enemyOf(w, 'snapper'))).toBe(true)
  })
})

describe('Drifter — the jellyfish', () => {
  test('floats a sine around its spawn point and always returns to it', () => {
    const w = worldWith(floor(), [{ type: 'drifter', x: 20, y: 1, amplitude: 2, period: 60 }])
    const e = enemyOf(w, 'drifter')
    const home = e.homeY
    let lowest = e.y
    let highest = e.y
    for (let i = 0; i < 60; i++) {
      update(w, blank())
      lowest = Math.max(lowest, e.y)
      highest = Math.min(highest, e.y)
    }
    expect(home - highest).toBeCloseTo(2 * TILE, 0)
    expect(lowest - home).toBeCloseTo(2 * TILE, 0)
    expect(e.y).toBeCloseTo(home, 6) // one full period, back where it started
  })

  test('ignores terrain entirely — it floats through walls', () => {
    const w = worldWith(['S....', '.....', '##########'.slice(0, 5), '.....'], [
      { type: 'drifter', x: 2, y: 1, amplitude: 3, period: 40 },
    ])
    const e = enemyOf(w, 'drifter')
    let passedThrough = false
    for (let i = 0; i < 80; i++) {
      update(w, blank())
      if (e.y > 2 * TILE) passedThrough = true
    }
    expect(passedThrough).toBe(true)
  })

  /**
   * Sampled, not integrated. An accumulated sine drifts off its centre over
   * thousands of frames, which would put a jellyfish somewhere a replay does
   * not expect.
   */
  test('is sampled from the clock, so it never drifts off centre', () => {
    const w = worldWith(floor(), [{ type: 'drifter', x: 20, y: 1, amplitude: 3, period: 120 }])
    const e = enemyOf(w, 'drifter')
    for (let i = 0; i < 120 * 50; i++) update(w, blank())
    expect(e.y).toBeCloseTo(e.homeY, 6)
  })

  test('cannot be stomped — the only answer is to route around it', () => {
    const w = worldWith(floor(), [{ type: 'drifter', x: 20, y: 1 }])
    expect(canStomp(enemyOf(w, 'drifter'))).toBe(false)
  })
})

describe('Puffer', () => {
  test('stays deflated while Nib is far away', () => {
    const w = worldWith(floor(), [{ type: 'puffer', x: 30, y: 2 }])
    const e = enemyOf(w, 'puffer')
    for (let i = 0; i < 120; i++) update(w, blank())
    expect(e.inflated).toBe(0)
    expect(canStomp(e)).toBe(true)
  })

  test('inflates within three tiles and becomes unstompable', () => {
    const w = worldWith(floor(), [{ type: 'puffer', x: 3, y: 2 }])
    const e = enemyOf(w, 'puffer')
    update(w, blank())
    expect(e.inflated).toBeGreaterThan(0)
    expect(canStomp(e)).toBe(false)
    expect(e.w).toBeGreaterThan(e.spawnW)
  })

  /**
   * The lesson is patience, and it only exists because the timer does not
   * re-arm while Nib stands there. If proximity held it inflated forever the
   * honest answer would be "walk away", which teaches nothing about timing.
   */
  test('deflates on schedule even with Nib standing next to it', () => {
    const w = worldWith(floor(), [{ type: 'puffer', x: 3, y: 2 }])
    const e = enemyOf(w, 'puffer')
    update(w, blank())
    for (let i = 0; i < ENEMIES.PUFFER_INFLATE; i++) update(w, blank())
    expect(e.inflated).toBe(0)
    expect(canStomp(e)).toBe(true)
    expect(e.w).toBe(e.spawnW)
  })

  test('grows and shrinks around its own feet, never sinking into the floor', () => {
    const w = worldWith(floor(), [{ type: 'puffer', x: 3, y: 2 }])
    const e = enemyOf(w, 'puffer')
    const groundLine = e.y + e.h
    update(w, blank())
    expect(e.y + e.h).toBeCloseTo(groundLine, 4)
  })
})

/**
 * Put Nib in the air directly above something, so the stomp rule is tested on
 * its own rather than through a jump arc that could miss for its own reasons.
 */
function placeAbove(w: World, e: { x: number; y: number; w: number }, gap = 24, dx = 0): void {
  const p = w.player
  p.x = e.x + (e.w - p.w) / 2 + dx
  p.y = e.y - p.h - gap
  p.vx = 0
  p.vy = 0
  p.prevY = p.y
  p.grounded = false
}

describe('stomping', () => {
  function stompSetup() {
    const w = worldWith(
      ['S..........', '...........', '...........', '###########'],
      [{ type: 'snapper', x: 4, y: 2, patrol: [4, 4] }],
    )
    const d = new Driver(w)
    d.step(0, 10)
    placeAbove(w, enemyOf(w, 'snapper'))
    return { w, d, e: enemyOf(w, 'snapper') }
  }

  function landOn(d: Driver, held = 0): void {
    for (let i = 0; i < 400; i++) {
      d.step(held)
      if (d.world.enemies.every((e) => !e.alive)) return
    }
  }

  test('a stomp kills, bounces and refunds a pip', () => {
    const { w, d, e } = stompSetup()
    w.player.ink = 1
    landOn(d)
    expect(e.alive).toBe(false)
    expect(w.player.vy).toBeLessThan(0) // bounced
    expect(w.player.ink).toBe(2) // refunded, capped at the tier max
  })

  test('a stomp scores the first chain link', () => {
    const { w, d } = stompSetup()
    landOn(d)
    expect(w.score).toBe(STOMP_CHAIN[0])
  })

  test('the refund is capped at the tier maximum', () => {
    const { w, d } = stompSetup()
    w.player.ink = 3
    landOn(d)
    expect(w.player.ink).toBe(3)
  })

  /**
   * A regression, and a sharp one.
   *
   * The variable-height jump cut used to clamp the stomp bounce as well, which
   * silently turned every -4.60 bounce into -1.80 — a third of the height the
   * PRD specifies, and just low enough that a bounce chain could not reach the
   * next enemy. It looked like a level-design problem for as long as nobody
   * measured it.
   */
  test('a stomp bounce is the specified height even with jump released', () => {
    const { w, d } = stompSetup()
    landOn(d)
    expect(w.player.vy).toBeCloseTo(PHYSICS.STOMP_BOUNCE, 6)
  })

  test('holding jump on contact bounces higher', () => {
    const w = worldWith(
      ['S..........', '...........', '...........', '###########'],
      [{ type: 'snapper', x: 4, y: 2, patrol: [4, 4] }],
    )
    const d = new Driver(w)
    d.step(0, 10)
    placeAbove(w, w.enemies[0]!)
    for (let i = 0; i < 400 && w.enemies[0]!.alive; i++) d.step(Act.Jump)
    expect(w.player.vy).toBeCloseTo(PHYSICS.STOMP_BOUNCE_HELD, 6)
  })

  test('a stomp freezes the frame briefly — the hitstop that sells the impact', () => {
    const { w, d } = stompSetup()
    landOn(d)
    expect(w.hitstop).toBeGreaterThan(0)
  })

  test('walking into a Snapper from the side costs a tier instead', () => {
    const w = worldWith(['S..........', '###########'], [{ type: 'snapper', x: 6, y: 0, patrol: [6, 6] }])
    const d = new Driver(w)
    d.step(0, 10)
    for (let i = 0; i < 300 && w.player.tier === FULL; i++) d.step(Act.Right)
    expect(w.player.tier).toBe(SPENT)
    expect(w.enemies[0]!.alive).toBe(true)
  })

  test('landing on an inflated Puffer costs a tier — read the state before committing', () => {
    const w = worldWith(
      ['S..........', '...........', '...........', '###########'],
      [{ type: 'puffer', x: 4, y: 2 }],
    )
    const d = new Driver(w)
    d.step(0, 10)
    for (let i = 0; i < 300 && w.player.tier === FULL; i++) d.step(Act.Right)
    expect(w.player.tier).toBe(SPENT)
    expect(w.enemies[0]!.alive).toBe(true)
  })
})

describe('the stomp chain', () => {
  test('escalates per link and caps', () => {
    expect(STOMP_CHAIN).toEqual([100, 200, 400, 800, 1000])
  })

  /**
   * Three Snappers, bounced without touching down. This is the scoring shape
   * the whole aerial-traversal loop is built around: bounce, drift, bounce.
   */
  test('three stomps with no ground contact score 100 + 200 + 400', () => {
    const w = worldWith(
      ['S'.padEnd(24, '.'), '.'.repeat(24), '.'.repeat(24), '.'.repeat(24), '#'.repeat(24)],
      [
        { type: 'snapper', x: 4, y: 3, patrol: [4, 4] },
        { type: 'snapper', x: 6, y: 3, patrol: [6, 6] },
        { type: 'snapper', x: 8, y: 3, patrol: [8, 8] },
      ],
    )
    const d = new Driver(w)
    d.step(0, 10)
    // Offset left so the first landing overlaps only the first crab.
    placeAbove(w, w.enemies[0]!, 24, -8)
    for (let i = 0; i < 900; i++) {
      d.step(Act.Right)
      if (w.enemies.every((e) => !e.alive)) break
    }
    expect(w.enemies.every((e) => !e.alive)).toBe(true)
    expect(w.score).toBe(100 + 200 + 400)
    expect(w.chain).toBe(3)
  })

  /**
   * Landing squarely between two adjacent crabs stomps both, and neither bites.
   *
   * The rule this pins down: a landing beats a touch, for the whole frame. The
   * first stomp reverses `vy`, so without a snapshot of how Nib arrived the
   * second crab would read as a walk into its flank and cost a tier — an
   * unearned double-hit that would be unreadable in hindsight.
   */
  test('coming down between two adjacent crabs stomps both, and costs nothing', () => {
    const w = worldWith(
      ['S...............', '................', '................', '................', '################'],
      [
        { type: 'snapper', x: 4, y: 3, patrol: [4, 4] },
        { type: 'snapper', x: 5, y: 3, patrol: [5, 5] },
      ],
    )
    const d = new Driver(w)
    d.step(0, 10)
    placeAbove(w, w.enemies[0]!, 24, 6)
    for (let i = 0; i < 60 && w.enemies.some((e) => e.alive); i++) d.step(0)
    expect(w.enemies.every((e) => !e.alive)).toBe(true)
    expect(w.player.tier).toBe(FULL)
    expect(w.score).toBe(100 + 200)
  })

  test('touching the ground ends the chain', () => {
    const w = worldWith(
      ['S..........', '...........', '...........', '###########'],
      [{ type: 'snapper', x: 4, y: 2, patrol: [4, 4] }],
    )
    const d = new Driver(w)
    d.step(0, 10)
    placeAbove(w, w.enemies[0]!)
    for (let i = 0; i < 400 && w.enemies[0]!.alive; i++) d.step(0)
    expect(w.chain).toBe(1)
    for (let i = 0; i < 200; i++) d.step(0)
    expect(w.chain).toBe(0)
  })
})

describe('the shrink ink cloud', () => {
  test('stuns every enemy within two tiles for thirty frames', () => {
    const w = worldWith(
      ['S...............', '################'],
      [
        { type: 'snapper', x: 4, y: 0, patrol: [4, 4] },
        { type: 'snapper', x: 5, y: 0, patrol: [5, 5] },
        { type: 'snapper', x: 14, y: 0, patrol: [14, 14] },
      ],
    )
    const d = new Driver(w)
    d.step(0, 10)
    for (let i = 0; i < 300 && w.player.tier === FULL; i++) d.step(Act.Right)
    expect(w.player.tier).toBe(SPENT)

    const near = w.enemies.filter((e) => e.homeX < 7 * TILE)
    const far = w.enemies.find((e) => e.homeX > 12 * TILE)!
    expect(near.every((e) => e.stun > 0)).toBe(true)
    expect(far.stun).toBe(0)
    expect(Math.max(...near.map((e) => e.stun))).toBeLessThanOrEqual(RULES.SHRINK_STUN_FRAMES)
  })

  test('a stunned enemy is frozen, not skipped — its clock stops too', () => {
    const w = worldWith(floor(), [{ type: 'drifter', x: 20, y: 1 }])
    const e = enemyOf(w, 'drifter')
    for (let i = 0; i < 20; i++) update(w, blank())
    const clock = e.clock
    const y = e.y
    e.stun = 10
    for (let i = 0; i < 10; i++) update(w, blank())
    expect(e.clock).toBe(clock)
    expect(e.y).toBe(y)
  })
})

describe('the Charged dash', () => {
  test('kills what it passes through, without a stomp', () => {
    const w = worldWith(['S..........', '###########'], [{ type: 'snapper', x: 3, y: 0, patrol: [3, 3] }])
    setTier(w.map, w.player, CHARGED_TIER)
    const d = new Driver(w)
    d.step(0, 10)
    d.tap(Act.Dash, Act.Right | Act.Dash)
    for (let i = 0; i < 60 && w.enemies[0]!.alive; i++) d.step(Act.Right)
    expect(w.enemies[0]!.alive).toBe(false)
    expect(w.player.tier).toBe(CHARGED_TIER) // took no damage doing it
  })

  test('a dash-through pays at least the flat Charged value', () => {
    const w = worldWith(['S..........', '###########'], [{ type: 'snapper', x: 3, y: 0, patrol: [3, 3] }])
    setTier(w.map, w.player, CHARGED_TIER)
    const d = new Driver(w)
    d.step(0, 10)
    d.tap(Act.Dash, Act.Right | Act.Dash)
    for (let i = 0; i < 60 && w.enemies[0]!.alive; i++) d.step(Act.Right)
    expect(w.score).toBe(150)
  })

  test('an ordinary dash at Full does not kill — it only buys i-frames', () => {
    const w = worldWith(['S..........', '###########'], [{ type: 'snapper', x: 3, y: 0, patrol: [3, 3] }])
    const d = new Driver(w)
    d.step(0, 10)
    d.tap(Act.Dash, Act.Right | Act.Dash)
    for (let i = 0; i < INK.DASH_IFRAMES; i++) d.step(Act.Right)
    expect(w.enemies[0]!.alive).toBe(true)
  })
})

describe('respawn restores the room', () => {
  test('every enemy comes back where and how it was authored', () => {
    const w = worldWith(
      ['S..........', '...........', '...........', '###########'],
      [{ type: 'snapper', x: 4, y: 2, patrol: [4, 4] }, { type: 'puffer', x: 8, y: 2 }],
    )
    const d = new Driver(w)
    d.step(0, 10)
    placeAbove(w, w.enemies[0]!)
    for (let i = 0; i < 400 && w.enemies[0]!.alive; i++) d.step(0)
    expect(w.enemies[0]!.alive).toBe(false)

    respawn(w)

    for (const e of w.enemies) {
      expect(e.alive).toBe(true)
      expect(e.x).toBe(e.homeX)
      expect(e.y).toBe(e.homeY)
      expect(e.w).toBe(e.spawnW)
      expect(e.clock).toBe(0)
    }
  })
})
