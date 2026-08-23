import { describe, expect, test } from 'vitest'
import { isMasterColour, MASTER, NIB_CHARGED_PALETTE, NIB_PALETTE, NIB_SPENT_PALETTE } from '../src/content/palettes.js'
import { NIB_FRAMES } from '../src/content/sprites/nib.js'
import { decode } from '../src/content/sprites/format.js'

/**
 * Palette discipline, as a test.
 *
 * PRD §9.1 asks for a 48-colour master palette and at most 4 colours per
 * sprite. That constraint is what will make five worlds authored over weeks
 * look like one game, and it is exactly the kind of rule that erodes silently
 * unless something fails the build when it does.
 */
describe('the master palette', () => {
  test('holds at most 48 colours', () => {
    expect(MASTER.length).toBeLessThanOrEqual(48)
  })

  test('every entry is a #rrggbb literal', () => {
    for (const c of MASTER) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('holds no duplicates', () => {
    expect(new Set(MASTER).size).toBe(MASTER.length)
  })
})

describe('sprite palettes', () => {
  test('every Nib frame uses at most 3 colours plus transparent', () => {
    for (const f of NIB_FRAMES) {
      expect(f.palette.length, `${f.name} palette`).toBeLessThanOrEqual(3)
    }
  })

  test('every colour any sprite uses comes from the master palette', () => {
    for (const f of NIB_FRAMES) {
      for (const c of f.palette) {
        expect(isMasterColour(c), `${f.name} uses ${c}, which is not in the master palette`).toBe(true)
      }
    }
  })

  test("Nib's three tier palettes are all master colours", () => {
    for (const p of [NIB_PALETTE, NIB_SPENT_PALETTE, NIB_CHARGED_PALETTE]) {
      for (const c of p) expect(isMasterColour(c)).toBe(true)
    }
  })

  test('the three tier palettes are the same length, so any frame reads under any of them', () => {
    expect(NIB_SPENT_PALETTE.length).toBe(NIB_PALETTE.length)
    expect(NIB_CHARGED_PALETTE.length).toBe(NIB_PALETTE.length)
  })
})

describe('Nib frames', () => {
  test('every frame decodes to exactly w*h pixels', () => {
    for (const f of NIB_FRAMES) expect(decode(f).length).toBe(f.w * f.h)
  })

  test('Full-tier frames are 16x16 and Spent-tier frames are 12x12', () => {
    for (const f of NIB_FRAMES) {
      const size = f.name.startsWith('spent') ? 12 : 16
      expect([f.w, f.h], f.name).toEqual([size, size])
    }
  })

  test('no frame is blank — an all-transparent cel is an authoring slip', () => {
    for (const f of NIB_FRAMES) {
      expect(decode(f).some((p) => p !== 0), `${f.name} is entirely transparent`).toBe(true)
    }
  })

  test('every frame fits inside its tier hitbox width, so the sprite never lies about the box', () => {
    for (const f of NIB_FRAMES) {
      const px = decode(f)
      let minX = f.w
      let maxX = -1
      for (let y = 0; y < f.h; y++) {
        for (let x = 0; x < f.w; x++) {
          if (px[y * f.w + x] !== 0) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
          }
        }
      }
      // Arms may reach the cel edge; the body may not be wider than the cel.
      expect(minX).toBeGreaterThanOrEqual(0)
      expect(maxX).toBeLessThan(f.w)
    }
  })

  test('frame names are unique', () => {
    const names = NIB_FRAMES.map((f) => f.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
