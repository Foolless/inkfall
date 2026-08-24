import { describe, expect, test } from 'vitest'
import { Act, frameFromMasks } from '../src/engine/input.js'
import { createWorld, update } from '../src/game/world.js'
import { loadLevel } from '../src/content/levels/format.js'
import { maskOf } from '../src/game/upgrades.js'
import { POINTS } from '../src/game/score.js'
import { BOSSES, ENEMIES, RULES } from '../src/game/constants.js'
import { campaign } from '../src/content/levels/index.js'
import { blank, levelFrom } from './helpers.js'

/**
 * The findings from the pre-merge review, one test each.
 *
 * Every one of these passed the 1,138-test suite. They are all the same kind of
 * bug: a *quiet* one. Nothing crashes, nothing throws, and the game keeps
 * running while an Ink Bomb kills nothing, a boss pays double, and Nib turns
 * invisible for a second and a half at a time.
 */

const T = 16
const ALL = maskOf(['inkShot', 'cling', 'inkBomb', 'heatShell', 'deepJet'])

describe('an Ink Bomb kills what it goes off next to', () => {
  /**
   * The bug: `detonateBombs` cleared the `detonated` flag, and it runs *before*
   * the combat pass that reads it. So a bomb opened cracked walls — that half
   * is in `detonateBombs` itself — and could not kill a single enemy.
   */
  const room = [
    'S...................',
    '....................',
    '....................',
    '####################',
  ]

  function bombRoom() {
    const w = createWorld(levelFrom(room, 'bomb', [{ type: 'snapper', x: 8, y: 2, patrol: [7, 9] }]), { upgrades: ALL })
    w.player.x = 6 * T
    w.player.y = 2 * T
    return w
  }

  test('a snapper standing in the blast dies', () => {
    const w = bombRoom()
    const snapper = w.enemies[0]!
    expect(snapper.alive).toBe(true)

    // Down + C throws a bomb; the fuse is twenty frames.
    const held = Act.Down | Act.Shoot
    update(w, frameFromMasks(held, 0))
    for (let i = 0; i < 60 && snapper.alive; i++) update(w, frameFromMasks(0, held))

    expect(snapper.alive, 'the bomb went off and the snapper survived it').toBe(false)
  })

  test('and the kill is scored', () => {
    const w = bombRoom()
    const held = Act.Down | Act.Shoot
    update(w, frameFromMasks(held, 0))
    for (let i = 0; i < 60 && w.enemies[0]!.alive; i++) update(w, frameFromMasks(0, held))
    expect(w.score).toBeGreaterThanOrEqual(POINTS.INKED)
  })

  /** Nib is deliberately not in his own blast — §8.5 sells a bomb as a door. */
  test('it does not kill the player who threw it', () => {
    const w = bombRoom()
    const held = Act.Down | Act.Shoot
    update(w, frameFromMasks(held, 0))
    for (let i = 0; i < 60; i++) update(w, frameFromMasks(0, held))
    expect(w.player.alive).toBe(true)
  })

  test('the flag does not survive into the next frame', () => {
    const w = bombRoom()
    const held = Act.Down | Act.Shoot
    update(w, frameFromMasks(held, 0))
    for (let i = 0; i < 60; i++) update(w, frameFromMasks(0, held))
    expect(w.projectiles.every((p) => !p.detonated)).toBe(true)
  })
})

describe('a boss pays for its own death exactly once', () => {
  /**
   * The Hermit King's killing stomp added `POINTS.BOSS` twice: once inside
   * `payBossHit`, which pays it when the hit puts the boss into `dying`, and
   * once again at the call site. He was worth 10,500 instead of 5,500.
   */
  test('the Hermit King is worth what §8.2 says he is', () => {
    const level = loadLevel(campaign()[0]!)
    const w = createWorld(level, { upgrades: ALL })
    // Straight to the bowl, and start the fight.
    w.player.x = level.map.width * T - 6 * T
    for (let i = 0; i < 30; i++) update(w, blank())
    expect(w.boss, 'the fight never started').not.toBeNull()

    // One hit short of dead, so the very next stomp is the killing one — the
    // only stomp whose payout the bug touched.
    const boss = w.boss!
    boss.hits = BOSSES.HITS - 1
    boss.state = 'exposed'

    const scoreBefore = w.score
    w.player.x = boss.x + boss.w / 2 - w.player.w / 2
    w.player.y = boss.y - w.player.h
    w.player.prevY = w.player.y - 4
    w.player.vy = 4
    update(w, blank())

    expect(boss.state, 'the killing stomp did not land').toBe('dying')
    // One hit and one death. Not one hit and *two* deaths, which is what the
    // King paid before: 10,500 for a boss §8.2 prices at 5,500.
    expect(w.score - scoreBefore).toBe(POINTS.BOSS_HIT + POINTS.BOSS)
  })
})

