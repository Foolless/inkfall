import { describe, expect, test } from 'vitest'
import { MAX_CATCHUP_MS, STEP_MS, stepsFor, type Accumulator } from '../src/engine/loop.js'

const acc = (): Accumulator => ({ carry: 0 })

describe('the fixed timestep', () => {
  test('a 60 Hz frame is exactly one step', () => {
    expect(stepsFor(acc(), STEP_MS)).toBe(1)
  })

  test('a 30 Hz frame is two steps', () => {
    expect(stepsFor(acc(), STEP_MS * 2)).toBe(2)
  })

  test('a frame shorter than a step runs none, and the remainder carries', () => {
    const a = acc()
    expect(stepsFor(a, STEP_MS / 2)).toBe(0)
    expect(stepsFor(a, STEP_MS / 2)).toBe(1) // the two halves add up
  })

  test('fractional remainders accumulate rather than being lost', () => {
    const a = acc()
    let steps = 0
    // 100 frames at a 144 Hz refresh should be ~41.7 sim steps, never 0 or 100.
    for (let i = 0; i < 100; i++) steps += stepsFor(a, 1000 / 144)
    expect(steps).toBe(Math.floor((100 * (1000 / 144)) / STEP_MS))
  })

  /**
   * Without this clamp, a tab restored after a minute in the background would
   * try to simulate 3,600 steps in a single frame and lock the page. It is the
   * difference between a hitch and a hang.
   */
  test('a long stall is clamped, not simulated in full', () => {
    const steps = stepsFor(acc(), 60_000)
    // 250 ms / 16.667 ms is exactly 15 in real arithmetic; Math.floor on the
    // float would say 14, so round rather than encoding the rounding error.
    expect(steps).toBe(Math.round(MAX_CATCHUP_MS / STEP_MS))
    expect(steps).toBeLessThan(20)
  })

  test('negative elapsed time is ignored rather than rewinding', () => {
    const a = acc()
    expect(stepsFor(a, -500)).toBe(0)
    expect(a.carry).toBe(0)
  })

  test('zero elapsed time runs nothing', () => {
    expect(stepsFor(acc(), 0)).toBe(0)
  })

  test('the step is 60 Hz', () => {
    expect(STEP_MS).toBeCloseTo(16.667, 3)
  })
})
