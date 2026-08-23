import { CHARGED_TIER, DISPLAY, SPENT } from '../game/constants.js'
import { Tile, tileAt, type TileId } from '../game/tilemap.js'
import { tierOf } from '../game/player.js'
import type { World } from '../game/world.js'
import type { Camera } from './camera.js'
import { frameFor, paletteFor, type Anim } from './anim.js'
import { drawSprite, SpriteCache } from './sprite.js'

const T = DISPLAY.TILE

/**
 * Grey box palette. Deliberately drab: Phase 1 is about whether the movement is
 * fun with nothing to look at. The only saturated colours belong to things that
 * kill you or things you want, so those still read instantly.
 */
const COLOURS: Record<TileId, string | null> = {
  [Tile.EMPTY]: null,
  [Tile.SOLID]: '#3a4248',
  [Tile.ONEWAY]: '#59646c',
  [Tile.WATER]: '#1d3f52',
  [Tile.HAZARD]: '#a8372a',
  [Tile.CRUMBLE]: '#6b5a44',
  [Tile.CURRENT_R]: '#25505c',
  [Tile.CURRENT_L]: '#25505c',
  [Tile.CURRENT_U]: '#25505c',
  [Tile.CURRENT_D]: '#25505c',
  [Tile.SLICK]: '#4a5f6b',
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D
  readonly sprites = new SpriteCache()
  scale = 1

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('2D canvas context unavailable')
    this.ctx = ctx
    canvas.width = DISPLAY.WIDTH
    canvas.height = DISPLAY.HEIGHT
  }

  /** Integer scaling only — a fractional scale shimmers at this resolution. */
  resize(availableW: number, availableH: number): void {
    const scale = Math.max(1, Math.floor(Math.min(availableW / DISPLAY.WIDTH, availableH / DISPLAY.HEIGHT)))
    this.scale = scale
    this.canvas.style.width = `${DISPLAY.WIDTH * scale}px`
    this.canvas.style.height = `${DISPLAY.HEIGHT * scale}px`
    this.canvas.style.imageRendering = 'pixelated'
  }

  draw(w: World, cam: Camera, anim: Anim): void {
    const { ctx } = this
    ctx.imageSmoothingEnabled = false
    // Everything below floors its coordinates: sub-pixel state, integer pixels.
    const ox = Math.floor(cam.x)
    const oy = Math.floor(cam.y)

    ctx.fillStyle = '#0b1116'
    ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT)

    this.drawTiles(w, ox, oy)
    this.drawPickups(w, ox, oy)
    this.drawPlayer(w, ox, oy, anim)
    this.drawHud(w)
  }

  private drawTiles(w: World, ox: number, oy: number): void {
    const { ctx } = this
    const x0 = Math.floor(ox / T)
    const x1 = Math.ceil((ox + DISPLAY.WIDTH) / T)
    const y0 = Math.floor(oy / T)
    const y1 = Math.ceil((oy + DISPLAY.HEIGHT) / T)

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = tileAt(w.map, tx, ty)
        const colour = COLOURS[t]
        if (colour === null) continue
        const index = ty * w.map.width + tx
        if (t === Tile.CRUMBLE && w.collapsed.has(index)) continue

        const px = tx * T - ox
        const py = ty * T - oy
        ctx.fillStyle = colour
        ctx.fillRect(px, py, T, T)

        // A crumble tile counting down flashes, so the timer is readable.
        if (t === Tile.CRUMBLE && w.crumbling.has(index) && (w.frame >> 2) % 2 === 0) {
          ctx.fillStyle = '#a88a5c'
          ctx.fillRect(px, py, T, T)
        }
        if (t === Tile.SOLID || t === Tile.SLICK) {
          ctx.fillStyle = t === Tile.SLICK ? '#7fa3b5' : '#4d565d'
          ctx.fillRect(px, py, T, 2)
        }
        if (t === Tile.ONEWAY) {
          ctx.fillStyle = '#8f9aa2'
          ctx.fillRect(px, py, T, 3)
        }
        if (t === Tile.HAZARD) this.drawSpikes(px, py)
        if (t >= Tile.CURRENT_R && t <= Tile.CURRENT_D) this.drawCurrent(t, px, py, w.frame)
      }
    }
  }

  /** Hazards are drawn as spikes, not just red, so they read in greyscale too. */
  private drawSpikes(px: number, py: number): void {
    const { ctx } = this
    ctx.fillStyle = '#e0705c'
    for (let i = 0; i < 4; i++) {
      const sx = px + i * 4
      for (let r = 0; r < 4; r++) ctx.fillRect(sx + r, py + r, 4 - r * 2, 1)
    }
  }

  private drawCurrent(t: TileId, px: number, py: number, frame: number): void {
    const { ctx } = this
    ctx.fillStyle = '#5fd6e8'
    const phase = (frame >> 1) % T
    for (let i = 0; i < 3; i++) {
      const o = (phase + i * 6) % T
      if (t === Tile.CURRENT_R) ctx.fillRect(px + o, py + 4 + i * 4, 3, 1)
      else if (t === Tile.CURRENT_L) ctx.fillRect(px + T - o - 3, py + 4 + i * 4, 3, 1)
      else if (t === Tile.CURRENT_U) ctx.fillRect(px + 4 + i * 4, py + T - o - 3, 1, 3)
      else ctx.fillRect(px + 4 + i * 4, py + o, 1, 3)
    }
  }

  private drawPickups(w: World, ox: number, oy: number): void {
    const { ctx } = this
    for (const p of w.pickups) {
      if (p.taken) continue
      const pulse = ((w.frame >> 3) % 2) - 0.5
      ctx.fillStyle = p.kind === 'inkCore' ? '#0d0d14' : '#7fe8d8'
      ctx.fillRect(Math.floor(p.x - ox), Math.floor(p.y - oy + pulse), p.w, p.h)
      ctx.fillStyle = p.kind === 'inkCore' ? '#e761ef' : '#d6fff6'
      ctx.fillRect(Math.floor(p.x - ox + 2), Math.floor(p.y - oy - 1 + pulse), p.w - 4, 2)
    }
  }

  private drawPlayer(w: World, ox: number, oy: number, anim: Anim): void {
    const { ctx } = this
    const p = w.player
    // Invulnerability flickers, which also communicates that a hit landed.
    if (p.alive && p.iframes > 0 && (w.frame >> 1) % 2 === 0) return

    const frame = frameFor(anim, p.tier)
    const palette = paletteFor(p.tier)

    // The sprite is larger than the hitbox by design (PRD §12.4), so it is
    // drawn centred on the box rather than aligned to it.
    const x = Math.floor(p.x - ox + (p.w - frame.w) / 2)
    const y = Math.floor(p.y - oy + (p.h - frame.h) / 2)

    if (p.dashFrames > 0) this.drawInkTrail(p, x, y, frame.w, frame.h)
    drawSprite(ctx, this.sprites.get(frame, p.facing < 0, palette), x, y)
  }

  /** A dash leaves a fading trail behind it — opaque black while Charged. */
  private drawInkTrail(
    p: { vx: number; vy: number; tier: number },
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const { ctx } = this
    const charged = p.tier === CHARGED_TIER
    const len = Math.hypot(p.vx, p.vy) || 1
    const ux = -p.vx / len
    const uy = -p.vy / len
    for (let i = 1; i <= 3; i++) {
      const fade = charged ? 0.85 - i * 0.15 : 0.4 - i * 0.1
      ctx.fillStyle = charged ? `rgba(10,6,20,${fade})` : `rgba(0,229,204,${fade})`
      ctx.fillRect(Math.floor(x + ux * i * 4 + w / 4), Math.floor(y + uy * i * 4 + h / 4), w / 2, h / 2)
    }
  }

  private drawHud(w: World): void {
    const { ctx } = this
    const p = w.player
    const max = tierOf(p).inkMax
    for (let i = 0; i < 3; i++) {
      const x = 6 + i * 9
      if (i >= max) {
        // Spent: the third slot draws as a broken outline. The meter is the
        // health bar, so tier costs no extra HUD space.
        ctx.strokeStyle = '#4d565d'
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, 6.5, 6, 6)
        continue
      }
      const filled = i < p.ink
      ctx.fillStyle = filled ? (p.tier === CHARGED_TIER ? '#e761ef' : '#00e5cc') : '#2a343b'
      ctx.fillRect(x, 6, 7, 7)
    }
    if (p.tier === SPENT) {
      ctx.fillStyle = '#7b9098'
      ctx.fillRect(6, 16, 15, 1)
    }
  }
}
