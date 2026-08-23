import { describe, expect, test } from 'vitest'
import { Act } from '../src/engine/input.js'
import { CHARGED_TIER, HAZARDS, RULES, SPENT } from '../src/game/constants.js'
import { setTier } from '../src/game/player.js'
import { update } from '../src/game/world.js'
import { CLAM_CYCLE, clamState, isClamDeadly, isClamSolid, isTelegraphing } from '../src/game/hazards.js'
import { Driver, TILE, blank, worldWith } from './helpers.js'

/**
 * Hazards are instant death at any tier. Geometry kills, creatures cost.
 *
 * That split is the rule the whole world's readability rests on, so it is
 * asserted at every tier including Charged — the tier that kills things by
 * touching them still dies to a spike.
 */
describe('hazards ignore tiers entirely', () => {
  const spikes = ['S.........', '..........', '####^^####']

  test.each([
    ['Spent', SPENT],
    ['Charged', CHARGED_TIER],
  ])('urchin spikes kill at %s', (_name, tier) => {
    const w = worldWith(spikes)
    setTier(w.map, w.player, tier)
    const d = new Driver(w)
    for (let i = 0; i < 400 && w.player.alive; i++) d.step(Act.Right)
    expect(w.player.alive).toBe(false)
  })

  test('falling out of the world kills at any tier', () => {
    const w = worldWith(['S....', '.....', '.....'])
    setTier(w.map, w.player, CHARGED_TIER)
    for (let i = 0; i < 200 && w.player.alive; i++) update(w, blank())
    expect(w.player.alive).toBe(false)
  })
})

describe('collapsing sand', () => {
  // A hard floor under the bridge, so a collapse drops Nib somewhere rather
  // than out of the world — a death would respawn him and reset every tile,
  // which is the opposite of what this is measuring.
  const bridge = ['...S......', '..........', '#ccccccccc', '..........', '##########']

  test('holds, then gives way, then comes back', () => {
    const w = worldWith(bridge)
    const d = new Driver(w)
    d.step(0, 10)
    expect(w.crumbling.size).toBeGreaterThan(0)

    for (let i = 0; i < 40; i++) d.step(0)
    expect(w.collapsed.size).toBeGreaterThan(0)
    const tile = [...w.collapsed][0]!

    for (let i = 0; i < RULES.CRUMBLE_RESPAWN + 10; i++) d.step(0)
    expect(w.player.alive).toBe(true)
    expect(w.collapsed.has(tile)).toBe(false)
  })

  test('Spent Nib sits on it half again as long — small is not purely worse', () => {
    const holdAt = (tier: typeof SPENT) => {
      const w = worldWith(bridge)
      setTier(w.map, w.player, tier)
      const d = new Driver(w)
      for (let i = 0; i < 40; i++) {
        d.step(0)
        if (w.crumbling.size > 0) return [...w.crumbling.values()][0]!
      }
      throw new Error('never started crumbling')
    }
    expect(holdAt(SPENT)).toBeGreaterThan(holdAt(1 as typeof SPENT))
  })
})

