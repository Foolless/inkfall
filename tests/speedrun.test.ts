import { describe, expect, test } from 'vitest'
import { Act, frameFromMasks } from '../src/engine/input.js'
import { RULES } from '../src/game/constants.js'
import {
  createSession,
  formatSplit,
  levelSplit,
  pbFrames,
  runFramesNow,
  updateSession,
  type Session,
} from '../src/game/state.js'
import { campaign } from '../src/content/levels/index.js'
import { NO_PROGRESS, type MapProgress } from '../src/game/map.js'
import {
  createRecorder,
  finishRecording,
  ghostAt,
  GHOST_INTERVAL,
  GHOST_MAX_SAMPLES,
  isTrack,
  resetRecorder,
  sample,
} from '../src/game/ghost.js'
import { clearGhost, ghostKey, loadGhost, writeGhost } from '../src/engine/ghosts.js'
import { kill } from '../src/game/player.js'
import { levelFrom } from './helpers.js'

/**
 * Speedrun timers, splits and ghosts. PLAN.md checkpoint 4.3, whose proof is
 * stated as "timer rule tests: boss fights counted, menus excluded, deaths
 * don't stop the clock".
 *
 * §8.4 writes those rules into Options "so the community doesn't have to
 * guess", which means they are a promise rather than an implementation detail.
 * Each one gets a test naming it.
 */

const LEVEL = levelFrom(['S........E', '##########'], 'timed')

class Play {
  private prev = 0
  constructor(readonly s: Session) {}
  step(held = 0, count = 1): this {
    for (let i = 0; i < count; i++) {
      updateSession(this.s, frameFromMasks(held, this.prev))
      this.prev = held
    }
    return this
  }
  tap(mask: number): this {
    updateSession(this.s, frameFromMasks(mask, this.prev & ~mask))
    this.prev = mask
    return this.step(0)
  }
  /**
   * Exactly one update, with no release frame after it.
   *
   * These tests measure frames, so a helper that quietly runs a second update
   * puts every expectation one out — precisely the error a timer test exists
   * not to have.
   */
  single(mask = 0): this {
    updateSession(this.s, frameFromMasks(mask, this.prev & ~mask))
    this.prev = mask
    return this
  }
  /** Reach the exit and confirm past the tally. */
  finish(): this {
    this.s.world.cleared = true
    this.step(0)
    this.step(0, 40)
    return this.tap(Act.Jump)
  }
}

function started(progress: MapProgress = NO_PROGRESS): Play {
  const s = createSession(LEVEL, { progress: () => progress })
  const p = new Play(s)
  p.single(Act.Jump)
  expect(s.screen).toBe('playing')
  expect(s.levelFrames).toBe(0)
  return p
}

describe('the timing rules §8.4 puts in Options', () => {
  test('the level clock starts at zero and runs while playing', () => {
    const p = started()
    expect(p.s.levelFrames).toBe(0)
    p.step(0, 30)
    expect(p.s.levelFrames).toBe(30)
  })

  /** A death costs you the time it is worth. That is the whole point of it. */
  test('deaths do not stop the level clock', () => {
    const p = started()
    p.step(0, 10)
    kill(p.s.world.player)
    p.step(0, RULES.DEATH_ANIM_FRAMES + 10)
    expect(p.s.levelFrames).toBe(10 + RULES.DEATH_ANIM_FRAMES + 10)
  })

  test('a pause does not advance it', () => {
    const p = started()
    p.step(0, 20)
    p.tap(Act.Pause)
    expect(p.s.screen).toBe('paused')
    const at = p.s.levelFrames
    p.step(0, 60)
    expect(p.s.levelFrames).toBe(at)
  })

  test('the tally does not advance it either', () => {
    const p = started()
    p.step(0, 20)
    p.s.world.cleared = true
    p.step(0)
    expect(p.s.screen).toBe('levelClear')
    const at = p.s.levelFrames
    p.step(0, 60)
    expect(p.s.levelFrames).toBe(at)
  })

  /**
   * The run timer is the *sum of level timers*, not a wall clock — which is
   * what makes routing the skill rather than menuing.
   */
  test('the run timer is the sum of finished levels, and menus are not in it', () => {
    const p = started()
    p.step(0, 100)
    expect(p.s.runFrames).toBe(0)
    expect(runFramesNow(p.s)).toBe(100)

    p.finish()
    expect(p.s.runFrames).toBe(101) // the frame the exit was touched counts
    // Back on the title with the fixture level; time here is nobody's.
    const at = p.s.runFrames
    p.step(0, 120)
    expect(p.s.runFrames).toBe(at)
  })

  test('a fresh run starts the run clock again', () => {
    const p = started()
    p.step(0, 50).finish()
    expect(p.s.runFrames).toBeGreaterThan(0)
    p.tap(Act.Jump)
    expect(p.s.screen).toBe('playing')
    expect(p.s.runFrames).toBe(0)
  })
})

