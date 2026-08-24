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
import { campaign, grantedBy } from '../content/levels/index.js'
import { UPGRADE_BIT, type UpgradeId } from './upgrades.js'
import type { LevelDef } from '../content/levels/format.js'

export type Screen = 'title' | 'playing' | 'paused' | 'levelClear' | 'gameOver' | 'gameClear'

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
   * Permanent upgrades this run holds, as a bitmask (§8.5).
   *
   * On the session rather than on the world, because they outlive the level:
   * a continue rebuilds the world from scratch and the Cling you earned two
   * worlds ago has to survive that.
   */
  upgrades: number
  /**
   * Upgrades earned since the last save, waiting to be written.
   *
   * Drained by the host, like `pendingSave` — the state machine flags, and
   * something outside it touches storage.
   */
  granted: UpgradeId[]
  /**
   * Frames since the session began, ticking on every screen.
   *
   * Menus need a clock and the world's does not run on the title, so this is
   * the one the prompts pulse against. Not the level clock: nothing a player
   * does on a menu may ever cost them time.
   */
  uiFrames: number
  /**
   * Set when there is progress worth persisting.
   *
   * The session never touches storage itself — it flags, and the host writes.
   * That keeps the state machine a pure function and keeps `localStorage` out
   * of the replay path entirely.
   */
  pendingSave: boolean
}

/** Par clocks are per level; this is what an unauthored one falls back to. */
export const DEFAULT_PAR_SECONDS = 300

export interface SessionOptions {
  /** What the player already holds, from their save. */
  upgrades?: number
}

export function createSession(level: LevelDef, options: SessionOptions = {}): Session {
  const upgrades = options.upgrades ?? 0
  return {
    screen: 'title',
    level,
    world: createWorld(level, { upgrades }),
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
    upgrades,
    granted: [],
    uiFrames: 0,
    pendingSave: false,
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
    case 'gameClear':
      // The end of the game, and the only screen with nothing after it. A
      // confirm goes back to the title with everything earned still earned.
      if (confirmed(input) && s.uiFrames > 60) s.screen = 'title'
      return
  }
}

function startRun(s: Session): void {
  s.world = createWorld(s.level, { upgrades: s.upgrades })
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
  s.world = createWorld(s.level, { upgrades: s.upgrades })
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

  // Deep Jet is banked the instant it is picked up, not on the level clear.
  // Dying with it in your hand and losing it would be the single worst thing
  // this game could do to someone, and §7.6 B2 is a third of the way through
  // the last level.
  bankUpgrades(s, w.earned)

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

/**
 * Move earned upgrades from the world into the run, once each.
 *
 * The world raises them and the session banks them; nothing here writes to
 * storage. Draining the list rather than reading it means a respawn cannot
 * grant the same nodule twice.
 */
function bankUpgrades(s: Session, earned: UpgradeId[]): void {
  if (earned.length === 0) return
  for (const id of earned) {
    if ((s.upgrades & UPGRADE_BIT[id]) !== 0) continue
    s.upgrades |= UPGRADE_BIT[id]
    s.granted.push(id)
  }
  earned.length = 0
  s.pendingSave = true
}

/**
 * The level is banked. Grant its upgrade and go to the next one.
 *
 * The chain is data: `grantedBy` and the campaign order decide what the player
 * walks out with and where they walk to, so a sixth level is an entry in the
 * registry and nothing else (§12.7's no-per-level-code rule).
 *
 * A level outside the campaign — the grey box — simply returns to the title.
 * It is a proving ground, not content, and it grants nothing.
 */
function finishLevel(s: Session): void {
  s.score += tallyTotal(s.tally)
  s.pendingSave = true

  const grant = grantedBy(s.level.id)
  if (grant !== undefined) bankUpgrades(s, [grant])

  const order = campaign().findIndex((d) => d.id === s.level.id)
  if (order < 0) {
    s.screen = 'title'
    return
  }

  const next = campaign()[order + 1]
  if (!next) {
    // The last world is cleared. There is nothing after this.
    s.screen = 'gameClear'
    s.uiFrames = 0
    return
  }

  s.level = next
  s.world = createWorld(next, { upgrades: s.upgrades })
  beginLevel(s)
  s.screen = 'playing'
}

/** The next level in the campaign, or null at the end of the game. */
export function nextLevel(id: string): LevelDef | null {
  const order = campaign().findIndex((d) => d.id === id)
  if (order < 0) return null
  return campaign()[order + 1] ?? null
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
