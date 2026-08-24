import { describe, expect, test } from 'vitest'
import { Act, frameFromMasks } from '../src/engine/input.js'
import { createSession, updateSession, type Session } from '../src/game/state.js'
import { defaultSave, recordHighScore, type HighScore } from '../src/engine/save.js'
import { chainTotal, POINTS, stompValue, STOMP_CHAIN } from '../src/game/score.js'
import { campaign } from '../src/content/levels/index.js'
import { glyph, MISSING } from '../src/content/font.js'
import { levelFrom } from './helpers.js'

/**
 * Scoring and the local high-score table. PLAN.md checkpoint 4.2, whose proof
 * is "score arithmetic at 100% coverage".
 *
 * §8.2 is a rate card, and the arithmetic over it lives in game/score.ts —
 * covered to 100% by tests/score.test.ts. What is here is the *table*: the
 * thing §11.1 puts on the title screen and which had been written to since
 * Phase 2 without anybody ever being able to look at it.
 */

function entry(score: number, over: Partial<HighScore> = {}): HighScore {
  return { score, character: 'nib', date: '2026-08-24', levelsCleared: 5, deaths: 3, ...over }
}

describe('the table holds the top ten runs', () => {
  test('highest first', () => {
    let save = defaultSave()
    for (const n of [1_000, 90_000, 40_000]) save = recordHighScore(save, entry(n))
    expect(save.records.highScores.map((h) => h.score)).toEqual([90_000, 40_000, 1_000])
  })

  test('eleven entries keep ten', () => {
    let save = defaultSave()
    for (let i = 1; i <= 11; i++) save = recordHighScore(save, entry(i * 1_000))
    expect(save.records.highScores).toHaveLength(10)
    expect(save.records.highScores[9]!.score).toBe(2_000)
  })

  test('a run too small for the board does not displace anyone', () => {
    let save = defaultSave()
    for (let i = 1; i <= 10; i++) save = recordHighScore(save, entry(i * 1_000))
    const before = save.records.highScores.map((h) => h.score)
    save = recordHighScore(save, entry(5))
    expect(save.records.highScores.map((h) => h.score)).toEqual(before)
  })

  /** Ties keep the earlier entry, which arrived first and therefore did it first. */
  test('a tie does not push the incumbent off', () => {
    let save = defaultSave()
    save = recordHighScore(save, entry(5_000, { date: '2026-01-01' }))
    save = recordHighScore(save, entry(5_000, { date: '2026-12-31' }))
    expect(save.records.highScores[0]!.date).toBe('2026-01-01')
  })

  test('it carries every field §8.2 names', () => {
    const save = recordHighScore(defaultSave(), entry(1_234, { character: 'octo', levelsCleared: 2, deaths: 9 }))
    const top = save.records.highScores[0]!
    expect(top).toEqual({ score: 1_234, character: 'octo', date: '2026-08-24', levelsCleared: 2, deaths: 9 })
  })
})

describe('the scores screen', () => {
  function press(s: Session, act: number, prev = 0): void {
    updateSession(s, frameFromMasks(act, prev))
  }

  function atTitle(): Session {
    return createSession(campaign()[0]!)
  }

  test('down opens it from the title, and confirm goes back', () => {
    const s = atTitle()
    press(s, Act.Down)
    expect(s.screen).toBe('scores')
    for (let i = 0; i < 30; i++) press(s, 0)
    press(s, Act.Jump)
    expect(s.screen).toBe('title')
  })

  /** The same key that opened it must not immediately close it again. */
  test('a confirm on its first frames is ignored', () => {
    const s = atTitle()
    press(s, Act.Down)
    press(s, Act.Jump)
    expect(s.screen).toBe('scores')
  })

  test('it does not start a run by accident', () => {
    const s = atTitle()
    press(s, Act.Down)
    for (let i = 0; i < 60; i++) press(s, 0)
    expect(s.screen).toBe('scores')
    expect(s.levelFrames).toBe(0)
  })

  test('confirm from the title still goes to the map, not the scores', () => {
    const s = atTitle()
    press(s, Act.Jump)
    expect(s.screen).toBe('worldMap')
  })
})

describe('everything the scores screen puts on screen is drawable', () => {
  test('its labels have glyphs', () => {
    const shown = ['HIGH SCORES', 'NOTHING HERE YET', 'FINISH A RUN TO PUT SOMETHING ON IT', 'SPACE TO GO BACK']
    const sample = shown.join('') + 'NIB OCTO L5 D3 2026-08-24 1,234,567 ↓ SCORES'
    for (const ch of new Set(sample)) {
      expect(glyph(ch), `no glyph for ${JSON.stringify(ch)}`).not.toBe(MISSING)
    }
  })
})

describe('the chain values §8.2 prints', () => {
  test('they are the table, exactly', () => {
    expect([...STOMP_CHAIN]).toEqual([100, 200, 400, 800, 1_000])
  })

  test('past the fifth link it caps rather than growing', () => {
    expect(stompValue(4)).toBe(1_000)
    expect(stompValue(50)).toBe(1_000)
  })

  test('a whole chain adds up the way the tally will show it', () => {
    expect(chainTotal(3)).toBe(700)
    expect(chainTotal(6)).toBe(3_500)
  })

  test('a negative link is a bug, not a zero', () => {
    expect(() => stompValue(-1)).toThrow(RangeError)
  })

  test('a Charged kill is worth at least a first stomp', () => {
    expect(POINTS.CHARGED_KILL).toBeGreaterThan(POINTS.INKED)
  })
})

describe('a run banks one entry, and only when it is over', () => {
  const LEVEL = levelFrom(['S........E', '##########'], 'scored')

  test('a level clear alone does not', () => {
    const s = createSession(LEVEL)
    updateSession(s, frameFromMasks(Act.Jump, 0))
    s.world.cleared = true
    updateSession(s, frameFromMasks(0, Act.Jump))
    expect(s.pendingScore).toBe(false)
  })

  test('clearing the game does', () => {
    const s = createSession(campaign()[campaign().length - 1]!, { direct: true })
    updateSession(s, frameFromMasks(Act.Jump, 0))
    s.world.cleared = true
    updateSession(s, frameFromMasks(0, Act.Jump))
    for (let i = 0; i < 40; i++) updateSession(s, frameFromMasks(0, 0))
    updateSession(s, frameFromMasks(Act.Jump, 0))
    expect(s.screen).toBe('gameClear')
    expect(s.pendingScore).toBe(true)
  })
})
