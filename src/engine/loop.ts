export const STEP_MS = 1000 / 60
/** Never simulate more than this much wall time in one frame — see below. */
export const MAX_CATCHUP_MS = 250

export interface LoopCallbacks {
  update: () => void
  render: (frameTimeMs: number) => void
}

export interface Accumulator {
  carry: number
}

/**
 * Decide how many fixed steps a variable-length frame is worth.
 *
 * Pulled out of the rAF loop so it can be tested without a browser: the
 * clamping behaviour is the part that matters, and it is easy to get wrong.
 * Without the clamp, a backgrounded tab returning after a minute would try to
 * simulate 3,600 steps in one frame and lock the page.
 */
export function stepsFor(acc: Accumulator, elapsedMs: number): number {
  acc.carry += Math.min(Math.max(elapsedMs, 0), MAX_CATCHUP_MS)
  let steps = 0
  while (acc.carry >= STEP_MS) {
    acc.carry -= STEP_MS
    steps++
  }
  return steps
}

/**
 * Fixed timestep, decoupled render, no interpolation.
 *
 * Non-interpolating is deliberate: at 320x180 a sub-pixel smoothed sprite
 * shimmers worse than the judder it is meant to fix. Everything snaps to
 * integers at draw time instead.
 */
export function startLoop(cb: LoopCallbacks): () => void {
  const acc: Accumulator = { carry: 0 }
  let previous = performance.now()
  let running = true
  let raf = 0

  const frame = (now: number) => {
    if (!running) return
    const elapsed = now - previous
    previous = now

    const steps = stepsFor(acc, elapsed)
    for (let i = 0; i < steps; i++) cb.update()

    cb.render(elapsed)
    raf = requestAnimationFrame(frame)
  }

  raf = requestAnimationFrame(frame)
  return () => {
    running = false
    cancelAnimationFrame(raf)
  }
}
