import { describe, expect, test } from 'vitest'
import { BOSSES } from '../src/game/constants.js'
import { parseTiles, type TileMap } from '../src/game/tilemap.js'
import {
  armsOf,
  arenaSpecOf,
  beakOf,
  BOSS_IDS,
  coreOf,
  cutArm,
  eyeOf,
  hitBoss,
  hitKelpWarden,
  hitKraken,
  hitVentLord,
  isVulnerable,
  lanternsOf,
  openParts,
  phaseOf,
  spawnBoss,
  suckersOf,
  tentacleCount,
  tentaclesOf,
  tilt,
  trueLanternIndex,
  updateBoss,
  ventOrder,
  ventsOf,
  type Boss,
  type BossStepContext,
} from '../src/game/bosses/index.js'
import type { Box } from '../src/game/collision.js'

const TILE = 16

/**
 * The four bosses Phase 3 added, against §6.3's contract.
 *
 * The contract is the same for all five and is asserted for all five at the
 * bottom of this file: **three hits, three phases, one arena, no dice.** The
 * per-boss blocks above it check the one thing each fight is *about* — the
 * Warden's order of operations, the Captain's decoys, the Vent Lord's shrinking
 * floor, the Kraken's change of verb.
 */
const ARENA: Box = { x: 0, y: 0, w: 20 * TILE, h: 20 * TILE }

const map: TileMap = parseTiles([
  'S...................',
  ...Array.from({ length: 19 }, () => '....................'),
  '####################',
])

function context(player: Box = { x: 10 * TILE, y: 18 * TILE, w: 12, h: 14 }): BossStepContext & { summons: number } {
  const ctx = {
    map,
    arena: ARENA,
    player,
    rocks: [],
    summons: 0,
    summonGuards() {
      ctx.summons++
    },
  }
  return ctx
}

function run(b: Boss, ctx: BossStepContext, frames: number): void {
  for (let i = 0; i < frames; i++) updateBoss(ctx, b)
}

/** Step until a predicate holds, or give up. Returns the frames it took. */
function until(b: Boss, ctx: BossStepContext, done: () => boolean, limit = 4_000): number {
  for (let i = 0; i < limit; i++) {
    if (done()) return i
    updateBoss(ctx, b)
  }
  throw new Error('condition never held')
}

describe('the Kelp Warden', () => {
  test('four arms and a core, and the core starts shut', () => {
    const b = spawnBoss('kelpWarden', ARENA)
    expect(armsOf(b)).toHaveLength(BOSSES.WARDEN_ARMS)
    expect(coreOf(b).open).toBe(false)
  })

  /** The order of operations *is* the fight: arms first, core second. */
  test('the core only opens once every arm is down', () => {
    const b = spawnBoss('kelpWarden', ARENA)
    const ctx = context()
    run(b, ctx, BOSSES.WAKE_FRAMES + 2)

    const arms = armsOf(b)
    for (let i = 0; i < arms.length - 1; i++) cutArm(arms[i]!)
    run(b, ctx, 1)
    expect(coreOf(b).open).toBe(false)

    cutArm(arms[arms.length - 1]!)
    run(b, ctx, 1)
    expect(coreOf(b).open).toBe(true)
  })

  test('a dash into the open core is a hit; anything else is not', () => {
    const b = spawnBoss('kelpWarden', ARENA)
    const ctx = context()
    run(b, ctx, BOSSES.WAKE_FRAMES + 2)
    expect(hitKelpWarden(b)).toBe(false) // core shut

    for (const arm of armsOf(b)) cutArm(arm)
    run(b, ctx, 1)
    expect(hitKelpWarden(b)).toBe(true)
    expect(b.hits).toBe(1)
  })

  /** Failing to convert is a setback, never a soft-lock. */
  test('letting the window close brings every arm back', () => {
    const b = spawnBoss('kelpWarden', ARENA)
    const ctx = context()
    run(b, ctx, BOSSES.WAKE_FRAMES + 2)
    for (const arm of armsOf(b)) cutArm(arm)
    run(b, ctx, BOSSES.WARDEN_CORE_OPEN + 2)
    expect(coreOf(b).open).toBe(false)
    expect(armsOf(b).every((a) => a.alive)).toBe(true)
  })

  test('an arm left alone grows back', () => {
    const b = spawnBoss('kelpWarden', ARENA)
    const ctx = context()
    run(b, ctx, BOSSES.WAKE_FRAMES + 2)
    const arm = armsOf(b)[0]!
    cutArm(arm)
    run(b, ctx, BOSSES.WARDEN_ARM_REGROW + 2)
    expect(arm.alive).toBe(true)
  })

  test('Phase 3 adds the downdraft, and killing it takes the downdraft away', () => {
    const b = spawnBoss('kelpWarden', ARENA)
    const ctx = context()
    run(b, ctx, BOSSES.WAKE_FRAMES + 2)
    expect(b.arenaForceY).toBe(0)

    b.hits = 2
    run(b, ctx, 1)
    expect(b.arenaForceY).toBeCloseTo(BOSSES.WARDEN_DOWNDRAFT, 5)

    for (const arm of armsOf(b)) cutArm(arm)
    run(b, ctx, 1)
    hitKelpWarden(b)
    expect(b.state).toBe('dying')
    expect(b.arenaForceY).toBe(0)
  })

  test('the arms alternate walls, so no one spot in the shaft is safe', () => {
    const b = spawnBoss('kelpWarden', ARENA)
    const sides = armsOf(b).map((a) => Math.sign(a.vx))
    expect(sides).toEqual([1, -1, 1, -1])
  })
})

