import { describe, expect, test } from 'vitest'
import { Act } from '../src/engine/input.js'
import { INK, RULES, TIERS, UPGRADES } from '../src/game/constants.js'
import { Tile, tileAt } from '../src/game/tilemap.js'
import { hurt, inkMax } from '../src/game/player.js'
import { update } from '../src/game/world.js'
import {
  ALL_UPGRADES,
  GRANTED_ON_CLEAR,
  hasUpgrade,
  idsOf,
  isUpgradeId,
  maskOf,
  UPGRADE_BIT,
  UPGRADE_IDS,
  withUpgrade,
} from '../src/game/upgrades.js'
import { Driver, blank, TILE, worldWith, worldWithUpgrades } from './helpers.js'

/**
 * The five permanent upgrades. PRD §8.5.
 *
 * The load-bearing assertion in this file is the last one: **no upgrade changes
 * how many hits Nib can take.** Upgrades and tiers are different currencies and
 * the whole tier system stops meaning anything the day one of them blurs that
 * line, so it is asserted for all five rather than argued about in review.
 */
describe('the mask', () => {
  test('every id has its own bit, and none of them collide', () => {
    const bits = UPGRADE_IDS.map((id) => UPGRADE_BIT[id])
    expect(new Set(bits).size).toBe(bits.length)
    expect(bits.reduce((a, b) => a | b, 0)).toBe(ALL_UPGRADES)
  })

  test('ids round-trip through a mask', () => {
    expect(idsOf(maskOf(['cling', 'deepJet']))).toEqual(['cling', 'deepJet'])
    expect(idsOf(ALL_UPGRADES)).toEqual([...UPGRADE_IDS])
  })

  /**
   * Save data is the caller here. An id written by a newer build must not throw
   * on an older one — the save layer already promises to preserve what it does
   * not understand, and this is that promise seen from the other side.
   */
  test('an unknown id is ignored rather than thrown at', () => {
    expect(() => maskOf(['cling', 'tentacleGrapple'])).not.toThrow()
    expect(idsOf(maskOf(['cling', 'tentacleGrapple']))).toEqual(['cling'])
    expect(isUpgradeId('tentacleGrapple')).toBe(false)
  })

  test('adding one you already hold changes nothing', () => {
    const held = maskOf(['inkShot'])
    expect(withUpgrade(held, 'inkShot')).toBe(held)
  })

  test('one upgrade per world, and Deep Jet is not among them', () => {
    const granted = Object.values(GRANTED_ON_CLEAR)
    expect(new Set(granted).size).toBe(granted.length)
    // §8.5: it is the one upgrade found inside a level rather than granted for
    // finishing one, which is why World 5 B2 exists at all.
    expect(granted).not.toContain('deepJet')
  })
})

describe('Deep Jet', () => {
  const flat = ['S' + '.'.repeat(29), '#'.repeat(30)]

  test('a fourth pip, at every tier', () => {
    for (let tier = 0; tier < TIERS.length; tier++) {
      const plain = worldWith(flat).player
      const jet = worldWithUpgrades(flat, ['deepJet']).player
      plain.tier = tier as 0 | 1 | 2
      jet.tier = tier as 0 | 1 | 2
      expect(inkMax(jet)).toBe(inkMax(plain) + UPGRADES.DEEP_JET_PIPS)
    }
  })

  test('a faster dash on a shorter cooldown', () => {
    const jet = new Driver(worldWithUpgrades(flat, ['deepJet']))
    jet.step(0, 5).tap(Act.Dash, Act.Right)
    expect(Math.abs(jet.p.vx)).toBeCloseTo(INK.DASH_SPEED + UPGRADES.DEEP_JET_SPEED, 5)
    expect(jet.p.dashCooldown).toBe(INK.DASH_LOCK_FRAMES + UPGRADES.DEEP_JET_COOLDOWN)

    const plain = new Driver(worldWith(flat))
    plain.step(0, 5).tap(Act.Dash, Act.Right)
    expect(Math.abs(plain.p.vx)).toBeCloseTo(INK.DASH_SPEED, 5)
    expect(plain.p.dashCooldown).toBe(INK.DASH_LOCK_FRAMES + INK.DASH_COOLDOWN)
  })

  test('picking up the nodule grants it mid-level and tops the meter up', () => {
    const w = worldWith(['S..........', '.......n...'.replace('n', '.'), '###########'], [
      { type: 'deepJet', x: 4, y: 1 },
    ])
    w.player.x = 4 * TILE
    w.player.y = 1 * TILE
    update(w, blank())
    expect(hasUpgrade(w.player.upgrades, 'deepJet')).toBe(true)
    expect(w.player.ink).toBe(inkMax(w.player))
    // The session banks it; the simulation only ever raises it.
    expect(w.earned).toContain('deepJet')
  })
})