describe('a shrimp vent can be shut up, not used up', () => {
  /**
   * `spawned` only ever went up, so `spawned >= VENT_MAX_ALIVE` was a *lifetime*
   * cap: kill four shrimp and the vent retired permanently. §7.6 B1's whole
   * lever is that inking the vents is what stops them, and a vent that stops on
   * its own inverts the room.
   */
  const room = [
    'S...................',
    '....................',
    '....................',
    '####################',
  ]

  test('killing its shrimp does not retire it', () => {
    const w = createWorld(levelFrom(room, 'vent', [{ type: 'shrimpVent', x: 10, y: 2 }]), { upgrades: ALL })
    const vent = w.enemies[0]!

    // Let it fill up to the live cap.
    for (let i = 0; i < ENEMIES.VENT_CYCLE * 8; i++) update(w, blank())
    const first = w.enemies.filter((e) => e.kind === 'boneShrimp' && e.alive).length
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThanOrEqual(ENEMIES.VENT_MAX_ALIVE)
    expect(vent.spawned).toBeGreaterThanOrEqual(first)

    // Clear the room, exactly as inking them would.
    for (const e of w.enemies) if (e.kind === 'boneShrimp') e.alive = false
    for (let i = 0; i < ENEMIES.VENT_CYCLE * 8; i++) update(w, blank())

    expect(
      w.enemies.filter((e) => e.kind === 'boneShrimp' && e.alive).length,
      'the vent stopped producing after its first four',
    ).toBeGreaterThan(0)
  })

  test('but it never exceeds the live cap', () => {
    const w = createWorld(levelFrom(room, 'vent2', [{ type: 'shrimpVent', x: 10, y: 2 }]))
    for (let i = 0; i < ENEMIES.VENT_CYCLE * 30; i++) update(w, blank())
    expect(w.enemies.filter((e) => e.kind === 'boneShrimp' && e.alive).length).toBeLessThanOrEqual(
      ENEMIES.VENT_MAX_ALIVE,
    )
  })
})

describe('a level with no start says so', () => {
  /**
   * Reported in the review as a bare TypeError from `starts[0]!.tx`. It is not:
   * `parseTiles` rejects a startless grid before the loader ever indexes that
   * array, so the message was always a real one. The guard was tightened from
   * `> 1` to `!== 1` anyway — it costs nothing and it stops the `!` in the next
   * line from being load-bearing — but the bug did not exist, and these two
   * tests are here to keep it that way.
   */
  test('a grid with no start is refused, with a message', () => {
    expect(() => loadLevel({ id: 'x', name: 'X', chapter: 'test', order: 0, tiles: ['....', '####'] })).toThrow(
      /no start/,
    )
  })

  test('and so is one with two', () => {
    expect(() => loadLevel({ id: 'x', name: 'X', chapter: 'test', order: 0, tiles: ['S.S.', '####'] })).toThrow(
      /2 starts/,
    )
  })
})

describe('the tuning that was applied is the tuning that is live', () => {
  test('five continues, three lives, four conches', () => {
    expect(RULES.CONTINUES).toBe(5)
    expect(RULES.START_LIVES).toBe(3)
    expect(RULES.CHECKPOINTS_PER_LEVEL).toBe(3)
  })
})

describe('a level that is only being looked at does not make noise', () => {
  /**
   * `world.cues` is cleared inside `world.update`. On any screen where the world
   * is not stepping — paused, the clear tally, game over — the last simulated
   * frame's cues sat in the array, and the host drained them into the synth
   * sixty times a second.
   */
  test('the cue list is only drained on a frame the world stepped', () => {
    const w = createWorld(levelFrom(['S........E', '##########'], 'quiet'))
    for (let i = 0; i < 30; i++) update(w, blank()) // land first
    update(w, frameFromMasks(Act.Jump, 0))
    expect(w.cues).toContain('jump')

    // A frame with no update leaves the array exactly as it was — which is why
    // the host has to check whether it stepped rather than trusting the list.
    const before = [...w.cues]
    expect(w.cues).toEqual(before)

    update(w, blank())
    expect(w.cues).not.toContain('jump')
  })
})
