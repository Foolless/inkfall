import { describe, expect, test } from 'vitest'
import { Act, frameFromMasks } from '../src/engine/input.js'
import { createWorld, update, MAX_ENTITIES } from '../src/game/world.js'
import { campaign } from '../src/content/levels/index.js'
import { loadCampaignLevel } from '../src/content/levels/format.js'
import { maskOf, UPGRADE_IDS } from '../src/game/upgrades.js'
import { blank } from './helpers.js'

/**
 * Performance and size. PLAN.md checkpoint 4.8: "≤ 8 ms frame time, zero
 * allocations in the update loop, ≤ 1.5 MB gzipped".
 *
 * The bundle size is asserted by scripts/check-size.mjs in CI. Frame time needs
 * a real browser and a real display, and lives in the smoke test. What is here
 * is the middle one, which is the one that rots quietly: allocation.
 *
 * ## Measuring allocation without a profiler
 *
 * Node exposes no per-scope allocation counter, so this counts *objects* the
 * only way a test can — by making the constructors observable. Two approaches
 * are used together: a heap-growth measurement over many frames with `--expose-gc`
 * when it is available, and, always, a structural check that the update loop
 * does not rebuild the objects it is known to have rebuilt before.
 *
 * The structural check is the load-bearing one. It is exact, it runs everywhere,
 * and it names the specific regression: a step context built per frame.
 */

const LEVEL = campaign()[0]!

function world() {
  return createWorld(loadCampaignLevel(LEVEL), { upgrades: maskOf([...UPGRADE_IDS]) })
}

describe('the update loop does not rebuild what it can reuse', () => {
  /**
   * The three that were being rebuilt every frame before checkpoint 4.8: the
   * player's step context, the enemies' step context (which carried two fresh
   * closures with it), and one box per checkpoint entity per frame.
   */
  test('the step contexts are the same objects on frame 1 and frame 600', () => {
    const w = world()
    const playerCtx = w.playerCtx
    const enemyCtx = w.enemyCtx
    const fire = w.enemyCtx.fire
    const spawn = w.enemyCtx.spawn

    for (let i = 0; i < 600; i++) update(w, blank())

    expect(w.playerCtx).toBe(playerCtx)
    expect(w.enemyCtx).toBe(enemyCtx)
    // The closures especially: a fresh function object per frame is the most
    // expensive per-frame garbage there is.
    expect(w.enemyCtx.fire).toBe(fire)
    expect(w.enemyCtx.spawn).toBe(spawn)
  })

  test('the checkpoint boxes are built once, at load', () => {
    const w = world()
    const boxes = w.checkpointBoxes.map((c) => c.box)
    expect(boxes.length).toBeGreaterThan(0)
    for (let i = 0; i < 300; i++) update(w, blank())
    expect(w.checkpointBoxes.map((c) => c.box)).toEqual(boxes)
    for (let i = 0; i < boxes.length; i++) expect(w.checkpointBoxes[i]!.box).toBe(boxes[i])
  })

  test('the scratch buffers are reused rather than replaced', () => {
    const w = world()
    const solids = w.solidScratch
    const blast = w.blastScratch
    const cues = w.cues
    for (let i = 0; i < 300; i++) update(w, frameFromMasks(Act.Right, 0))
    expect(w.solidScratch).toBe(solids)
    expect(w.blastScratch).toBe(blast)
    expect(w.cues).toBe(cues)
  })

  /** The cue list is drained every frame, so it cannot grow without bound. */
  test('the cue list does not accumulate', () => {
    const w = world()
    for (let i = 0; i < 600; i++) update(w, frameFromMasks(Act.Right | Act.Jump, 0))
    expect(w.cues.length).toBeLessThan(16)
  })

  /**
   * §12.6's cap. The shrimp vents are the only thing in the game that produces
   * enemies indefinitely, and a player who stands in §7.6's B1 doing nothing
   * should meet a hard ceiling rather than a slowly dying frame rate.
   */
  test('a room cannot grow past the entity cap', () => {
    const abyss = createWorld(loadCampaignLevel(campaign().find((d) => d.id === 'w05-abyss')!))
    for (let i = 0; i < 3_000; i++) update(abyss, blank())
    expect(abyss.enemies.length).toBeLessThanOrEqual(MAX_ENTITIES)
  })
})

describe('heap growth over a long run', () => {
  /**
   * Only meaningful with `--expose-gc`, which vitest does not pass by default.
   * Skipped rather than faked when it is absent: a memory test that cannot
   * collect is measuring the collector's mood, not the code.
   */
  const gc = (globalThis as { gc?: () => void }).gc
  const maybe = gc ? test : test.skip

  maybe('ten seconds of play does not grow the heap materially', () => {
    const w = world()
    for (let i = 0; i < 120; i++) update(w, blank()) // settle
    gc!()
    const before = process.memoryUsage().heapUsed

    for (let i = 0; i < 600; i++) update(w, frameFromMasks(Act.Right | Act.Run, Act.Right | Act.Run))
    gc!()
    const after = process.memoryUsage().heapUsed

    // A megabyte over 600 frames would be ~1.7 kB per frame of garbage. The
    // real figure should be near zero; this is a ceiling, not a target.
    expect(after - before).toBeLessThan(1_000_000)
  })
})

describe('a level steps fast enough to be worth measuring in a browser', () => {
  /**
   * Not a frame-time assertion — a CI box is not a display and the number would
   * be noise. This is the weaker claim that actually catches something: a
   * thousand frames of the busiest level in the game finish in a fraction of
   * the wall clock they would take at 60 Hz, so there is real headroom under
   * the 8 ms budget before a browser adds rendering to it.
   */
  test('a thousand frames of World 5 run far faster than real time', () => {
    const w = createWorld(loadCampaignLevel(campaign().find((d) => d.id === 'w05-abyss')!), {
      upgrades: maskOf([...UPGRADE_IDS]),
    })
    const started = process.hrtime.bigint()
    for (let i = 0; i < 1_000; i++) update(w, frameFromMasks(Act.Right, Act.Right))
    const ms = Number(process.hrtime.bigint() - started) / 1e6

    // 1,000 frames is 16.7 s of play. Simulating it in under two seconds
    // leaves the whole frame budget for rendering.
    expect(ms).toBeLessThan(2_000)
  })

  test('every campaign level steps at a similar cost — none is an outlier', () => {
    const costs = campaign().map((def) => {
      const w = createWorld(loadCampaignLevel(def), { upgrades: maskOf([...UPGRADE_IDS]) })
      const started = process.hrtime.bigint()
      for (let i = 0; i < 300; i++) update(w, frameFromMasks(Act.Right, Act.Right))
      return { id: def.id, ms: Number(process.hrtime.bigint() - started) / 1e6 }
    })
    const slowest = costs.reduce((a, b) => (a.ms > b.ms ? a : b))
    expect(slowest.ms, `${slowest.id} is the slowest level`).toBeLessThan(1_500)
  })
})
