import { beforeEach, describe, expect, test } from 'vitest'
import { Act, frameFromMasks } from '../src/engine/input.js'
import { RULES } from '../src/game/constants.js'
import {
  createSession,
  DEFAULT_PAR_SECONDS,
  formatScore,
  formatTime,
  TALLY_LINE_FRAMES,
  tallyRevealed,
  tallyShown,
  updateSession,
  type Session,
} from '../src/game/state.js'
import { POINTS } from '../src/game/score.js'
import { kill } from '../src/game/player.js'
import { glyph, MISSING } from '../src/content/font.js'
import { campaign } from '../src/content/levels/index.js'
import { levelFrom } from './helpers.js'

const LEVEL = levelFrom(['S........E', '##########'], 'flow')

/** Drives a session the way a keyboard would, tracking pressed edges. */
class Player {
  private prev = 0
  constructor(readonly s: Session) {}

  step(held = 0, count = 1): this {
    for (let i = 0; i < count; i++) {
      updateSession(this.s, frameFromMasks(held, this.prev))
      this.prev = held
    }
    return this
  }

  /** Press and release, so the next call reads as a fresh press. */
  tap(mask: number): this {
    updateSession(this.s, frameFromMasks(mask, this.prev & ~mask))
    this.prev = mask
    return this.step(0)
  }
}

let s: Session
let p: Player
beforeEach(() => {
  s = createSession(LEVEL)
  p = new Player(s)
})

describe('the screen flow', () => {
  test('starts on the title', () => {
    expect(s.screen).toBe('title')
  })

  test('confirm starts a run with a full complement of lives and continues', () => {
    p.tap(Act.Jump)
    expect(s.screen).toBe('playing')
    expect(s.lives).toBe(RULES.START_LIVES)
    expect(s.continues).toBe(RULES.CONTINUES)
    expect(s.score).toBe(0)
  })

  test('the level clock starts at zero and runs while playing', () => {
    p.tap(Act.Jump)
    expect(s.levelFrames).toBeGreaterThan(0)
    const before = s.levelFrames
    p.step(0, 30)
    expect(s.levelFrames).toBe(before + 30)
  })

  test('pause and resume', () => {
    p.tap(Act.Jump).step(0, 5)
    const frames = s.levelFrames
    p.tap(Act.Pause)
    expect(s.screen).toBe('paused')

    p.step(0, 60)
    expect(s.levelFrames).toBe(frames) // the world is frozen, and so is the clock
    p.tap(Act.Pause)
    expect(s.screen).toBe('playing')
  })

  test('a paused world does not advance', () => {
    p.tap(Act.Jump).step(0, 5)
    const frame = s.world.frame
    p.tap(Act.Pause).step(0, 60)
    expect(s.world.frame).toBe(frame)
  })
})

describe('lives and deaths', () => {
  function die(): void {
    kill(s.world.player)
    p.step(0, RULES.DEATH_ANIM_FRAMES + 4)
  }

  test('one death costs exactly one life', () => {
    p.tap(Act.Jump)
    die()
    expect(s.lives).toBe(RULES.START_LIVES - 1)
  })

  /**
   * The world respawns Nib on its own after the death animation, so a session
   * that watched for "alive went false" could look after he was already back.
   * It counts the world's monotonic death tally instead.
   */
  test('a death is charged once, not once per frame he is dead', () => {
    p.tap(Act.Jump)
    kill(s.world.player)
    p.step(0, 5)
    expect(s.lives).toBe(RULES.START_LIVES - 1)
    p.step(0, 5)
    expect(s.lives).toBe(RULES.START_LIVES - 1)
  })

  test('the last life ends the run', () => {
    p.tap(Act.Jump)
    for (let i = 0; i < RULES.START_LIVES; i++) die()
    expect(s.screen).toBe('gameOver')
  })

  test('a death costs the no-death bonus, and a hit costs the no-damage bonus', () => {
    p.tap(Act.Jump)
    expect(s.noDeath).toBe(true)
    expect(s.noDamage).toBe(true)
    die()
    expect(s.noDeath).toBe(false)
    expect(s.noDamage).toBe(true) // dying is not the same as being hit
  })
})

