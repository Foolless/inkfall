import { describe, expect, test } from 'vitest'
import { flipRgba, parseHex, toRgba } from '../src/engine/sprite.js'
import { sprite } from '../src/content/sprites/format.js'
import { NIB_CHARGED_PALETTE, NIB_PALETTE } from '../src/content/palettes.js'
import { nibIdle0 } from '../src/content/sprites/nib.js'

const RED = '#ff0000'
const GREEN = '#00ff00'

/** A 2x2 with one pixel of each palette slot and one transparent. */
const tiny = sprite('tiny', [RED, GREEN], ['12', '01'])

describe('parseHex', () => {
  test('splits a #rrggbb literal into channels', () => {
    expect(parseHex('#ff8040')).toEqual({ r: 255, g: 128, b: 64 })
  })

  test('rejects anything that is not six hex digits', () => {
    expect(() => parseHex('#fff')).toThrow()
    expect(() => parseHex('red')).toThrow()
    expect(() => parseHex('#gggggg')).toThrow()
  })
})

describe('toRgba', () => {
  test('slot 0 is transparent and every other slot is opaque', () => {
    const rgba = toRgba(tiny)
    expect([...rgba.slice(0, 4)]).toEqual([255, 0, 0, 255]) // slot 1
    expect([...rgba.slice(4, 8)]).toEqual([0, 255, 0, 255]) // slot 2
    expect([...rgba.slice(8, 12)]).toEqual([0, 0, 0, 0]) // slot 0
    expect([...rgba.slice(12, 16)]).toEqual([255, 0, 0, 255])
  })

  test('produces w*h*4 bytes', () => {
    expect(toRgba(nibIdle0).length).toBe(16 * 16 * 4)
  })

  /**
   * This is the whole reason Charged costs no new art: the same frames, drawn
   * from a darker set of three colours.
   */
  test('an override palette recolours a frame without redrawing it', () => {
    const full = toRgba(nibIdle0, NIB_PALETTE)
    const charged = toRgba(nibIdle0, NIB_CHARGED_PALETTE)
    expect(charged.length).toBe(full.length)

    let differing = 0
    for (let i = 3; i < full.length; i += 4) {
      // Alpha must match exactly: the silhouette is identical.
      expect(charged[i]).toBe(full[i])
      if (full[i] === 255 && charged[i - 3] !== full[i - 3]) differing++
    }
    expect(differing).toBeGreaterThan(0)
  })

  test('throws when the override palette is too short for the frame', () => {
    expect(() => toRgba(tiny, [RED])).toThrow(/palette slot 2/)
  })
})

describe('flipRgba', () => {
  test('mirrors along X', () => {
    const flipped = flipRgba(toRgba(tiny), 2, 2)
    expect([...flipped.slice(0, 4)]).toEqual([0, 255, 0, 255])
    expect([...flipped.slice(4, 8)]).toEqual([255, 0, 0, 255])
    expect([...flipped.slice(8, 12)]).toEqual([255, 0, 0, 255])
    expect([...flipped.slice(12, 16)]).toEqual([0, 0, 0, 0])
  })

  test('is its own inverse', () => {
    const once = flipRgba(toRgba(nibIdle0), 16, 16)
    const twice = flipRgba(once, 16, 16)
    expect([...twice]).toEqual([...toRgba(nibIdle0)])
  })

  test('preserves the number of opaque pixels', () => {
    const source = toRgba(nibIdle0)
    const flipped = flipRgba(source, 16, 16)
    const opaque = (a: Uint8ClampedArray) => a.filter((_, i) => i % 4 === 3 && a[i] === 255).length
    expect(opaque(flipped)).toBe(opaque(source))
  })
})
