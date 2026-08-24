import { CHARGED_TIER, DISPLAY } from '../game/constants.js'
import { Tile, tileAt, type TileId } from '../game/tilemap.js'
import { inkMax } from '../game/player.js'
import type { World } from '../game/world.js'
import type { Camera } from './camera.js'
import { frameFor, paletteFor, type Anim } from './anim.js'
import { enemyFrame } from './enemy-anim.js'
import { bubbleBox, clamState, isTelegraphing, pressureLoad } from '../game/hazards.js'
import { formatScore, formatTime, runFramesNow, type Session } from '../game/state.js'
import { ghostAt } from '../game/ghost.js'
import { SHARED } from '../content/palettes.js'
import { defaultSave, type HighScore, type Settings } from './save.js'
import { drawText, drawTextCentred, drawTextRight, textWidth } from './text.js'
import { clamp } from './camera.js'
import { createJuice, onScreen, shakeOffset, type Juice } from './juice.js'

const ZERO_SHAKE = { x: 0, y: 0 }
import {
  drawGameClear,
  drawGameOver,
  drawLevelClear,
  drawOptions,
  drawPause,
  drawScores,
  drawTitle,
  drawWorldMap,
} from './screens.js'
import { chapterOf } from '../content/chapters.js'
import { tilesetOf, type Tileset } from '../content/tilesets/index.js'
import { PICKUP_SPRITES } from '../content/sprites/pickups.js'
import { PROJECTILE_SPRITES } from '../content/sprites/projectiles.js'
import * as art from '../content/sprites/bosses.js'
import { lure, lureRadius } from '../game/enemies/index.js'
import { armLash, armsOf } from '../game/bosses/index.js'
import { HAZARDS } from '../game/constants.js'
import { ABYSS, KELP, VENTS, WRECK } from '../content/palettes.js'
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
  [Tile.CRACKED]: '#4a3f38',
  [Tile.FUSED]: '#5a3a2a',
  [Tile.MAGMA]: '#ff6b35',
  [Tile.HOT]: '#8b2c1f',
  [Tile.KNOT]: '#3d7a52',
  [Tile.CRACK]: '#2c3a30',
}

/**
 * Four bosses, four colour sets, each from its own chapter's sub-palette.
 *
 * `open` is deliberately the brightest colour any of them has: the damage
 * window is the only thing on screen a player under pressure has to find.
 */
