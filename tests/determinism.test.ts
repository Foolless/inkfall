import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { Act, replayStream } from '../src/engine/input.js'
import { hashWorld } from '../src/game/hash.js'
import { createWorld, update, type World } from '../src/game/world.js'
import { greybox } from '../src/content/greybox.js'
import { flatGround, levelFrom } from './helpers.js'

/**
 * The most load-bearing test in the project.
 *
 * Replaying an input log must produce byte-identical world state every time.
 * Speedrun timing, ghost playback and reproducing a bug report from an input
 * log all rest on it — and it is the canary for `Math.random()` or `Date.now()`
 * finding their way into the update loop.
 */
function replay(log: readonly number[], level = greybox): World {
  const w = createWorld(level)
  const stream = replayStream(log)
  for (let i = 0; i < log.length; i++) update(w, stream(i))
  return w
}

/** A long, varied input log: walking, running, jumping, dashing, idling. */
function scriptedLog(length: number): number[] {
  const log: number[] = []
  for (let i = 0; i < length; i++) {
    let mask = 0
    if (i % 97 < 60) mask |= Act.Right
    if (i % 97 >= 60 && i % 97 < 70) mask |= Act.Left
    if (i % 13 < 6) mask |= Act.Run
    if (i % 41 < 9) mask |= Act.Jump
    if (i % 53 === 7) mask |= Act.Dash
    if (i % 53 === 7 && i % 106 === 7) mask |= Act.Up
    log.push(mask)
  }
  return log
}

describe('replay determinism', () => {
  test('the same input log replayed twice produces identical state', () => {
    const log = scriptedLog(1200)
    expect(hashWorld(replay(log))).toBe(hashWorld(replay(log)))
  })

  test('it holds on a flat test level too', () => {
    const level = levelFrom(flatGround(300), 'flat')
    const log = scriptedLog(900)
    expect(hashWorld(replay(log, level))).toBe(hashWorld(replay(log, level)))
  })

  test('replaying a prefix and continuing matches replaying the whole log', () => {
    const log = scriptedLog(800)
    const whole = replay(log)

    const piecewise = createWorld(greybox)
    const stream = replayStream(log)
    for (let i = 0; i < 400; i++) update(piecewise, stream(i))
    for (let i = 400; i < log.length; i++) update(piecewise, stream(i))

    expect(hashWorld(piecewise)).toBe(hashWorld(whole))
  })

  test('different inputs produce different state — the hash is not a constant', () => {
    const level = levelFrom(flatGround(300), 'flat')
    const right = Array.from({ length: 200 }, () => Act.Right | Act.Run)
    const left = Array.from({ length: 200 }, () => Act.Left | Act.Run)
    expect(hashWorld(replay(right, level))).not.toBe(hashWorld(replay(left, level)))
  })

  test('the hash changes as the world advances', () => {
    const level = levelFrom(flatGround(300), 'flat')
    const log = scriptedLog(400)
    expect(hashWorld(replay(log.slice(0, 100), level))).not.toBe(hashWorld(replay(log, level)))
  })

  test('the hash reflects state, not the route taken to it', () => {
    // Two worlds stepped the same way must agree even though their Sets and
    // Maps were populated by different insertion orders.
    const w1 = createWorld(greybox)
    const w2 = createWorld(greybox)
    w1.collapsed.add(5)
    w1.collapsed.add(2)
    w2.collapsed.add(2)
    w2.collapsed.add(5)
    expect(hashWorld(w1)).toBe(hashWorld(w2))
  })
})

describe('the simulation reads no ambient state', () => {
  /**
   * A static check, because a determinism failure caused by a stray
   * `Date.now()` is far cheaper to catch here than to debug from a
   * ghost-replay desync months later. The lint config bans these too; this
   * test is the belt to that pair of braces.
   */
  const banned = [/Math\s*\.\s*random/, /Date\s*\.\s*now/, /new\s+Date\s*\(/, /performance\s*\.\s*now/]

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry: string) => {
      const full = join(dir, entry)
      return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : []
    })
  }

  /** Comments may name these; only real calls are a problem. */
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  }

  test.each(walk('src/game'))('%s is free of non-deterministic calls', (file) => {
    const source = stripComments(readFileSync(file, 'utf8'))
    for (const pattern of banned) {
      expect(pattern.test(source), `${file} matches ${pattern}`).toBe(false)
    }
  })
})
