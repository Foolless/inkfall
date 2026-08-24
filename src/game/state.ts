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
import { campaign, grantedBy, levelDef } from '../content/levels/index.js'
import { UPGRADE_BIT, type UpgradeId } from './upgrades.js'
import { buildMap, furthestUnlocked, moveCursor, NO_PROGRESS, type MapNode, type MapProgress } from './map.js'
import { createRecorder, finishRecording, resetRecorder, sample, type GhostRecorder, type GhostTrack } from './ghost.js'
import type { LevelDef } from '../content/levels/format.js'

export type Screen =
  | 'title'
  | 'worldMap'
  | 'scores'
  | 'options'
  | 'playing'
  | 'paused'
  | 'levelClear'
  | 'gameOver'
  | 'gameClear'

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
  /**
   * The run timer: the sum of the level timers already finished (§8.4).
   *
   * A *sum*, not a wall clock, which is the rule that makes routing the skill
   * rather than menuing — time spent on the map, on a tally or on a pause
   * screen is not in it, and neither is the time between sessions.
   */
  runFrames: number
  /**
   * The personal best for the level being played, in frames, or null.
   *
   * Snapshotted when the level starts rather than read at the end, so the
   * split is measured against the time the player walked in holding — beating
   * your PB must not move the target you were beating.
   */
  bestFrames: number | null
  /** Deaths already charged to the life counter, so one death costs one life. */
  deathsCharged: number
  /**
   * Deaths across the whole run, for the high-score table (§8.2).
   *
   * Separate from the world's count, which resets with every level, and from
   * `deathsCharged`, which is bookkeeping for the life counter.
   */
  deaths: number
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
   * Assist Mode (PRD §13). Lives never run out and there is no game over.
   *
   * On the session as well as the world because the two halves of the mode live
   * in different places: the world owns the slower enemies and the soft
   * checkpoints, and the run owns the life counter that stops going down.
   */
  assist: boolean
  /**
   * Which pearls this player has already banked, by level id.
   *
   * A function rather than a snapshot, because the session outlives any one
   * level and has to ask again when it advances. §8.3 pays a pearl once, on the
   * run that first finds it; without this a cleared level is a life farm.
   * Defaults to "none found", which is what a fresh save means.
   */
  foundPearls: (levelId: string) => readonly boolean[]
  /**
   * The world map's nodes, rebuilt from the save every time the map opens.
   *
   * Rebuilt rather than mutated because clearing a level changes three of the
   * things a node shows — locked, cleared, and the best time — and the save is
   * the authority on all three.
   */
  nodes: MapNode[]
  /** Which node the map's cursor is on. */
  cursor: number
  /**
   * This level had already been cleared when the run entered it.
   *
   * A replay returns to the map when it is finished rather than rolling into
   * the next world: somebody who went back to World 2 for a pearl wants the
   * map, not World 3 again.
   */
  replay: boolean
  /** Reads the save's progress. See `foundPearls` for why this is a function. */
  progress: () => MapProgress
  /**
   * Skip the map: the title starts `level` immediately.
   *
   * The map is the campaign's front door, so anything that is *not* campaign
   * content — the grey box, a test fixture — is entered directly, and so is a
   * level named explicitly on the debug route. Neither has a node to sit on.
   */
  direct: boolean
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
  /**
   * Set once, when the run itself is over — the game cleared, or the last
   * continue spent. Drained by the host, like `pendingSave`.
   *
   * §8.2's table is the top ten *runs*. Recording on every level clear instead
   * filled it with five partial snapshots of the same playthrough, each one
   * beating the last, so a good run pushed out nine other people's.
   */
  pendingScore: boolean
  /**
   * Set when a level was actually *finished*, as opposed to merely worth saving.
   *
   * The two are different and conflating them cost a personal best: Deep Jet
   * raises `pendingSave` mid-level so the upgrade is banked the instant it is
   * picked up (§8.5), and the host treated that as a clear — unlocking the next
   * world and writing a partial-run time in as the permanent PB.
   */
  pendingClear: boolean
  /**
   * The run being recorded, for a personal-best ghost (§8.4).
   *
   * Always recording, whether or not the ghost is switched on for *display* —
   * the setting decides whether a silhouette is drawn, not whether a time
   * worth keeping gets kept. Recording costs two rounded integers every six
   * frames.
   */
  recorder: GhostRecorder
  /**
   * A finished recording waiting to be stored, or null. Drained by the host.
   *
   * Set only when the level was finished *faster than the personal best*, so
   * the stored ghost is always the ghost of the best run.
   */
  pendingGhost: GhostTrack | null
  /** The ghost to draw, handed in by the host when the level starts. */
  ghost: GhostTrack | null
  /** The options screen's cursor. */
  options: OptionsState
  /**
   * Where the options screen came from, so backing out returns there.
   *
   * §11.1 reaches Options from both the title and the pause menu, and landing
   * on the title after adjusting the volume mid-level would throw the run away.
   */
  optionsFrom: Screen
  /**
   * What the HUD's clock shows. §8.4 makes it a setting and off by default:
   * a timer nobody asked for is a scoreboard on a game about exploring.
   */
  timerDisplay: TimerDisplay
}

