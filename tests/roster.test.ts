import { describe, expect, test } from 'vitest'
import { ENEMIES } from '../src/game/constants.js'
import {
  canStomp,
  EEL_FLARING,
  EEL_LUNGING,
  EEL_RETREATING,
  EEL_SOCKETED,
  ENEMY_KINDS,
  GHOST_ROOM_TILES,
  HOOK_CYCLE,
  HOOK_DROPPING,
  HOOK_RETRACTING,
  HOOK_SWEEPING,
  inkEffect,
  inkTarget,
  isFlaring,
  lethalBox,
  LIGHTLESS_CHARGING,
  LIGHTLESS_LURKING,
  LIGHTLESS_WINDING,
  extraHurtBox,
  enemySolids,
  hookBarbs,
  hookPlatform,
  snailRear,
  spawnEnemy,
  updateEnemy,
  WHIPKELP_LASHING,
  type Enemy,
} from '../src/game/enemies/index.js'
import { boxesOverlap, type Box } from '../src/game/collision.js'
import { parseTiles } from '../src/game/tilemap.js'
import type { EntityDef } from '../src/content/levels/format.js'

const TILE = 16

/**
 * The twelve-enemy roster, one lesson each. PRD §6.1.
 *
 * These test *behaviour*, not placement — where a Barb Turret goes in World 2
 * is a level question and lives in that level's own file. What matters here is
 * that a turret fires on its cycle, an eel commits once it flares, and a
 * Ghost Diver cannot be solved.
 */
const room = parseTiles([
  'S...................',
  '....................',
  '....................',
  '....................',
  '####################',
])

const NOTHING = new Set<number>()

function make(def: EntityDef & { type: Enemy['kind'] }): Enemy {
  return spawnEnemy(def)
}

function step(e: Enemy, player: Box, frames = 1, fire?: (kind: string) => void): void {
  const ctx = {
    map: room,
    collapsed: NOTHING,
    player,
    fire: (kind: string) => fire?.(kind),
    spawn: () => true,
  }
  for (let i = 0; i < frames; i++) updateEnemy(ctx as never, e)
}

const far: Box = { x: 999, y: 999, w: 1, h: 1 }

describe('the roster is complete and consistent', () => {
  test('twelve species plus the vent that produces one of them', () => {
    // §6.1 budgets twelve enemies. The shrimp vent is scenery with a spawner
    // attached, not a thirteenth lesson — it exists so Bone Shrimp have a
    // source that can be shut off.
    expect(ENEMY_KINDS).toHaveLength(13)
    expect(ENEMY_KINDS).toContain('shrimpVent')
  })

  test('every species answers the four questions the combat pass asks', () => {
    for (const kind of ENEMY_KINDS) {
      const e = make({ type: kind, x: 4, y: 3 } as never)
      expect(typeof canStomp(e), kind).toBe('boolean')
      expect(['kill', 'stun', 'none'], kind).toContain(inkEffect(e))
      expect(inkTarget(e), kind).toBeTruthy()
    }
  })

  /** §6.1's "Stomp?" column, read straight off. */
  test('only four species can be landed on, and armour is not the only reason', () => {
    const stompable = ENEMY_KINDS.filter((k) => canStomp(make({ type: k, x: 4, y: 3 } as never)))
    expect(stompable.sort()).toEqual(['boneShrimp', 'cinderMoth', 'puffer', 'snapper'])
    // A Drifter and a Whipkelp are both unarmoured and neither has a top worth
    // landing on. Being inkable is not the same as being a platform.
    for (const kind of ['drifter', 'whipkelp'] as const) {
      const e = make({ type: kind, x: 4, y: 3 })
      expect(e.armoured, kind).toBe(false)
      expect(canStomp(e), kind).toBe(false)
    }
  })

  /** The Puffer is the exception, and being the exception is its whole lesson. */
  test('a Puffer stops being stompable the moment it inflates', () => {
    const e = make({ type: 'puffer', x: 4, y: 3 })
    expect(canStomp(e)).toBe(true)
    e.inflated = ENEMIES.PUFFER_INFLATE
    expect(canStomp(e)).toBe(false)
  })

  test('nothing armoured can be stomped', () => {
    for (const kind of ENEMY_KINDS) {
      const e = make({ type: kind, x: 4, y: 3 } as never)
      if (!e.armoured) continue
      expect(canStomp(e), kind).toBe(false)
    }
  })
})