describe('splits against the personal best', () => {
  const best: MapProgress = { ...NO_PROGRESS, bestTimes: { timed: 10 } } // 600 frames

  test('a first run has no split rather than a fake one', () => {
    const p = started()
    expect(p.s.bestFrames).toBeNull()
    expect(levelSplit(p.s)).toBeNull()
  })

  test('the PB is read in frames, from seconds', () => {
    const p = started(best)
    expect(pbFrames(p.s, 'timed')).toBe(600)
    expect(p.s.bestFrames).toBe(600)
  })

  test('faster is negative, slower is positive', () => {
    const fast = started(best)
    fast.step(0, 500)
    expect(levelSplit(fast.s)).toBe(-100)

    const slow = started(best)
    slow.step(0, 700)
    expect(levelSplit(slow.s)).toBe(100)
  })

  /** §8.4's own format: `−2.31` and `+4.02`. Two decimals, always signed. */
  test('it formats the way §8.4 writes it', () => {
    expect(formatSplit(-139)).toBe('-2.32')
    expect(formatSplit(241)).toBe('+4.02')
    expect(formatSplit(0)).toBe('+0.00')
  })

  /**
   * Snapshotted when the level starts, not read at the end — beating your PB
   * must not move the target you were beating.
   */
  test('the PB does not move underneath a run that is beating it', () => {
    let times: Record<string, number | null> = { timed: 10 }
    const s = createSession(LEVEL, { progress: () => ({ ...NO_PROGRESS, bestTimes: times }) })
    new Play(s).single(Act.Jump).step(0, 100)
    times = { timed: 1 } // something else wrote a better time mid-level
    expect(s.bestFrames).toBe(600)
    expect(levelSplit(s)).toBe(-500)
  })
})

describe('the ghost recorder', () => {
  test('samples once every interval, and nothing in between', () => {
    const r = createRecorder()
    for (let i = 0; i < GHOST_INTERVAL * 3; i++) sample(r, i, i * 2)
    expect(r.points).toEqual([0, 0, GHOST_INTERVAL, GHOST_INTERVAL * 2, GHOST_INTERVAL * 2, GHOST_INTERVAL * 4])
  })

  test('positions are rounded to whole pixels', () => {
    const r = createRecorder()
    sample(r, 10.4, 20.6)
    expect(r.points).toEqual([10, 21])
  })

  /** A player who parks on a checkpoint and goes to lunch gets a hard stop. */
  test('it stops recording at the cap rather than growing forever', () => {
    const r = createRecorder()
    for (let i = 0; i < (GHOST_MAX_SAMPLES + 50) * GHOST_INTERVAL; i++) sample(r, i, i)
    expect(r.points.length / 2).toBe(GHOST_MAX_SAMPLES)
    // The frame count keeps going, so the recorded run still knows how long it was.
    expect(r.frames).toBe((GHOST_MAX_SAMPLES + 50) * GHOST_INTERVAL)
  })

  test('resetting clears it completely', () => {
    const r = createRecorder()
    sample(r, 1, 1)
    resetRecorder(r)
    expect(r).toEqual(createRecorder())
  })
})

describe('playing a ghost back', () => {
  const track = { level: 'timed', frames: 30, points: [0, 0, 10, 5, 20, 10, 30, 15, 40, 20] }

  test('frame zero is the first sample', () => {
    expect(ghostAt(track, 'timed', 0)).toEqual({ x: 0, y: 0 })
  })

  test('it advances one sample per interval', () => {
    expect(ghostAt(track, 'timed', GHOST_INTERVAL)).toEqual({ x: 10, y: 5 })
    expect(ghostAt(track, 'timed', GHOST_INTERVAL * 2)).toEqual({ x: 20, y: 10 })
  })

  /**
   * Held at the exit rather than vanishing. A player who is behind their PB
   * should see the silhouette waiting for them, which is the most useful thing
   * it can tell them.
   */
  test('a finished ghost waits at its last position', () => {
    expect(ghostAt(track, 'timed', 100_000)).toEqual({ x: 40, y: 20 })
  })

  test('a ghost from another level is never drawn', () => {
    expect(ghostAt(track, 'w01-tidepools', 0)).toBeNull()
    expect(ghostAt(null, 'timed', 0)).toBeNull()
    expect(ghostAt({ ...track, points: [] }, 'timed', 0)).toBeNull()
  })
})

describe('a ghost is only kept when it is a personal best', () => {
  test('a first run always is one', () => {
    const p = started()
    p.step(0, 50)
    p.s.world.cleared = true
    p.step(0)
    expect(p.s.pendingGhost).not.toBeNull()
    expect(p.s.pendingGhost!.level).toBe('timed')
  })

  test('a slower run is not', () => {
    const p = started({ ...NO_PROGRESS, bestTimes: { timed: 1 } }) // 60 frames
    p.step(0, 200)
    p.s.world.cleared = true
    p.step(0)
    expect(p.s.pendingGhost).toBeNull()
  })

  test('a faster one replaces it', () => {
    const p = started({ ...NO_PROGRESS, bestTimes: { timed: 10 } }) // 600 frames
    p.step(0, 100)
    p.s.world.cleared = true
    p.step(0)
    expect(p.s.pendingGhost).not.toBeNull()
    expect(p.s.pendingGhost!.frames).toBeGreaterThan(0)
  })

  test('the recording restarts with the level', () => {
    const p = started()
    p.step(0, 60)
    expect(p.s.recorder.points.length).toBeGreaterThan(0)
    p.finish()
    p.tap(Act.Jump) // a new run at the same fixture level
    expect(p.s.recorder.points.length).toBeLessThanOrEqual(2)
  })
})

