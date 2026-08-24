import { createAnim, updateAnim } from './engine/anim.js'
import { createCamera, updateCamera } from './engine/camera.js'
import { DebugOverlay } from './engine/debug.js'
import { DEFAULT_BINDS, Keyboard } from './engine/input.js'
import { startLoop } from './engine/loop.js'
import { Renderer } from './engine/renderer.js'
import { campaign, levelDef } from './content/levels/index.js'
import { bossCameraLock } from './game/world.js'
import { createSession, nextLevel, rebuild, setAssist, updateSession } from './game/state.js'
import type { LevelDef } from './content/levels/format.js'
import { kill } from './game/player.js'
import {
  checkUnlocks,
  defaultSave,
  loadSave,
  recordClear,
  recordHighScore,
  recordUnlock,
  recordUpgrades,
  totalPearls,
  writeSave,
  type SaveData,
} from './engine/save.js'
import { loadGhost, writeGhost } from './engine/ghosts.js'
import { updateJuice } from './engine/juice.js'
import { bindsFrom, OPTION_ROWS, rebind } from './game/options.js'
import { idsOf, maskOf } from './game/upgrades.js'
import { Audio } from './engine/audio/sfx.js'
import { trackFor } from './content/music/world1.js'
import { chapterOf } from './content/chapters.js'

const canvas = document.getElementById('game')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#game canvas missing')

const renderer = new Renderer(canvas)
const camera = createCamera()
const debug = new DebugOverlay()
const anim = createAnim()
const keyboard = new Keyboard()
keyboard.attach(window)

// The campaign level is the default; ?level=greybox reaches the Phase 1
// proving ground. A query parameter rather than a menu entry, because the grey
// box is a development tool and not content.
const params = new URLSearchParams(window.location.search)
const requested = params.get('level')
const startLevel = requested === null ? campaign()[0]! : levelDef(requested)

// Progress is loaded once at boot. `writable` is false when the file was
// unreadable or came from a newer build — in both cases the game is playable
// and the existing file is left exactly as it was found.
const loaded = loadSave(window.localStorage)
let save: SaveData = loaded.data
const canWrite = loaded.writable
if (loaded.message) showToast(loaded.message)

// Upgrades are permanent (§8.5), so a run starts with whatever the save says
// this player has already earned — including on a second playthrough.
const session = createSession(startLevel, {
  upgrades: maskOf(save.progress.upgrades),
  assist: save.settings.assistMode,
  // Read live rather than snapshotted: the save is replaced on every clear,
  // and a pearl banked in World 2 must be known by the time World 2 is
  // replayed later in the same sitting.
  foundPearls: (id) => save.progress.pearls[id] ?? [],
  // The map reads the save every time it opens, so a level cleared this
  // session unlocks the next one without a reload.
  progress: () => ({
    unlocked: save.progress.unlocked,
    cleared: save.progress.cleared,
    pearls: save.progress.pearls,
    bestTimes: save.records.bestTimes[save.characters.selected] ?? {},
  }),
  // A level named on the debug route is entered directly: `?level=w03-ship`
  // means that level, not the map's idea of where the player got to.
  direct: requested !== null,
  timerDisplay: save.settings.timerDisplay,
})
const audio = new Audio()

/**
 * Audio cannot start until the player has touched something (PRD §10.4), which
 * is exactly what the title screen's "PRESS SPACE" is for. Everything before
 * that point queues nothing and simply makes no sound.
 *
 * The theme follows the *chapter*, so crossing into a new world changes the
 * track without anything here knowing which levels exist.
 */
function startAudio(): void {
  if (audio.started) return
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return
  audio.start(new Ctor())
  playChapterTheme()
}
function playChapterTheme(): void {
  if (!audio.started) return
  const track = trackFor(chapterOf(session.level.chapter).music)
  if (track) audio.playMusic(track)
}
window.addEventListener('keydown', startAudio, { once: true })
window.addEventListener('pointerdown', startAudio, { once: true })

function showToast(message: string): void {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = message
  el.hidden = false
  window.setTimeout(() => (el.hidden = true), 8_000)
}

/**
 * Bank whatever the session says is worth banking.
 *
 * Called with the level that was *just* finished, because by the time the flag
 * is seen the session has already moved on to the next one — clearing World 2
 * and finding yourself in World 3 is one frame, and the pearls belong to the
 * world behind you.
 */
function persist(finished: LevelDef, pearls: readonly boolean[], seconds: number): void {
  if (!canWrite) return

  // Upgrades first: they are the thing whose loss would cost the most, and
  // they are banked even when nothing else about the run is worth recording.
  if (session.granted.length > 0) {
    save = recordUpgrades(save, session.granted)
    session.granted.length = 0
  }

  save = recordClear(save, finished.id, { pearls, seconds })
  const next = nextLevel(finished.id)
  if (next) save = recordUnlock(save, next.id)
  // The fifteenth pearl is worth something (§8.3), and it can be the last one
  // found on any level — so this is checked on every clear, not on the last.
  save = checkUnlocks(save)
  writeSave(window.localStorage, save)
}

