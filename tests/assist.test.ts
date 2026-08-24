import { beforeEach, describe, expect, test } from 'vitest'
import { Act, frameFromMasks } from '../src/engine/input.js'
import { ASSIST, DISPLAY, RULES } from '../src/game/constants.js'
import { createSession, setAssist, updateSession, type Session } from '../src/game/state.js'
import { createWorld, update } from '../src/game/world.js'
import { kill } from '../src/game/player.js'
import { drifterYAt } from '../src/game/enemies/drifter.js'
import { blank, levelFrom } from './helpers.js'

/**
 * Assist Mode. PRD §13, brought forward from checkpoint 4.7.
 *
 * The mode exists because of a Gate 3 finding — the game's own author could not
 * finish it — so what these tests protect is the promise it makes: the run
 * never ends, the enemies are slower, the walk back is shorter, and *nothing
 * else about the game changes*. That last one is the one worth the most tests:
 * an assist that quietly made hazards survivable or handed back pips would be a
 * different game wearing this one's name, and a clear of it would not mean what
 * the clear screen says it means.
 */

const T = DISPLAY.TILE

const FLOOR = ['S........E', '##########']

function session(assist: boolean): Session {
  return createSession(levelFrom(FLOOR, 'assist-fixture'), { assist })
}

/** Drives a session the way a keyboard would, tracking pressed edges. */
class Play {
  private prev = 0
  constructor(readonly s: Session) {}
  step(held = 0, count = 1): this {
    for (let i = 0; i < count; i++) {
      updateSession(this.s, frameFromMasks(held, this.prev))
      this.prev = held
    }
    return this
  }
  tap(mask: number): this {
    updateSession(this.s, frameFromMasks(mask, this.prev & ~mask))
    this.prev = mask
    return this.step(0)
  }
  /** Die, and run out the death animation so the respawn lands. */
  die(): this {
    kill(this.s.world.player)
    return this.step(0, RULES.DEATH_ANIM_FRAMES + 2)
  }
}

describe('lives never run out', () => {
  let s: Session
  let p: Play

  beforeEach(() => {
    s = session(true)
    p = new Play(s)
    p.tap(Act.Jump) // title -> playing
  })

  test('a death costs no life', () => {
    p.die()
    expect(s.lives).toBe(RULES.START_LIVES)
    expect(s.screen).toBe('playing')
  })

  test('twenty deaths still leave the player playing', () => {
    for (let i = 0; i < 20; i++) p.die()
    expect(s.lives).toBe(RULES.START_LIVES)
    expect(s.screen).toBe('playing')
    expect(s.continues).toBe(RULES.CONTINUES)
  })

  test('the deaths are still counted, so the no-death bonus stays honest', () => {
    expect(s.noDeath).toBe(true)
    p.die()
    expect(s.noDeath).toBe(false)
    expect(s.world.player.deaths).toBe(1)
  })

  /** The classic rules are untouched — assist is a switch, not a rewrite. */
  test('without it, three deaths is still a game over', () => {
    const classic = new Play(session(false))
    classic.tap(Act.Jump)
    for (let i = 0; i < RULES.START_LIVES; i++) classic.die()
    expect(classic.s.lives).toBeLessThanOrEqual(0)
    expect(classic.s.screen).toBe('gameOver')
  })
})

describe('enemies move at three quarters speed', () => {
  const room = [
    'S...................',
    '....................',
    '....................',
    '####################',
  ]

  /**
   * Path length, not displacement. A Snapper turns at its patrol bounds, and
   * across a turn the two worlds are at different points on the same walk —
   * measuring end-to-start would have called a 25% slowdown a 7% one.
   */
  function walked(assist: boolean, frames: number): number {
    const w = createWorld(levelFrom(room, assist ? 'a' : 'b', [{ type: 'snapper', x: 6, y: 2, patrol: [2, 18] }]), {
      assist,
    })
    const e = w.enemies[0]!
    let total = 0
    for (let i = 0; i < frames; i++) {
      const before = e.x
      update(w, blank())
      total += Math.abs(e.x - before)
    }
    return total
  }

  test('a patrolling Snapper covers three quarters of the ground', () => {
    const classic = walked(false, 240)
    const assisted = walked(true, 240)
    expect(classic).toBeGreaterThan(0)
    expect(assisted / classic).toBeCloseTo(0.75, 2)
  })

  /**
   * The hold is a *skipped step*, which matters: a Drifter's height is sampled
   * from its own clock rather than integrated, so holding the clock has to slow
   * the sine rather than desynchronise it. After 120 frames the assisted one
   * must be exactly where 90 frames of clock puts it — not somewhere near it.
   */
  test('a clock-driven Drifter is slowed, not knocked off its curve', () => {
    const drifter = [{ type: 'drifter', x: 6, y: 1 }] as const
    const w = createWorld(levelFrom(room, 'c', drifter), { assist: true })
    const e = w.enemies[0]!

    for (let i = 0; i < 120; i++) update(w, blank())

    const held = Math.floor(120 / ASSIST.ENEMY_HOLD_EVERY)
    expect(e.clock).toBe(120 - held)
    expect(e.y).toBeCloseTo(drifterYAt(e, e.clock), 6)
  })

  test('one frame in four, and always the same one', () => {
    expect(ASSIST.ENEMY_HOLD_EVERY).toBe(4)
  })
})

