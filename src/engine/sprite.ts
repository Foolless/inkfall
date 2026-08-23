/**
 * Palette-indexed blitting.
 *
 * A sprite is a string of hex nibbles (src/content/sprites/format.ts) plus a
 * palette of at most three colours. Nothing here decodes at draw time: a frame
 * is turned into pixels once, cached as a canvas, and blitted thereafter.
 *
 * The split matters for testing. Everything that turns nibbles into pixels is a
 * pure function over typed arrays and is unit-tested; only the thin canvas
 * shell needs a browser, and that is covered by the smoke test and human eyes.
 */

import { decode, type SpriteDef } from '../content/sprites/format.js'

/**
 * Straight RGBA, one byte per channel.
 *
 * Pinned to a plain ArrayBuffer rather than the default ArrayBufferLike so the
 * result can be handed straight to ImageData, which will not take a buffer that
 * might be shared.
 */
export type Pixels = Uint8ClampedArray<ArrayBuffer>

/** Parsed '#rrggbb'. Index 0 of a sprite is always transparent. */
export interface Rgb {
  r: number
  g: number
  b: number
}

export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) throw new Error(`not a #rrggbb colour: ${JSON.stringify(hex)}`)
  const n = parseInt(m[1]!, 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

/**
 * Expand a sprite to straight RGBA.
 *
 * `palette` overrides the sprite's own, which is how Charged Nib exists: the
 * same frames drawn from a darker set of three colours rather than redrawn.
 */
export function toRgba(s: SpriteDef, palette: readonly string[] = s.palette): Pixels {
  const indices = decode(s)
  const colours = palette.map(parseHex)
  const out: Pixels = new Uint8ClampedArray(new ArrayBuffer(s.w * s.h * 4))
  for (let i = 0; i < indices.length; i++) {
    const slot = indices[i]!
    if (slot === 0) continue // transparent
    const c = colours[slot - 1]
    if (c === undefined) throw new Error(`${s.name}: pixel wants palette slot ${slot}, override has ${palette.length}`)
    const o = i * 4
    out[o] = c.r
    out[o + 1] = c.g
    out[o + 2] = c.b
    out[o + 3] = 255
  }
  return out
}

/** Mirror in place along X. Nib faces right in every source frame. */
export function flipRgba(rgba: Pixels, w: number, h: number): Pixels {
  const out: Pixels = new Uint8ClampedArray(new ArrayBuffer(rgba.length))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4
      const dst = (y * w + (w - 1 - x)) * 4
      out[dst] = rgba[src]!
      out[dst + 1] = rgba[src + 1]!
      out[dst + 2] = rgba[src + 2]!
      out[dst + 3] = rgba[src + 3]!
    }
  }
  return out
}

/** A drawable, backed by whatever canvas the host provides. */
export interface Blittable {
  readonly w: number
  readonly h: number
  readonly image: CanvasImageSource
}

type CanvasFactory = (w: number, h: number) => HTMLCanvasElement

const defaultFactory: CanvasFactory = (w, h) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/**
 * Lazily rasterises sprites and keeps both facings.
 *
 * Keyed on name plus palette identity, so Full and Charged Nib — the same
 * frames under different colours — never collide in the cache.
 */
export class SpriteCache {
  private entries = new Map<string, Blittable>()

  constructor(private readonly factory: CanvasFactory = defaultFactory) {}

  get(s: SpriteDef, flip = false, palette: readonly string[] = s.palette): Blittable {
    const key = `${s.name}|${flip ? 1 : 0}|${palette.join(',')}`
    const hit = this.entries.get(key)
    if (hit) return hit

    const rgba = flip ? flipRgba(toRgba(s, palette), s.w, s.h) : toRgba(s, palette)
    const canvas = this.factory(s.w, s.h)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable for sprite rasterisation')
    ctx.putImageData(new ImageData(rgba, s.w, s.h), 0, 0)

    const entry: Blittable = { w: s.w, h: s.h, image: canvas }
    this.entries.set(key, entry)
    return entry
  }

  get size(): number {
    return this.entries.size
  }
}

/**
 * Blit at integer pixels. Sub-pixel motion lives in the simulation and never
 * reaches the screen — at 320x180 a smoothed sprite shimmers badly.
 */
export function drawSprite(ctx: CanvasRenderingContext2D, b: Blittable, x: number, y: number): void {
  ctx.drawImage(b.image, Math.floor(x), Math.floor(y))
}