/**
 * Load the ghost for whatever level is about to be played, if ghosts are on.
 *
 * Read at the start of a level rather than held for the session: the player can
 * pick any level from the map, and the silhouette has to belong to the one they
 * picked. A failure to read one is not an error — it just means no ghost.
 */
function loadGhostForLevel(): void {
  session.ghost = save.settings.ghost ? loadGhost(window.localStorage, save.characters.selected, session.level.id) : null
}

/**
 * Store a ghost the session says is a personal best.
 *
 * Kept apart from `persist` because it writes to a different key for a
 * different reason: a quota error while storing a few thousand coordinates
 * must never be able to take somebody's pearls with it.
 */
function bankGhost(): void {
  const track = session.pendingGhost
  session.pendingGhost = null
  if (!track || !canWrite) return
  writeGhost(window.localStorage, save.characters.selected, track)
}

/**
 * The run's entry on the board, written once when the run ends.
 *
 * §8.2's table is the top ten *runs*. Writing on every level clear filled it
 * with five partial snapshots of the same playthrough instead.
 */
function bankScore(): void {
  if (!canWrite) return
  save = recordHighScore(save, {
    score: session.score,
    character: save.characters.selected,
    date: new Date().toISOString().slice(0, 10),
    levelsCleared: save.progress.cleared.length,
    deaths: session.deaths,
  })
  writeSave(window.localStorage, save)
}

/**
 * Everything the options screen does. §11.1 and §13.
 *
 * Driven from raw key events rather than through the action masks, for one
 * reason that decides the whole design: while a bind row is listening, *every*
 * key has to stop meaning what it usually means — including the ones that
 * would otherwise move the cursor off the row being rebound.
 */
function stepOptions(e: KeyboardEvent): boolean {
  if (session.screen !== 'options') return false
  const state = session.options

  if (state.listening !== null) {
    e.preventDefault()
    if (e.code === 'Escape') {
      state.listening = null
      return true
    }
    // Anything else becomes the binding, including keys the game already uses:
    // taking a key off whatever held it is `rebind`'s job, and refusing the
    // press would leave a player stuck on a row with no way out but Escape.
    applySettings(rebind(save.settings, state.listening.slice('bind.'.length), e.code))
    state.listening = null
    return true
  }

  const row = OPTION_ROWS[state.cursor]
  switch (e.code) {
    case 'Escape':
      session.screen = session.optionsFrom
      session.uiFrames = 0
      break
    case 'ArrowUp':
    case 'KeyW':
      state.cursor = Math.max(0, state.cursor - 1)
      break
    case 'ArrowDown':
    case 'KeyS':
      state.cursor = Math.min(OPTION_ROWS.length - 1, state.cursor + 1)
      break
    case 'ArrowLeft':
    case 'KeyA':
      if (row?.adjust) applySettings(row.adjust(save.settings, -1))
      break
    case 'ArrowRight':
    case 'KeyD':
      if (row?.adjust) applySettings(row.adjust(save.settings, 1))
      break
    case 'Space':
    case 'Enter':
      if (row?.kind === 'bind') state.listening = row.id
      else if (row?.id === 'reset') applySettings(defaultSave().settings)
      else if (row?.adjust) applySettings(row.adjust(save.settings, 1))
      break
    default:
      return false
  }
  e.preventDefault()
  return true
}

/**
 * Store a settings change and make it take effect immediately.
 *
 * Immediately matters for every row on the screen: a volume slider you cannot
 * hear, or a light radius that waits for the next level, is a control that
 * looks broken while it is working.
 */
function applySettings(next: SaveData['settings']): void {
  save = { ...save, settings: next }
  session.assist = next.assistMode
  session.timerDisplay = next.timerDisplay
  keyboard.setBinds(bindsFrom(next, DEFAULT_BINDS))
  audio.configure({ musicVolume: next.musicVolume, sfxVolume: next.sfxVolume })
  renderer.settings = next
  if (canWrite) writeSave(window.localStorage, save)
}

window.addEventListener('keydown', (e) => {
  if (stepOptions(e)) {
    // The options screen consumed it, so the simulation must not also see it.
    keyboard.flush()
    return
  }
  if (e.code === 'F1') {
    e.preventDefault()
    debug.toggle()
  }
  if (e.code === 'KeyM') {
    e.preventDefault()
    audio.toggleMute()
  }
  if (e.code === 'KeyR' && session.screen === 'playing') {
    e.preventDefault()
    session.world = rebuild(session, session.level)
    session.levelFrames = 0
    session.deathsCharged = session.world.player.deaths
  }
  // Assist Mode is a title-screen switch and a saved setting (PRD §13). On one
  // key, next to the label that names it, because the player who needs it is
  // the least likely to go hunting through a menu for it.
  //
  // `A` is also the WASD binding for Left, so this must not touch the event
  // unless it actually toggled — `setAssist` refuses anywhere but the title and
  // the game-over screen, and swallowing the key mid-level would eat a step.
  if (e.code === 'KeyA' && setAssist(session, !session.assist)) {
    e.preventDefault()
    if (!canWrite) return
    save = { ...save, settings: { ...save.settings, assistMode: session.assist } }
    writeSave(window.localStorage, save)
  }
})