describe('Barb Turret', () => {
  test('it fires once a cycle and nothing in between', () => {
    const e = make({ type: 'barbTurret', x: 4, y: 2, dir: 'left' })
    let shots = 0
    step(e, far, ENEMIES.TURRET_CYCLE * 3, () => shots++)
    expect(shots).toBe(3)
  })

  test('the flare is the last twenty frames before the shot', () => {
    const e = make({ type: 'barbTurret', x: 4, y: 2, dir: 'left' })
    step(e, far, ENEMIES.TURRET_CYCLE - ENEMIES.TURRET_TELEGRAPH - 1)
    expect(isFlaring(e)).toBe(false)
    step(e, far, 2)
    expect(isFlaring(e)).toBe(true)
  })

  test('an authored phase offsets the whole cycle', () => {
    const a = make({ type: 'barbTurret', x: 4, y: 2, dir: 'left' })
    const b = make({ type: 'barbTurret', x: 6, y: 2, dir: 'left', phase: 50 })
    let firstA = -1
    let firstB = -1
    for (let i = 0; i < ENEMIES.TURRET_CYCLE * 2; i++) {
      step(a, far, 1, () => {
        if (firstA < 0) firstA = i
      })
      step(b, far, 1, () => {
        if (firstB < 0) firstB = i
      })
    }
    expect(firstA - firstB).toBe(50)
  })

  test('it fires along the axis it was authored to face', () => {
    const up = make({ type: 'barbTurret', x: 4, y: 2, dir: 'up' })
    expect(up.dirX).toBe(0)
    expect(up.dirY).toBe(-1)
  })

  test('nothing kills it', () => {
    const e = make({ type: 'barbTurret', x: 4, y: 2 })
    expect(inkEffect(e)).toBe('none')
    expect(canStomp(e)).toBe(false)
  })
})

describe('Whipkelp', () => {
  test('it lashes for forty frames of every hundred and twenty', () => {
    const e = make({ type: 'whipkelp', x: 4, y: 3, dir: 'right' })
    let lashing = 0
    for (let i = 0; i < ENEMIES.WHIPKELP_CYCLE; i++) {
      step(e, far)
      if (e.state === WHIPKELP_LASHING) lashing++
    }
    expect(lashing).toBe(ENEMIES.WHIPKELP_LASH)
  })

  test('the arm extends and retracts rather than snapping out', () => {
    const e = make({ type: 'whipkelp', x: 4, y: 3, dir: 'right' })
    const widths: number[] = []
    for (let i = 0; i < ENEMIES.WHIPKELP_LASH; i++) {
      step(e, far)
      widths.push(extraHurtBox(e)?.w ?? 0)
    }
    const peak = Math.max(...widths)
    expect(peak).toBeGreaterThan(TILE * 3)
    // Symmetric: the safe moment after an arc is as wide as the one before it.
    expect(widths[0]).toBeLessThan(peak)
    expect(widths[widths.length - 1]).toBeLessThan(peak)
  })

  test('the arm reaches the four tiles §6.1 promises', () => {
    const e = make({ type: 'whipkelp', x: 4, y: 3, dir: 'right' })
    let peak = 0
    for (let i = 0; i < ENEMIES.WHIPKELP_CYCLE; i++) {
      step(e, far)
      peak = Math.max(peak, extraHurtBox(e)?.w ?? 0)
    }
    expect(peak).toBeGreaterThanOrEqual(ENEMIES.WHIPKELP_REACH * TILE * 0.95)
  })

  /** The lesson: attack the right part of a thing. */
  test('ink has to land on the base, not on the arm', () => {
    const e = make({ type: 'whipkelp', x: 4, y: 3, dir: 'right' })
    for (let i = 0; i < 10; i++) step(e, far)
    const base = inkTarget(e)
    const arm = extraHurtBox(e)
    expect(arm).not.toBeNull()
    expect(boxesOverlap(base, arm!)).toBe(false)
  })
})

