import { describe, expect, test } from 'vitest'
import { createAnim, frameFor, paletteFor, poseFor, updateAnim, type AnimView } from '../src/engine/anim.js'
import { CHARGED_TIER, FULL, RULES, SPENT } from '../src/game/constants.js'
import { NIB_CHARGED_PALETTE, NIB_PALETTE, NIB_SPENT_PALETTE } from '../src/content/palettes.js'

function view(over: Partial<AnimView> = {}): AnimView {
  return {
    vx: 0,
    vy: 0,
    grounded: true,
    inWater: false,
    dashFrames: 0,
    stunCloud: 0,
    alive: true,
    tier: FULL,
    ...over,
  }
}

describe('pose selection', () => {
  test('standing still on the ground is idle', () => {
    expect(poseFor(view())).toBe('idle')
  })

  test('moving on the ground is a walk', () => {
    expect(poseFor(view({ vx: 1.2 }))).toBe('walk')
  })

  test('a twitch of residual velocity is still idle, not a one-frame walk', () => {
    expect(poseFor(view({ vx: 0.05 }))).toBe('idle')
  })

  test('airborne splits into rise and fall at the apex', () => {
    expect(poseFor(view({ grounded: false, vy: -3 }))).toBe('rise')
    expect(poseFor(view({ grounded: false, vy: 0.5 }))).toBe('fall')
  })

  test('water replaces the airborne poses entirely', () => {
    expect(poseFor(view({ grounded: false, vy: -3, inWater: true }))).toBe('swim')
  })

  test('a dash overrides water', () => {
    expect(poseFor(view({ inWater: true, dashFrames: 4 }))).toBe('dash')
  })

  /** Priority order: death beats everything, then the hit recoil. */
  test('death beats every other pose', () => {
    expect(poseFor(view({ alive: false, dashFrames: 8, inWater: true }))).toBe('death')
  })

  test('the recoil frame shows for the first few frames after a hit, then releases', () => {
    expect(poseFor(view({ stunCloud: RULES.SHRINK_STUN_FRAMES }))).toBe('hurt')
    // The stun cloud outlives the recoil: enemies stay stunned, Nib moves again.
    expect(poseFor(view({ stunCloud: 1 }))).toBe('idle')
  })
})

describe('the animation clock', () => {
  test('advances while the pose holds and resets when it changes', () => {
    const a = createAnim()
    updateAnim(a, view())
    updateAnim(a, view())
    expect(a.clock).toBe(2)
    updateAnim(a, view({ grounded: false, vy: 1 }))
    expect(a.pose).toBe('fall')
    expect(a.clock).toBe(0)
  })

  test('the scud cycle is driven by distance, not by wall time', () => {
    const a = createAnim()
    for (let i = 0; i < 10; i++) updateAnim(a, view({ vx: 2 }))
    expect(a.stride).toBeCloseTo(20)

    const slow = createAnim()
    for (let i = 0; i < 10; i++) updateAnim(slow, view({ vx: 0.5 }))
    expect(slow.stride).toBeCloseTo(5)
    // Same elapsed time, different cel: the legs match the speed.
    expect(frameFor(a, FULL).name).not.toBe(frameFor(slow, FULL).name)
  })

  test('stride resets when Nib stops walking, so the next step starts at the first cel', () => {
    const a = createAnim()
    for (let i = 0; i < 10; i++) updateAnim(a, view({ vx: 2 }))
    updateAnim(a, view())
    expect(a.stride).toBe(0)
  })

  test('a dash preserves stride, so landing out of one does not restart the cycle', () => {
    const a = createAnim()
    for (let i = 0; i < 10; i++) updateAnim(a, view({ vx: 2 }))
    const before = a.stride
    updateAnim(a, view({ dashFrames: 5, vx: 5.6 }))
    expect(a.stride).toBe(before)
  })
})

describe('frame selection', () => {
  test('the idle mantle pulse alternates on a slow cycle', () => {
    const a = createAnim()
    expect(frameFor(a, FULL).name).toBe('nibIdle0')
    for (let i = 0; i < 30; i++) updateAnim(a, view())
    expect(frameFor(a, FULL).name).toBe('nibIdle1')
    for (let i = 0; i < 30; i++) updateAnim(a, view())
    expect(frameFor(a, FULL).name).toBe('nibIdle0')
  })

  test('Spent draws the 12x12 set, Full and Charged the 16x16 set', () => {
    const a = createAnim()
    expect(frameFor(a, SPENT).w).toBe(12)
    expect(frameFor(a, FULL).w).toBe(16)
    expect(frameFor(a, CHARGED_TIER).w).toBe(16)
  })

  test('Charged reuses the Full frames under a different palette — no new art', () => {
    const a = createAnim()
    expect(frameFor(a, CHARGED_TIER).name).toBe(frameFor(a, FULL).name)
    expect(paletteFor(CHARGED_TIER)).toEqual(NIB_CHARGED_PALETTE)
    expect(paletteFor(FULL)).toEqual(NIB_PALETTE)
    expect(paletteFor(SPENT)).toEqual(NIB_SPENT_PALETTE)
  })

  test('the death cycle plays once and holds its last cel — it never loops back', () => {
    const a = createAnim()
    for (let i = 0; i < RULES.DEATH_ANIM_FRAMES * 3; i++) updateAnim(a, view({ alive: false }))
    expect(frameFor(a, FULL).name).toBe('nibDeath2')
  })

  test('every pose resolves to a frame at both drawn tiers', () => {
    const views: AnimView[] = [
      view(),
      view({ vx: 2 }),
      view({ grounded: false, vy: -2 }),
      view({ grounded: false, vy: 2 }),
      view({ dashFrames: 6 }),
      view({ inWater: true }),
      view({ stunCloud: RULES.SHRINK_STUN_FRAMES }),
      view({ alive: false }),
    ]
    for (const v of views) {
      const a = createAnim()
      for (let i = 0; i < 120; i++) {
        updateAnim(a, v)
        for (const tier of [SPENT, FULL] as const) {
          const f = frameFor(a, tier)
          expect(f, `${a.pose} at tier ${tier}`).toBeTruthy()
          expect(f.palette.length).toBeLessThanOrEqual(paletteFor(tier).length)
        }
      }
    }
  })
})