describe('the Drowned Captain', () => {
  test('one lantern before Phase 3, three after', () => {
    const b = spawnBoss('drownedCaptain', ARENA)
    const ctx = context()
    run(b, ctx, BOSSES.WAKE_FRAMES + 2)
    expect(lanternsOf(b).filter((l) => l.alive)).toHaveLength(1)

    b.hits = 2
    run(b, ctx, 1)
    expect(lanternsOf(b).filter((l) => l.alive)).toHaveLength(BOSSES.CAPTAIN_DECOYS + 1)
  })

  /**
   * A death in Phase 3 is a retry, not a re-roll. Which lantern is real is a
   * function of the hit count and nothing else.
   */
  test('which lantern is real is fixed within a phase and moves between them', () => {
    const b = spawnBoss('drownedCaptain', ARENA)
    const first = trueLanternIndex(b)
    expect(trueLanternIndex(b)).toBe(first)
    b.hits = 1
    expect(trueLanternIndex(b)).not.toBe(first)
  })

  test('shooting a decoy is not a hit', () => {
    const b = spawnBoss('drownedCaptain', ARENA)
    const ctx = context()
    b.hits = 2
    run(b, ctx, BOSSES.WAKE_FRAMES + 2)

    const decoy = lanternsOf(b).find((l) => l.alive && l.index !== trueLanternIndex(b))!
    expect(hitBoss(b, decoy, 'ink')).toBe('none')
    expect(b.hits).toBe(2)
  })

  test('shooting the true lantern is', () => {
    const b = spawnBoss('drownedCaptain', ARENA)
    const ctx = context()
    run(b, ctx, BOSSES.WAKE_FRAMES + 2)
    const real = lanternsOf(b).find((l) => l.alive && l.index === trueLanternIndex(b))!
    expect(hitBoss(b, real, 'ink')).toBe('hit')
    expect(b.hits).toBe(1)
  })

  test('the floor tilts both ways over its cycle', () => {
    const b = spawnBoss('drownedCaptain', ARENA)
    const ctx = context()
    run(b, ctx, BOSSES.WAKE_FRAMES + 2)
    const forces: number[] = []
    for (let i = 0; i < BOSSES.CAPTAIN_TILT_CYCLE; i++) {
      run(b, ctx, 1)
      forces.push(b.arenaForceX)
    }
    expect(Math.max(...forces)).toBeGreaterThan(0)
    expect(Math.min(...forces)).toBeLessThan(0)
    expect(Math.abs(tilt(b))).toBeLessThanOrEqual(1)
  })

  test('the ghost drifts toward the player, through everything', () => {
    const b = spawnBoss('drownedCaptain', ARENA)
    const ctx = context({ x: 2 * TILE, y: 4 * TILE, w: 12, h: 14 })
    run(b, ctx, BOSSES.WAKE_FRAMES + 2)
    const before = b.x
    run(b, ctx, 60)
    expect(b.x).toBeLessThan(before)
  })
})

