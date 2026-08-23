import { describe, expect, test } from 'vitest'
import {
  blank,
  decode,
  encode,
  fromSource,
  SpriteFormatError,
  toSource,
  validate,
  type SpriteDef,
} from '../src/content/sprites/format.js'

const palette = ['#2a1b45', '#7d5fc4', '#b9a6d8', '#00e5cc']

const sample: SpriteDef = {
  name: 'nibIdle',
  w: 4,
  h: 4,
  palette,
  data: '0110' + '1221' + '1231' + '0440',
}

/**
 * The editor is only trustworthy if what it writes is exactly what the game
 * reads. That is the whole point of these tests: ~455 frames get authored
 * through that tool, and a lossy round trip would corrupt them silently.
 */
describe('round tripping', () => {
  test('source survives a full write-read cycle unchanged', () => {
    expect(fromSource(toSource(sample))).toEqual(sample)
  })

  test('two cycles are identical to one — the format is stable', () => {
    const once = toSource(sample)
    expect(toSource(fromSource(once))).toBe(once)
  })

  test('pixels survive decode and re-encode', () => {
    expect(encode(decode(sample), sample.w, sample.h)).toBe(sample.data)
  })

  test('a blank sprite round-trips', () => {
    const empty = blank('empty', 8, 8, palette)
    expect(fromSource(toSource(empty))).toEqual(empty)
  })

  test('a sprite with no palette round-trips', () => {
    const none: SpriteDef = { name: 'none', w: 2, h: 2, palette: [], data: '0000' }
    expect(fromSource(toSource(none))).toEqual(none)
  })

  test('a full 16x16 frame round-trips', () => {
    const big: SpriteDef = {
      name: 'big',
      w: 16,
      h: 16,
      palette,
      // A deterministic pattern, not random — this test must never flake.
      data: Array.from({ length: 256 }, (_, i) => (i % 5).toString(16)).join(''),
    }
    expect(fromSource(toSource(big))).toEqual(big)
  })
})

describe('validation', () => {
  test('rejects a pixel count that does not match the dimensions', () => {
    expect(() => validate({ ...sample, data: '011' })).toThrow(SpriteFormatError)
  })

  test('rejects a pixel referencing a palette slot that does not exist', () => {
    expect(() => validate({ ...sample, data: '0110122112319990' })).toThrow(/palette slot/)
  })

  test('rejects non-hex data', () => {
    expect(() => validate({ ...sample, data: 'zzzz1221123104 0'.slice(0, 16) })).toThrow(/hex/)
  })

  test('rejects a palette larger than 15 colours', () => {
    const tooMany = Array.from({ length: 16 }, (_, i) => `#00000${i.toString(16)}`)
    expect(() => validate({ ...sample, palette: tooMany })).toThrow(/15 colours/)
  })

  test('rejects zero or negative dimensions', () => {
    expect(() => validate({ ...sample, w: 0, data: '' })).toThrow(/positive/)
  })

  test('encode rejects an out-of-range pixel', () => {
    expect(() => encode([0, 1, 16, 3], 2, 2)).toThrow(/out of range/)
  })

  test('encode rejects a mismatched pixel count', () => {
    expect(() => encode([0, 1], 4, 4)).toThrow(/expected 16/)
  })

  test('fromSource rejects source missing its header', () => {
    expect(() => fromSource('const x = 1')).toThrow(/missing name/)
  })
})

describe('decoding', () => {
  test('index 0 means transparent', () => {
    const pixels = decode(sample)
    expect(pixels[0]).toBe(0)
    expect(pixels[1]).toBe(1)
  })

  test('the decoded length matches the dimensions', () => {
    expect(decode(sample)).toHaveLength(sample.w * sample.h)
  })
})
