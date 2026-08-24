/**
 * Title, pause, level clear, game over.
 *
 * Enough shell to start, play, finish and restart without touching the console
 * — checkpoint 2.10's bar. Everything here is pure drawing against a `Session`;
 * the state machine that decides which one to show lives in game/state.ts and
 * is tested without a canvas.
 */

import { DISPLAY } from '../game/constants.js'
import { formatScore, formatSplit, formatTime, levelSplit, tallyRevealed, tallyShown, type Session } from '../game/state.js'
import { SHARED, SHALLOWS } from '../content/palettes.js'
import { mapTotals } from '../game/map.js'
import type { HighScore } from './save.js'
import { drawText, drawTextCentred, drawTextRight } from './text.js'

const W = DISPLAY.WIDTH
const H = DISPLAY.HEIGHT

/** Full-screen wash, so a menu over the playfield still reads. */
function dim(ctx: CanvasRenderingContext2D, alpha = 0.72): void {
  ctx.fillStyle = `rgba(5,9,15,${alpha})`
  ctx.fillRect(0, 0, W, H)
}

/** A slow pulse for "press a key" prompts. Never a hard blink — that reads as broken. */
function pulse(frame: number): boolean {
  return frame % 60 < 42
}

export function drawTitle(ctx: CanvasRenderingContext2D, s: Session): void {
  ctx.fillStyle = SHARED.VOID
  ctx.fillRect(0, 0, W, H)

  // A few bands of descending water behind the logo — the game is about going
  // down, and the title screen should say so before a word of text does.
  for (let i = 0; i < 6; i++) {
    const y = 30 + i * 24
    ctx.fillStyle = i < 2 ? SHALLOWS.SHALLOW_DEEP : i < 4 ? '#173845' : '#0d2029'
    ctx.globalAlpha = 0.35 - i * 0.04
    ctx.fillRect(0, y, W, 24)
  }
  ctx.globalAlpha = 1

  drawTextCentred(ctx, 'INKFALL', W / 2, 40, SHARED.INK_CYAN, { scale: 4, shadow: SHARED.INK_DARK })
  drawTextCentred(ctx, 'A SQUID GOES DOWN', W / 2, 84, SHARED.UI_DIM)

  if (pulse(s.uiFrames)) drawTextCentred(ctx, 'PRESS SPACE', W / 2, 116, SHARED.UI_TEXT)

  // Assist Mode is plainly labelled and never hidden in a submenu (PRD §13):
  // the person who needs it is the least likely to go looking.
  drawTextCentred(
    ctx,
    s.assist ? 'A: ASSIST ON   INFINITE LIVES' : 'A: ASSIST OFF',
    W / 2,
    132,
    s.assist ? SHARED.INK_CYAN : SHARED.UI_DIM,
  )

  drawTextCentred(ctx, 'ARROWS MOVE   SPACE JUMP   X INK DASH', W / 2, 148, SHARED.UI_DIM)
  drawTextCentred(ctx, 'SHIFT RUN   ESC PAUSE   M MUTE   \u2193 SCORES', W / 2, 158, SHARED.UI_DIM)
}

export function drawPause(ctx: CanvasRenderingContext2D): void {
  dim(ctx)
  drawTextCentred(ctx, 'PAUSED', W / 2, 70, SHARED.UI_TEXT, { scale: 2 })
  drawTextCentred(ctx, 'ESC TO RESUME', W / 2, 100, SHARED.UI_DIM)
  drawTextCentred(ctx, 'R RESTART LEVEL', W / 2, 112, SHARED.UI_DIM)
  drawTextCentred(ctx, '↓ QUIT TO MAP', W / 2, 124, SHARED.UI_DIM)
}

/**
 * The world map: a vertical descent, one node per level. PRD §11.1.
 *
 * Drawn from `s.nodes`, which is built from the level registry — so a sixth
 * level is a sixth node and nothing here changes (§12.7). The list scrolls
 * rather than being sized to five, for the same reason.
 *
 * This is where progression is meant to be *felt*, so the shape carries the
 * meaning: the line runs down the screen, the water darkens as it goes, and a
 * locked node is a rung you can see and cannot stand on.
 */