export type TimerDisplay = 'off' | 'level' | 'run' | 'both'

/** Par clocks are per level; this is what an unauthored one falls back to. */
export const DEFAULT_PAR_SECONDS = 300

export interface SessionOptions {
  /** What the player already holds, from their save. */
  upgrades?: number
  /** Assist Mode, from their settings. PRD §13. */
  assist?: boolean
  /** Pearls already banked, by level id. See `Session.foundPearls`. */
  foundPearls?: (levelId: string) => readonly boolean[]
  /** The save's progress, for the world map. */
  progress?: () => MapProgress
  /** Start `level` straight from the title, with no map. See `Session.direct`. */
  direct?: boolean
  /** What the HUD's clock shows. §8.4 — off by default. */
  timerDisplay?: TimerDisplay
}

/**
 * The options screen's cursor and its one piece of modal state.
 *
 * `listening` is the row waiting for a key press, or null. It is here rather
 * than in the host because rebinding is a screen mode — every other key has to
 * stop meaning what it usually means while it is on.
 */
export interface OptionsState {
  cursor: number
  listening: string | null
}

/** A fresh save has found nothing anywhere. */
const NONE_FOUND: readonly boolean[] = []

export function createSession(level: LevelDef, options: SessionOptions = {}): Session {
  const upgrades = options.upgrades ?? 0
  const assist = options.assist ?? false
  const foundPearls = options.foundPearls ?? (() => NONE_FOUND)
  const progress = options.progress ?? (() => NO_PROGRESS)
  const nodes = buildMap(progress())
  const direct = options.direct ?? !campaign().some((d) => d.id === level.id)
  return {
    screen: 'title',
    level,
    world: createWorld(level, { upgrades, assist, found: foundPearls(level.id) }),
    lives: RULES.START_LIVES,
    continues: RULES.CONTINUES,
    score: 0,
    levelFrames: 0,
    runFrames: 0,
    bestFrames: null,
    deathsCharged: 0,
    deaths: 0,
    summary: null,
    tally: [],
    tallyClock: 0,
    noDamage: true,
    noDeath: true,
    upgrades,
    granted: [],
    assist,
    foundPearls,
    nodes,
    cursor: furthestUnlocked(nodes),
    replay: false,
    progress,
    direct,
    uiFrames: 0,
    pendingSave: false,
    pendingScore: false,
    pendingClear: false,
    recorder: createRecorder(),
    pendingGhost: null,
    ghost: null,
    timerDisplay: options.timerDisplay ?? 'off',
    options: { cursor: 0, listening: null },
    optionsFrom: 'title',
  }
}

/** Open the options screen, remembering where to go back to. */
export function openOptions(s: Session): void {
  s.optionsFrom = s.screen
  s.options = { cursor: 0, listening: null }
  s.screen = 'options'
  s.uiFrames = 0
}

/** The run total as it stands: finished levels plus the one in progress. */
export function runFramesNow(s: Session): number {
  return s.runFrames + s.levelFrames
}