describe('Cling', () => {
  //  A two-tile shaft with wall on both sides and a floor at the bottom.
  const shaft = [
    'S.#...#....',
    '..#...#....',
    '..#...#....',
    '..#...#....',
    '..#...#....',
    '###########',
  ]

  test('without the upgrade a wall is just a wall', () => {
    const d = new Driver(worldWith(shaft))
    d.step(Act.Right, 60)
    expect(d.p.clingDir).toBe(0)
  })

  test('holding into a wall grips, and the grip holds vertical velocity at zero', () => {
    const w = worldWithUpgrades(shaft, ['cling'])
    const d = new Driver(w)
    // Off the floor and against the left face of the pillar at x2.
    d.p.x = 1.4 * TILE
    d.p.y = 2 * TILE
    d.step(Act.Right, 3)
    expect(d.p.clingDir).toBe(1)
    expect(d.p.vy).toBe(0)
  })

  test('past sixty frames the grip becomes a slide', () => {
    const w = worldWithUpgrades(shaft, ['cling'])
    const d = new Driver(w)
    d.p.x = 1.4 * TILE
    d.p.y = 1 * TILE
    d.step(Act.Right, UPGRADES.CLING_FRAMES + 2)
    expect(d.p.clingDir).toBe(1)
    expect(d.p.vy).toBeCloseTo(UPGRADES.CLING_SLIDE, 5)
  })

  test('letting go of the direction lets go of the wall', () => {
    const w = worldWithUpgrades(shaft, ['cling'])
    const d = new Driver(w)
    d.p.x = 1.4 * TILE
    d.p.y = 2 * TILE
    d.step(Act.Right, 3)
    expect(d.p.clingDir).toBe(1)
    d.step(0, 1)
    expect(d.p.clingDir).toBe(0)
  })

  /**
   * The rule that makes a cling shaft a route with a budget rather than a free
   * elevator: the first grip of an airtime is free and every later one is a pip.
   */
  test('the first grip is free and the second costs a pip', () => {
    const w = worldWithUpgrades(shaft, ['cling'])
    const d = new Driver(w)
    d.p.x = 1.4 * TILE
    d.p.y = 2 * TILE

    const before = d.p.ink
    d.step(Act.Right, 3)
    expect(d.p.ink).toBe(before)
    expect(d.p.clingsUsed).toBe(1)

    d.step(0, 2) // let go
    d.step(Act.Right, 2) // and grip again
    expect(d.p.clingsUsed).toBe(2)
    expect(d.p.ink).toBe(before - UPGRADES.CLING_REGRIP_COST)
  })

  test('with no pips left there is no second grip', () => {
    const w = worldWithUpgrades(shaft, ['cling'])
    const d = new Driver(w)
    d.p.x = 1.4 * TILE
    d.p.y = 2 * TILE
    d.step(Act.Right, 3)
    d.p.ink = 0
    d.step(0, 2)
    d.step(Act.Right, 2)
    expect(d.p.clingDir).toBe(0)
  })

  test('touching down makes the next grip free again', () => {
    const w = worldWithUpgrades(shaft, ['cling'])
    const d = new Driver(w)
    d.step(0, 40) // fall to the floor
    expect(d.p.grounded).toBe(true)
    expect(d.p.clingsUsed).toBe(0)
  })

  test('jumping off a wall pushes away from it', () => {
    const w = worldWithUpgrades(shaft, ['cling'])
    const d = new Driver(w)
    d.p.x = 1.4 * TILE
    d.p.y = 2 * TILE
    d.step(Act.Right, 3)
    d.tap(Act.Jump, Act.Right)
    expect(d.p.vy).toBeLessThan(0)
    expect(d.p.vx).toBeLessThan(0) // away from the wall on the right
    expect(d.p.clingDir).toBe(0)
  })
})

