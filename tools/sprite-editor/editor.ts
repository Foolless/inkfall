import { blank, decode, encode, fromSource, toSource, type SpriteDef } from '../../src/content/sprites/format.js'

/**
 * Sprite editor.
 *
 * ~455 frames get hand-authored before the game ships. Typing hex nibbles by
 * hand is how that becomes the project's bottleneck, so this exists in Phase 1
 * rather than being wished for in Phase 3. It reads and writes the exact
 * SpriteDef source format, and tests assert the round trip is lossless.
 */

const DEFAULT_PALETTE = ['#2a1b45', '#7d5fc4', '#b9a6d8', '#00e5cc', '#e761ef', '#0b1116', '#e3eef0']

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id}`)
  return el as T
}

let sprite: SpriteDef = blank('nibIdle', 16, 16, [...DEFAULT_PALETTE])
let pixels = decode(sprite)
let current = 1
let painting = false
let zoom = 20

const canvas = $<HTMLCanvasElement>('grid')
const ctx = canvas.getContext('2d')!
const out = $<HTMLTextAreaElement>('source')
const status = $<HTMLParagraphElement>('status')

function say(msg: string, bad = false): void {
  status.textContent = msg
  status.style.color = bad ? '#ff8367' : '#69808a'
}

function redraw(): void {
  canvas.width = sprite.w * zoom
  canvas.height = sprite.h * zoom
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      const v = pixels[y * sprite.w + x]!
      // Transparency reads as a checkerboard, not as a colour that could be one.
      ctx.fillStyle = v === 0 ? ((x + y) % 2 ? '#141c24' : '#1b242e') : (sprite.palette[v - 1] ?? '#f0f')
      ctx.fillRect(x * zoom, y * zoom, zoom, zoom)
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let x = 0; x <= sprite.w; x++) {
    ctx.beginPath()
    ctx.moveTo(x * zoom + 0.5, 0)
    ctx.lineTo(x * zoom + 0.5, canvas.height)
    ctx.stroke()
  }
  for (let y = 0; y <= sprite.h; y++) {
    ctx.beginPath()
    ctx.moveTo(0, y * zoom + 0.5)
    ctx.lineTo(canvas.width, y * zoom + 0.5)
    ctx.stroke()
  }
}

function buildPalette(): void {
  const bar = $<HTMLDivElement>('palette')
  bar.replaceChildren()
  for (let i = 0; i <= sprite.palette.length; i++) {
    const swatch = document.createElement('button')
    swatch.type = 'button'
    swatch.className = 'swatch' + (i === current ? ' on' : '')
    swatch.style.background = i === 0 ? 'transparent' : sprite.palette[i - 1]!
    swatch.textContent = i === 0 ? '⌀' : String(i)
    swatch.title = i === 0 ? 'transparent' : sprite.palette[i - 1]!
    swatch.addEventListener('click', () => {
      current = i
      buildPalette()
    })
    bar.append(swatch)
  }
}

function paintAt(ev: PointerEvent): void {
  const rect = canvas.getBoundingClientRect()
  const x = Math.floor((ev.clientX - rect.left) / zoom)
  const y = Math.floor((ev.clientY - rect.top) / zoom)
  if (x < 0 || y < 0 || x >= sprite.w || y >= sprite.h) return
  const i = y * sprite.w + x
  if (pixels[i] === current) return
  pixels[i] = current
  sprite = { ...sprite, data: encode(pixels, sprite.w, sprite.h) }
  redraw()
  emit()
}

function emit(): void {
  out.value = toSource(sprite)
}

canvas.addEventListener('pointerdown', (e) => {
  painting = true
  canvas.setPointerCapture(e.pointerId)
  paintAt(e)
})
canvas.addEventListener('pointermove', (e) => painting && paintAt(e))
canvas.addEventListener('pointerup', () => (painting = false))
canvas.addEventListener('contextmenu', (e) => e.preventDefault())

$('load').addEventListener('click', () => {
  try {
    sprite = fromSource(out.value)
    pixels = decode(sprite)
    zoom = Math.max(6, Math.floor(320 / sprite.w))
    buildPalette()
    redraw()
    say(`loaded ${sprite.name} (${sprite.w}x${sprite.h})`)
  } catch (err) {
    say(err instanceof Error ? err.message : String(err), true)
  }
})

$('clear').addEventListener('click', () => {
  sprite = blank(sprite.name, sprite.w, sprite.h, sprite.palette)
  pixels = decode(sprite)
  redraw()
  emit()
  say('cleared')
})

$('resize').addEventListener('click', () => {
  const w = Number((document.getElementById('w') as HTMLInputElement).value)
  const h = Number((document.getElementById('h') as HTMLInputElement).value)
  const name = (document.getElementById('name') as HTMLInputElement).value || 'sprite'
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 128 || h > 128) {
    return say('width and height must be whole numbers from 1 to 128', true)
  }
  sprite = blank(name, w, h, sprite.palette)
  pixels = decode(sprite)
  zoom = Math.max(6, Math.floor(320 / w))
  redraw()
  emit()
  say(`new ${name} (${w}x${h})`)
})

$('copy').addEventListener('click', () => {
  out.select()
  navigator.clipboard
    ?.writeText(out.value)
    .then(() => say('copied to clipboard'))
    .catch(() => say('select and copy manually', true))
})

buildPalette()
redraw()
emit()
say('paint with the mouse; Load parses whatever is in the box')
