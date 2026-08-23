import { describe, expect, test } from 'vitest'
import {
  chainTotal,
  clearTally,
  livesEarned,
  POINTS,
  STOMP_CHAIN,
  stompValue,
  tallyTotal,
  type ClearSummary,
} from '../src/game/score.js'

/**
 * Score arithmetic, at 100%.
 *
 * This is the one system where a player will notice a discrepancy of ten points
 * and nobody will be able to reproduce it, so every branch gets an assertion.
 */
const clean: ClearSummary = {
  secondsRemaining: 0,
  shells: 0,
  pearlsFound: 0,
  bossDefeated: false,
  noDamage: false,
  noDeath: false,
}

describe('the point table matches the PRD', () => {
  test('PRD §8.2 values', () => {
    expect(POINTS.SHELL).toBe(10)
    expect(POINTS.STOMP).toBe(100)
    expect(POINTS.INKED).toBe(50)
    expect(POINTS.PEARL).toBe(5_000)
    expect(POINTS.CHARGED_KILL).toBe(150)
    expect(POINTS.BOSS).toBe(5_000)
    expect(POINTS.NO_DAMAGE).toBe(5_000)
    expect(POINTS.NO_DEATH).toBe(10_000)
    expect(POINTS.PER_SECOND_REMAINING).toBe(50)
  })
})

describe('the stomp chain', () => {
  test('escalates then caps', () => {
    expect(STOMP_CHAIN).toEqual([100, 200, 400, 800, 1000])
    expect(stompValue(0)).toBe(100)
    expect(stompValue(4)).toBe(1000)
  })

  test('a chain longer than the table stays at the cap rather than growing', () => {
    expect(stompValue(5)).toBe(1000)
    expect(stompValue(50)).toBe(1000)
  })

  test('a negative link is a programming error, not a score of zero', () => {
    expect(() => stompValue(-1)).toThrow(RangeError)
  })

  test('the running total of a chain', () => {
    expect(chainTotal(0)).toBe(0)
    expect(chainTotal(1)).toBe(100)
    expect(chainTotal(3)).toBe(700)
    expect(chainTotal(5)).toBe(2_500)
    expect(chainTotal(6)).toBe(3_500)
  })
})

describe('the clear tally', () => {
  test('a bare clear still pays the clear bonus', () => {
    const lines = clearTally(clean)
    expect(lines).toEqual([{ label: 'LEVEL CLEAR', points: POINTS.LEVEL_CLEAR }])
  })

  test('zero-valued lines are dropped, so the screen shows only what was earned', () => {
    const lines = clearTally({ ...clean, shells: 0, pearlsFound: 0 })
    expect(lines.map((l) => l.label)).toEqual(['LEVEL CLEAR'])
  })

  test('every bonus, itemised', () => {
    const lines = clearTally({
      secondsRemaining: 90,
      shells: 25,
      pearlsFound: 3,
      bossDefeated: true,
      noDamage: true,
      noDeath: true,
    })
    expect(lines).toEqual([
      { label: 'LEVEL CLEAR', points: 1_000 },
      { label: 'TIME', points: 4_500 },
      { label: 'SHELLS', points: 250 },
      { label: 'PEARLS', points: 15_000 },
      { label: 'BOSS', points: 5_000 },
      { label: 'NO DAMAGE', points: 5_000 },
      { label: 'NO DEATH', points: 10_000 },
    ])
    expect(tallyTotal(lines)).toBe(40_750)
  })

  test('a fractional par remainder floors rather than rounding up', () => {
    expect(clearTally({ ...clean, secondsRemaining: 10.9 })[1]).toEqual({ label: 'TIME', points: 500 })
  })

  /** Finishing over par is worth nothing, never a penalty. */
  test('being over par pays zero, not a negative', () => {
    const lines = clearTally({ ...clean, secondsRemaining: -40 })
    expect(lines.map((l) => l.label)).not.toContain('TIME')
    expect(tallyTotal(lines)).toBe(POINTS.LEVEL_CLEAR)
  })

  test('an empty tally totals zero', () => {
    expect(tallyTotal([])).toBe(0)
  })
})

describe('extra lives from shells', () => {
  test('one life per hundred', () => {
    expect(livesEarned(99, 100)).toBe(1)
    expect(livesEarned(0, 99)).toBe(0)
    expect(livesEarned(100, 101)).toBe(0)
    expect(livesEarned(199, 200)).toBe(1)
  })

  /**
   * The awkward case this exists for: a pickup that crosses more than one
   * threshold at once, which a naive `count % 100 === 0` check would miss.
   */
  test('crossing several hundreds at once pays for each', () => {
    expect(livesEarned(50, 350)).toBe(3)
  })

  test('a count that does not move pays nothing', () => {
    expect(livesEarned(140, 140)).toBe(0)
  })
})