export function drawWorldMap(ctx: CanvasRenderingContext2D, s: Session): void {
  ctx.fillStyle = SHARED.VOID
  ctx.fillRect(0, 0, W, H)

  const rows = s.nodes.length
  const step = 26
  const top = 30
  // Scroll so the cursor is always on screen, however long the list becomes.
  const view = H - top - 24
  const span = Math.max(0, rows * step - view)
  const scroll = Math.min(span, Math.max(0, s.cursor * step - view / 2 + step))

  // The water, darkening with depth. Behind everything, and it is the reason
  // the map is vertical rather than a grid of boxes.
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = i < 2 ? SHALLOWS.SHALLOW_DEEP : i < 4 ? '#173845' : '#0b1a22'
    ctx.globalAlpha = 0.3 - i * 0.035
    ctx.fillRect(0, i * 26, W, 26)
  }
  ctx.globalAlpha = 1

  drawTextCentred(ctx, 'THE DESCENT', W / 2, 12, SHARED.INK_CYAN)

  const lineX = 40
  ctx.fillStyle = '#12222c'
  ctx.fillRect(lineX, top - 6, 1, Math.min(view + 12, rows * step))

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, top - 10, W, view + 16)
  ctx.clip()

  s.nodes.forEach((node, i) => {
    const y = top + i * step - scroll
    if (y < top - step || y > top + view + step) return
    const here = i === s.cursor
    const ink = node.unlocked ? (here ? SHARED.INK_CYAN : SHARED.UI_TEXT) : SHARED.UI_DIM

    // The rung. Filled once cleared, hollow while it is still ahead of you.
    ctx.fillStyle = node.unlocked ? ink : '#1b262e'
    if (node.cleared) ctx.fillRect(lineX - 3, y + 1, 7, 7)
    else {
      ctx.strokeStyle = ctx.fillStyle
      ctx.lineWidth = 1
      ctx.strokeRect(lineX - 2.5, y + 1.5, 6, 6)
    }

    if (here) drawText(ctx, '>', lineX - 16, y + 1, SHARED.INK_CYAN)
    drawText(ctx, node.unlocked ? node.name.toUpperCase() : '- - - -', lineX + 14, y + 1, ink)

    if (!node.unlocked) return
    // Pearls, and the best time if there is one. Right-aligned so the eye can
    // run down the column rather than hunting along each row.
    drawTextRight(ctx, node.pearls.map((p) => (p ? '*' : 'o')).join(''), W - 10, y + 1, SHARED.PEARL)
    if (node.bestSeconds !== null) {
      drawTextRight(ctx, formatTime(Math.round(node.bestSeconds * 60)), W - 42, y + 1, SHARED.UI_DIM)
    }
  })
  ctx.restore()

  const totals = mapTotals(s.nodes)
  drawText(ctx, `PEARLS ${totals.pearls}/${totals.pearlsPossible}`, 10, H - 12, SHARED.PEARL)
  drawTextRight(ctx, pulse(s.uiFrames) ? 'SPACE TO DIVE' : '', W - 10, H - 12, SHARED.UI_TEXT)
}

/**
 * The local high-score table. PRD §8.2 and §11.1's "Scores".
 *
 * Ten runs, and the fields §8.2 names: score, character, date, levels cleared,
 * deaths. One row per *run*, which is the thing the table is a table of — an
 * entry per level clear would fill it with five snapshots of one playthrough.
 *
 * An empty table says so rather than drawing ten blank rows, because ten empty
 * rows read as a rendering bug and one sentence reads as an invitation.
 */
export function drawScores(ctx: CanvasRenderingContext2D, scores: readonly HighScore[], frame: number): void {
  ctx.fillStyle = SHARED.VOID
  ctx.fillRect(0, 0, W, H)
  drawTextCentred(ctx, 'HIGH SCORES', W / 2, 14, SHARED.INK_CYAN)

  if (scores.length === 0) {
    drawTextCentred(ctx, 'NOTHING HERE YET', W / 2, 80, SHARED.UI_DIM)
    drawTextCentred(ctx, 'FINISH A RUN TO PUT SOMETHING ON IT', W / 2, 94, SHARED.UI_DIM)
  } else {
    const top = 34
    const step = 12
    scores.slice(0, 10).forEach((entry, i) => {
      const y = top + i * step
      const ink = i === 0 ? SHARED.PEARL : SHARED.UI_TEXT
      drawText(ctx, `${i + 1}`.padStart(2, ' '), 12, y, SHARED.UI_DIM)
      drawText(ctx, formatScore(entry.score), 30, y, ink)
      drawText(ctx, entry.character.toUpperCase(), 108, y, SHARED.UI_DIM)
      drawText(ctx, `L${entry.levelsCleared}`, 152, y, SHARED.SHELL)
      drawText(ctx, `D${entry.deaths}`, 176, y, SHARED.UI_DIM)
      drawTextRight(ctx, entry.date, W - 10, y, SHARED.UI_DIM)
    })
  }

  if (pulse(frame)) drawTextCentred(ctx, 'SPACE TO GO BACK', W / 2, H - 12, SHARED.UI_TEXT)
}

/**
 * The itemised tally, counting up one line at a time.
 *
 * PRD §8.2 calls the count-up 60% of the reward, which is why the lines arrive
 * one at a time rather than all at once — and why a confirm skips to the total
 * instead of being ignored. It is a reward the first time and a wait the tenth.
 */
