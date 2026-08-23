/**
 * The screen state machine and the run that survives across levels.
 *
 * Everything above a single level lives here: lives, continues, the running
 * score, the pause, the death accounting, the level-clear tally. It is a plain
 * function of `(state, input)` with no DOM and no clock, so the whole flow —
 * start, die three times, game over, continue, clear — is unit-testable without
 * a browser and replays deterministically alongside the world it wraps.
 */

import { Act, isPressed, type InputFrame } from '../engine/input.js'
import { RULES } from './constants.js'
import { clearTally, tallyTotal, type ClearSummary, type TallyLine } from './score.js'
import { createWorld, update as updateWorld, type World } from './world.js'
import type { LevelDef } from '../content/levels/format.js'

export type Screen = 'title' | 'playing' | 'paused' | 'levelClear' | 'gameOver'

/** How many frames the tally holds between lines as it counts up. */
export const TALLY_LINE_FRAMES = 24

export interface Session {
  screen: Screen
  level: LevelDef
  world: World
  lives: number
  continues: number
  /** The run's score. Survives a death and a continue; a new run resets it. */
  score: number
  /**
   * Frames elapsed in the current level.
   *
   * Starts on the first frame Nib is controllable and stops on the exit
   * trigger. Deaths do not stop it and the boss is inside it (PRD §8.4) — the
   * clock is part of what a death costs.
   */
  levelFrames: number
  /** Deaths already charged to the life counter, so one death costs one life. */
  deathsCharged: number
  summary: ClearSummary | null
  tally: readonly TallyLine[]
  /** Frames since the tally started, driving the count-up. */
  tallyClock: number
  /** True until Nib takes his first hit this level. Worth 5,000. */
  noDamage: boolean
  noDeath: boolean
  /**
   * Frames since the session began, ticking on every screen.
   *
   * Menus need a clock and the world's does not run on the title, so this is
   * the one the prompts pulse against. Not the level clock: nothing a player
   * does on a menu may ever cost them time.
   */
  uiFrames: number
}

/** Par clocks are per level; this is what an unauthored one falls back to. */
export const DEFAULT_PAR_SECONDS = 300

export function createSession(level: LevelDef): Session {
  return {
    screen: 'title',
    level,
    world: createWorld(level),
    lives: RULES.START_LIVES,
    continues: RULES.CONTINUES,
    score: 0,
    levelFrames: 0,
    deathsCharged: 0,
    summary: null,
    tally: [],
    tallyClock: 0,
    noDamage: true,
    noDeath: true,
    uiFrames: 0,
  }
}

/** Confirm is Space or Z; Esc and Enter pause. Both confirm on a menu. */
function confirmed(input: InputFrame): boolean {
  return isPressed(input, Act.Jump) || isPressed(input, Act.Pause)
}

export function updateSession(s: Session, input: InputFrame): void {
  s.uiFrames++
  switch (s.screen) {
    case 'title':
      if (confirmed(input)) startRun(s)
      return
    case 'playing':
      stepLevel(s, input)
      return
    case 'paused':
      if (isPressed(input, Act.Pause)) s.screen = 'playing'
      return
    case 'levelClear':
      s.tallyClock++
      // Confirm skips straight to the total rather than sitting through it —
      // the count-up is a reward the first time and a wait the tenth.
      if (confirmed(input) && s.tallyClock > TALLY_LINE_FRAMES) finishLevel(s)
      return
    case 'gameOver':
      if (!confirmed(input)) return
      if (s.continues > 0) useContinue(s)
      else s.screen = 'title'
      return
  }
}

function startRun(s: Session): void {
  s.world = createWorld(s.level)
  s.lives = RULES.START_LIVES
  s.continues = RULES.CONTINUES
  s.score = 0
  beginLevel(s)
  s.screen = 'playing'
}

function beginLevel(s: Session): void {
  s.levelFrames = 0
  s.deathsCharged = 0
  s.summary = null
  s.tally = []
  s.tallyClock = 0
  s.noDamage = true
  s.noDeath = true
}

/**
 * A continue restarts the current level from its start with three lives and no
 * shells (PRD §4.5). The score stays: it belongs to the run, and the shells
 * being reset is what the continue actually costs.
 */
function useContinue(s: Session): void {
  s.continues--
  s.world = createWorld(s.level)
  s.lives = RULES.START_LIVES
  beginLevel(s)
  s.screen = 'playing'
}

function stepLevel(s: Session, input: InputFrame): void {
  if (isPressed(input, Act.Pause)) {
    s.screen = 'paused'
    return
  }

  const w = s.world
  const tierBefore = w.player.tier

  updateWorld(w, input)
  s.levelFrames++

  // Shells and pearls pay out in lives; the world counts them, the run banks them.
  if (w.livesOwed > 0) {
    s.lives += w.livesOwed
    w.livesOwed = 0
  }

  if (w.player.tier < tierBefore) s.noDamage = false

  chargeDeaths(s)
  if (s.screen !== 'playing') return

  if (w.cleared) clearLevel(s)
}

/**
 * One death, one life.
 *
 * The world respawns Nib on its own after the death animation, so the session
 * cannot watch for "alive went false" — by the time it looks, he may be alive
 * again. It counts the world's own death tally instead, which is monotonic and
 * cannot miss one.
 */
function chargeDeaths(s: Session): void {
  const deaths = s.world.player.deaths
  while (s.deathsCharged < deaths) {
    s.deathsCharged++
    s.lives--
    s.noDeath = false
  }
  if (s.lives <= 0) s.screen = 'gameOver'
}

function clearLevel(s: Session): void {
  const w = s.world
  const par = s.level.par ?? DEFAULT_PAR_SECONDS
  s.summary = {
    secondsRemaining: par - s.levelFrames / 60,
    shells: w.shells,
    pearlsFound: w.pearls.filter(Boolean).length,
    bossDefeated: s.level.boss !== undefined,
    noDamage: s.noDamage,
    noDeath: s.noDeath,
  }
  s.tally = clearTally(s.summary)
  s.tallyClock = 0
  s.screen = 'levelClear'
}

function finishLevel(s: Session): void {
  s.score += tallyTotal(s.tally)
  // One level in Phase 2, so clearing it ends the run. The world map picks this
  // up in Phase 4 and sends the player to the next node instead.
  s.screen = 'title'
}

/** How many tally lines have counted up so far. */
export function tallyRevealed(s: Session): number {
  return Math.min(s.tally.length, Math.floor(s.tallyClock / TALLY_LINE_FRAMES) + 1)
}

/** The running total as the tally counts up, for the screen to render. */
export function tallyShown(s: Session): number {
  return tallyTotal(s.tally.slice(0, tallyRevealed(s)))
}

/** Level time as `M:SS`, for the HUD and the clear screen. */
export function formatTime(frames: number): string {
  const total = Math.floor(frames / 60)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Scores read with thousands separators — 84,300 rather than 84300.
 *
 * Grouped by hand rather than through `toLocaleString`, which would make the
 * HUD depend on the host's locale and on whether Node was built with full ICU.
 * A score that renders differently on two machines is not a score.
 */
export function formatScore(score: number): string {
  const sign = score < 0 ? '-' : ''
  const digits = String(Math.abs(Math.trunc(score)))
  let out = ''
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ','
    out += digits[i]
  }
  return sign + out
}