describe('the Vent Lord', () => {
  test('five vents, and the order is a fixed walk over all of them', () => {
    const b = spawnBoss('ventLord', ARENA)
    expect(ventsOf(b)).toHaveLength(BOSSES.VENT_COUNT)
    const order = Array.from({ length: BOSSES.VENT_COUNT }, (_, i) => ventOrder(i))
    expect(new Set(order).size).toBe(BOSSES.VENT_COUNT)
  })

  test('no two consecutive surfaces are adjacent vents', () => {
    for (let i = 0; i < 20; i++) {
      expect(Math.abs(ventOrder(i + 1) - ventOrder(i))).not.toBe(1)
    }
  })

  test('the rumble comes before the crest, and the crest is the window', () => {
    const b = spawnBoss('ventLord', ARENA)
    const ctx = context()
    until(b, ctx, () => b.state === 'throwing')
    expect(b.timer).toBeLessThanOrEqual(BOSSES.VENT_RUMBLE)
    expect(openParts(b)).toHaveLength(0)

    until(b, ctx, () => b.state === 'exposed')
    expect(openParts(b)).toHaveLength(1)
    expect(openParts(b)[0]!.hit).toBe('stomp')
  })

  /** The arena shrinking *is* the damage readout. There is no health bar. */
  test('the magma comes up a tile on every hit, including the last', () => {
    const b = spawnBoss('ventLord', ARENA)
    const ctx = context()
    for (let hit = 1; hit <= BOSSES.HITS; hit++) {
      until(b, ctx, () => b.state === 'exposed')
      expect(hitVentLord(b)).toBe(true)
      expect(b.floorRise).toBe(hit * BOSSES.VENT_MAGMA_PER_HIT)
    }
    expect(b.state).toBe('dying')
  })

  test('a stomp outside the window does nothing', () => {
    const b = spawnBoss('ventLord', ARENA)
    const ctx = context()
    until(b, ctx, () => b.state === 'idle')
    expect(hitVentLord(b)).toBe(false)
  })

  test('Phase 3 lets the guards out, exactly once', () => {
    const b = spawnBoss('ventLord', ARENA)
    const ctx = context()
    b.hits = 2
    run(b, ctx, 300)
    expect(ctx.summons).toBe(1)
  })
})

describe('the Kraken', () => {
  test('each stage asks for a different verb — ink, stomp, dash', () => {
    const b = spawnBoss('kraken', ARENA)
    const ctx = context()
    const verbs: string[] = []
    for (let hits = 0; hits < 3; hits++) {
      b.hits = hits
      b.state = 'exposed'
      b.timer = 0
      run(b, ctx, 2)
      // Phase 2's beak spends most of its cycle winding up or lunging, so the
      // window has to be waited for rather than assumed.
      until(b, ctx, () => openParts(b).length > 0)
      verbs.push(openParts(b)[0]!.hit)
    }
    expect(verbs).toEqual(['ink', 'stomp', 'dash'])
  })

  test('two tentacles in Phase 1 and eight in Phase 3', () => {
    const b = spawnBoss('kraken', ARENA)
    expect(tentacleCount(b)).toBe(BOSSES.KRAKEN_TENTACLES[0])
    b.hits = 2
    expect(tentacleCount(b)).toBe(BOSSES.KRAKEN_TENTACLES[2])
  })

  test('inking a sucker takes its whole tentacle off', () => {
    const b = spawnBoss('kraken', ARENA)
    const ctx = context()
    run(b, ctx, BOSSES.WAKE_FRAMES + 2)
    const sucker = suckersOf(b).find((s) => s.alive)!
    const arm = tentaclesOf(b)[sucker.index]!
    expect(hitBoss(b, sucker, 'ink')).toBe('part')
    expect(arm.alive).toBe(false)
  })

  test('clearing every arm ends Phase 1', () => {
    const b = spawnBoss('kraken', ARENA)
    const ctx = context()
    run(b, ctx, BOSSES.WAKE_FRAMES + 2)
    for (const s of suckersOf(b).filter((s) => s.alive)) hitBoss(b, s, 'ink')
    run(b, ctx, 2)
    expect(b.hits).toBe(1)
  })

  test('the beak is only stompable in its recovery', () => {
    const b = spawnBoss('kraken', ARENA)
    const ctx = context()
    b.hits = 1
    b.state = 'exposed'
    b.timer = 0
    run(b, ctx, 2)
    const beak = beakOf(b)
    expect(beak.open).toBe(false)
    until(b, ctx, () => beak.open)
    expect(hitBoss(b, beak, 'stomp')).toBe('hit')
  })

  test('the eye opens and shuts, so the dash has to be timed', () => {
    const b = spawnBoss('kraken', ARENA)
    const ctx = context()
    b.hits = 2
    b.state = 'exposed'
    b.timer = 0
    run(b, ctx, 2)
    const eye = eyeOf(b)
    const seen = new Set<boolean>()
    for (let i = 0; i < BOSSES.KRAKEN_EYE_OPEN * 3; i++) {
      run(b, ctx, 1)
      seen.add(eye.open)
    }
    expect(seen.has(true)).toBe(true)
    expect(seen.has(false)).toBe(true)
  })

  /**
   * A scripted no-damage clear. PLAN.md 3.7 asks for exactly this: the fight
   * has to be *finishable* by an agent that only ever does the right thing, or
   * the last three minutes of the game are a wall rather than a boss.
   */
  test('a perfect player clears all three stages', () => {
    const b = spawnBoss('kraken', ARENA)
    const ctx = context()
    run(b, ctx, BOSSES.WAKE_FRAMES + 2)

    for (let guard = 0; guard < 20_000 && b.state !== 'dying' && b.state !== 'dead'; guard++) {
      for (const target of openParts(b)) hitBoss(b, target, target.hit)
      updateBoss(ctx, b)
    }

    expect(b.hits).toBe(BOSSES.HITS)
    expect(b.state === 'dying' || b.state === 'dead').toBe(true)
  })

  test('the last hit puts every part away', () => {
    const b = spawnBoss('kraken', ARENA)
    b.hits = 2
    const eye = eyeOf(b)
    eye.alive = true
    eye.open = true
    expect(hitKraken(b, eye)).toBe(true)
    expect(b.parts.some((p) => p.alive)).toBe(false)
  })
})