describe('the crush clam', () => {
  /** A clam on the floor with a gap either side of it. */
  const room = (phase = 0) => ({
    tiles: ['S.............', '..............', '..............', '##############', '##############'],
    entities: [{ type: 'clam' as const, x: 5, y: 2, phase }],
  })

  function clamWorld(phase = 0) {
    const r = room(phase)
    const w = worldWith(r.tiles, r.entities)
    return { w, c: w.clams[0]! }
  }

  test('cycles open, slams, closes, and repeats', () => {
    const { w, c } = clamWorld()
    const seen: string[] = []
    for (let i = 0; i < CLAM_CYCLE; i++) {
      seen.push(clamState(c))
      update(w, blank())
    }
    expect(new Set(seen)).toEqual(new Set(['open', 'slamming', 'closed']))
    expect(seen.filter((s) => s === 'slamming').length).toBe(HAZARDS.CLAM_SLAM)
    expect(seen.filter((s) => s === 'open').length).toBe(HAZARDS.CLAM_OPEN)

    // And it is exactly where it started one cycle later.
    expect(clamState(c)).toBe('open')
  })

  test('the slam is short and the warning is long', () => {
    expect(HAZARDS.CLAM_TELEGRAPH).toBeGreaterThan(HAZARDS.CLAM_SLAM * 2)
  })

  test('it telegraphs before it slams, and only then', () => {
    const { w, c } = clamWorld()
    let telegraphed = 0
    for (let i = 0; i < HAZARDS.CLAM_OPEN; i++) {
      if (isTelegraphing(c)) telegraphed++
      update(w, blank())
    }
    expect(telegraphed).toBe(HAZARDS.CLAM_TELEGRAPH)
    expect(clamState(c)).toBe('slamming')
    expect(isTelegraphing(c)).toBe(false)
  })

  test('an authored phase offsets it — three clams become a rhythm, not three copies', () => {
    const a = clamWorld(0)
    const b = clamWorld(HAZARDS.CLAM_OPEN + HAZARDS.CLAM_SLAM)
    expect(clamState(a.c)).toBe('open')
    expect(clamState(b.c)).toBe('closed')
  })

  test('closed, the shell is footing; open, there is nothing there', () => {
    const { c } = clamWorld(HAZARDS.CLAM_OPEN + HAZARDS.CLAM_SLAM)
    expect(isClamSolid(c)).toBe(true)
    expect(isClamDeadly(c)).toBe(false)

    const open = clamWorld(0)
    expect(isClamSolid(open.c)).toBe(false)
    expect(isClamDeadly(open.c)).toBe(true)
  })

  test('Nib stands on a closed shell', () => {
    const { w, c } = clamWorld(HAZARDS.CLAM_OPEN + HAZARDS.CLAM_SLAM)
    const p = w.player
    p.x = c.x + 8
    p.y = c.y - p.h - 8
    p.vy = 0
    for (let i = 0; i < 20; i++) update(w, blank())
    expect(p.alive).toBe(true)
    expect(p.grounded).toBe(true)
    expect(p.y + p.h).toBeCloseTo(c.y, 4)
  })

  test('the shell opening under Nib drops him into the mouth, and that kills', () => {
    // Land on the shell with just a few frames of "closed" left.
    const { w, c } = clamWorld(CLAM_CYCLE - 6)
    const p = w.player
    p.x = c.x + 8
    p.y = c.y - p.h
    p.vy = 0
    for (let i = 0; i < 40 && p.alive; i++) update(w, blank())
    expect(p.alive).toBe(false)
  })

  test('standing in an open mouth when it slams is death at any tier', () => {
    const { w, c } = clamWorld(HAZARDS.CLAM_OPEN - 3)
    setTier(w.map, w.player, CHARGED_TIER)
    const p = w.player
    p.x = c.x + 8
    p.y = c.y
    for (let i = 0; i < 10 && p.alive; i++) update(w, blank())
    expect(p.alive).toBe(false)
  })

  test('a closed clam blocks horizontal movement like a wall', () => {
    const { w, c } = clamWorld(HAZARDS.CLAM_OPEN + HAZARDS.CLAM_SLAM)
    const p = w.player
    p.x = c.x - p.w - 2
    p.y = c.y
    p.vy = 0
    const d = new Driver(w)
    for (let i = 0; i < 30; i++) d.step(Act.Right)
    expect(p.x + p.w).toBeLessThanOrEqual(c.x + 0.001)
  })

  test('a dash cannot tunnel through a closed shell', () => {
    const { w, c } = clamWorld(HAZARDS.CLAM_OPEN + HAZARDS.CLAM_SLAM)
    const p = w.player
    p.x = c.x - p.w - 2
    p.y = c.y
    p.vy = 0
    const d = new Driver(w)
    d.tap(Act.Dash, Act.Right | Act.Dash)
    for (let i = 0; i < 20; i++) d.step(Act.Right)
    expect(p.x + p.w).toBeLessThanOrEqual(c.x + 0.001)
  })

  test('a respawn restores the authored phase, not frame zero', () => {
    const { w, c } = clamWorld(40)
    for (let i = 0; i < 25; i++) update(w, blank())
    expect(c.clock).toBe(65)

    w.player.alive = false
    for (let i = 0; i < RULES.DEATH_ANIM_FRAMES + 4; i++) update(w, blank())
    expect(c.clock).toBeLessThan(50)
    expect(c.phase).toBe(40)
  })

  test('a clam sits on tile boundaries, so its shell lines up with the floor', () => {
    const { c } = clamWorld()
    expect(c.x % TILE).toBe(0)
    expect(c.y % TILE).toBe(0)
    expect(c.w).toBe(2 * TILE)
  })
})
