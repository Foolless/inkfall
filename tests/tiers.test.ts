import { describe, expect, test } from 'vitest'
import { CHARGED_TIER, FULL, RULES, SPENT, TIERS, type TierIndex } from '../src/game/constants.js'
import { hurt, promote, setTier, tierOf } from '../src/game/player.js'
import { respawn, update } from '../src/game/world.js'
import { blank, Driver, flatGround, settle, worldWith } from './helpers.js'

const ALL: TierIndex[] = [SPENT, FULL, CHARGED_TIER]

describe('the tier ladder', () => {
  /**
   * The whole damage model in one table. A hit steps exactly one rung down and
   * a pickup exactly one rung up — no skipping in either direction.
   */
  test.each([
    [CHARGED_TIER, FULL],
    [FULL, SPENT],
  ])('a hit at tier %i drops to tier %i', (from, to) => {
    const w = settle(worldWith(flatGround()))
    setTier(w.map, w.player, from as TierIndex)
    expect(hurt(w.map, w.player, 0)).toBe(true)
    expect(w.player.tier).toBe(to)
    expect(w.player.alive).toBe(true)
  })

  test('a hit at Spent kills', () => {
    const w = settle(worldWith(flatGround()))
    setTier(w.map, w.player, SPENT)
    expect(hurt(w.map, w.player, 0)).toBe(true)
    expect(w.player.alive).toBe(false)
    expect(w.player.deaths).toBe(1)
  })

  test('an Ink Bulb promotes Spent to Full and no further', () => {
    const w = settle(worldWith(flatGround()))
    setTier(w.map, w.player, SPENT)
    promote(w.map, w.player, FULL)
    expect(w.player.tier).toBe(FULL)
    promote(w.map, w.player, FULL) // a second bulb cannot reach Charged
    expect(w.player.tier).toBe(FULL)
  })

  test('an Ink Core collected while Spent promotes one rung only, to Full', () => {
    const w = settle(worldWith(flatGround()))
    setTier(w.map, w.player, SPENT)
    promote(w.map, w.player, CHARGED_TIER)
    expect(w.player.tier).toBe(FULL)
  })

  test('an Ink Core promotes Full to Charged', () => {
    const w = settle(worldWith(flatGround()))
    promote(w.map, w.player, CHARGED_TIER)
    expect(w.player.tier).toBe(CHARGED_TIER)
  })

  test('a pickup taken at that tier already refills the meter instead', () => {
    const w = settle(worldWith(flatGround()))
    w.player.ink = 0
    const promoted = promote(w.map, w.player, FULL)
    expect(promoted).toBe(false)
    expect(w.player.tier).toBe(FULL)
    expect(w.player.ink).toBe(TIERS[FULL]!.inkMax)
  })

  test('only Charged has a killing dash', () => {
    for (const t of ALL) expect(TIERS[t]!.dashKills).toBe(t === CHARGED_TIER)
  })

  test('Charged grants no extra pips — pip count belongs to Deep Jet', () => {
    expect(TIERS[CHARGED_TIER]!.inkMax).toBe(TIERS[FULL]!.inkMax)
  })

  test('only Spent is small enough for a 1-tile gap', () => {
    for (const t of ALL) {
      const fits = TIERS[t]!.h <= 16 && TIERS[t]!.w <= 16 && TIERS[t]!.h <= 10
      expect(fits).toBe(t === SPENT)
    }
  })
})