/**
 * Turn Assist Mode on or off, and rebuild the world so it takes effect.
 *
 * Only legal outside a level. A run is played at one difficulty: flipping it
 * mid-level would change what the input log means halfway through, and a clear
 * that was half assisted is not a fact the tally can state honestly.
 */
export function setAssist(s: Session, on: boolean): boolean {
  if (s.screen !== 'title' && s.screen !== 'gameOver') return false
  s.assist = on
  s.world = rebuild(s, s.level, on)
  return true
}

/**
 * A fresh world for a level, carrying everything the run holds.
 *
 * One place, because there are five of them — starting a run, continuing,
 * advancing a level, toggling assist, and the host's restart key — and a
 * rebuild that forgot one of upgrades, assist or found pearls would be a bug
 * you only meet on the fourth level of a second playthrough.
 */
export function rebuild(s: Session, level: LevelDef, assist = s.assist): World {
  return createWorld(level, { upgrades: s.upgrades, assist, found: s.foundPearls(level.id) })
}

/** Confirm is Space or Z; Esc and Enter pause. Both confirm on a menu. */
function confirmed(input: InputFrame): boolean {
  return isPressed(input, Act.Jump) || isPressed(input, Act.Pause)
}

export function updateSession(s: Session, input: InputFrame): void {
  s.uiFrames++
  switch (s.screen) {
    case 'title':
      // §11.1 puts Scores on the title. One key rather than a menu: the game
      // has two things to look at from here and a cursor for two rows is
      // furniture, not navigation.
      if (isPressed(input, Act.Down)) {
        s.screen = 'scores'
        s.uiFrames = 0
        return
      }
      if (isPressed(input, Act.Up)) {
        openOptions(s)
        return
      }
      if (confirmed(input)) {
        if (s.direct) startRun(s)
        else openMap(s)
      }
      return
    case 'options':
      // Everything here is the host's: it owns the settings and the keyboard.
      // The session only holds the cursor, so that backing out lands correctly.
      return
    case 'scores':
      if (confirmed(input) && s.uiFrames > 20) s.screen = 'title'
      return
    case 'worldMap':
      stepMap(s, input)
      return
    case 'playing':
      stepLevel(s, input)
      return
    case 'paused':
      if (isPressed(input, Act.Pause)) s.screen = 'playing'
      // Quit to the map (§11.1). The level is abandoned, not failed: nothing
      // is re-locked and no continue is spent — the same terms a replay gets.
      else if (isPressed(input, Act.Down)) openMap(s)
      else if (isPressed(input, Act.Up)) openOptions(s)
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
      else endRun(s)
      return
    case 'gameClear':
      // The end of the game, and the only screen with nothing after it. A
      // confirm goes back to the title with everything earned still earned.
      if (confirmed(input) && s.uiFrames > 60) s.screen = 'title'
      return
  }
}

/**
 * Open the world map, rebuilt from whatever the save now says.
 *
 * The cursor lands on the deepest level the player may enter, which is the
 * game's continue: progress had been written to the save since Phase 2 and
 * never read back, so every session started at the tide pools regardless.
 */
export function openMap(s: Session): void {
  s.nodes = buildMap(s.progress())
  s.cursor = furthestUnlocked(s.nodes)
  s.screen = 'worldMap'
}

function stepMap(s: Session, input: InputFrame): void {
  if (isPressed(input, Act.Up)) s.cursor = moveCursor(s.nodes, s.cursor, -1)
  if (isPressed(input, Act.Down)) s.cursor = moveCursor(s.nodes, s.cursor, 1)
  if (!confirmed(input)) return

  const node = s.nodes[s.cursor]
  if (!node || !node.unlocked) return
  s.level = levelDef(node.id)
  s.replay = node.cleared
  startRun(s)
}

/**
 * Begin a fresh run at the selected level.
 *
 * Full lives, full continues, and a score of zero — including on a replay,
 * where §11.1 says the run "starts a fresh score and can set a new personal
 * best". A replay costs nothing and re-locks nothing; the only thing it can do
 * is add to what the save already holds.
 */