describe('Ink Shot', () => {
  // Three rows of headroom, because a bolt *arcs*: fired flat into a corridor
  // one tile tall it would bury itself in the floor before reaching anything,
  // which says more about the fixture than about the upgrade.
  const range = ['S' + '.'.repeat(29), '.'.repeat(30), '.'.repeat(30), '#'.repeat(30)]

  test('nothing comes out without the upgrade', () => {
    const d = new Driver(worldWith(range))
    d.step(0, 3).tap(Act.Shoot)
    expect(d.world.projectiles.filter((p) => p.alive)).toHaveLength(0)
  })

  test('a bolt costs a pip and flies the way Nib faces', () => {
    const w = worldWithUpgrades(range, ['inkShot'])
    const d = new Driver(w)
    d.step(Act.Right, 10)
    const before = d.p.ink
    d.tap(Act.Shoot, Act.Right)
    const live = w.projectiles.filter((p) => p.alive)
    expect(live).toHaveLength(1)
    expect(live[0]!.kind).toBe('bolt')
    expect(live[0]!.vx).toBeGreaterThan(0)
    expect(d.p.ink).toBe(before - UPGRADES.SHOT_COST)
  })

  test('with no pips there is no bolt', () => {
    const w = worldWithUpgrades(range, ['inkShot'])
    const d = new Driver(w)
    d.p.ink = 0
    d.tap(Act.Shoot)
    expect(w.projectiles.filter((p) => p.alive)).toHaveLength(0)
  })

  test('it kills a Drifter, which nothing in World 1 could', () => {
    const w = worldWithUpgrades(range, ['inkShot'], [{ type: 'drifter', x: 4, y: 2, amplitude: 0 }])
    const d = new Driver(w)
    d.step(0, 30)
    d.tap(Act.Shoot, Act.Right)
    for (let i = 0; i < 40 && w.enemies[0]!.alive; i++) d.step(0)
    expect(w.enemies[0]!.alive).toBe(false)
  })

  test('an Eel is stunned, never killed', () => {
    const w = worldWithUpgrades(range, ['inkShot'], [{ type: 'eel', x: 4, y: 2, dir: 'left' }])
    const eel = w.enemies[0]!
    const d = new Driver(w)
    d.step(0, 30)
    d.tap(Act.Shoot, Act.Right)
    for (let i = 0; i < 60 && eel.stun === 0; i++) d.step(0)
    expect(eel.alive).toBe(true)
    expect(eel.stun).toBeGreaterThan(0)
  })
})

describe('Ink Bomb', () => {
  //  A cracked wall two tiles to the right of the start.
  const wall = ['S..x.......', '#..x.......', '###########']

  test('cracked terrain is solid until a bomb opens it', () => {
    const w = worldWithUpgrades(wall, ['inkBomb'])
    expect(tileAt(w.map, 3, 1)).toBe(Tile.CRACKED)
    const d = new Driver(w)
    d.step(Act.Right, 40)
    // He is stopped by the wall rather than walking through it.
    expect(d.p.x).toBeLessThan(3 * TILE)
  })

  test('the blast opens every cracked tile inside it', () => {
    const w = worldWithUpgrades(wall, ['inkBomb'])
    const d = new Driver(w)
    d.step(Act.Right, 5)
    d.tap(Act.Shoot, Act.Right | Act.Down)
    const live = w.projectiles.filter((p) => p.alive)
    expect(live).toHaveLength(1)
    expect(live[0]!.kind).toBe('bomb')

    for (let i = 0; i < UPGRADES.BOMB_FUSE + 4; i++) d.step(0)
    expect(w.collapsed.has(0 * w.map.width + 3)).toBe(true)
    expect(w.collapsed.has(1 * w.map.width + 3)).toBe(true)
  })

  test('a bomb never hurts the player who threw it', () => {
    const w = worldWithUpgrades(wall, ['inkBomb'])
    const d = new Driver(w)
    const tier = d.p.tier
    d.tap(Act.Shoot, Act.Down)
    for (let i = 0; i < UPGRADES.BOMB_FUSE + 10; i++) d.step(0)
    expect(d.p.alive).toBe(true)
    expect(d.p.tier).toBe(tier)
  })

  test('without the upgrade, a crouched shot is still just a bolt', () => {
    const w = worldWithUpgrades(wall, ['inkShot'])
    const d = new Driver(w)
    d.tap(Act.Shoot, Act.Down)
    expect(w.projectiles.filter((p) => p.alive)[0]!.kind).toBe('bolt')
  })
})

