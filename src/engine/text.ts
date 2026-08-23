/**
 * Drawing the bitmap font.
 *
 * One `fillRect` per lit pixel sounds wasteful and is not: the whole game shows
 * perhaps sixty glyphs at once, which is under two thousand rects a frame in
 * the worst case, and it keeps the font a pure data structure with no
 * rasterisation step, no cache to invalidate, and no measurement API to get
 * wrong.
 */

import { ADVANCE, GLYPH_H, GLYPH_W, glyph, textWidth } from '../content/font.js'

export interface TextOptions {
  /** 1 draws at the internal resolution; 2 doubles every pixel. */
  scale?: number
  /** Drops a one-pixel shadow, which is what makes text legible over tiles. */
  shadow?: string
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  colour: string,
  options: TextOptions = {},
): void {
  const scale = options.scale ?? 1
  if (options.shadow) paint(ctx, text, x + scale, y + scale, options.shadow, scale)
  paint(ctx, text, x, y, colour, scale)
}

function paint(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string, scale: number): void {
  ctx.fillStyle = colour
  const left = Math.floor(x)
  const top = Math.floor(y)
  for (let i = 0; i < text.length; i++) {
    const rows = glyph(text[i]!)
    const gx = left + i * ADVANCE * scale
    for (let row = 0; row < GLYPH_H; row++) {
      const line = rows[row]!
      for (let col = 0; col < GLYPH_W; col++) {
        if (line[col] !== '#') continue
        ctx.fillRect(gx + col * scale, top + row * scale, scale, scale)
      }
    }
  }
}

export function drawTextCentred(
  ctx: CanvasRenderingContext2D,
  text: string,
  centreX: number,
  y: number,
  colour: string,
  options: TextOptions = {},
): void {
  const scale = options.scale ?? 1
  drawText(ctx, text, centreX - (textWidth(text) * scale) / 2, y, colour, options)
}

export function drawTextRight(
  ctx: CanvasRenderingContext2D,
  text: string,
  rightX: number,
  y: number,
  colour: string,
  options: TextOptions = {},
): void {
  const scale = options.scale ?? 1
  drawText(ctx, text, rightX - textWidth(text) * scale, y, colour, options)
}

export { textWidth }