describe('Eel', () => {
  const inLine = (e: Enemy): Box => ({ x: e.homeX - TILE * 3, y: e.y, w: 12, h: 12 })

  test('it does nothing at all until Nib crosses its line', () => {
    const e = make({ type: 'eel', x: 8, y: 3, dir: 'left' })
    step(e, far, 200)
    expect(e.state).toBe(EEL_SOCKETED)
    expect(e.x).toBe(e.homeX)
  })

  test('crossing the line starts a forty-frame flare', () => {
    const e = make({ type: 'eel', x: 8, y: 3, dir: 'left' })
    step(e, inLine(e), 1)
    expect(e.state).toBe(EEL_FLARING)
    step(e, inLine(e), ENEMIES.EEL_TELEGRAPH)
    expect(e.state).toBe(EEL_LUNGING)
  })

  /** Committing is what makes baiting a decision rather than a coin toss. */
  test('once it flares it lunges, even if Nib has left', () => {
    const e = make({ type: 'eel', x: 8, y: 3, dir: 'left' })
    step(e, inLine(e), 1)
    step(e, far, ENEMIES.EEL_TELEGRAPH + 1)
    expect(e.state).toBe(EEL_LUNGING)
  })

  test('the lunge travels five tiles and then reels in over ninety frames', () => {
    const e = make({ type: 'eel', x: 8, y: 3, dir: 'left' })
    step(e, inLine(e), 1)

    let furthest = 0
    for (let i = 0; i < ENEMIES.EEL_TELEGRAPH + 200; i++) {
      step(e, far)
      furthest = Math.max(furthest, Math.abs(e.x - e.homeX))
    }
    // Five tiles at the top of the lunge — §6.1's number, and the reason the
    // channel in §7.3 C1 is six tiles wide rather than five.
    expect(furthest).toBeCloseTo(ENEMIES.EEL_REACH * TILE, 0)
    // And all the way home by the end, so the next pass is the same room.
    expect(e.state).toBe(EEL_SOCKETED)
    expect(e.x).toBe(e.homeX)
  })

  test('the retreat is the window, and it is ninety frames long', () => {
    const e = make({ type: 'eel', x: 8, y: 3, dir: 'left' })
    step(e, inLine(e), 1)
    let retreating = 0
    for (let i = 0; i < ENEMIES.EEL_TELEGRAPH + 200; i++) {
      step(e, far)
      if (e.state === EEL_RETREATING) retreating++
    }
    expect(retreating).toBe(ENEMIES.EEL_RETREAT)
  })

  test('standing off its row is not crossing its line', () => {
    const e = make({ type: 'eel', x: 8, y: 3, dir: 'left' })
    step(e, { x: e.homeX - TILE * 3, y: e.y - TILE * 5, w: 12, h: 12 }, 5)
    expect(e.state).toBe(EEL_SOCKETED)
  })
})

describe('Ghost Diver', () => {
  test('it comes straight at Nib, through everything', () => {
    const e = make({ type: 'ghostDiver', x: 4, y: 0 })
    const target: Box = { x: 4 * TILE, y: 3.5 * TILE, w: 12, h: 14 }
    const before = e.y
    step(e, target, 30)
    // Straight down through the floor row, which no other enemy would do.
    expect(e.y).toBeGreaterThan(before)
  })

  test('nothing solves it — not ink, not a stomp, not the shrink cloud', () => {
    const e = make({ type: 'ghostDiver', x: 4, y: 2 })
    expect(inkEffect(e)).toBe('none')
    expect(canStomp(e)).toBe(false)
    expect(e.stunProof).toBe(true)
  })

  test('leaving the room is what ends it', () => {
    const e = make({ type: 'ghostDiver', x: 4, y: 2 })
    step(e, { x: e.homeX + (GHOST_ROOM_TILES + 2) * TILE, y: 0, w: 12, h: 14 }, 1)
    expect(e.alive).toBe(false)
  })

  test('it is the slowest thing in the game', () => {
    const e = make({ type: 'ghostDiver', x: 4, y: 2 })
    step(e, { x: 999, y: e.y, w: 12, h: 14 }, 1)
    expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(ENEMIES.GHOST_SPEED, 5)
    expect(ENEMIES.GHOST_SPEED).toBeLessThan(ENEMIES.SNAPPER_SPEED)
  })
})

