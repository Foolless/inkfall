/**
 * Sprites are palette-indexed nibble arrays authored as plain text in the repo.
 *
 * One hex digit per pixel: 0 is transparent, 1-15 index the sprite's palette.
 * That keeps a 16x16 frame to 256 characters, readable in a diff, and needs no
 * asset pipeline, no binary blobs and no licensing questions.
 *
 * ~455 of these get hand-authored before the game ships, which is why the
 * editor in tools/sprite-editor exists and why round-tripping is tested.
 */

export interface SpriteDef {
  name: string
  w: number
  h: number
  /** Up to 15 colours; index 0 is always transparent and is not listed. */
  palette: string[]
  /** w*h hex digits, row-major. */
  data: string
}

export class SpriteFormatError extends Error {}

export function validate(s: SpriteDef): void {
  if (s.w <= 0 || s.h <= 0) throw new SpriteFormatError(`${s.name}: dimensions must be positive`)
  if (s.palette.length > 15) throw new SpriteFormatError(`${s.name}: palette holds at most 15 colours`)
  if (s.data.length !== s.w * s.h) {
    throw new SpriteFormatError(`${s.name}: expected ${s.w * s.h} pixels, found ${s.data.length}`)
  }
  if (!/^[0-9a-f]*$/.test(s.data)) throw new SpriteFormatError(`${s.name}: data must be lowercase hex`)
  for (const ch of s.data) {
    const index = parseInt(ch, 16)
    if (index > s.palette.length) {
      throw new SpriteFormatError(`${s.name}: pixel references palette slot ${index}, palette has ${s.palette.length}`)
    }
  }
}

/** Decode to one palette index per pixel; 0 means transparent. */
export function decode(s: SpriteDef): Uint8Array {
  validate(s)
  const out = new Uint8Array(s.w * s.h)
  for (let i = 0; i < s.data.length; i++) out[i] = parseInt(s.data[i]!, 16)
  return out
}

export function encode(pixels: ArrayLike<number>, w: number, h: number): string {
  if (pixels.length !== w * h) throw new SpriteFormatError(`expected ${w * h} pixels, got ${pixels.length}`)
  let out = ''
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i]!
    if (v < 0 || v > 15) throw new SpriteFormatError(`pixel ${i} out of range: ${v}`)
    out += v.toString(16)
  }
  return out
}

/** Serialise to the TypeScript literal the editor exports and levels import. */
export function toSource(s: SpriteDef): string {
  validate(s)
  const rows: string[] = []
  for (let y = 0; y < s.h; y++) rows.push(`    '${s.data.slice(y * s.w, (y + 1) * s.w)}'`)
  const palette = s.palette.map((c) => `'${c}'`).join(', ')
  return `export const ${s.name}: SpriteDef = {
  name: '${s.name}',
  w: ${s.w},
  h: ${s.h},
  palette: [${palette}],
  data:
${rows.join(' +\n')},
}
`
}

/** Inverse of toSource. Round-tripping through both is asserted in tests. */
export function fromSource(src: string): SpriteDef {
  const name = /name:\s*'([^']+)'/.exec(src)?.[1]
  const w = Number(/\bw:\s*(\d+)/.exec(src)?.[1])
  const h = Number(/\bh:\s*(\d+)/.exec(src)?.[1])
  const paletteRaw = /palette:\s*\[([^\]]*)\]/.exec(src)?.[1]
  if (name === undefined || !Number.isFinite(w) || !Number.isFinite(h) || paletteRaw === undefined) {
    throw new SpriteFormatError('source is missing name, dimensions or palette')
  }
  const palette = paletteRaw.trim() === '' ? [] : [...paletteRaw.matchAll(/'([^']*)'/g)].map((m) => m[1]!)
  const dataSection = src.slice(src.indexOf('data:'))
  const data = [...dataSection.matchAll(/'([0-9a-f]*)'/g)].map((m) => m[1]!).join('')

  const sprite: SpriteDef = { name, w, h, palette, data }
  validate(sprite)
  return sprite
}

export function blank(name: string, w: number, h: number, palette: string[]): SpriteDef {
  return { name, w, h, palette, data: '0'.repeat(w * h) }
}

/**
 * Author a frame as one string per pixel row.
 *
 * This is how every sprite in src/content/sprites is written, because a 16x16
 * frame laid out as sixteen lines of sixteen digits is legible in a diff — you
 * can see the squid. A single 256-character string is not.
 */
export function sprite(name: string, palette: string[], rows: readonly string[]): SpriteDef {
  if (rows.length === 0) throw new SpriteFormatError(`${name}: no rows`)
  const w = rows[0]!.length
  rows.forEach((row, y) => {
    if (row.length !== w) throw new SpriteFormatError(`${name}: row ${y} is ${row.length} wide, expected ${w}`)
  })
  const def: SpriteDef = { name, w, h: rows.length, palette, data: rows.join('') }
  validate(def)
  return def
}