describe('taking a hit', () => {
  test('invulnerability frames prevent an instant second hit', () => {
    const w = settle(worldWith(flatGround()))
    expect(hurt(w.map, w.player, 0)).toBe(true)
    expect(w.player.iframes).toBe(RULES.HURT_IFRAMES)
    expect(hurt(w.map, w.player, 0)).toBe(false) // the double-hit that must not happen
    expect(w.player.tier).toBe(SPENT)
  })

  test('the expelled ink cloud stuns for the documented window', () => {
    const w = settle(worldWith(flatGround()))
    hurt(w.map, w.player, 0)
    expect(w.player.stunCloud).toBe(RULES.SHRINK_STUN_FRAMES)
    for (let i = 0; i < RULES.SHRINK_STUN_FRAMES; i++) update(w, blank())
    expect(w.player.stunCloud).toBe(0)
  })

  test('knockback pushes away from the source', () => {
    const right = settle(worldWith(flatGround()))
    hurt(right.map, right.player, right.player.x + 100) // hit from the right
    expect(right.player.vx).toBeLessThan(0)

    const left = settle(worldWith(flatGround()))
    hurt(left.map, left.player, left.player.x - 100)
    expect(left.player.vx).toBeGreaterThan(0)
  })

  test('shrinking keeps Nib standing on the floor, not buried in it', () => {
    const w = settle(worldWith(flatGround()))
    const bottomBefore = w.player.y + w.player.h
    hurt(w.map, w.player, 0)
    expect(w.player.y + w.player.h).toBeCloseTo(bottomBefore, 6)
  })

  test('growing under a low ceiling lifts Nib clear rather than trapping him', () => {
    // A one-tile-high corridor: only Spent fits.
    const tiles = ['##########', '##########', '#S.......#', '##########']
    const w = worldWith(tiles)
    setTier(w.map, w.player, SPENT)
    for (let i = 0; i < 20; i++) update(w, blank())
    const yBefore = w.player.y

    promote(w.map, w.player, FULL, w.collapsed)
    expect(w.player.tier).toBe(FULL)
    // He must not be left overlapping the ceiling.
    expect(w.player.y).toBeLessThanOrEqual(yBefore)
    for (let i = 0; i < 20; i++) update(w, blank())
    expect(w.player.alive).toBe(true)
  })
})

describe('respawn', () => {
  test('always restores Full — never Spent, never Charged', () => {
    for (const start of ALL) {
      const w = settle(worldWith(flatGround()))
      setTier(w.map, w.player, start)
      w.player.alive = false
      respawn(w)
      expect(w.player.tier, `from tier ${start}`).toBe(RULES.RESPAWN_TIER)
      expect(w.player.tier).toBe(FULL)
      expect(w.player.ink).toBe(tierOf(w.player).inkMax)
    }
  })

  test('respawn grants invulnerability and clears dash state', () => {
    const w = settle(worldWith(flatGround()))
    w.player.dashFrames = 5
    w.player.dashCooldown = 9
    w.player.alive = false
    respawn(w)
    expect(w.player.iframes).toBe(RULES.RESPAWN_IFRAMES)
    expect(w.player.dashFrames).toBe(0)
    expect(w.player.dashCooldown).toBe(0)
    expect(w.player.alive).toBe(true)
  })

  test('death returns Nib to the last checkpoint, not the level start', () => {
    // K sits on the row the player actually stands in, not the one above it.
    const tiles = ['S.........', '......K...', '##########']
    const w = worldWith(tiles)
    const d = new Driver(w)
    d.step(0, 40) // settle onto the floor
    d.step(2, 200) // walk right onto the checkpoint (Act.Right === 2)
    expect(w.checkpoint).not.toBeNull()

    const cp = { ...w.checkpoint! }
    w.player.alive = false
    respawn(w)
    expect(w.player.x).toBe(cp.x)
    expect(w.player.y).toBe(cp.y)
  })
})

describe('hazards ignore tiers entirely', () => {
  test.each(ALL)('a hazard kills outright at tier %i — geometry kills, creatures cost', (tier) => {
    const tiles = ['S.........', '..........', '^^^^^^^^^^', '##########']
    const w = worldWith(tiles)
    setTier(w.map, w.player, tier)
    for (let i = 0; i < 120 && w.player.alive; i++) update(w, blank())
    expect(w.player.alive).toBe(false)
  })
})