describe('Hookline', () => {
  test('it drops, sweeps and retracts on a fixed loop', () => {
    const e = make({ type: 'hookline', x: 4, y: 0, dir: 'right', span: 6, drop: 4 })
    const seen = new Set<number>()
    for (let i = 0; i < HOOK_CYCLE; i++) {
      step(e, far)
      seen.add(e.state)
    }
    expect([...seen].sort()).toEqual([HOOK_DROPPING, HOOK_SWEEPING, HOOK_RETRACTING].sort())
  })

  test('it never reacts to the player — that is what makes it a platform', () => {
    const a = make({ type: 'hookline', x: 4, y: 0, dir: 'right', span: 6, drop: 4 })
    const b = make({ type: 'hookline', x: 4, y: 0, dir: 'right', span: 6, drop: 4 })
    step(a, far, 90)
    step(b, { x: 4 * TILE, y: 0, w: 12, h: 14 }, 90)
    expect(a.x).toBe(b.x)
    expect(a.y).toBe(b.y)
  })

  /** The flat top is footing; everything under it is instant death. */
  test('the ride band and the barbs do not overlap', () => {
    const e = make({ type: 'hookline', x: 4, y: 0, dir: 'right', span: 6, drop: 4 })
    step(e, far, 30)
    expect(boxesOverlap(hookPlatform(e), hookBarbs(e))).toBe(false)
    expect(lethalBox(e)).toEqual(hookBarbs(e))
  })

  test('it hands its flat top to the collision sweep', () => {
    const e = make({ type: 'hookline', x: 4, y: 0, dir: 'right', span: 6, drop: 4 })
    const solids = enemySolids([e], [])
    expect(solids).toHaveLength(1)
    expect(solids[0]!.h).toBe(ENEMIES.HOOK_RIDE_BAND)
  })

  test('an authored phase makes three of them a staircase', () => {
    const a = make({ type: 'hookline', x: 4, y: 0, dir: 'right', span: 6, drop: 4 })
    const b = make({ type: 'hookline', x: 8, y: 0, dir: 'right', span: 6, drop: 4, phase: 80 })
    step(a, far, 10)
    step(b, far, 10)
    expect(a.y).not.toBeCloseTo(b.y, 1)
  })
})

describe('Magma Snail', () => {
  test('it is armoured everywhere except the rear', () => {
    const e = make({ type: 'magmaSnail', x: 4, y: 3 })
    expect(canStomp(e)).toBe(false)
    expect(inkEffect(e)).toBe('kill')
    const rear = inkTarget(e)
    expect(rear.w).toBe(ENEMIES.SNAIL_REAR)
    expect(rear.w).toBeLessThan(e.w)
  })

  /** Derived from facing, so turning around turns the weak spot around too. */
  test('the rear follows the direction it is walking', () => {
    const e = make({ type: 'magmaSnail', x: 4, y: 3 })
    e.facing = 1
    const rightward = snailRear(e).x
    e.facing = -1
    expect(snailRear(e).x).toBeGreaterThan(rightward)
  })

  test('its shell is footing', () => {
    const e = make({ type: 'magmaSnail', x: 4, y: 3 })
    const solids = enemySolids([e], [])
    expect(solids).toHaveLength(1)
    expect(solids[0]!.y).toBe(e.y)
  })

  test('it is the slowest walker in the game', () => {
    expect(ENEMIES.SNAIL_SPEED).toBeLessThan(ENEMIES.SNAPPER_SPEED)
  })
})