describe('continues', () => {
  function gameOver(): void {
    p.tap(Act.Jump)
    for (let i = 0; i < RULES.START_LIVES; i++) {
      kill(s.world.player)
      p.step(0, RULES.DEATH_ANIM_FRAMES + 4)
    }
    expect(s.screen).toBe('gameOver')
  }

  test('a continue restarts the level with three lives and no shells', () => {
    gameOver()
    s.world.shells = 40
    p.tap(Act.Jump)
    expect(s.screen).toBe('playing')
    expect(s.continues).toBe(RULES.CONTINUES - 1)
    expect(s.lives).toBe(RULES.START_LIVES)
    expect(s.world.shells).toBe(0)
    expect(s.levelFrames).toBeLessThan(5)
  })

  /** The score belongs to the run; losing the shells is what a continue costs. */
  test('a continue keeps the run score', () => {
    gameOver()
    s.score = 4_200
    p.tap(Act.Jump)
    expect(s.score).toBe(4_200)
  })

  test('running out of continues drops back to the title', () => {
    gameOver()
    for (let i = 0; i < RULES.CONTINUES; i++) {
      p.tap(Act.Jump)
      expect(s.screen).toBe('playing')
      for (let d = 0; d < RULES.START_LIVES; d++) {
        kill(s.world.player)
        p.step(0, RULES.DEATH_ANIM_FRAMES + 4)
      }
    }
    expect(s.continues).toBe(0)
    p.tap(Act.Jump)
    expect(s.screen).toBe('title')
  })
})

describe('extra lives', () => {
  test('shells crossing a hundred pay out a life', () => {
    p.tap(Act.Jump)
    s.world.shells = 99
    s.world.livesOwed = 1
    p.step(0)
    expect(s.lives).toBe(RULES.START_LIVES + 1)
    expect(s.world.livesOwed).toBe(0)
  })
})

describe('the level-clear tally', () => {
  function clear(): void {
    p.tap(Act.Jump).step(0, 5)
    s.world.cleared = true
    p.step(0)
  }

  test('reaching the exit shows the tally', () => {
    clear()
    expect(s.screen).toBe('levelClear')
    expect(s.tally.length).toBeGreaterThan(0)
    expect(s.tally[0]!.label).toBe('LEVEL CLEAR')
  })

  test('a clean fast run earns every bonus', () => {
    p.tap(Act.Jump).step(0, 5)
    s.world.shells = 12
    s.world.pearls = [true, true, false]
    s.world.cleared = true
    p.step(0)

    const labels = s.tally.map((l) => l.label)
    expect(labels).toContain('TIME')
    expect(labels).toContain('SHELLS')
    expect(labels).toContain('PEARLS')
    expect(labels).toContain('NO DAMAGE')
    expect(labels).toContain('NO DEATH')
    expect(s.summary!.pearlsFound).toBe(2)
  })

  test('the lines arrive one at a time — the count-up is the reward', () => {
    clear()
    expect(tallyRevealed(s)).toBe(1)
    p.step(0, TALLY_LINE_FRAMES)
    expect(tallyRevealed(s)).toBe(2)
    expect(tallyShown(s)).toBe(s.tally[0]!.points + s.tally[1]!.points)
  })

  test('a confirm skips to the total instead of being ignored', () => {
    clear()
    p.step(0, TALLY_LINE_FRAMES + 2)
    p.tap(Act.Jump)
    expect(s.screen).toBe('title')
    expect(s.score).toBeGreaterThan(POINTS.LEVEL_CLEAR)
  })

  /**
   * The bug this exists to stop coming back: the run banked only the tally's
   * bonuses, so every stomp, chain, inked kill and boss hit a player made
   * inside a level was thrown away at the exit — after the HUD had spent the
   * whole level showing them those points.
   */
  test('points earned inside the level are banked, not discarded', () => {
    p.tap(Act.Jump).step(0, 5)
    s.world.score = 4_250 // stomps, a chain, a boss hit
    s.world.cleared = true
    p.step(0)

    expect(s.summary!.levelPoints).toBe(4_250)
    expect(s.tally.map((l) => l.label)).toContain('ENEMIES')
    p.step(0, TALLY_LINE_FRAMES * 10).tap(Act.Jump)
    expect(s.score).toBeGreaterThanOrEqual(4_250)
  })

  /**
   * The HUD shows `run + world` while playing and the tally counts up from
   * `run` — so the tally's lines have to sum to exactly what the world scored,
   * plus the bonuses, or the number visibly jumps at the exit.
   */
  test('the itemised lines account for every point the world scored', () => {
    p.tap(Act.Jump).step(0, 5)
    s.world.shells = 12
    s.world.pearls = [true, false, false]
    s.world.score = 12 * POINTS.SHELL + POINTS.PEARL + 900
    s.world.cleared = true
    p.step(0)

    const earned = ['SHELLS', 'PEARLS', 'BOSS', 'ENEMIES']
    const itemised = s.tally.filter((l) => earned.includes(l.label)).reduce((n, l) => n + l.points, 0)
    expect(itemised).toBe(s.world.score)
  })

  test('the time bonus comes off a par clock, and never goes negative', () => {
    p.tap(Act.Jump)
    s.levelFrames = (DEFAULT_PAR_SECONDS + 60) * 60 // well over par
    s.world.cleared = true
    p.step(0)
    expect(s.summary!.secondsRemaining).toBeLessThan(0)
    expect(s.tally.map((l) => l.label)).not.toContain('TIME')
    expect(s.tally.every((l) => l.points >= 0)).toBe(true)
  })
})

