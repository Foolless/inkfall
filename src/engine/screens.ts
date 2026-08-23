/**
 * Title, pause, level clear, game over.
 *
 * Enough shell to start, play, finish and restart without touching the console
 * — checkpoint 2.10's bar. Everything here is pure drawing against a `Session`;
 * the state machine that decides which one to show lives in game/state.ts and
 * is tested without a canvas.
 */

import { DISPLAY } from '../game/constants.js'
import { formatScore, formatTime, tallyRevealed, tallyShown, type Session } from '../game/state.js'
import { SHARED, SHALLOWS } from '../content/palettes.js'
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

  drawTextCentred(ctx, 'ARROWS MOVE   SPACE JUMP   X INK DASH', W / 2, 148, SHARED.UI_DIM)
  drawTextCentred(ctx, 'SHIFT RUN   ESC PAUSE   M MUTE', W / 2, 158, SHARED.UI_DIM)
}

export function drawPause(ctx: CanvasRenderingContext2D): void {
  dim(ctx)
  drawTextCentred(ctx, 'PAUSED', W / 2, 70, SHARED.UI_TEXT, { scale: 2 })
  drawTextCentred(ctx, 'ESC TO RESUME', W / 2, 100, SHARED.UI_DIM)
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
  drawTextCentred(ctx, 'LEVEL CLEAR', W / 2, 24, SHARED.INK_CYAN, { scale: 2 })

  const shown = tallyRevealed(s)
  const left = 74
  const right = W - 74
  s.tally.slice(0, shown).forEach((line, i) => {
    const y = 56 + i * 12
    drawText(ctx, line.label, left, y, SHARED.UI_TEXT)
    drawTextRight(ctx, formatScore(line.points), right, y, SHARED.SHELL)
  })

  const totalY = 56 + s.tally.length * 12 + 8
  ctx.fillStyle = SHARED.UI_DIM
  ctx.fillRect(left, totalY - 4, right - left, 1)
  drawText(ctx, 'TOTAL', left, totalY, SHARED.UI_TEXT)
  drawTextRight(ctx, formatScore(s.score + tallyShown(s)), right, totalY, SHARED.PEARL)

  drawTextCentred(ctx, `TIME ${formatTime(s.levelFrames)}`, W / 2, totalY + 18, SHARED.UI_DIM)
  if (pulse(s.tallyClock)) drawTextCentred(ctx, 'PRESS SPACE', W / 2, H - 18, SHARED.UI_TEXT)
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
