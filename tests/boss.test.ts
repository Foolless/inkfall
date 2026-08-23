import { describe, expect, test } from 'vitest'
import { Act } from '../src/engine/input.js'
import { BOSS, FULL, RULES, SPENT } from '../src/game/constants.js'
import { createWorld, respawn, update, type World } from '../src/game/world.js'
import { hitHermitKing, isVulnerable, phaseOf, spawnBoss, type Boss } from '../src/game/bosses/index.js'
import { POINTS } from '../src/game/score.js'
import { tidepools } from '../src/content/levels/w01-tidepools.js'
import { loadCampaignLevel } from '../src/content/levels/format.js'
import { blank, Driver, levelFrom, TILE, worldWith } from './helpers.js'

/**
 * A bare bowl: floor, a far wall, a boss, and one ledge out of his reach.
 *
 * The ledge matters. Without somewhere safe to park Nib, most of these tests
 * would quietly be measuring what happens after he is charged into, killed and
 * respawned — which resets the very fight they are trying to watch.
 */
function arenaWorld(): World {
  const width = BOSS.ARENA_TILES + 4
  const rows: string[] = []
  for (let y = 0; y < 8; y++) {
    if (y === 1) rows.push('.'.repeat(LEDGE_X) + 'S' + '.'.repeat(width - LEDGE_X - 2) + '#')
    else if (y === 2) rows.push('.'.repeat(LEDGE_X) + '####' + '.'.repeat(width - LEDGE_X - 5) + '#')
    else if (y < 7) rows.push('.'.repeat(width - 1) + '#')
    else rows.push('#'.repeat(width))
  }
  const def = { ...levelFrom(rows, 'arena', []), boss: 'hermitKing' }
  return createWorld(def)
}

/** Just inside the bowl, and high enough that the King charges underneath. */
const LEDGE_X = 5

function enterArena(w: World): Boss {
  for (let i = 0; i < 8; i++) update(w, blank())
  if (!w.boss) throw new Error('the fight never started')
  return w.boss
}

describe('the arena', () => {
  test('a level with a boss reserves exactly one screen for the fight', () => {
    const w = arenaWorld()
    expect(w.arena).not.toBeNull()
    expect(w.arena!.w).toBe(BOSS.ARENA_TILES * TILE)
  })

  test('a level without a boss reserves none', () => {
    expect(worldWith(['S....E', '######']).arena).toBeNull()
  })

  test('the fight does not start until Nib crosses into the bowl', () => {
    const w = arenaWorld()
    w.player.x = 0
    update(w, blank())
    expect(w.bossActive).toBe(false)
    expect(w.boss).toBeNull()
  })

  test('crossing in wakes the King', () => {
    const w = arenaWorld()
    const boss = enterArena(w)
    expect(w.bossActive).toBe(true)
    expect(boss.state).toBe('waking')
    expect(phaseOf(boss)).toBe(1)
  })

  /** The soft wall that stands in for a gate closing. */
  test('once it starts, Nib cannot walk back out of the bowl', () => {
    const w = arenaWorld()
    enterArena(w)
    const d = new Driver(w)
    for (let i = 0; i < 200; i++) d.step(Act.Left)
    expect(w.player.x).toBeGreaterThanOrEqual(w.arena!.x)
  })
})

