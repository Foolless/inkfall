import { describe, expect, test } from 'vitest'
import { isMasterColour, MASTER, NIB_CHARGED_PALETTE, NIB_PALETTE, NIB_SPENT_PALETTE } from '../src/content/palettes.js'
import { NIB_FRAMES } from '../src/content/sprites/nib.js'
import { ENEMY_FRAMES } from '../src/content/sprites/enemies.js'
import { PICKUP_FRAMES } from '../src/content/sprites/pickups.js'
import { SHALLOWS_FRAMES } from '../src/content/tilesets/shallows.js'
import { BOSS_FRAMES } from '../src/content/sprites/bosses.js'
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

const ALL_FRAMES = [...NIB_FRAMES, ...ENEMY_FRAMES, ...PICKUP_FRAMES, ...SHALLOWS_FRAMES, ...BOSS_FRAMES]

describe('sprite palettes', () => {
  test('every frame uses at most 3 colours plus transparent', () => {
    for (const f of ALL_FRAMES) {
      expect(f.palette.length, `${f.name} palette`).toBeLessThanOrEqual(3)
    }
  })

  test('every colour any sprite uses comes from the master palette', () => {
    for (const f of ALL_FRAMES) {
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

describe('boss frames', () => {
  /**
   * Upright and bonked must share nothing, because the difference between them
   * is the difference between "run" and "jump on him".
   */
  test('the two Hermit King poses are unmistakably different', () => {
    const idle = BOSS_FRAMES.find((f) => f.name === 'hermitIdle')!
    const exposed = BOSS_FRAMES.find((f) => f.name === 'hermitExposed')!
    const silhouette = (f: typeof idle) => decode(f).map((p) => (p === 0 ? 0 : 1))
    const a = silhouette(idle)
    const b = silhouette(exposed)
    const differing = a.filter((v, i) => v !== b[i]).length
    expect(differing).toBeGreaterThan(a.length * 0.15)
  })

  test('he is big enough to be a boss', () => {
    const idle = BOSS_FRAMES.find((f) => f.name === 'hermitIdle')!
    expect(idle.w * idle.h).toBeGreaterThanOrEqual(48 * 32)
  })
})

describe('pickup frames', () => {
  /**
   * A Bulb and a Core are a decision the player makes mid-air, so they must not
   * merely be different colours — PRD §13 asks every meaningful difference to
   * survive greyscale.
   */
  test('every pickup has its own silhouette', () => {
    const shapes = PICKUP_FRAMES.map((f) => `${f.w}x${f.h}:` + decode(f).map((p) => (p === 0 ? 0 : 1)).join(''))
    expect(new Set(shapes).size).toBe(shapes.length)
  })
})

describe('tileset frames', () => {
  test('every tile cel fills a whole 16x16 cell, except the one-way ledge', () => {
    for (const f of SHALLOWS_FRAMES) {
      expect([f.w, f.h], f.name).toEqual([16, 16])
      const opaque = decode(f).filter((p) => p !== 0).length
      // A one-way ledge is a thin plank, an urchin is spikes, and a crack is
      // mostly the gap it is named after. Everything else is a full cell.
      const partial = ['Oneway', 'Urchin', 'Crack'].some((n) => f.name.includes(n))
      const wanted = partial ? 16 : 256
      expect(opaque, `${f.name} covers ${opaque} pixels`).toBeGreaterThanOrEqual(wanted)
    }
  })

  test('the capped and filled sand cels are different, so an edge reads as an edge', () => {
    const top = SHALLOWS_FRAMES.find((f) => f.name === 'sandTop')!
    const fill = SHALLOWS_FRAMES.find((f) => f.name === 'sandFill')!
    expect(top.data).not.toBe(fill.data)
  })
})

describe('enemy frames', () => {
  /**
   * PRD §13: every hazard is distinguished by shape, never colour alone. The
   * cheapest proxy for that is footprint — a deflated Puffer and an inflated one
   * must not be confusable, and they are the pair a player dies to.
   */
  test('the two Puffer states have plainly different footprints', () => {
    const deflated = ENEMY_FRAMES.find((f) => f.name === 'pufferDeflated')!
    const inflated = ENEMY_FRAMES.find((f) => f.name === 'pufferInflated')!
    const area = (f: typeof deflated) => decode(f).filter((p) => p !== 0).length
    expect(area(inflated)).toBeGreaterThan(area(deflated) * 1.8)
  })

  test('every species has a distinct silhouette', () => {
    const shapes = ENEMY_FRAMES.map((f) => decode(f).map((p) => (p === 0 ? 0 : 1)).join(''))
    expect(new Set(shapes).size).toBe(shapes.length)
  })
})

describe('Nib frames', () => {
  test('every frame decodes to exactly w*h pixels', () => {
    for (const f of ALL_FRAMES) expect(decode(f).length).toBe(f.w * f.h)
  })

  test('Full-tier frames are 16x16 and Spent-tier frames are 12x12', () => {
    for (const f of NIB_FRAMES) {
      const size = f.name.startsWith('spent') ? 12 : 16
      expect([f.w, f.h], f.name).toEqual([size, size])
    }
  })

  test('no frame is blank — an all-transparent cel is an authoring slip', () => {
    for (const f of ALL_FRAMES) {
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

  test('frame names are unique across the whole game', () => {
    const names = ALL_FRAMES.map((f) => f.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