describe('Cinder Moth', () => {
  test('it drops an ember every ninety frames', () => {
    const e = make({ type: 'cinderMoth', x: 4, y: 1, patrol: [2, 8] })
    let drops = 0
    step(e, far, ENEMIES.MOTH_DROP_CYCLE * 2, (kind) => {
      if (kind === 'ember') drops++
    })
    expect(drops).toBe(2)
  })

  test('it turns at the ends of its patrol and ignores terrain in between', () => {
    const e = make({ type: 'cinderMoth', x: 4, y: 1, patrol: [2, 6] })
    step(e, far, 400)
    expect(e.x).toBeGreaterThanOrEqual(e.patrolLo - 1)
    expect(e.x).toBeLessThanOrEqual(e.patrolHi + 1)
  })

  test('it can be stomped — the moth is the easy half of World 4', () => {
    expect(canStomp(make({ type: 'cinderMoth', x: 4, y: 1 }))).toBe(true)
  })
})

describe('Bone Shrimp and their vents', () => {
  test('a shrimp chases along the floor', () => {
    const e = make({ type: 'boneShrimp', x: 8, y: 3 })
    const before = e.x
    step(e, { x: 2 * TILE, y: 3 * TILE, w: 12, h: 14 }, 20)
    expect(e.x).toBeLessThan(before)
  })

  test('a vent produces one every hundred and fifty frames', () => {
    const e = make({ type: 'shrimpVent', x: 4, y: 3 })
    let made = 0
    const ctx = {
      map: room,
      collapsed: NOTHING,
      player: far,
      spawn: () => {
        made++
        return true
      },
    }
    for (let i = 0; i < ENEMIES.VENT_CYCLE * 3; i++) updateEnemy(ctx as never, e)
    expect(made).toBe(3)
  })

  test('a vent is a hole, not a creature — touching it does nothing', () => {
    const e = make({ type: 'shrimpVent', x: 4, y: 3 })
    expect(e.harmless).toBe(true)
    expect(inkEffect(e)).toBe('kill') // inking it is how you shut it
  })

  test('the world can refuse a vent, and the vent accepts that', () => {
    const e = make({ type: 'shrimpVent', x: 4, y: 3 })
    const ctx = { map: room, collapsed: NOTHING, player: far, spawn: () => false }
    for (let i = 0; i < ENEMIES.VENT_CYCLE * 4; i++) updateEnemy(ctx as never, e)
    expect(e.spawned).toBe(0)
  })
})

describe('Lightless', () => {
  const inLure = (e: Enemy): Box => ({ x: e.x + e.w, y: e.y, w: 8, h: 8 })

  test('it lurks until Nib enters the light', () => {
    const e = make({ type: 'lightless', x: 6, y: 2 })
    step(e, far, 120)
    expect(e.state).toBe(LIGHTLESS_LURKING)
  })

  test('entering the lure light starts a wind-up, then a charge', () => {
    const e = make({ type: 'lightless', x: 6, y: 2 })
    e.facing = 1
    step(e, inLure(e), 1)
    expect(e.state).toBe(LIGHTLESS_WINDING)
    step(e, far, ENEMIES.LIGHTLESS_WINDUP)
    expect(e.state).toBe(LIGHTLESS_CHARGING)
    expect(Math.abs(e.vx)).toBeCloseTo(ENEMIES.LIGHTLESS_CHARGE, 5)
  })

  test('it charges in a straight line and always returns home', () => {
    const e = make({ type: 'lightless', x: 6, y: 2 })
    e.facing = 1
    step(e, inLure(e), 1)
    step(e, far, ENEMIES.LIGHTLESS_WINDUP + ENEMIES.LIGHTLESS_CHARGE_FRAMES + ENEMIES.LIGHTLESS_RECOVER + 2)
    expect(e.state).toBe(LIGHTLESS_LURKING)
    expect(e.x).toBe(e.homeX)
  })

  test('the lure is the hitbox, and it is not the body', () => {
    const e = make({ type: 'lightless', x: 6, y: 2 })
    const target = inkTarget(e)
    expect(target.w).toBeLessThan(e.w)
    expect(inkEffect(e)).toBe('kill')
    expect(canStomp(e)).toBe(false)
  })

  test('it is the fastest thing in the game', () => {
    expect(ENEMIES.LIGHTLESS_CHARGE).toBeGreaterThan(ENEMIES.EEL_LUNGE_SPEED)
  })
})