describe('the pattern', () => {
  test('he wakes, then charges', () => {
    const w = arenaWorld()
    const boss = enterArena(w)
    for (let i = 0; i < BOSS.WAKE_FRAMES + BOSS.IDLE_FRAMES[0]! + 4; i++) update(w, blank())
    expect(['charging', 'exposed']).toContain(boss.state)
  })

  test('a charge ends in a bonk, and a bonk exposes his back', () => {
    const w = arenaWorld()
    const boss = enterArena(w)
    for (let i = 0; i < 900 && boss.state !== 'exposed'; i++) update(w, blank())
    expect(boss.state).toBe('exposed')
    expect(isVulnerable(boss)).toBe(true)
    expect(boss.timer).toBeGreaterThan(0)
  })

  test('the exposed window closes on its own', () => {
    const w = arenaWorld()
    const boss = enterArena(w)
    for (let i = 0; i < 900 && boss.state !== 'exposed'; i++) update(w, blank())
    for (let i = 0; i < BOSS.BONK_STUN + 4; i++) update(w, blank())
    expect(isVulnerable(boss)).toBe(false)
  })

  test('he charges toward Nib, never away from him', () => {
    const w = arenaWorld()
    const boss = enterArena(w)
    w.player.x = w.arena!.x + 2
    for (let i = 0; i < 900 && boss.state !== 'charging'; i++) update(w, blank())
    expect(boss.facing).toBe(-1) // Nib is to his left
  })

  /**
   * Alternating rather than choosing is what makes the fight learnable, and
   * learnable is the whole difference between hard and unfair.
   */
  test('from Phase 2 he alternates charging and throwing', () => {
    const boss = spawnBoss('hermitKing', { x: 0, y: 0, w: 320, h: 128 })
    boss.hits = 1
    expect(phaseOf(boss)).toBe(2)

    const seen: string[] = []
    const w = arenaWorld()
    enterArena(w)
    w.boss = boss
    boss.y = w.arena!.y + w.arena!.h - 16 - boss.h
    for (let i = 0; i < 1_600; i++) {
      update(w, blank())
      if (boss.state === 'throwing' || boss.state === 'charging') {
        if (seen[seen.length - 1] !== boss.state) seen.push(boss.state)
      }
    }
    expect(seen.length).toBeGreaterThan(2)
    // No two of the same in a row.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1])
  })

  test('a thrown rock actually leaves his claw', () => {
    const w = arenaWorld()
    const boss = enterArena(w)
    boss.hits = 1
    for (let i = 0; i < 2_000 && !w.rocks.some((r) => r.alive); i++) update(w, blank())
    expect(w.rocks.some((r) => r.alive)).toBe(true)
  })

  test('rocks are recycled rather than allocated forever', () => {
    const w = arenaWorld()
    const boss = enterArena(w)
    boss.hits = 1
    for (let i = 0; i < 6_000; i++) update(w, blank())
    // A rock is in flight for at most its arc; a pool of a handful is plenty.
    expect(w.rocks.length).toBeLessThan(8)
  })
})

describe('phase transitions', () => {
  const bossAt = (hits: number): Boss => {
    const b = spawnBoss('hermitKing', { x: 0, y: 0, w: 320, h: 128 })
    b.hits = hits
    return b
  }

  test('phase is derived from the hit count, so the two cannot disagree', () => {
    expect(phaseOf(bossAt(0))).toBe(1)
    expect(phaseOf(bossAt(1))).toBe(2)
    expect(phaseOf(bossAt(2))).toBe(3)
  })

  test('he charges faster in Phase 3', () => {
    expect(BOSS.CHARGE_SPEED[2]).toBeGreaterThan(BOSS.CHARGE_SPEED[0]!)
    expect(BOSS.IDLE_FRAMES[2]).toBeLessThan(BOSS.IDLE_FRAMES[0]!)
  })

  test('a hit only lands on the exposed back', () => {
    const b = bossAt(0)
    b.state = 'charging'
    expect(hitHermitKing(b)).toBe(false)
    expect(b.hits).toBe(0)

    b.state = 'exposed'
    expect(hitHermitKing(b)).toBe(true)
    expect(b.hits).toBe(1)
  })

  test('three hits finish him', () => {
    const b = bossAt(2)
    b.state = 'exposed'
    hitHermitKing(b)
    expect(b.hits).toBe(BOSS.HERMIT_HITS)
    expect(b.state).toBe('dying')
  })

  test('a dying King cannot be hit again', () => {
    const b = bossAt(2)
    b.state = 'exposed'
    hitHermitKing(b)
    expect(hitHermitKing(b)).toBe(false)
    expect(b.hits).toBe(BOSS.HERMIT_HITS)
  })

  test('Phase 3 lets two Snappers out, exactly once', () => {
    const w = arenaWorld()
    const boss = enterArena(w)
    const before = w.enemies.length
    boss.hits = 2
    for (let i = 0; i < 300; i++) update(w, blank())
    expect(w.enemies.length).toBe(before + 2)
    expect(boss.spawnedGuards).toBe(true)
  })
})