describe('soft checkpoints halve the walk back', () => {
  /** Long, flat, and empty: distance is the only variable. */
  const run = ['S'.padEnd(90, '.') + 'E', '#'.repeat(91)]

  function runTo(assist: boolean, frames: number) {
    const w = createWorld(levelFrom(run, assist ? 'soft' : 'hard'), { assist })
    let prev = 0
    const held = Act.Right | Act.Run
    for (let i = 0; i < frames; i++) {
      update(w, frameFromMasks(held, prev))
      prev = held
    }
    return w
  }

  test('running past 32 tiles sets one, and the respawn uses it', () => {
    const w = runTo(true, 600)
    expect(w.player.x).toBeGreaterThan(ASSIST.CHECKPOINT_TILES * T)
    expect(w.checkpoint).not.toBeNull()
    expect(w.checkpoint!.x).toBeGreaterThanOrEqual(ASSIST.CHECKPOINT_TILES * T)

    const at = w.checkpoint!.x
    kill(w.player)
    for (let i = 0; i < RULES.DEATH_ANIM_FRAMES + 2; i++) update(w, blank())
    expect(w.player.x).toBeCloseTo(at, 0)
  })

  test('without assist the same run has no checkpoint at all', () => {
    const w = runTo(false, 600)
    expect(w.player.x).toBeGreaterThan(ASSIST.CHECKPOINT_TILES * T)
    expect(w.checkpoint).toBeNull()
  })

  test('one is not handed out before the distance is earned', () => {
    const w = runTo(true, 40)
    expect(w.player.x).toBeLessThan(ASSIST.CHECKPOINT_TILES * T)
    expect(w.checkpoint).toBeNull()
  })

  /**
   * Backtracking for a pearl must never move the checkpoint behind the room the
   * player is in. Only forward progress counts, so walking back and forth over
   * the same ground cannot ratchet it backwards.
   */
  test('walking back does not move it backwards', () => {
    const w = runTo(true, 600)
    const at = w.checkpoint!.x
    let prev = 0
    const held = Act.Left | Act.Run
    for (let i = 0; i < 300; i++) {
      update(w, frameFromMasks(held, prev))
      prev = held
    }
    expect(w.checkpoint!.x).toBe(at)
  })

  /** A checkpoint over a pit is a respawn loop, so the footing has to be real. */
  test('none is set in mid-air', () => {
    const gap = ['S'.padEnd(90, '.') + 'E', '#'.repeat(40) + '.'.repeat(20) + '#'.repeat(31)]
    const w = createWorld(levelFrom(gap, 'pit'), { assist: true })
    let prev = 0
    const held = Act.Right | Act.Run
    for (let i = 0; i < 200; i++) {
      update(w, frameFromMasks(held, prev))
      prev = held
      if (w.checkpoint) expect(w.player.grounded, `checkpoint set while airborne at x=${w.player.x}`).toBe(true)
    }
  })
})

describe('what assist does not change', () => {
  const room = ['S.........E', '#####^#####']

  test('a hazard still kills at every tier', () => {
    const w = createWorld(levelFrom(room, 'spikes'), { assist: true })
    w.player.x = 5 * T
    w.player.y = 0
    for (let i = 0; i < 60 && w.player.alive; i++) update(w, blank())
    expect(w.player.alive).toBe(false)
  })

  test('the ink budget is the same three pips', () => {
    const assisted = createWorld(levelFrom(room, 'ink-a'), { assist: true })
    const classic = createWorld(levelFrom(room, 'ink-b'))
    expect(assisted.player.ink).toBe(classic.player.ink)
    expect(assisted.player.tier).toBe(classic.player.tier)
  })

  test('a level still has to be finished to be cleared', () => {
    const s = session(true)
    new Play(s).tap(Act.Jump).step(0, 60)
    expect(s.screen).toBe('playing')
  })
})

describe('the switch itself', () => {
  test('it can be turned on from the title and the world takes it', () => {
    const s = session(false)
    expect(s.world.assist).toBe(false)
    expect(setAssist(s, true)).toBe(true)
    expect(s.assist).toBe(true)
    expect(s.world.assist).toBe(true)
  })

  /**
   * A run is played at one difficulty. Flipping it mid-level would change what
   * the input log means halfway through, and a clear that was half assisted is
   * not something the tally can state honestly.
   */
  test('it cannot be flipped mid-level', () => {
    const s = session(false)
    new Play(s).tap(Act.Jump)
    expect(s.screen).toBe('playing')
    expect(setAssist(s, true)).toBe(false)
    expect(s.assist).toBe(false)
    expect(s.world.assist).toBe(false)
  })

  test('it survives into the next level of the campaign', () => {
    const s = session(true)
    const p = new Play(s)
    p.tap(Act.Jump)
    s.world.cleared = true
    p.step(0, 2)
    expect(s.screen).toBe('levelClear')
    p.step(0, 30).tap(Act.Jump)
    // The fixture is not a campaign level, so this lands back on the title —
    // what matters is that the flag and the rebuilt world came through it.
    expect(s.assist).toBe(true)
    expect(s.world.assist).toBe(true)
  })

  test('off by default, so nobody gets it without asking', () => {
    expect(createSession(levelFrom(FLOOR, 'default')).assist).toBe(false)
    expect(createWorld(levelFrom(FLOOR, 'default')).assist).toBe(false)
  })
})