describe('formatting', () => {
  test('time reads as M:SS', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(59)).toBe('0:00')
    expect(formatTime(60)).toBe('0:01')
    expect(formatTime(60 * 107)).toBe('1:47')
    expect(formatTime(60 * 605)).toBe('10:05')
  })

  /**
   * Grouped by hand rather than through toLocaleString: a score that renders
   * differently depending on the host's locale or ICU build is not a score.
   */
  test('scores group in thousands, without depending on the host locale', () => {
    expect(formatScore(0)).toBe('0')
    expect(formatScore(999)).toBe('999')
    expect(formatScore(1_000)).toBe('1,000')
    expect(formatScore(84_300)).toBe('84,300')
    expect(formatScore(1_234_567)).toBe('1,234,567')
    expect(formatScore(-1_500)).toBe('-1,500')
  })
})

describe('the font', () => {
  /**
   * A missing glyph draws as a filled box, which is loud on purpose — but only
   * useful if nothing the game actually shows hits it.
   */
  test('every character the game puts on screen has a glyph', () => {
    const shown = [
      'INKFALL',
      'A SQUID GOES DOWN',
      'PRESS SPACE',
      'ARROWS MOVE   SPACE JUMP   X INK DASH',
      'SHIFT RUN   ESC PAUSE   M MUTE',
      'PAUSED',
      'ESC TO RESUME',
      'LEVEL CLEAR',
      'GAME OVER',
      'NO CONTINUES LEFT',
      'PRESS SPACE TO CONTINUE',
      'TOTAL',
      'TIME',
      'SHELLS',
      'PEARLS',
      'BOSS',
      'NO DAMAGE',
      'NO DEATH',
      '[X] INK DASH',
      '[C] INK SHOT',
      'NIBx3',
      'NIBx∞',
      'A: ASSIST ON   INFINITE LIVES',
      'A: ASSIST OFF',
      'ASSIST',
      'THE ABYSS IS BEHIND YOU',
      'SOMETHING IS STILL DOWN THERE',
      'S000',
      '1,234,567',
      '10:05',
      'CONTINUES 3',
    ].join('')
    for (const ch of new Set(shown)) {
      expect(glyph(ch), `no glyph for ${JSON.stringify(ch)}`).not.toBe(MISSING)
    }
  })

  /**
   * The list above is hand-written and a hand-written list goes stale. Hints
   * come from level data, and that is where the hole actually was: World 1's
   * `HOLD ↑ + X TO DASH UP` — Gate 1's entire fix for nobody finding the
   * up-dash — drew the arrow as a missing-character box for two phases.
   */
  test('every hint in every shipped level is drawable, arrows included', () => {
    for (const def of campaign()) {
      for (const hint of def.hints ?? []) {
        for (const ch of new Set(hint.text)) {
          expect(glyph(ch), `${def.id} hint has no glyph for ${JSON.stringify(ch)}`).not.toBe(MISSING)
        }
      }
    }
  })

  test('a character with no glyph is loud rather than silent', () => {
    expect(glyph('\u00e9')).toBe(MISSING)
  })
})

describe('inputs that should do nothing', () => {
  test('holding confirm does not restart the run every frame', () => {
    p.step(Act.Jump, 10)
    expect(s.screen).toBe('playing')
    const frames = s.levelFrames
    p.step(Act.Jump, 10)
    expect(s.levelFrames).toBe(frames + 10)
  })

  test('a confirm on the very first tally frame is ignored, so a held key cannot skip it', () => {
    p.tap(Act.Jump).step(0, 5)
    s.world.cleared = true
    p.step(Act.Jump)
    expect(s.screen).toBe('levelClear')
  })
})
