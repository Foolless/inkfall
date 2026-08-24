/**
 * The Vent Lord. World 4's boss. PRD §6.3.
 *
 * A magma worm in a circular vent chamber. It surfaces from one of five vents,
 * telegraphed forty-five frames by rumble and particles, and crests for thirty.
 * **Hit: stomp the head while it is cresting.**
 *
 * The arena shrinks as you win. Magma rises one tile per hit, so the third hit
 * is taken on a third of the floor the first one was — the only boss in the
 * game whose difficulty curve is the player's own progress. It is also the only
 * one that can be lost by winning too slowly in the wrong place, which is what
 * makes the vent order worth learning.
 *
 * The order is a fixed walk, not a shuffle: 0, 2, 4, 1, 3. Every vent comes up,
 * no two in a row are adjacent, and a player who counts can be standing on the
 * right one before the rumble starts. That is the whole difference between hard
 * and unfair.
 */

import { BOSSES, DISPLAY } from '../constants.js'
import type { Box } from '../collision.js'
import { baseBoss, part, phaseOf, type Boss, type BossPart, type BossStepContext } from './types.js'

const T = DISPLAY.TILE

export const WORM_SIZE = { w: 24, h: 28 }

/**
 * Which vent is next. A fixed walk over all five, never a random pick.
 *
 * The step of two is what keeps consecutive surfaces apart: a player who has
 * just dodged one is never asked to cross the whole chamber, and never asked to
 * stand still either.
 */
export function ventOrder(beat: number): number {
  return (beat * 2) % BOSSES.VENT_COUNT
}

export function spawnVentLord(arena: Box): Boss {
  const b = baseBoss('ventLord', {
    x: arena.x + arena.w / 2 - WORM_SIZE.w / 2,
    y: arena.y + arena.h - WORM_SIZE.h,
    w: WORM_SIZE.w,
    h: WORM_SIZE.h,
  })
  b.timer = BOSSES.WAKE_FRAMES

  // Five vents evenly along the floor, inset a tile so the outer two are still
  // reachable once the magma has taken a row.
  const usable = arena.w - T * 4
  for (let i = 0; i < BOSSES.VENT_COUNT; i++) {
    const cx = arena.x + T * 2 + (usable * i) / (BOSSES.VENT_COUNT - 1)
    b.parts.push(
      part('vent', i, 'stomp', {
        x: cx - T,
        y: arena.y + arena.h - T,
        w: T * 2,
        h: T,
      }),
    )
  }

  // The head is one part rather than five, because it is one worm. It parks
  // below the floor between surfaces, which is also where it is drawn.
  const head = part(
    'head',
    0,
    'stomp',
    { x: b.x, y: arena.y + arena.h, w: WORM_SIZE.w, h: WORM_SIZE.h },
    true,
  )
  head.open = false
  b.parts.push(head)
  return b
}

export function ventsOf(b: Boss): BossPart[] {
  return b.parts.filter((p) => p.kind === 'vent')
}

export function headOf(b: Boss): BossPart {
  return b.parts.find((p) => p.kind === 'head')!
}

/** The vent currently rumbling, or -1. Drawn as shaking particles. */
export function rumblingVent(b: Boss): number {
  return b.state === 'throwing' ? ventOrder(b.beat) : -1
}

/** The magma line, in pixels. It only ever comes up. */
export function magmaLine(ctx: BossStepContext, b: Boss): number {
  return ctx.arena.y + ctx.arena.h - b.floorRise * T
}

export function updateVentLord(ctx: BossStepContext, b: Boss): void {
  if (b.state === 'dead') return
  if (b.timer > 0) b.timer--

  const phase = phaseOf(b)
  const head = headOf(b)
  const floor = magmaLine(ctx, b)

  switch (b.state) {
    case 'waking':
      if (b.timer === 0) startIdle(b, phase)
      break

    case 'idle':
      if (b.timer > 0) break
      // Rumble. `throwing` is the shared struct's name for "winding up", and
      // reusing it rather than adding a fifth state keeps every boss's state
      // machine readable side by side.
      b.state = 'throwing'
      b.timer = BOSSES.VENT_RUMBLE
      break

    case 'throwing': {
      if (b.timer > 0) break
      const vent = ventsOf(b)[ventOrder(b.beat)]!
      head.x = vent.x + vent.w / 2 - head.w / 2
      head.y = floor
      head.open = true
      b.state = 'exposed'
      b.timer = BOSSES.VENT_CREST
      break
    }

    case 'exposed': {
      // Cresting. It rises out of the vent over the window and sinks back, so
      // the thirty frames are a shape on screen rather than a number.
      const k = 1 - b.timer / BOSSES.VENT_CREST
      head.y = floor - Math.sin(k * Math.PI) * head.h
      if (b.timer === 0) {
        head.open = false
        b.state = 'charging'
        b.timer = BOSSES.VENT_SUBMERGE
      }
      break
    }

    case 'charging':
      // Submerging. Named for the shared struct again; nothing charges here.
      head.y = floor
      if (b.timer === 0) {
        b.beat++
        startIdle(b, phase)
      }
      break

    case 'dying':
      if (b.timer === 0) b.state = 'dead'
      break
  }

  b.x = head.x
  b.y = head.y
  // Phase 3 lets two Snappers out of the rock, same as the King's third phase.
  if (phase === 3 && !b.spawnedGuards) {
    b.spawnedGuards = true
    ctx.summonGuards()
  }
}

function startIdle(b: Boss, phase: 1 | 2 | 3): void {
  b.state = 'idle'
  b.timer = BOSSES.VENT_IDLE[phase - 1]!
}

/**
 * A stomp on the cresting head.
 *
 * The magma comes up a tile on every hit including the last, because the arena
 * shrinking *is* the damage readout — there is no health bar, and the floor
 * getting smaller is the only thing telling the player they are winning.
 */
export function hitVentLord(b: Boss): boolean {
  const head = headOf(b)
  if (!head.open) return false

  b.hits++
  head.open = false
  b.floorRise += BOSSES.VENT_MAGMA_PER_HIT
  if (b.hits >= BOSSES.HITS) {
    b.state = 'dying'
    b.timer = BOSSES.DEATH_FRAMES
  } else {
    b.state = 'charging'
    b.timer = BOSSES.VENT_SUBMERGE
    b.beat++
  }
  return true
}