const BOSS_COLOURS: Record<string, { body: string; rim: string; part: string; open: string }> = {
  kelpWarden: { body: KELP.SILHOUETTE, rim: KELP.KELP_MID, part: KELP.KELP_DARK, open: KELP.GOD_RAY },
  drownedCaptain: { body: WRECK.COLD_WATER, rim: WRECK.VERDIGRIS, part: WRECK.BRASS, open: WRECK.LANTERN },
  ventLord: { body: VENTS.BASALT, rim: VENTS.ROCK_RED, part: VENTS.ASH, open: VENTS.SULPHUR },
  kraken: { body: ABYSS.SHAPE, rim: ABYSS.BIO_DIM, part: ABYSS.SHAPE, open: ABYSS.BIO_MAGENTA },
  default: { body: SHARED.UI_DIM, rim: SHARED.UI_TEXT, part: SHARED.UI_DIM, open: SHARED.INK_CYAN },
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

  /** The high-score table, handed in by the host — the renderer reads no storage. */
  scores: readonly HighScore[] = []
  /** The live settings, likewise handed in rather than read. */
  settings: Settings = defaultSave().settings

  /** Render-side juice: shake and particles. Never part of the simulation. */
  juice: Juice = createJuice()

  draw(s: Session, cam: Camera, anim: Anim, pearls = 0): void {
    const { ctx } = this
    ctx.imageSmoothingEnabled = false

    if (s.screen === 'title') {
      drawTitle(ctx, s)
      return
    }
    if (s.screen === 'options') {
      drawOptions(ctx, this.settings, s.options, s.uiFrames)
      return
    }
    if (s.screen === 'scores') {
      drawScores(ctx, this.scores, s.uiFrames)
      return
    }
    if (s.screen === 'worldMap') {
      drawWorldMap(ctx, s)
      return
    }
    if (s.screen === 'gameClear') {
      drawGameClear(ctx, s, pearls)
      return
    }

    const w = s.world
    // Everything below floors its coordinates: sub-pixel state, integer pixels.
    // The shake is added to the camera *here*, in the render, so the simulation
    // never sees it — two identical input logs must produce two identical
    // worlds whether or not either of them was shaking (§12.6).
    const shake = s.screen === 'playing' ? shakeOffset(this.juice) : ZERO_SHAKE
    const ox = Math.floor(cam.x) + shake.x
    const oy = Math.floor(cam.y) + shake.y
    const set = tilesetOf(chapterOf(s.level.chapter).tileset)

    ctx.fillStyle = set?.sky ?? '#0b1116'
    ctx.fillRect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT)

    if (set) this.drawTileset(w, ox, oy, set)
    else this.drawTiles(w, ox, oy)
    this.drawRises(w, ox, oy)
    this.drawClams(w, ox, oy)
    this.drawBubbles(w, ox, oy)
    this.drawPickups(w, ox, oy)
    this.drawEnemies(w, ox, oy)
    this.drawBoss(w, ox, oy)
    this.drawProjectiles(w, ox, oy)
    // Under Nib, always: a silhouette that occludes the thing it is pacing is
    // worse than no silhouette at all.
    this.drawGhost(s, ox, oy)
    this.drawPlayer(w, ox, oy, anim)
    // The abyss, last of all: everything above is drawn and then most of it is
    // taken away again. PRD §7.6 — a 5-tile radius, and the lures.
    const dark = chapterOf(s.level.chapter).dark
    // The chapter says the world is dark; the setting says how much of it this
    // player needs to see (§13). The chapter's own value is the default, so a
    // slider left alone changes nothing.
    if (dark !== undefined) this.drawDarkness(w, ox, oy, Math.max(dark, this.settings.lightRadius))
    this.drawParticles(ox, oy)
    this.drawPressure(w)
    // Only while playing: a key hint has no business on top of a tally screen.
    if (s.screen === 'playing') this.drawHints(w, ox, oy)
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

        // Magma and superheated water are liquids and are painted, not blitted.
        if (t === Tile.MAGMA || t === Tile.HOT) {
          const heat = set.heat
          ctx.fillStyle = heat ? (t === Tile.MAGMA ? heat.magma : heat.hot) : (COLOURS[t] as string)
          ctx.fillRect(px, py, T, T)
          if (tileAt(w.map, tx, ty - 1) !== t) {
            ctx.fillStyle = heat?.crest ?? '#ffd23f'
            ctx.fillRect(px, py, T, 1)
            // Something moving on the surface, so a still frame still reads as
            // "this is liquid and it will kill you" rather than as a floor.
            ctx.fillRect(px + ((w.frame >> 2) % T), py + 1, 3, 1)
          }
          continue
        }

        if (t === Tile.CRACKED || t === Tile.FUSED || t === Tile.KNOT) {
          if (w.collapsed.has(index)) continue
          const cel = t === Tile.CRACKED ? set.cracked : t === Tile.FUSED ? set.fused : set.knot
          if (cel) drawSprite(ctx, this.sprites.get(cel), px, py)
          else {
            ctx.fillStyle = COLOURS[t] as string
            ctx.fillRect(px, py, T, T)
          }
          continue
        }

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
                : t === Tile.CRACK && set.crack
                  ? set.crack
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

  /**
   * A rising surface — the flood, the magma. Drawn as a filled region with a
   * moving line on it, because a surface with no edge does not read as rising.
   */
  private drawRises(w: World, ox: number, oy: number): void {
    const { ctx } = this
    for (const r of w.rises) {
      if (!r.armed) continue
      const y = Math.floor(r.y - oy)
      if (y > DISPLAY.HEIGHT) continue
      ctx.fillStyle = r.fluid === 'magma' ? 'rgba(255,107,53,0.82)' : 'rgba(44,62,80,0.62)'
      ctx.fillRect(0, y, DISPLAY.WIDTH, DISPLAY.HEIGHT - y)
      ctx.fillStyle = r.fluid === 'magma' ? '#ffd23f' : '#c9c2a8'
      ctx.fillRect(0, y, DISPLAY.WIDTH, 1)
      // A few crests riding the line, so it is obviously liquid and obviously
      // moving even on a frame where it has climbed less than a pixel.
      for (let i = 0; i < 8; i++) {
        const cx = ((i * 47 + (w.frame >> 1)) % (DISPLAY.WIDTH + 40)) - 20
        ctx.fillRect(cx, y - 1, 6, 1)
      }
      void ox
    }
  }

  /**
   * Bubble streams. One frame of contact and an upward carry, then they pop.
   *
   * Drawn as rings rather than discs so they read as air rather than as
   * pickups — the one thing a player must never do with a bubble is try to
   * collect it.
   */
  private drawBubbles(w: World, ox: number, oy: number): void {
    const { ctx } = this
    ctx.fillStyle = '#ddf6fb'
    for (const b of w.bubbles) {
      for (let i = 0; i < b.count; i++) {
        const box = bubbleBox(b, i)
        if (!box) continue
        const x = Math.floor(box.x - ox)
        const y = Math.floor(box.y - oy)
        ctx.fillRect(x + 2, y, 4, 1)
        ctx.fillRect(x + 2, y + 7, 4, 1)
        ctx.fillRect(x, y + 2, 1, 4)
        ctx.fillRect(x + 7, y + 2, 1, 4)
        ctx.fillRect(x + 1, y + 1, 1, 1)
        ctx.fillRect(x + 6, y + 1, 1, 1)
        ctx.fillRect(x + 1, y + 6, 1, 1)
        ctx.fillRect(x + 6, y + 6, 1, 1)
      }
    }
  }

  /** Bolts, bombs, barbs and embers. A settled ember pulses where it burns. */
  private drawProjectiles(w: World, ox: number, oy: number): void {
    const { ctx } = this
    for (const p of w.projectiles) {
      if (!p.alive) continue
      const frame = PROJECTILE_SPRITES[p.kind]
      if (!frame) continue
      const flip = p.vx < 0
      const x = Math.floor(p.x - ox + (p.w - frame.w) / 2)
      const y = Math.floor(p.y - oy + (p.h - frame.h) / 2)
      // A bomb about to go off flashes faster the closer it is, which is the
      // only warning the player gets and the only one they need.
      if (p.kind === 'bomb' && p.clock > 10 && (w.frame >> 1) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillRect(x - 1, y - 1, frame.w + 2, frame.h + 2)
      }
      drawSprite(ctx, this.sprites.get(frame, flip), x, y)
    }
  }

  /**
   * The abyss. A hole punched in a black sheet, plus a hole per lure.
   *
   * Composited rather than masked per-sprite: everything is drawn normally and
   * then covered, which means darkness costs one pass regardless of how much is
   * on screen and works identically for terrain, enemies and Nib himself.
   */
  private drawDarkness(w: World, ox: number, oy: number, radiusTiles: number): void {
    const { ctx } = this
    const p = w.player
    const holes: Array<[number, number, number]> = [
      [p.x + p.w / 2 - ox, p.y + p.h / 2 - oy, radiusTiles * T],
    ]
    for (const e of w.enemies) {
      const r = e.kind === 'lightless' ? lureRadius(e) : 0
      if (r <= 0) continue
      const l = lure(e)
      holes.push([l.x + l.w / 2 - ox, l.y + l.h / 2 - oy, r])
    }

    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = 'rgba(5,5,8,0.94)'
    ctx.beginPath()
    ctx.rect(0, 0, DISPLAY.WIDTH, DISPLAY.HEIGHT)
    for (const [cx, cy, r] of holes) {
      ctx.moveTo(cx + r, cy)
      ctx.arc(cx, cy, r, 0, Math.PI * 2, true)
    }
    ctx.fill('evenodd')
    ctx.restore()
  }

  /**
   * The pressure vignette. It closes over the last second before the crush.
   *
   * PRD §6.2: the room has to say *move* before it says *dead*. Drawn as a
   * closing frame rather than a flash, because a flash is the one thing §13's
   * accessibility rules ask for a slider on.
   */
  private drawPressure(w: World): void {
    const load = pressureLoad(w.pressure, w.player)
    const warn = 1 - HAZARDS.PRESSURE_WARN / HAZARDS.PRESSURE_FRAMES
    if (load < warn) return

    const { ctx } = this
    const k = (load - warn) / (1 - warn)
    const inset = Math.floor(k * (DISPLAY.HEIGHT / 2 - 12))
    ctx.fillStyle = `rgba(5,5,8,${0.35 + k * 0.5})`
    ctx.fillRect(0, 0, DISPLAY.WIDTH, inset)
    ctx.fillRect(0, DISPLAY.HEIGHT - inset, DISPLAY.WIDTH, inset)
    ctx.fillRect(0, 0, inset * 2, DISPLAY.HEIGHT)
    ctx.fillRect(DISPLAY.WIDTH - inset * 2, 0, inset * 2, DISPLAY.HEIGHT)
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

    if (b.id !== 'hermitKing') {
      this.drawBossParts(w, ox, oy)
      return
    }

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

  /**
   * The other four bosses, drawn from their part lists.
   *
   * No sprites: these are large shapes made of a body and its parts, and a
   * 64x48 hand-authored cel per pose would be four hundred frames of art for
   * four fights. What matters is that the *open* part is unmistakable, which is
   * what the pulse does, and that damage is visible without a health bar, which
   * is what the missing parts do — an arm that is gone is gone, and the player
   * counts what is left.
   */
  private drawBossParts(w: World, ox: number, oy: number): void {
    const { ctx } = this
    const b = w.boss
    if (!b) return

    // Dying: flicker, like the King does.
    if (b.state === 'dying' && (w.frame >> 1) % 2 === 0) return

    const palette = BOSS_COLOURS[b.id] ?? BOSS_COLOURS.default!
    const shudder = b.state === 'waking' && (w.frame >> 1) % 2 === 0 ? 1 : 0

    ctx.fillStyle = palette.body
    ctx.fillRect(Math.floor(b.x - ox) + shudder, Math.floor(b.y - oy), b.w, b.h)
    ctx.fillStyle = palette.rim
    ctx.fillRect(Math.floor(b.x - ox) + shudder, Math.floor(b.y - oy), b.w, 2)

    for (const p of b.parts) {
      if (!p.alive) continue
      // A vent is a hole in the floor and never a thing; drawing it as a block
      // would tell the player there is something there to stand on.
      const px = Math.floor(p.x - ox)
      const py = Math.floor(p.y - oy)
      ctx.fillStyle = p.kind === 'vent' ? palette.rim : palette.part
      ctx.fillRect(px, py, p.w, p.kind === 'vent' ? 2 : p.h)

      if (!p.open) continue
      // The window is the whole fight, so it is impossible to miss.
      ctx.fillStyle = (w.frame >> 2) % 2 === 0 ? palette.open : 'rgba(255,255,255,0.35)'
      ctx.fillRect(px - 1, py - 1, p.w + 2, p.h + 2)
    }

    // The Warden's arms lash; the reach changes every frame, so it is drawn
    // rather than authored, exactly like the King's cracks.
    if (b.id === 'kelpWarden') {
      ctx.fillStyle = palette.part
      for (const arm of armsOf(b)) {
        const lash = armLash(b, arm)
        if (!lash) continue
        ctx.fillRect(Math.floor(lash.x - ox), Math.floor(lash.y - oy), Math.ceil(lash.w), lash.h)
      }
    }
  }

  private drawPlayer(w: World, ox: number, oy: number, anim: Anim): void {
    const { ctx } = this
    const p = w.player
    // Invulnerability flickers, which also communicates that a hit landed.
    // Invulnerability flickers at 30 Hz, which §13's photosensitivity provision
    // caps at 3 Hz — slow enough to still read as "a hit landed" and far under
    // the threshold that matters.
    //
    // Ten frames on, ten frames off, counted rather than shifted: `>> 10` is one
    // toggle per 1,024 frames, which left Nib *entirely invisible* for about
    // half of all 90-frame invulnerability windows.
    const period = this.settings.flashReduction ? 10 : 2
    if (p.alive && p.iframes > 0 && Math.floor(w.frame / period) % 2 === 0) return

    const frame = frameFor(anim, p.tier)
    const palette = paletteFor(p.tier)

    // The sprite is larger than the hitbox by design (PRD §12.4), so it is
    // drawn centred on the box rather than aligned to it.
    const x = Math.floor(p.x - ox + (p.w - frame.w) / 2)
    const y = Math.floor(p.y - oy + (p.h - frame.h) / 2)

    if (p.dashFrames > 0) this.drawInkTrail(p, x, y, frame.w, frame.h)
    drawSprite(ctx, this.sprites.get(frame, p.facing < 0, palette), x, y)
  }

  /**
   * The personal-best ghost. PRD §8.4 — a translucent silhouette, off by default.
   *
   * A filled box rather than a sprite, and deliberately: the ghost is a
   * *position*, and drawing it in Nib's own frames invites reading it as a
   * second player. What a runner needs from it is "am I ahead or behind", which
   * a shape answers as well as a portrait and more legibly at 12 by 14.
   */
  private drawGhost(s: Session, ox: number, oy: number): void {
    if (s.screen !== 'playing') return
    const at = ghostAt(s.ghost, s.level.id, s.levelFrames)
    if (!at) return

    const { ctx } = this
    const p = s.world.player
    ctx.globalAlpha = 0.28
    ctx.fillStyle = SHARED.NIB_PALE
    ctx.fillRect(Math.floor(at.x - ox), Math.floor(at.y - oy), p.w, p.h)
    ctx.globalAlpha = 1
  }

  /**
   * Silt and ink. Two looks from one pool: silt is sand-coloured and falls,
   * ink is the player's own colour and hangs.
   */
  private drawParticles(ox: number, oy: number): void {
    const { ctx } = this
    for (const p of this.juice.particles) {
      if (!p.alive) continue
      const x = Math.floor(p.x - ox)
      const y = Math.floor(p.y - oy)
      if (!onScreen(x, y)) continue
      ctx.globalAlpha = Math.min(1, p.life / p.maxLife) * (p.kind === 0 ? 0.5 : 0.75)
      ctx.fillStyle = p.kind === 0 ? SHARED.UI_DIM : SHARED.INK_CYAN
      ctx.fillRect(x, y, 1, 1)
    }
    ctx.globalAlpha = 1
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
  /**
   * One-time key prompts, drawn at the geometry that needs them.
   *
   * The only text the game shows during play, and it is anchored to the room
   * rather than to Nib: the prompt is a caption on the thing in front of him,
   * so it should stay put while he moves.
   */
  private drawHints(w: World, ox: number, oy: number): void {
    const { ctx } = this
    for (const hint of w.hints) {
      if (hint.frames <= 0) continue
      const width = textWidth(hint.text)
      const x = clamp(Math.floor(hint.tx * T + T / 2 - ox), width / 2 + 4, DISPLAY.WIDTH - width / 2 - 4)
      const y = clamp(Math.floor(hint.ty * T - oy) - 12, 22, DISPLAY.HEIGHT - 20)

      // Fade over the last half-second rather than vanishing mid-read.
      ctx.globalAlpha = Math.min(1, hint.frames / 30)
      ctx.fillStyle = 'rgba(5,9,15,0.85)'
      ctx.fillRect(x - width / 2 - 3, y - 2, width + 6, 11)
      drawTextCentred(ctx, hint.text, x, y, SHARED.INK_CYAN)
      ctx.globalAlpha = 1
    }
  }

  private drawHud(s: Session): void {
    const { ctx } = this
    const w = s.world
    const p = w.player
    // `inkMax`, not the tier's own figure: Deep Jet adds a pip on top of the
    // tier (§8.5), and reading the tier alone hid it completely.
    const max = inkMax(p)
    const slots = Math.max(3, max)

    ctx.fillStyle = 'rgba(5,9,15,0.55)'
    ctx.fillRect(0, 0, DISPLAY.WIDTH, 16)

    // Assist Mode never spends a life, so the counter would sit at 3 forever
    // and read as a broken HUD. It says what is actually true instead.
    drawText(ctx, s.assist ? 'NIBx∞' : `NIBx${s.lives}`, 4, 5, SHARED.UI_TEXT)

    for (let i = 0; i < slots; i++) {
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

    // §8.4's timer, off unless asked for. `run` is the sum of level timers, so
    // the two clocks differ by everything spent on menus and on earlier levels.
    if (s.timerDisplay === 'level' || s.timerDisplay === 'both') {
      drawTextRight(ctx, formatTime(s.levelFrames), DISPLAY.WIDTH - 4, 5, SHARED.UI_TEXT)
    }
    if (s.timerDisplay === 'run' || s.timerDisplay === 'both') {
      const y = s.timerDisplay === 'both' ? 17 : 5
      drawTextRight(ctx, formatTime(runFramesNow(s)), DISPLAY.WIDTH - 4, y, SHARED.UI_DIM)
    }
  }
}