describe('ghost storage keeps away from the progress save', () => {
  class Mem implements Record<string, unknown> {
    [key: string]: unknown
    private data = new Map<string, string>()
    getItem(k: string): string | null {
      return this.data.get(k) ?? null
    }
    setItem(k: string, v: string): void {
      this.data.set(k, v)
    }
    removeItem(k: string): void {
      this.data.delete(k)
    }
    keys(): string[] {
      return [...this.data.keys()]
    }
  }

  const track = finishRecording((() => {
    const r = createRecorder()
    for (let i = 0; i < 60; i++) sample(r, i, i)
    return r
  })(), 'w01-tidepools')

  test('it writes under its own key, never the save key', () => {
    const store = new Mem()
    expect(writeGhost(store, 'nib', track)).toBe(true)
    expect(store.keys()).toEqual([ghostKey('nib', 'w01-tidepools')])
    expect(store.getItem('inkfall.save.v1')).toBeNull()
  })

  test('it round-trips', () => {
    const store = new Mem()
    writeGhost(store, 'nib', track)
    expect(loadGhost(store, 'nib', 'w01-tidepools')).toEqual(track)
  })

  test('each character keeps their own', () => {
    const store = new Mem()
    writeGhost(store, 'nib', track)
    expect(loadGhost(store, 'octo', 'w01-tidepools')).toBeNull()
  })

  /** A ghost is never worth a crash, so every bad blob is simply not drawn. */
  test('junk, truncation and the wrong level all read as no ghost', () => {
    const store = new Mem()
    store.setItem(ghostKey('nib', 'w01-tidepools'), 'not json at all')
    expect(loadGhost(store, 'nib', 'w01-tidepools')).toBeNull()

    store.setItem(ghostKey('nib', 'w02-kelp'), JSON.stringify({ level: 'w02-kelp', frames: 1, points: [1] }))
    expect(loadGhost(store, 'nib', 'w02-kelp')).toBeNull()

    store.setItem(ghostKey('nib', 'w03-ship'), JSON.stringify({ ...track }))
    expect(loadGhost(store, 'nib', 'w03-ship')).toBeNull()
  })

  /**
   * A full quota is the usual reason a write fails, and the right response is
   * to keep playing without a silhouette — not to interrupt somebody mid-run.
   */
  test('a storage that refuses to write is survivable', () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(writeGhost(full, 'nib', track)).toBe(false)
    expect(loadGhost(full, 'nib', 'w01-tidepools')).toBeNull()
  })

  test('a storage that refuses to read is survivable too', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }
    expect(loadGhost(broken, 'nib', 'w01-tidepools')).toBeNull()
  })

  test('one can be dropped without touching the others', () => {
    const store = new Mem()
    writeGhost(store, 'nib', track)
    writeGhost(store, 'nib', { ...track, level: 'w02-kelp' })
    clearGhost(store, 'nib', 'w01-tidepools')
    expect(loadGhost(store, 'nib', 'w01-tidepools')).toBeNull()
    expect(loadGhost(store, 'nib', 'w02-kelp')).not.toBeNull()
  })

  test('a storage with no removeItem does not crash on a clear', () => {
    expect(() => clearGhost({ getItem: () => null, setItem: () => {} }, 'nib', 'x')).not.toThrow()
  })
})

describe('what counts as a track', () => {
  test('a real one does', () => {
    expect(isTrack({ level: 'a', frames: 10, points: [1, 2] })).toBe(true)
  })

  test('and these do not', () => {
    expect(isTrack(null)).toBe(false)
    expect(isTrack({ level: 1, frames: 10, points: [] })).toBe(false)
    expect(isTrack({ level: 'a', frames: 'x', points: [] })).toBe(false)
    expect(isTrack({ level: 'a', frames: 10, points: [1] })).toBe(false)
    expect(isTrack({ level: 'a', frames: 10, points: [1, NaN] })).toBe(false)
    expect(isTrack({ level: 'a', frames: 10, points: [0, 1e12] })).toBe(false)
  })

  test('an oversized one is refused rather than drawn', () => {
    const huge = new Array((GHOST_MAX_SAMPLES + 1) * 2).fill(0)
    expect(isTrack({ level: 'a', frames: 10, points: huge })).toBe(false)
  })
})

describe('the timer HUD setting', () => {
  test('off by default, because §8.4 says so', () => {
    expect(createSession(LEVEL).timerDisplay).toBe('off')
    expect(createSession(campaign()[0]!).timerDisplay).toBe('off')
  })

  test('it carries whatever the settings hold', () => {
    expect(createSession(LEVEL, { timerDisplay: 'both' }).timerDisplay).toBe('both')
  })
})
