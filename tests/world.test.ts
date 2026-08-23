import { describe, expect, test } from 'vitest'
import { Act } from '../src/engine/input.js'
import { CHARGED_TIER, FULL, RULES, SPENT } from '../src/game/constants.js'
import { setTier } from '../src/game/player.js'
import { createWorld, update } from '../src/game/world.js'
import { blank, Driver, levelFrom, TILE, worldWith } from './helpers.js'

describe('crumble tiles', () => {
  const bridge = ['S.........', '..........', 'ccccccccc.', '..........', '##########']

  test('a crumble tile holds, collapses, then comes back', () => {
    const w = worldWith(bridge)
    // Drop onto the bridge and stand there.
    for (let i = 0; i < 30; i++) update(w, blank())
    expect(w.player.grounded).toBe(true)
    expect(w.crumbling.size).toBe(1)

    const hold = RULES.CRUMBLE_RESPAWN
    for (let i = 0; i < 40 && w.collapsed.size === 0; i++) update(w, blank())
    expect(w.collapsed.size).toBe(1)
    expect(w.crumbling.size).toBe(0)

    for (let i = 0; i < hold + 5; i++) update(w, blank())
    expect(w.collapsed.size).toBe(0) // the tile returns
  })

  test('Spent Nib gets longer footing — being small is not purely worse', () => {
    const spent = worldWith(bridge)
    setTier(spent.map, spent.player, SPENT)
    for (let i = 0; i < 30; i++) update(spent, blank())
    const spentHold = [...spent.crumbling.values()][0]

    const full = worldWith(bridge)
    for (let i = 0; i < 30; i++) update(full, blank())
    const fullHold = [...full.crumbling.values()][0]

    expect(spentHold).toBeGreaterThan(fullHold!)
  })

  test('standing on an already-crumbling tile does not restart its timer', () => {
    const w = worldWith(bridge)
    for (let i = 0; i < 30; i++) update(w, blank())
    const first = [...w.crumbling.values()][0]
    update(w, blank())
    const second = [...w.crumbling.values()][0]
    expect(second).toBeLessThan(first!)
  })
})

describe('pickups', () => {
  test('an Ink Bulb is consumed once and promotes one tier', () => {
    const w = worldWith(['S....b....', '##########'])
    setTier(w.map, w.player, SPENT)
    const d = new Driver(w)
    d.step(0, 20)
    expect(w.player.tier).toBe(SPENT)

    d.step(Act.Right, 200)
    expect(w.player.tier).toBe(FULL)
    expect(w.pickups[0]!.taken).toBe(true)

    // Walking back over it must do nothing.
    const inkBefore = w.player.ink
    d.step(Act.Left, 200)
    expect(w.player.tier).toBe(FULL)
    expect(w.player.ink).toBe(inkBefore)
  })

  test('an Ink Core promotes Full all the way to Charged', () => {
    const w = worldWith(['S....o....', '##########'])
    const d = new Driver(w)
    d.step(0, 20)
    d.step(Act.Right, 200)
    expect(w.player.tier).toBe(CHARGED_TIER)
  })

  test('an Ink Core taken while Spent stops at Full — no skipping a rung', () => {
    const w = worldWith(['S....o....', '##########'])
    setTier(w.map, w.player, SPENT)
    const d = new Driver(w)
    d.step(0, 20)
    d.step(Act.Right, 200)
    expect(w.player.tier).toBe(FULL)
  })
})

describe('level flow', () => {
  test('reaching the exit clears the level', () => {
    const w = worldWith(['S........E', '##########'])
    const d = new Driver(w)
    d.step(0, 20)
    expect(w.cleared).toBe(false)
    d.step(Act.Right | Act.Run, 300)
    expect(w.cleared).toBe(true)
  })

  test('falling out of the world kills rather than dropping forever', () => {
    const w = worldWith(['S.........', '..........', '..........'])
    for (let i = 0; i < 400 && w.player.alive; i++) update(w, blank())
    expect(w.player.alive).toBe(false)
  })

  test('death is followed by an animation, then a respawn', () => {
    // The spawn is deliberately clear of the spikes: a respawn point inside a
    // hazard would loop forever, since hazards kill regardless of i-frames.
    const w = worldWith(['S....^....', '##########'])
    const d = new Driver(w)
    d.step(0, 20)

    for (let i = 0; i < 300 && w.player.alive; i++) d.step(Act.Right)
    expect(w.player.alive).toBe(false)

    const deathsBefore = w.player.deaths
    d.step(0, RULES.DEATH_ANIM_FRAMES + 2) // stop walking; wait out the animation
    expect(w.player.alive).toBe(true)
    expect(w.player.deaths).toBe(deathsBefore)
    expect(w.player.x).toBe(w.spawn.x)
  })

  test('a fresh world is identical to a reset one', () => {
    const def = levelFrom(['S........E', '##########'], 'flow')
    const a = createWorld(def)
    const b = createWorld(def)
    expect(a.player.x).toBe(b.player.x)
    expect(a.spawn).toEqual(b.spawn)
  })

  test('the spawn point sits where the S mark is', () => {
    const w = worldWith(['..........', '..S.......', '##########'])
    expect(w.spawn.x).toBe(2 * TILE + 2)
    expect(w.spawn.y).toBe(1 * TILE + 2)
  })
})