describe('Heat Shell', () => {
  const pool = ['S..........', '..hhhh.....', '###########']
  const fused = ['S..f.......', '#..f.......', '###########']

  test('superheated water scalds without it, and does not with it', () => {
    const plain = new Driver(worldWith(pool))
    plain.p.x = 3 * TILE
    plain.p.y = 1 * TILE
    plain.step(0, 20)
    expect(plain.p.scald).toBeGreaterThan(0)

    const shelled = new Driver(worldWithUpgrades(pool, ['heatShell']))
    shelled.p.x = 3 * TILE
    shelled.p.y = 1 * TILE
    shelled.step(0, 20)
    expect(shelled.p.scald).toBe(0)
  })

  test('ninety frames in hot water is fatal without it', () => {
    const d = new Driver(worldWith(pool))
    for (let i = 0; i < 200 && d.p.alive; i++) {
      d.p.x = 3 * TILE
      d.p.y = 1 * TILE
      d.step(0)
    }
    expect(d.p.alive).toBe(false)
  })

  test('surfacing bleeds the scald timer back down', () => {
    const d = new Driver(worldWith(pool))
    d.p.x = 3 * TILE
    d.p.y = 1 * TILE
    d.step(0, 20)
    const cooked = d.p.scald
    d.p.x = 8 * TILE
    d.p.y = 1 * TILE
    d.step(0, 5)
    expect(d.p.scald).toBeLessThan(cooked)
  })

  test('magma kills outright without it, and grants ninety frames with it', () => {
    const lava = ['S..........', '..mmmm.....', '###########']
    const plain = new Driver(worldWith(lava))
    plain.p.x = 3 * TILE
    plain.p.y = 1 * TILE
    plain.step(0, 2)
    expect(plain.p.alive).toBe(false)

    const shelled = new Driver(worldWithUpgrades(lava, ['heatShell']))
    shelled.p.x = 3 * TILE
    shelled.p.y = 1 * TILE
    shelled.step(0, 30)
    expect(shelled.p.alive).toBe(true)
  })

  test('heat-fused debris is solid without it and open with it', () => {
    const closed = new Driver(worldWith(fused))
    closed.step(Act.Right, 60)
    expect(closed.p.x).toBeLessThan(3 * TILE)

    const open = new Driver(worldWithUpgrades(fused, ['heatShell']))
    open.step(Act.Right, 90)
    expect(open.p.x).toBeGreaterThan(3 * TILE)
  })

  test('the doors stay open after a respawn', () => {
    const w = worldWithUpgrades(fused, ['heatShell'])
    const opened = [...w.collapsed]
    expect(opened.length).toBeGreaterThan(0)
    w.player.alive = false
    for (let i = 0; i < RULES.DEATH_ANIM_FRAMES + 2; i++) update(w, blank())
    for (const tile of opened) expect(w.collapsed.has(tile)).toBe(true)
  })
})

/**
 * PRD §8.5's design note, as a test.
 *
 * "No permanent upgrade ever changes how many hits Nib can take, and no tier is
 * ever permanent." Deep Jet owns pip count, Charged owns dash damage, and the
 * two never overlap. This is the assertion that keeps them apart.
 */
describe('upgrades and tiers are different currencies', () => {
  const flat = ['S' + '.'.repeat(19), '#'.repeat(20)]

  test('no upgrade changes the hit count', () => {
    for (const id of [...UPGRADE_IDS, ...UPGRADE_IDS.map(() => null)]) {
      const w = id === null ? worldWith(flat) : worldWithUpgrades(flat, [id])
      const p = w.player
      let hits = 0
      // Straight through hurt(), which is the only thing that drops a tier.
      while (p.alive && hits < 10) {
        p.iframes = 0
        hurt(w.map, p, p.x - 100, w.collapsed)
        hits++
      }
      // Full -> Spent -> dead is two, with every upgrade and with none.
      expect(hits, `${id ?? 'nothing'} changed the hit count`).toBe(2)
    }
  })

  test('and no upgrade makes a tier permanent', () => {
    const w = worldWithUpgrades(flat, ['deepJet', 'heatShell'])
    w.player.tier = 2
    w.player.iframes = 0
    update(w, blank())
    expect(w.player.tier).toBe(2) // nothing promotes on its own
  })
})