/**
 * §6.3's contract, asserted for all five at once.
 *
 * These are the assertions that will fail the day a sixth boss is added with a
 * fourth phase or a health bar, which is exactly when someone needs telling.
 */
describe('every boss keeps the same promises', () => {
  test('five of them, one per world', () => {
    expect(BOSS_IDS).toHaveLength(5)
  })

  for (const id of BOSS_IDS) {
    describe(id, () => {
      test('three hits, and the phase is derived from them', () => {
        const b = spawnBoss(id, ARENA)
        expect(phaseOf(b)).toBe(1)
        b.hits = 1
        expect(phaseOf(b)).toBe(2)
        b.hits = 2
        expect(phaseOf(b)).toBe(3)
        // Never a fourth, however many hits somehow land.
        b.hits = 9
        expect(phaseOf(b)).toBe(3)
      })

      test('it wakes before it fights, so the fight has a beginning', () => {
        const b = spawnBoss(id, ARENA)
        expect(b.state).toBe('waking')
        expect(isVulnerable(b)).toBe(false)
      })

      test('it fits in an arena a level can leave room for', () => {
        const spec = arenaSpecOf(id)
        expect(spec.tilesW).toBeGreaterThan(0)
        expect(spec.tilesH).toBeGreaterThan(0)
        const b = spawnBoss(id, ARENA)
        expect(b.x).toBeGreaterThanOrEqual(ARENA.x)
        expect(b.x + b.w).toBeLessThanOrEqual(ARENA.x + ARENA.w)
      })

      /**
       * The one property the whole design rests on: a boss that rolls dice
       * cannot be practised, and a boss that cannot be practised is not a NES
       * boss. Two identical fights, stepped identically, must stay identical.
       */
      test('it is deterministic — two runs of the same script agree exactly', () => {
        const a = spawnBoss(id, ARENA)
        const c = spawnBoss(id, ARENA)
        const ctxA = context()
        const ctxC = context()
        for (let i = 0; i < 900; i++) {
          updateBoss(ctxA, a)
          updateBoss(ctxC, c)
        }
        expect(snapshot(a)).toEqual(snapshot(c))
      })

      test('it dies rather than lingering, and stops being vulnerable when it does', () => {
        const b = spawnBoss(id, ARENA)
        const ctx = context()
        b.state = 'dying'
        b.timer = BOSSES.DEATH_FRAMES
        run(b, ctx, BOSSES.DEATH_FRAMES + 2)
        expect(b.state).toBe('dead')
      })
    })
  }
})

function snapshot(b: Boss): unknown {
  return {
    x: b.x,
    y: b.y,
    hits: b.hits,
    state: b.state,
    timer: b.timer,
    beat: b.beat,
    floorRise: b.floorRise,
    parts: b.parts.map((p) => [p.alive, p.open, p.x, p.y, p.state, p.timer]),
  }
}
