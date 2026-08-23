import { createAnim, updateAnim } from './engine/anim.js'
import { createCamera, updateCamera } from './engine/camera.js'
import { DebugOverlay } from './engine/debug.js'
import { Keyboard } from './engine/input.js'
import { startLoop } from './engine/loop.js'
import { Renderer } from './engine/renderer.js'
import { greybox } from './content/levels/greybox.js'
import { levelDef } from './content/levels/index.js'
import { createSession, updateSession } from './game/state.js'
import { kill } from './game/player.js'
import { loadSave, recordClear, recordHighScore, writeSave, type SaveData } from './engine/save.js'

const canvas = document.getElementById('game')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#game canvas missing')

const renderer = new Renderer(canvas)
const camera = createCamera()
const debug = new DebugOverlay()
const anim = createAnim()
const keyboard = new Keyboard()
keyboard.attach(window)

// ?level=greybox reaches the Phase 1 proving ground; the campaign level is the
// default. A query parameter rather than a menu entry: the grey box is a
// development tool, not content.
const params = new URLSearchParams(window.location.search)
const requested = params.get('level')
const level = requested === null ? greybox : levelDef(requested)

const session = createSession(level)

// Progress is loaded once at boot. `writable` is false when the file was
// unreadable or came from a newer build — in both cases the game is playable
// and the existing file is left exactly as it was found.
const loaded = loadSave(window.localStorage)
let save: SaveData = loaded.data
const canWrite = loaded.writable
if (loaded.message) showToast(loaded.message)

function showToast(message: string): void {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = message
  el.hidden = false
  window.setTimeout(() => (el.hidden = true), 8_000)
}

function persist(): void {
  if (!canWrite) return
  save = recordClear(save, level.id, {
    pearls: session.world.pearls,
    seconds: session.levelFrames / 60,
  })
  save = recordHighScore(save, {
    score: session.score,
    character: save.characters.selected,
    date: new Date().toISOString().slice(0, 10),
    levelsCleared: save.progress.cleared.length,
    deaths: session.world.player.deaths,
  })
  writeSave(window.localStorage, save)
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'F1') {
    e.preventDefault()
    debug.toggle()
  }
  if (e.code === 'KeyR' && session.screen === 'playing') {
    e.preventDefault()
    session.world = createSession(level).world
    session.levelFrames = 0
    session.deathsCharged = session.world.player.deaths
  }
})

const fit = () => renderer.resize(window.innerWidth, window.innerHeight)
window.addEventListener('resize', fit)
fit()

startLoop({
  update: () => {
    const input = keyboard.snapshot()
    updateSession(session, input)
    if (session.pendingSave) {
      session.pendingSave = false
      persist()
    }
    // Animation advances on the simulation step, not the render, so a cycle
    // never speeds up on a fast display or stutters on a slow one.
    updateAnim(anim, session.world.player)
  },
  render: (frameTimeMs) => {
    debug.sample(frameTimeMs)
    updateCamera(camera, session.world.player, session.world.map)
    renderer.draw(session, camera, anim)
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
      reset: () => void
      kill: () => void
      clear: () => void
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
    session.world = createSession(level).world
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
  pearls: () => save.progress.pearls[level.id]?.filter(Boolean).length ?? 0,
}
