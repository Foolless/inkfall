/**
 * The Kelp Warden. World 2's boss. PRD §6.3.
 *
 * A knot of kelp at the top of a flooded shaft, with four Whipkelp arms lashing
 * out of the walls below it. **Hit: ink each arm's base, then dash into the
 * exposed core.** Phase 3 adds a downward current you have to dash against.
 *
 * The fight is about *the order you spend pips in*, which is the only thing
 * World 2 has been teaching. Four arms at a pip each and then a dash is five
 * pips against a meter that holds two or three — so the arms have to be cut
 * down between refills, in water, while they lash. A player who sprays is out
 * of ink with three arms still up; a player who works one wall at a time is
 * not.
 *
 * Arms grow back. That is what stops the fight becoming a checklist: dawdle and
 * the wall you cleared is a wall again. The regrow timer is long enough that
 * a clean round never sees one return, and short enough that a slow one always
 * does.
 */

import { BOSSES, DISPLAY } from '../constants.js'
import type { Box } from '../collision.js'
import { baseBoss, part, phaseOf, type Boss, type BossPart, type BossStepContext } from './types.js'

const T = DISPLAY.TILE

export const WARDEN_SIZE = { w: 40, h: 32 }
const ARM_SIZE = { w: 14, h: 16 }

/**
 * Four arms, alternating walls, evenly spaced down the shaft.
 *
 * Alternating rather than stacked so that no single position in the shaft is
 * safe from two at once, and so the player is forced to cross the middle to
 * reach the far wall — which is exactly where Phase 3's downdraft is worst.
 */
export function spawnKelpWarden(arena: Box): Boss {
  const b = baseBoss('kelpWarden', {
    x: arena.x + arena.w / 2 - WARDEN_SIZE.w / 2,
    y: arena.y + T,
    w: WARDEN_SIZE.w,
    h: WARDEN_SIZE.h,
  })
  b.timer = BOSSES.WAKE_FRAMES

  // The core sits inside the knot and is only ever hittable once every arm is
  // down, so it is authored closed and opened by the fight rather than by time.
  b.parts.push(
    part('core', 0, 'dash', {
      x: b.x + WARDEN_SIZE.w / 2 - 10,
      y: b.y + WARDEN_SIZE.h - 14,
      w: 20,
      h: 16,
    }),
  )

  const top = arena.y + WARDEN_SIZE.h + T * 3
  const spacing = (arena.y + arena.h - T * 2 - top) / BOSSES.WARDEN_ARMS
  for (let i = 0; i < BOSSES.WARDEN_ARMS; i++) {
    const onRight = i % 2 === 1
    const arm = part(
      'arm',
      i,
      'ink',
      {
        x: onRight ? arena.x + arena.w - ARM_SIZE.w : arena.x,
        y: top + spacing * i,
        w: ARM_SIZE.w,
        h: ARM_SIZE.h,
      },
      true,
    )
    // An arm is always shootable while it is up. The *core* is the thing with
    // a window; the arms are just work.
    arm.open = true
    // The direction it lashes, stored where every other part keeps its motion.
    arm.vx = onRight ? -1 : 1
    // A third of a cycle apart, so four arms are a rhythm and not a wall.
    arm.timer = (i * BOSSES.WARDEN_LASH[0]!) / BOSSES.WARDEN_ARMS
    b.parts.push(arm)
  }
  return b
}

export function armsOf(b: Boss): BossPart[] {
  return b.parts.filter((p) => p.kind === 'arm')
}

export function coreOf(b: Boss): BossPart {
  return b.parts.find((p) => p.kind === 'core')!
}

/** How far out an arm currently reaches, in pixels. Zero while it is coiled. */
export function armReach(b: Boss, arm: BossPart): number {
  if (!arm.alive) return 0
  const cycle = BOSSES.WARDEN_LASH[phaseOf(b) - 1]!
  const t = ((arm.timer % cycle) + cycle) % cycle
  const lash = cycle / 3
  if (t >= lash) return 0
  return (1 - Math.abs(1 - (t / lash) * 2)) * T * 4
}

/** The lashing arm as a box, or null while it is coiled. Instant tier loss. */
export function armLash(b: Boss, arm: BossPart): Box | null {
  const reach = armReach(b, arm)
  if (reach < 2) return null
  return arm.vx > 0
    ? { x: arm.x + arm.w, y: arm.y + 2, w: reach, h: T }
    : { x: arm.x - reach, y: arm.y + 2, w: reach, h: T }
}

export function updateKelpWarden(ctx: BossStepContext, b: Boss): void {
  if (b.state === 'dead') return
  if (b.timer > 0) b.timer--

  const phase = phaseOf(b)
  // Phase 3's downdraft. Applied to the whole arena rather than to Nib
  // directly, so it pushes the player, his ink bolts and nothing else — the
  // arms are anchored and the core is a knot, and neither should drift.
  b.arenaForceY = phase >= 3 ? BOSSES.WARDEN_DOWNDRAFT : 0

  if (b.state === 'waking') {
    if (b.timer === 0) b.state = 'idle'
    return
  }
  if (b.state === 'dying') {
    if (b.timer === 0) b.state = 'dead'
    return
  }

  const arms = armsOf(b)
  for (const arm of arms) {
    arm.open = arm.alive
    if (arm.alive) {
      arm.timer++
      continue
    }
    // Regrowing. A cleared wall does not stay cleared for long.
    arm.state++
    if (arm.state >= BOSSES.WARDEN_ARM_REGROW && !coreOf(b).open) {
      arm.alive = true
      arm.state = 0
    }
  }

  const core = coreOf(b)
  const allDown = arms.every((a) => !a.alive)

  if (core.open) {
    core.timer--
    if (core.timer <= 0) {
      // The window closed. Everything comes back and the round starts again —
      // failing to convert is a setback, never a soft-lock.
      core.open = false
      for (const arm of arms) {
        arm.alive = true
        arm.state = 0
      }
    }
  } else if (allDown) {
    core.open = true
    core.timer = BOSSES.WARDEN_CORE_OPEN
    b.beat++
  }

  // The knot drifts across the top of the shaft, so the dash into it is aimed
  // rather than automatic. Slow, and it turns at the walls: the core is a
  // target, not a dodge.
  const drift = 0.5 + phase * 0.15
  b.x += b.facing * drift
  if (b.x <= ctx.arena.x + T) {
    b.x = ctx.arena.x + T
    b.facing = 1
  } else if (b.x + b.w >= ctx.arena.x + ctx.arena.w - T) {
    b.x = ctx.arena.x + ctx.arena.w - T - b.w
    b.facing = -1
  }
  core.x = b.x + b.w / 2 - core.w / 2
  core.y = b.y + b.h - 14
}

/** An arm cut down at the base. Returns true if this one was still up. */
export function cutArm(arm: BossPart): boolean {
  if (!arm.alive) return false
  arm.alive = false
  arm.state = 0
  return true
}

/** A dash into the open core. The whole round pays out here or not at all. */
export function hitKelpWarden(b: Boss): boolean {
  const core = coreOf(b)
  if (!core.open) return false
  b.hits++
  core.open = false
  core.timer = 0
  for (const arm of armsOf(b)) {
    arm.alive = true
    arm.state = 0
    arm.timer = 0
  }
  if (b.hits >= BOSSES.HITS) {
    b.state = 'dying'
    b.timer = BOSSES.DEATH_FRAMES
    b.arenaForceY = 0
  } else {
    b.state = 'idle'
  }
  return true
}