export function drawLevelClear(ctx: CanvasRenderingContext2D, s: Session): void {
  dim(ctx, 0.82)
  drawTextCentred(ctx, 'LEVEL CLEAR', W / 2, 18, SHARED.INK_CYAN, { scale: 2 })

  const shown = tallyRevealed(s)
  const left = 74
  const right = W - 74
  const top = 44
  const step = 11

  s.tally.slice(0, shown).forEach((line, i) => {
    const y = top + i * step
    drawText(ctx, line.label, left, y, SHARED.UI_TEXT)
    drawTextRight(ctx, formatScore(line.points), right, y, SHARED.SHELL)
  })

  const totalY = top + s.tally.length * step + 10
  ctx.fillStyle = SHARED.UI_DIM
  ctx.fillRect(left, totalY - 4, right - left, 1)
  drawText(ctx, 'TOTAL', left, totalY, SHARED.UI_TEXT)
  drawTextRight(ctx, formatScore(s.score + tallyShown(s)), right, totalY, SHARED.PEARL)

  drawText(ctx, 'TIME', left, totalY + 14, SHARED.UI_DIM)
  drawTextRight(ctx, formatTime(s.levelFrames), right, totalY + 14, SHARED.UI_DIM)

  // The split against the personal best (§8.4). Green for faster, red for
  // slower, and nothing at all on a first run — there is no race to report.
  const split = levelSplit(s)
  if (split !== null) {
    drawTextRight(ctx, formatSplit(split), right, totalY + 25, split <= 0 ? '#7fd67f' : '#e0705c')
  } else if (s.bestFrames === null) {
    drawTextRight(ctx, 'FIRST RUN', right, totalY + 25, SHARED.UI_DIM)
  }

  if (pulse(s.tallyClock)) drawTextCentred(ctx, 'PRESS SPACE', W / 2, H - 12, SHARED.UI_TEXT)
}

/**
 * The end of the game. The only screen with nothing after it.
 *
 * Deliberately quiet: a total, a pearl count, and the water it took to get
 * here. §11.3 gives the game almost no words and this is not the place to
 * start spending them.
 */
export function drawGameClear(ctx: CanvasRenderingContext2D, s: Session, pearls: number): void {
  ctx.fillStyle = SHARED.VOID
  ctx.fillRect(0, 0, W, H)

  // The descent, run backwards: the surface at the top, the abyss at the
  // bottom, and the whole of it behind the words.
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i < 2 ? '#0d2029' : i < 4 ? '#173845' : SHALLOWS.SHALLOW_DEEP
    ctx.globalAlpha = 0.1 + i * 0.05
    ctx.fillRect(0, i * 30, W, 30)
  }
  ctx.globalAlpha = 1

  drawTextCentred(ctx, 'THE ABYSS IS BEHIND YOU', W / 2, 40, SHARED.INK_CYAN, { scale: 1 })
  drawTextCentred(ctx, `SCORE ${formatScore(s.score)}`, W / 2, 70, SHARED.UI_TEXT, { scale: 2 })
  drawTextCentred(ctx, `PEARLS ${pearls} OF 15`, W / 2, 96, SHARED.PEARL)
  drawTextCentred(ctx, `TIME ${formatTime(s.levelFrames)}`, W / 2, 110, SHARED.UI_DIM)

  // The true ending (§8.3): what the fifteen pearls were for. Four short lines,
  // because §11.3 gives the game almost no words and this is not the place to
  // start spending them.
  if (pearls >= 15) {
    drawTextCentred(ctx, 'YOU CARRIED THEM ALL BACK UP', W / 2, 126, SHARED.PEARL)
    drawTextCentred(ctx, 'FIFTEEN LIGHTS. FIFTEEN NAMES.', W / 2, 138, SHARED.UI_DIM)
  } else {
    drawTextCentred(ctx, 'SOMETHING IS STILL DOWN THERE', W / 2, 132, SHARED.UI_DIM)
  }
  // §13: an assist run is stamped, never blocked. It says what the run was, in
  // the same breath as saying it was finished, and it is not an asterisk.
  if (s.assist) drawTextCentred(ctx, 'ASSIST', W / 2, 122, SHARED.UI_DIM)
  if (pulse(s.uiFrames)) drawTextCentred(ctx, 'PRESS SPACE', W / 2, H - 16, SHARED.UI_TEXT)
}

export function drawGameOver(ctx: CanvasRenderingContext2D, s: Session): void {
  dim(ctx, 0.88)
  drawTextCentred(ctx, 'GAME OVER', W / 2, 52, '#e0705c', { scale: 2 })
  drawTextCentred(ctx, `SCORE ${formatScore(s.score + s.world.score)}`, W / 2, 88, SHARED.UI_TEXT)

  if (s.continues > 0) {
    drawTextCentred(ctx, `CONTINUES ${s.continues}`, W / 2, 106, SHARED.UI_DIM)
    if (pulse(s.uiFrames)) drawTextCentred(ctx, 'PRESS SPACE TO CONTINUE', W / 2, 128, SHARED.UI_TEXT)
  } else {
    drawTextCentred(ctx, 'NO CONTINUES LEFT', W / 2, 106, SHARED.UI_DIM)
    if (pulse(s.uiFrames)) drawTextCentred(ctx, 'PRESS SPACE', W / 2, 128, SHARED.UI_TEXT)
  }
}