describe('fighting him', () => {
  function exposedFight(): { w: World; boss: Boss } {
    const w = arenaWorld()
    const boss = enterArena(w)
    for (let i = 0; i < 900 && boss.state !== 'exposed'; i++) update(w, blank())
    return { w, boss }
  }

  test('landing on the exposed back scores and bounces', () => {
    const { w, boss } = exposedFight()
    const p = w.player
    p.x = boss.x + boss.w / 2 - p.w / 2
    p.y = boss.y - p.h - 8
    p.prevY = p.y
    p.vy = 0
    p.grounded = false
    for (let i = 0; i < 60 && boss.hits === 0; i++) update(w, blank())

    expect(boss.hits).toBe(1)
    expect(w.player.vy).toBeLessThan(0)
    expect(w.score).toBeGreaterThanOrEqual(POINTS.BOSS_HIT)
  })

  test('touching him anywhere else costs a tier', () => {
    const w = arenaWorld()
    const boss = enterArena(w)
    boss.state = 'charging'
    const p = w.player
    p.x = boss.x - p.w + 2
    p.y = boss.y + 8
    p.prevY = p.y
    for (let i = 0; i < 30 && p.tier === FULL; i++) update(w, blank())
    expect(p.tier).toBe(SPENT)
  })

  test('a rock costs a tier — it is a projectile, not geometry', () => {
    const w = arenaWorld()
    enterArena(w)
    w.rocks.push({ x: w.player.x, y: w.player.y, w: 8, h: 8, vx: 0, vy: 0, alive: true })
    w.player.iframes = 0
    update(w, blank())
    expect(w.player.tier).toBe(SPENT)
    expect(w.rocks[0]!.alive).toBe(false)
  })

  test('killing him pays the boss bonus on top of the last hit', () => {
    const w = arenaWorld()
    const boss = enterArena(w)
    boss.hits = 2
    boss.state = 'exposed'
    boss.timer = BOSS.BONK_STUN
    const p = w.player
    p.x = boss.x + boss.w / 2 - p.w / 2
    p.y = boss.y - p.h - 8
    p.prevY = p.y
    p.vy = 0
    p.grounded = false
    for (let i = 0; i < 60 && boss.state === 'exposed'; i++) update(w, blank())
    expect(w.score).toBeGreaterThanOrEqual(POINTS.BOSS + POINTS.BOSS_HIT)
  })
})

describe('the exit is the boss, not the door behind him', () => {
  const level = loadCampaignLevel(tidepools)

  test('touching the exit while the King lives does nothing', () => {
    const w = createWorld(level)
    w.player.x = w.exit!.x
    w.player.y = w.exit!.y
    for (let i = 0; i < 10; i++) update(w, blank())
    expect(w.cleared).toBe(false)
  })

  test('with the King dead, the exit clears the level', () => {
    const w = createWorld(level)
    w.player.x = w.arena!.x + 8
    update(w, blank())
    w.boss!.state = 'dead'
    w.player.x = w.exit!.x
    w.player.y = w.exit!.y
    for (let i = 0; i < 10; i++) update(w, blank())
    expect(w.cleared).toBe(true)
  })
})

describe('dying in the fight', () => {
  test('a respawn restarts the whole fight, guards and all', () => {
    const w = arenaWorld()
    const boss = enterArena(w)
    boss.hits = 2
    for (let i = 0; i < 300; i++) update(w, blank())
    expect(w.enemies.length).toBeGreaterThan(w.baseEnemies)

    respawn(w)
    expect(w.boss).toBeNull()
    expect(w.bossActive).toBe(false)
    expect(w.enemies.length).toBe(w.baseEnemies)
    expect(w.rocks.every((r) => !r.alive)).toBe(true)
  })

  test('the conch at the door means a retry is a retry, not a walk back', () => {
    const level = loadCampaignLevel(tidepools)
    const last = level.checkpoints[level.checkpoints.length - 1]!
    expect(last.x).toBeGreaterThan(level.map.width - BOSS.ARENA_TILES - 8)
  })
})

describe('determinism', () => {
  /**
   * Twelve hundred frames of Phase 2, including the rocks that eventually kill
   * Nib and reset the fight. Two runs that die on the same frame and restart
   * identically is a stronger claim than two runs that never went wrong.
   */
  test('the same fight replayed twice is the same fight', () => {
    const run = () => {
      const w = arenaWorld()
      enterArena(w)
      w.boss!.hits = 1
      const marks: number[] = []
      for (let i = 0; i < 1_200; i++) {
        update(w, blank())
        marks.push(
          Math.round((w.boss?.x ?? -1) * 1000),
          w.boss?.hits ?? -1,
          w.rocks.filter((r) => r.alive).length,
          w.player.deaths,
        )
      }
      return marks.join(',')
    }
    const first = run()
    expect(first).toBe(run())
    // And it did more than sit still for twelve hundred frames.
    expect(new Set(first.split(',')).size).toBeGreaterThan(20)
  })

  test('the fight advances one frame per step, hitstop included', () => {
    const w = arenaWorld()
    const before = w.frame
    for (let i = 0; i < 300; i++) update(w, blank())
    expect(w.frame).toBe(before + 300)
    void RULES
  })
})