// Everything the save already holds, applied before the first frame: bindings,
// volumes, the timer, the light radius, Assist Mode.
applySettings(save.settings)

const fit = () => renderer.resize(window.innerWidth, window.innerHeight)
window.addEventListener('resize', fit)
fit()

startLoop({
  update: () => {
    const input = keyboard.snapshot()
    const screenBefore = session.screen
    const levelBefore = session.level
    // Snapshot what the finishing level is owed, before the session advances.
    const owed = {
      pearls: [...session.world.pearls],
      seconds: session.levelFrames / 60,
    }

    updateSession(session, input)
    for (const cue of session.world.cues) audio.play(cue)
    if (session.screen !== screenBefore) audio.play('menu')
    if (session.pendingSave) {
      session.pendingSave = false
      persist(levelBefore, owed.pearls, owed.seconds)
    }
    if (session.pendingScore) {
      session.pendingScore = false
      bankScore()
    }
    if (session.pendingGhost) bankGhost()
    // A new world is a new chapter, and a chapter owns the music. Also on the
    // way out of the map, where the player may have picked any world at all.
    if (session.level !== levelBefore || (screenBefore === 'worldMap' && session.screen === 'playing')) {
      playChapterTheme()
    }
    // A level just started, from the map or from the level before it.
    if (session.screen === 'playing' && screenBefore !== 'playing' && screenBefore !== 'paused') {
      loadGhostForLevel()
    }
    // Animation advances on the simulation step, not the render, so a cycle
    // never speeds up on a fast display or stutters on a slow one. The juice
    // rides along for the same reason — and, unlike the animation, it is fed
    // the cues the world just raised rather than reading the world itself.
    updateAnim(anim, session.world.player)
    const p = session.world.player
    updateJuice(
      renderer.juice,
      {
        cues: session.world.cues,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        grounded: p.grounded,
        vy: p.vy,
        tier: p.tier,
        alive: p.alive,
      },
      save.settings.screenShake,
    )
  },
  render: (frameTimeMs) => {
    debug.sample(frameTimeMs)
    // Scheduled against the audio clock, not the frame: a dropped frame nobody
    // sees is a stutter everybody hears.
    audio.update()
    updateCamera(camera, session.world.player, session.world.map, bossCameraLock(session.world))
    renderer.scores = save.records.highScores
    renderer.draw(session, camera, anim, totalPearls(save))
    debug.draw(renderer.ctx, session.world, camera)
  },
})

// Exposed so the browser smoke test can drive the game directly rather than
// racing the render loop.
declare global {
  interface Window {
    __inkfall?: {
      frame: () => number
      screen: () => string
      tier: () => number
      ink: () => number
      lives: () => number
      score: () => number
      pearls: () => number
      level: () => string
      upgrades: () => string[]
      assist: () => boolean
      setAssist: (on: boolean) => boolean
      optionRows: () => string[]
      listening: () => string | null
      reset: () => void
      kill: () => void
      clear: () => void
      warp: (tx: number) => void
      audio: () => { started: boolean; playing: string | null; muted: boolean }
    }
  }
}
window.__inkfall = {
  frame: () => session.world.frame,
  screen: () => session.screen,
  tier: () => session.world.player.tier,
  ink: () => session.world.player.ink,
  lives: () => session.lives,
  score: () => session.score + session.world.score,
  reset: () => {
    session.world = rebuild(session, session.level)
    session.deathsCharged = 0
  },
  kill: () => {
    // Through kill(), not by clearing `alive`: the death tally is what charges
    // a life, and setting the flag by hand would skip it.
    kill(session.world.player)
  },
  clear: () => {
    session.world.cleared = true
  },
  // Teleport, for looking at a room without playing to it. Debug only.
  warp: (tx: number) => {
    session.world.player.x = tx * 16
    session.world.player.y = 18 * 16 - session.world.player.h
    session.world.player.vx = 0
    session.world.player.vy = 0
  },
  pearls: () => save.progress.pearls[session.level.id]?.filter(Boolean).length ?? 0,
  level: () => session.level.id,
  upgrades: () => idsOf(session.upgrades),
  assist: () => session.assist,
  setAssist: (on: boolean) => setAssist(session, on),
  optionRows: () => OPTION_ROWS.map((r) => r.id),
  listening: () => session.options.listening,
  audio: () => ({ started: audio.started, playing: audio.nowPlaying, muted: audio.muted }),
}
