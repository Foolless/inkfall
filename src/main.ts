import { createAnim, updateAnim } from './engine/anim.js'
import { createCamera, updateCamera } from './engine/camera.js'
import { DebugOverlay } from './engine/debug.js'
import { Keyboard } from './engine/input.js'
import { startLoop } from './engine/loop.js'
import { Renderer } from './engine/renderer.js'
import { greybox } from './content/greybox.js'
import { createWorld, respawn, resetWorld, update } from './game/world.js'

const canvas = document.getElementById('game')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#game canvas missing')

const renderer = new Renderer(canvas)
const camera = createCamera()
const debug = new DebugOverlay()
const anim = createAnim()
const keyboard = new Keyboard()
keyboard.attach(window)

let world = createWorld(greybox)

window.addEventListener('keydown', (e) => {
  if (e.code === 'F1') {
    e.preventDefault()
    debug.toggle()
  }
  if (e.code === 'KeyR') {
    e.preventDefault()
    world = resetWorld(greybox)
  }
})

const fit = () => renderer.resize(window.innerWidth, window.innerHeight)
window.addEventListener('resize', fit)
fit()

startLoop({
  update: () => {
    const input = keyboard.snapshot()
    update(world, input)
    // Animation advances on the simulation step, not the render, so a cycle
    // never speeds up on a fast display or stutters on a slow one.
    updateAnim(anim, world.player)
    if (world.cleared) world = resetWorld(greybox)
  },
  render: (frameTimeMs) => {
    debug.sample(frameTimeMs)
    updateCamera(camera, world.player, world.map)
    renderer.draw(world, camera, anim)
    debug.draw(renderer.ctx, world, camera)
  },
})

// Exposed so the browser smoke test can drive the simulation directly rather
// than racing the render loop.
declare global {
  interface Window {
    __inkfall?: {
      frame: () => number
      tier: () => number
      ink: () => number
      reset: () => void
      kill: () => void
    }
  }
}
window.__inkfall = {
  frame: () => world.frame,
  tier: () => world.player.tier,
  ink: () => world.player.ink,
  reset: () => {
    world = resetWorld(greybox)
  },
  kill: () => {
    world.player.alive = false
    respawn(world)
  },
}
