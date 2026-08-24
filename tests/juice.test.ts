import { describe, expect, test } from 'vitest'
import { createJuice, MAX_PARTICLES, onScreen, shakeOffset, updateJuice, type JuiceInput } from '../src/engine/juice.js'
import { DISPLAY } from '../src/game/constants.js'
import type { Cue } from '../src/game/cues.js'

/**
 * Juice. PLAN.md checkpoint 4.6, which calls it "60% of the game's feel and
 * none of it testable".
 *
 * Most of that is true — whether a shake feels good needs eyes. What *is*
 * testable is the part that would quietly break the rest of the game: this all
 * lives on the render side, and the tests below are mostly about it staying
 * there. A particle in the simulation is state the replay hash has to agree on;
 * a shake applied through the camera makes two identical input logs produce two
 * different worlds the moment one of them stutters.
 */

function input(over: Partial<JuiceInput> = {}): JuiceInput {
  return { cues: [], x: 100, y: 50, w: 12, h: 14, grounded: true, vy: 0, tier: 1, alive: true, ...over }
}

function alive(j: ReturnType<typeof createJuice>): number {
  return j.particles.filter((p) => p.alive).length
}

describe('screen shake', () => {
  test('a still frame does not move the camera at all', () => {
    const j = createJuice()
    updateJuice(j, input())
    expect(j.shake).toBe(0)
    expect(shakeOffset(j)).toEqual({ x: 0, y: 0 })
  })

  test('taking a hit shakes it', () => {
    const j = createJuice()
    updateJuice(j, input({ cues: ['shrink'] }))
    expect(j.shake).toBeGreaterThan(0)
  })

  /**
   * A screen that shakes for everything is a screen that shakes for nothing.
   * A stomp happens dozens of times a level; it is not an event.
   */
  test('routine things do not', () => {
    for (const cue of ['stomp', 'shell', 'jump', 'swim', 'menu'] as Cue[]) {
      const j = createJuice()
      updateJuice(j, input({ cues: [cue] }))
      expect(j.shake, `${cue} should not shake the screen`).toBe(0)
    }
  })

  test('it decays to nothing rather than rumbling on', () => {
    const j = createJuice()
    updateJuice(j, input({ cues: ['bossDeath'] }))
    for (let i = 0; i < 60; i++) updateJuice(j, input())
    expect(j.shake).toBe(0)
  })

  /** §13's vestibular provision. At zero the camera must be perfectly still. */
  test('the slider scales it, and zero means zero', () => {
    const full = createJuice()
    updateJuice(full, input({ cues: ['death'] }), 1)
    const half = createJuice()
    updateJuice(half, input({ cues: ['death'] }), 0.5)
    const off = createJuice()
    updateJuice(off, input({ cues: ['death'] }), 0)

    expect(half.shake).toBeCloseTo(full.shake / 2, 5)
    expect(off.shake).toBe(0)
    expect(shakeOffset(off)).toEqual({ x: 0, y: 0 })
  })

  test('the offset is whole pixels, because the game is', () => {
    const j = createJuice()
    updateJuice(j, input({ cues: ['bossDeath'] }))
    for (let i = 0; i < 10; i++) {
      const at = shakeOffset(j)
      expect(Number.isInteger(at.x)).toBe(true)
      expect(Number.isInteger(at.y)).toBe(true)
      updateJuice(j, input())
    }
  })

  /**
   * No `Math.random`: the same frame shakes the same way twice, so a recorded
   * bug looks the same on the second viewing.
   */
  test('it is deterministic — the same frames give the same offsets', () => {
    const run = () => {
      const j = createJuice()
      const seen: number[] = []
      updateJuice(j, input({ cues: ['bossDeath'] }))
      for (let i = 0; i < 12; i++) {
        const at = shakeOffset(j)
        seen.push(at.x, at.y)
        updateJuice(j, input())
      }
      return seen
    }
    expect(run()).toEqual(run())
  })

  test('the offset object is reused rather than allocated per frame', () => {
    const j = createJuice()
    updateJuice(j, input({ cues: ['bossDeath'] }))
    expect(shakeOffset(j)).toBe(shakeOffset(j))
  })
})

