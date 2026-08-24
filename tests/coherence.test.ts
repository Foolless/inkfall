import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { Act, frameFromMasks } from '../src/engine/input.js'
import { RULES } from '../src/game/constants.js'
import {
  applyAssist,
  createSession,
  restartLevel,
  setAssist,
  updateSession,
  type Session,
} from '../src/game/state.js'
import { kill } from '../src/game/player.js'
import { campaign, loadoutOnArrival } from '../src/content/levels/index.js'
import { maskOf, idsOf } from '../src/game/upgrades.js'
import { levelFrom } from './helpers.js'

/**
 * Five places where two halves of the same fact disagreed.
 *
 * Every one of these is the shape Phase 4 kept producing: a thing the game
 * stores in two places and only updates in one. None of them crashes, none is
 * visible in a screenshot, and each one is a lie told to the player by a screen
 * that had the right number somewhere else in the same object.
 *
 * - Assist Mode lived on the session *and* on the world, and the options screen
 *   set one of them.
 * - The debug route's loadout was what the save held, not what a player
 *   arriving there would be holding.
 * - A restart reset the level and left the ghost recorder running.
 * - The board took the run's score and left behind the points earned inside the
 *   level the run died in — after the game-over screen had shown them.
 * - The completion screen timed the last level and called it the descent.
 */

const FLOOR = ['S........E', '##########']

function session(): Session {
  return createSession(levelFrom(FLOOR, 'coherence-fixture'))
}

/** Run frames the way the host does, with press edges tracked. */
function step(s: Session, count = 1, held = 0): void {
  for (let i = 0; i < count; i++) updateSession(s, frameFromMasks(held, held))
}

/** One press-and-release of a confirm, as a keyboard would deliver it. */
function confirm(s: Session): void {
  updateSession(s, frameFromMasks(Act.Jump, 0))
  updateSession(s, frameFromMasks(0, Act.Jump))
}

describe('assist mode is one setting, not two', () => {
  test('the session and the world always agree', () => {
    const s = session()
    applyAssist(s, true)
    expect(s.assist).toBe(true)
    expect(s.world.assist).toBe(true)

    applyAssist(s, false)
    expect(s.assist).toBe(false)
    expect(s.world.assist).toBe(false)
  })

  /**
   * The bug this replaces: Options is reachable from the pause screen, and
   * turning Assist on there gave the run unlimited lives while every enemy in
   * the level stayed at classic speed.
   */
  test('a change made mid-level reaches the world already running', () => {
    const s = session()
    s.screen = 'playing'
    step(s, 30)
    const frames = s.world.frame

    applyAssist(s, true)
    expect(s.world.assist).toBe(true)
    // In place, not rebuilt: a settings change must not throw the level away.
    expect(s.world.frame).toBe(frames)
  })

  /**
   * `A` is also the WASD binding for Left. The title-screen shortcut has to
   * keep saying "not here" mid-level, or the key that toggles assist on the
   * title eats a step everywhere else.
   */
  test('the one-key shortcut still refuses anywhere but the title and game over', () => {
    const s = session()
    s.screen = 'playing'
    expect(setAssist(s, true)).toBe(false)
    expect(s.assist).toBe(false)

    s.screen = 'title'
    expect(setAssist(s, true)).toBe(true)
    expect(s.assist).toBe(true)
    expect(s.world.assist).toBe(true)
  })
})

describe('a level entered directly is a level that can be finished', () => {
  /**
   * `?level=w02-kelp` on a fresh save used to start with an empty loadout, and
   * World 2's first room is a kelp knot only the Ink Shot opens. The debug
   * route dropped the player into a level with no exit.
   */
  test('the debug route arrives with the loadout the campaign would have given', () => {
    for (const def of campaign()) {
      // Exactly what main.ts composes: what the save holds, plus §8.5's table.
      const mask = maskOf([]) | maskOf(loadoutOnArrival(def.id))
      expect(idsOf(mask).sort(), def.id).toEqual([...loadoutOnArrival(def.id)].sort())
    }
  })

  test('the grey box grants nothing, because it is not campaign content', () => {
    expect(loadoutOnArrival('greybox')).toEqual([])
  })
})

describe('a restart restarts everything', () => {
  test('the ghost recorder does not carry the abandoned attempt', () => {
    const s = session()
    s.screen = 'playing'
    step(s, 60)
    expect(s.recorder.frames).toBeGreaterThan(0)
    expect(s.recorder.points.length).toBeGreaterThan(0)

    restartLevel(s)
    expect(s.recorder.frames).toBe(0)
    expect(s.recorder.points).toHaveLength(0)
  })

  test('the clock and the clean-run flags reset with it', () => {
    const s = session()
    s.screen = 'playing'
    step(s, 60)
    s.noDamage = false
    s.noDeath = false

    restartLevel(s)
    expect(s.levelFrames).toBe(0)
    expect(s.noDamage).toBe(true)
    expect(s.noDeath).toBe(true)
    expect(s.world.frame).toBe(0)
  })
})

describe('the board agrees with the screen the player was looking at', () => {
  /** Play, earn points inside the level, then die out of every life. */
  function playedOut(continues: number): Session {
    const s = session()
    s.continues = continues
    s.screen = 'playing'
    s.score = 1_000
    s.world.score = 250
    for (let i = 0; i < RULES.START_LIVES; i++) {
      kill(s.world.player)
      step(s, RULES.DEATH_ANIM_FRAMES + 2)
    }
    expect(s.screen).toBe('gameOver')
    return s
  }

  test('the run keeps what it earned in the level it died in', () => {
    const s = playedOut(0)
    // What drawGameOver has been showing all along.
    expect(s.score + s.world.score).toBe(1_250)

    confirm(s) // no continues left: the run is over and goes on the board
    expect(s.screen).toBe('title')
    expect(s.pendingScore).toBe(true)
    expect(s.score).toBe(1_250)
  })

  test('a continue costs the shells and the checkpoint, never the points', () => {
    const s = playedOut(2)
    confirm(s)
    expect(s.screen).toBe('playing')
    expect(s.continues).toBe(1)
    // The world was thrown away and its points came with the player.
    expect(s.world.score).toBe(0)
    expect(s.score).toBe(1_250)
  })

  test('banking is once, not twice', () => {
    const s = playedOut(0)
    confirm(s)
    const banked = s.score
    step(s, 10)
    expect(s.score).toBe(banked)
  })
})

describe('the completion screen times the descent', () => {
  /**
   * `runFrames` is the sum of the level timers (§8.4) and `levelFrames` is the
   * last level alone. The end of a five-level game showed the second one under
   * the word TIME.
   */
  test('the run total and the last level are different numbers', () => {
    const s = session()
    s.runFrames = 40_000
    s.levelFrames = 3_000
    expect(s.runFrames).not.toBe(s.levelFrames)
  })

  test('drawGameClear reads the run total', () => {
    const src = readFileSync('src/engine/screens.ts', 'utf8')
    const body = src.slice(src.indexOf('export function drawGameClear'))
    const time = body.slice(body.indexOf('TIME'), body.indexOf('TIME') + 60)
    expect(time).toContain('runFrames')
    expect(time).not.toContain('levelFrames')
  })
})