function startRun(s: Session): void {
  s.world = rebuild(s, s.level)
  s.lives = RULES.START_LIVES
  s.continues = RULES.CONTINUES
  s.score = 0
  s.deaths = 0
  s.runFrames = 0
  beginLevel(s)
  s.screen = 'playing'
}

/** The run is over — cleared out or played out. Its score goes on the board. */
function endRun(s: Session): void {
  s.screen = 'title'
  s.pendingScore = true
}

function beginLevel(s: Session): void {
  s.levelFrames = 0
  s.bestFrames = pbFrames(s, s.level.id)
  resetRecorder(s.recorder)
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
  s.world = rebuild(s, s.level)
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
  // Sampled after the step, so frame 0 is where the level starts rather than
  // where the player spawned one frame before being able to move.
  sample(s.recorder, w.player.x, w.player.y)

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
    // Assist Mode does not charge the life, but it still records the death.
    // The counter is what the run costs; the death is what happened, and the
    // no-death bonus has to stay honest or the tally is a different game's.
    if (!s.assist) s.lives--
    s.deaths++
    s.noDeath = false
  }
  if (!s.assist && s.lives <= 0) s.screen = 'gameOver'
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
    // Everything earned inside the level comes with it. Banking only the
    // bonuses would throw away every stomp, chain and boss hit the player made
    // — and the HUD had already shown them the points.
    levelPoints: w.score,
  }
  s.tally = clearTally(s.summary)
  s.tallyClock = 0
  s.screen = 'levelClear'

  // Only a personal best is worth keeping. A first run has nothing to beat, so
  // it always is one.
  if (s.bestFrames === null || s.levelFrames < s.bestFrames) {
    s.pendingGhost = finishRecording(s.recorder, s.level.id)
  }
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
  s.pendingClear = true
  // The run timer is the sum of the level timers (§8.4) — added here, where a
  // level is actually finished, so a level abandoned to the map adds nothing.
  s.runFrames += s.levelFrames
  s.pendingSave = true

  const grant = grantedBy(s.level.id)
  if (grant !== undefined) bankUpgrades(s, [grant])

  const order = campaign().findIndex((d) => d.id === s.level.id)
  if (order < 0) {
    // Not campaign content — the grey box. A proving ground has nothing after
    // it, so it goes back to where it was started from.
    s.screen = 'title'
    return
  }

  // A level that was already cleared before this run entered it hands back to
  // the map rather than rolling on. Somebody who went back to World 2 for a
  // pearl wants the map, not World 3 again (§11.1).
  if (s.replay) {
    openMap(s)
    return
  }

  const next = campaign()[order + 1]
  if (!next) {
    // The last world is cleared. There is nothing after this.
    s.screen = 'gameClear'
    s.uiFrames = 0
    s.pendingScore = true
    return
  }

  s.level = next
  s.world = rebuild(s, next)
  beginLevel(s)
  s.screen = 'playing'
}

/**
 * The personal best for a level, in frames, or null if it has never been run.
 *
 * Stored as seconds because that is what a save is readable as; converted here
 * because §8.4 asks for frame accuracy and a split of "−0.02" is meaningless
 * if the number it came from was rounded on the way in.
 */
export function pbFrames(s: Session, levelId: string): number | null {
  const best = s.progress().bestTimes[levelId]
  return best === undefined || best === null ? null : Math.round(best * 60)
}

/**
 * This level's split against the personal best, in frames. Negative is faster.
 *
 * Null when there is nothing to compare against — a first run has no split, and
 * showing `+0.00` for it would be a lie about a race nobody ran.
 */
export function levelSplit(s: Session): number | null {
  return s.bestFrames === null ? null : s.levelFrames - s.bestFrames
}

/** A split as `-2.31` / `+4.02`, per §8.4. Always two decimals and a sign. */
export function formatSplit(frames: number): string {
  const seconds = frames / 60
  return `${seconds < 0 ? '-' : '+'}${Math.abs(seconds).toFixed(2)}`
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