describe('particles', () => {
  test('landing kicks up silt, and standing there does not', () => {
    const j = createJuice()
    updateJuice(j, input({ grounded: false, vy: 4 }))
    expect(alive(j)).toBe(0)

    updateJuice(j, input({ grounded: true }))
    const landed = alive(j)
    expect(landed).toBeGreaterThan(0)

    for (let i = 0; i < 3; i++) updateJuice(j, input({ grounded: true }))
    expect(alive(j)).toBeLessThanOrEqual(landed)
  })

  test('a harder landing kicks up more of it', () => {
    const soft = createJuice()
    updateJuice(soft, input({ grounded: false, vy: 1 }))
    updateJuice(soft, input({ grounded: true }))

    const hard = createJuice()
    updateJuice(hard, input({ grounded: false, vy: 8 }))
    updateJuice(hard, input({ grounded: true }))

    expect(alive(hard)).toBeGreaterThan(alive(soft))
  })

  test('a dead player kicks up nothing', () => {
    const j = createJuice()
    updateJuice(j, input({ grounded: false, vy: 5, alive: false }))
    updateJuice(j, input({ grounded: true, alive: false }))
    expect(alive(j)).toBe(0)
  })

  /** §11.2's shrink burst: ink thrown out in every direction. */
  test('a shrink throws ink out all round', () => {
    const j = createJuice()
    updateJuice(j, input({ cues: ['shrink'] }))
    const ink = j.particles.filter((p) => p.alive && p.kind === 1)
    expect(ink.length).toBeGreaterThanOrEqual(12)
    expect(ink.some((p) => p.vx > 0)).toBe(true)
    expect(ink.some((p) => p.vx < 0)).toBe(true)
    expect(ink.some((p) => p.vy < 0)).toBe(true)
  })

  test('they expire rather than accumulating', () => {
    const j = createJuice()
    updateJuice(j, input({ cues: ['shrink'] }))
    expect(alive(j)).toBeGreaterThan(0)
    for (let i = 0; i < 120; i++) updateJuice(j, input())
    expect(alive(j)).toBe(0)
  })

  /** §12.6's rule applies to the render path too: the pool never grows. */
  test('the pool is fixed and the same objects come back round', () => {
    const j = createJuice()
    const objects = [...j.particles]
    for (let i = 0; i < 200; i++) updateJuice(j, input({ cues: ['shrink', 'blast'] }))
    expect(j.particles).toHaveLength(MAX_PARTICLES)
    expect(j.particles).toEqual(objects)
    expect(alive(j)).toBeLessThanOrEqual(MAX_PARTICLES)
  })

  test('silt falls faster than ink hangs', () => {
    const j = createJuice()
    updateJuice(j, input({ grounded: false, vy: 5 }))
    updateJuice(j, input({ grounded: true, cues: ['shrink'] }))
    const silt = j.particles.find((p) => p.alive && p.kind === 0)!
    const ink = j.particles.find((p) => p.alive && p.kind === 1)!
    const siltVy = silt.vy
    const inkVy = ink.vy
    updateJuice(j, input())
    expect(silt.vy - siltVy).toBeGreaterThan(ink.vy - inkVy)
  })
})

describe('nothing draws over the HUD', () => {
  test('the strip at the top of the screen is off limits', () => {
    expect(onScreen(10, 4)).toBe(false)
    expect(onScreen(10, 20)).toBe(true)
  })

  test('and neither does anything off the edges', () => {
    expect(onScreen(-1, 40)).toBe(false)
    expect(onScreen(DISPLAY.WIDTH, 40)).toBe(false)
    expect(onScreen(10, DISPLAY.HEIGHT)).toBe(false)
  })
})
