import { CHARGED_TIER, DISPLAY } from '../game/constants.js'
import { Tile, tileAt, type TileId } from '../game/tilemap.js'
import { tierOf } from '../game/player.js'
import type { World } from '../game/world.js'
import type { Camera } from './camera.js'
import { frameFor, paletteFor, type Anim } from './anim.js'
import { enemyFrame } from './enemy-anim.js'
import { clamState, isTelegraphing } from '../game/hazards.js'
import { formatScore, formatTime, type Session } from '../game/state.js'
import { SHARED } from '../content/palettes.js'
import { drawText, drawTextRight } from './text.js'
import { drawGameOver, drawLevelClear, drawPause, drawTitle } from './screens.js'
import { chapterOf } from '../content/chapters.js'
import { tilesetOf, type Tileset } from '../content/tilesets/index.js'
import { PICKUP_SPRITES } from '../content/sprites/pickups.js'
import * as art from '../content/sprites/bosses.js'
import { SHALLOWS } from '../content/palettes.js'
import { drawSprite, SpriteCache } from './sprite.js'

const T = DISPLAY.TILE

/** True when the tile sits behind another solid, so it needs no sunlit cap. */
function isBlocked(map: World['map'], tx: number, ty: number): boolean {
  const t = tileAt(map, tx, ty)
  return t === Tile.SOLID || t === Tile.SLICK || t === Tile.CRUMBLE
}

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

  draw(s: Session, cam: Camera, anim: Anim): void {
    const { ctx } = this
    ctx.imageSmoothingEnabled = false

    if (s.screen === 'title') {
      drawTitle(ctx, s)
      return
    }

    const w = s.world
    // Everything below floors its coordinates: sub-pixel state, integer pixels.
    const ox = Math.floor(cam.x)
    const oy = Math.floor(cam.y)
    const set = tilesetOf(chapterOf(s.level.chapter).tileset)

    ctx.fillStyle = set?.sky ?? '#0b1116'
    ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT)

    if (set) this.drawTileset(w, ox, oy, set)
    else this.drawTiles(w, ox, oy)
    this.drawClams(w, ox, oy)
    this.drawPickups(w, ox, oy)
    this.drawEnemies(w, ox, oy)
    this.drawBoss(w, ox, oy)
    this.drawPlayer(w, ox, oy, anim)
    this.drawHud(s)

    if (s.screen === 'paused') drawPause(ctx)
    if (s.screen === 'levelClear') drawLevelClear(ctx, s)
    if (s.screen === 'gameOver') drawGameOver(ctx, s)
  }

  /**
   * Draw a chapter's tileset.
   *
   * Solids pick their cel from what is above them, so a designer authors a
   * grid of '#' and gets sunlit tops and shaded fill without ever thinking
   * about edges. Water is painted rather than blitted because it is
   * translucent, and the nibble format has no alpha to spare.
   */
  private drawTileset(w: World, ox: number, oy: number, set: Tileset): void {
    const { ctx } = this
    const x0 = Math.floor(ox / T)
    const x1 = Math.ceil((ox + DISPLAY.WIDTH) / T)
    const y0 = Math.floor(oy / T)
    const y1 = Math.ceil((oy + DISPLAY.HEIGHT) / T)

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = tileAt(w.map, tx, ty)
        const px = tx * T - ox
        const py = ty * T - oy
        const index = ty * w.map.width + tx

        if (t === Tile.WATER || (t >= Tile.CURRENT_R && t <= Tile.CURRENT_D)) {
          ctx.fillStyle = set.water.body
          ctx.fillRect(px, py, T, T)
          // A surface line wherever the water stops, so a pool has an edge.
          const above = tileAt(w.map, tx, ty - 1)
          if (above !== Tile.WATER && !(above >= Tile.CURRENT_R && above <= Tile.CURRENT_D)) {
            ctx.fillStyle = set.water.surface
            ctx.fillRect(px, py, T, 1)
            ctx.fillRect(px + ((w.frame >> 2) % T), py + 1, 3, 1)
          }
          if (t >= Tile.CURRENT_R && t <= Tile.CURRENT_D) this.drawCurrent(t, px, py, w.frame)
          continue
        }

        if (t === Tile.EMPTY) continue

        if (t === Tile.CRUMBLE) {
          if (w.collapsed.has(index)) continue
          drawSprite(ctx, this.sprites.get(set.crumble), px, py)
          // Counting down: flash, so the 24 frames of footing are readable.
          if (w.crumbling.has(index) && (w.frame >> 2) % 2 === 0) {
            ctx.fillStyle = 'rgba(255,240,210,0.4)'
            ctx.fillRect(px, py, T, T)
          }
          continue
        }

        const cel =
          t === Tile.HAZARD
            ? set.hazard
            : t === Tile.ONEWAY
              ? set.oneway
              : t === Tile.SLICK
                ? set.slick
                : isBlocked(w.map, tx, ty - 1)
                  ? set.solidFill
                  : set.solidTop
        drawSprite(ctx, this.sprites.get(cel), px, py)
      }
    }
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

  /** Pickups bob on a slow cycle, which is most of what makes them read as
   *  "take me" rather than "scenery". */
  private drawPickups(w: World, ox: number, oy: number): void {
    for (const p of w.pickups) {
      if (p.taken) continue
      const frame = PICKUP_SPRITES[p.kind]
      if (!frame) continue
      const bob = ((w.frame >> 3) % 2) - 0.5
      const x = p.x - ox + (p.w - frame.w) / 2
      const y = p.y - oy + (p.h - frame.h) / 2 + bob
      drawSprite(this.ctx, this.sprites.get(frame), x, y)
    }
  }

  /**
   * A clam reads by shape alone: open is a gaping V, closed is a flat lid, and
   * the telegraph shudders. None of that depends on colour, per PRD §13.
   */
  private drawClams(w: World, ox: number, oy: number): void {
    const { ctx } = this
    for (const c of w.clams) {
      const state = clamState(c)
      const shudder = isTelegraphing(c) && (w.frame >> 1) % 2 === 0 ? 1 : 0
      const x = Math.floor(c.x - ox) + shudder
      const y = Math.floor(c.y - oy)

      ctx.fillStyle = '#a8875c'
      ctx.fillRect(x, y + c.h - 4, c.w, 4) // the lower shell, always there

      if (state === 'closed') {
        ctx.fillStyle = '#d6bd8f'
        ctx.fillRect(x, y, c.w, c.h - 4)
        ctx.fillStyle = '#f4e4c1'
        ctx.fillRect(x, y, c.w, 2)
        continue
      }

      // Open: two jaws with a gap between them, and teeth so the gap reads as a
      // mouth rather than a doorway.
      const gape = state === 'slamming' ? 3 : c.h - 8
      ctx.fillStyle = '#d6bd8f'
      ctx.fillRect(x, y, c.w, c.h - 4 - gape)
      ctx.fillStyle = '#e8825a'
      for (let i = 0; i < c.w / 4; i++) ctx.fillRect(x + i * 4 + 1, y + c.h - 4 - 2, 2, 2)
    }
  }

  /**
   * Enemies are drawn bottom-aligned and horizontally centred on their box.
   *
   * Bottom rather than centre because a crab that hovers two pixels above the
   * sand reads as a bug, and a hurtbox shorter than its sprite is the normal
   * case here rather than the exception.
   */
  private drawEnemies(w: World, ox: number, oy: number): void {
    for (const e of w.enemies) {
      if (!e.alive) continue
      const frame = enemyFrame(e, w.frame)
      const x = Math.floor(e.x - ox + (e.w - frame.w) / 2)
      const y = Math.floor(e.y - oy + (e.h - frame.h))
      drawSprite(this.ctx, this.sprites.get(frame, e.facing > 0), x, y)
      // A stunned enemy flickers, so "why is that crab not moving" is never a
      // question the player has to ask.
      if (e.stun > 0 && (w.frame >> 1) % 2 === 0) {
        this.ctx.fillStyle = 'rgba(214,255,246,0.35)'
        this.ctx.fillRect(x, y, frame.w, frame.h)
      }
    }
  }

  /**
   * The King and his rocks.
   *
   * No health bar: the shell cracks a stage per hit, which is the only damage
   * readout the fight has (PRD §6.3). Cracks are drawn rather than authored,
   * so "visibly breaking" costs no extra frames.
   */
  private drawBoss(w: World, ox: number, oy: number): void {
    const { ctx } = this
    for (const r of w.rocks) {
      if (!r.alive) continue
      drawSprite(ctx, this.sprites.get(art.rock), r.x - ox - 1, r.y - oy - 1)
    }

    const b = w.boss
    if (!b || b.state === 'dead') return

    const exposed = b.state === 'exposed'
    const frame = exposed ? art.hermitExposed : art.hermitIdle
    const x = Math.floor(b.x - ox + (b.w - frame.w) / 2)
    const y = Math.floor(b.y - oy + (b.h - frame.h))

    // Dying: he flickers and sinks. Waking: he shudders.
    if (b.state === 'dying' && (w.frame >> 1) % 2 === 0) return
    const shudder = b.state === 'waking' && (w.frame >> 1) % 2 === 0 ? 1 : 0

    drawSprite(ctx, this.sprites.get(frame, b.facing > 0), x + shudder, y)

    ctx.fillStyle = SHALLOWS.URCHIN
    for (let i = 0; i < b.hits; i++) {
      const cx = x + 22 + i * 7
      ctx.fillRect(cx, y + 8 + i * 3, 1, 9)
      ctx.fillRect(cx + 1, y + 11 + i * 3, 3, 1)
    }

    // The window is the whole fight, so it is impossible to miss.
    if (exposed && (w.frame >> 2) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)'
      ctx.fillRect(x, y, frame.w, frame.h)
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

  /**
   * The HUD. PRD §11.2: one 16px strip, and the ink meter is the largest thing
   * in it because it is what the player has to read mid-air.
   *
   * The meter doubles as the health display, which is why the tier costs no
   * extra real estate — Spent draws its third slot as a broken outline, Charged
   * hardens all three. The player reads their own health where they are already
   * looking.
   */
  private drawHud(s: Session): void {
    const { ctx } = this
    const w = s.world
    const p = w.player
    const max = tierOf(p).inkMax

    ctx.fillStyle = 'rgba(5,9,15,0.55)'
    ctx.fillRect(0, 0, DISPLAY.WIDTH, 16)

    drawText(ctx, `NIBx${s.lives}`, 4, 5, SHARED.UI_TEXT)

    for (let i = 0; i < 3; i++) {
      const x = 46 + i * 10
      if (i >= max) {
        // Spent: the third slot is a broken outline, not a missing pip. The
        // difference matters — one says "you lost something", the other says
        // "there was never anything here".
        ctx.strokeStyle = SHARED.UI_DIM
        ctx.lineWidth = 1
        ctx.setLineDash([2, 2])
        ctx.strokeRect(x + 0.5, 4.5, 7, 7)
        ctx.setLineDash([])
        continue
      }
      const filled = i < p.ink
      ctx.fillStyle = filled ? (p.tier === CHARGED_TIER ? SHARED.CHARGED_BODY : SHARED.INK_CYAN) : '#2a343b'
      ctx.fillRect(x, 4, 8, 8)
      if (p.tier === CHARGED_TIER && filled) {
        ctx.fillStyle = SHARED.CHARGED_RIM
        ctx.fillRect(x, 4, 8, 1)
        ctx.fillRect(x, 4, 1, 8)
      }
    }

    drawText(ctx, `S${String(w.shells).padStart(3, '0')}`, 84, 5, SHARED.SHELL)
    drawText(ctx, formatScore(w.score + s.score), 118, 5, SHARED.UI_TEXT)

    // Pearls: filled for found, hollow for not. Shape, never colour alone.
    for (let i = 0; i < 3; i++) {
      const x = 224 + i * 8
      ctx.fillStyle = w.pearls[i] ? SHARED.PEARL : SHARED.UI_DIM
      if (w.pearls[i]) {
        ctx.fillRect(x, 6, 5, 5)
      } else {
        ctx.fillRect(x, 6, 5, 1)
        ctx.fillRect(x, 10, 5, 1)
        ctx.fillRect(x, 6, 1, 5)
        ctx.fillRect(x + 4, 6, 1, 5)
      }
    }

    drawTextRight(ctx, formatTime(s.levelFrames), DISPLAY.WIDTH - 4, 5, SHARED.UI_TEXT)
  }
}
