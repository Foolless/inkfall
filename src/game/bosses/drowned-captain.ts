/**
 * The Drowned Captain. World 3's boss. PRD §6.3.
 *
 * A ghost that phases through the arena, and a **lantern** that does not. The
 * ghost cannot be touched, cannot be hurt, and is not the fight — it is the
 * thing carrying the fight around. **Hit: ink the true lantern.**
 *
 * The floor tilts on a two-hundred-frame cycle and slides Nib with it, which is
 * what makes an easy shot hard: every bolt is fired while moving, and waiting
 * for level ground costs you the window. Phase 3 splits the lantern three ways
 * and exactly one is real.
 *
 * The decoys are chosen from the hit count, not from a die roll. A player who
 * dies to phase 3 and comes back finds the *same* lantern real, which is the
 * difference between a fight you learn and a fight you survive.
 */

import { BOSSES, DISPLAY } from '../constants.js'
import type { Box } from '../collision.js'
import { baseBoss, part, phaseOf, type Boss, type BossPart, type BossStepContext } from './types.js'

const T = DISPLAY.TILE

export const CAPTAIN_SIZE = { w: 20, h: 28 }
const LANTERN_SIZE = { w: 10, h: 12 }

export function spawnDrownedCaptain(arena: Box): Boss {
  const b = baseBoss('drownedCaptain', {
    x: arena.x + arena.w - CAPTAIN_SIZE.w - T * 2,
    y: arena.y + arena.h / 2,
    w: CAPTAIN_SIZE.w,
    h: CAPTAIN_SIZE.h,
  })
  b.timer = BOSSES.WAKE_FRAMES

  // Three lanterns are authored up front and only one is alive before phase 3.
  // Spawning the decoys late would mean the fight allocates mid-round, and it
  // would put a visible pop on the exact frame the player most needs to read
  // the screen.
  for (let i = 0; i <= BOSSES.CAPTAIN_DECOYS; i++) {
    const l = part('lantern', i, 'ink', {
      x: b.x,
      y: b.y + CAPTAIN_SIZE.h - 6,
      w: LANTERN_SIZE.w,
      h: LANTERN_SIZE.h,
    })
    l.alive = i === 0
    l.open = i === 0
    b.parts.push(l)
  }
  return b
}

export function lanternsOf(b: Boss): BossPart[] {
  return b.parts.filter((p) => p.kind === 'lantern')
}

/**
 * Which lantern is real this phase.
 *
 * `hits` and nothing else. It moves between phases so phase 3 is not "shoot the
 * one you shot last time", and it is fixed within a phase so a death is a
 * retry rather than a re-roll.
 */
export function trueLanternIndex(b: Boss): number {
  return b.hits % (BOSSES.CAPTAIN_DECOYS + 1)
}

/** How far the floor is tilted, -1 (left) to 1 (right). */
export function tilt(b: Boss): number {
  const c = BOSSES.CAPTAIN_TILT_CYCLE
  return Math.sin(((b.beat % c) / c) * Math.PI * 2)
}

export function updateDrownedCaptain(ctx: BossStepContext, b: Boss): void {
  if (b.state === 'dead') return
  if (b.timer > 0) b.timer--
  b.beat++

  if (b.state === 'waking') {
    if (b.timer === 0) b.state = 'idle'
    return
  }
  if (b.state === 'dying') {
    if (b.timer === 0) b.state = 'dead'
    b.arenaForceX = 0
    return
  }

  const phase = phaseOf(b)
  b.arenaForceX = tilt(b) * BOSSES.CAPTAIN_TILT_FORCE

  if (b.state === 'exposed') {
    // Staggered: the lanterns hang still and low, which is the invitation.
    if (b.timer === 0) b.state = 'idle'
  } else {
    // Drifts toward the player, through everything. The ghost is scenery with
    // an opinion about where you are standing.
    const dx = ctx.player.x + ctx.player.w / 2 - (b.x + b.w / 2)
    const dy = ctx.player.y + ctx.player.h / 2 - (b.y + b.h / 2)
    const len = Math.hypot(dx, dy) || 1
    b.vx = (dx / len) * BOSSES.CAPTAIN_DRIFT
    b.vy = (dy / len) * BOSSES.CAPTAIN_DRIFT
    b.x += b.vx
    b.y += b.vy
    b.facing = dx < 0 ? -1 : 1
    clampToArena(ctx.arena, b)
  }

  // Phase 3 lights the decoys. They ride the same swing at different offsets,
  // so the three of them read as one object breaking apart rather than as three
  // objects that were always there.
  const lanterns = lanternsOf(b)
  const spread = phase >= 3 ? T * 2.5 : 0
  const swing = BOSSES.CAPTAIN_PHASE_SHIFT[phase - 1]!
  for (const l of lanterns) {
    l.alive = phase >= 3 || l.index === 0
    if (!l.alive) {
      l.open = false
      continue
    }
    // Every visible lantern must be shootable, or "one of them is real" is a
    // sentence with no mechanism behind it. Only one of them counts.
    l.open = b.state !== 'exposed'
    const offset = phase >= 3 ? (l.index - BOSSES.CAPTAIN_DECOYS / 2) * spread : 0
    const bob = Math.sin(((b.beat + l.index * swing) / swing) * Math.PI * 2) * 4
    l.x = b.x + b.w / 2 - l.w / 2 + offset
    l.y = b.y + b.h - 8 + bob
  }
}

function clampToArena(arena: Box, b: Boss): void {
  const margin = T
  b.x = Math.max(arena.x + margin, Math.min(b.x, arena.x + arena.w - margin - b.w))
  b.y = Math.max(arena.y + margin, Math.min(b.y, arena.y + arena.h - margin - b.h * 2))
}

/**
 * A bolt into a lantern. Only the true one counts; a decoy staggers nothing.
 *
 * Returns true when the hit landed, so the caller can pay out. Shooting a decoy
 * is deliberately *not* punished — it costs a pip and the time, which in a room
 * with a tilting floor is punishment enough.
 */
export function hitDrownedCaptain(b: Boss, lantern: BossPart): boolean {
  if (!lantern.alive || !lantern.open) return false
  if (lantern.index !== trueLanternIndex(b)) return false

  b.hits++
  b.state = b.hits >= BOSSES.HITS ? 'dying' : 'exposed'
  b.timer = b.state === 'dying' ? BOSSES.DEATH_FRAMES : BOSSES.CAPTAIN_STAGGER
  for (const l of lanternsOf(b)) l.open = false
  return true
}
