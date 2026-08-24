/**
 * The Kraken. The last fight. PRD §6.3, §7.6.
 *
 * Three stages, no checkpoint, about three minutes:
 *
 *   P1  two tentacles sweep the dark. Ink the suckers.
 *   P2  the beak lunges out of the dark. Dash-dodge, then stomp it.
 *   P3  all eight tentacles, and the eye opens. Dash into the eye.
 *
 * Each stage asks for a different verb — **ink**, **stomp**, **dash** — which
 * is the game's whole vocabulary, in the order the player learned it. That is
 * deliberate: the final boss is a vocabulary test, and it is the only fight in
 * the game that changes what it wants between phases.
 *
 * The eye is only reachable at the apex of a Hookline ride, which is the last
 * thing World 3 taught and the reason the shelf is built the way it is (§7.6
 * C3). A player who never learned to ride a hook cannot finish the game, and
 * they have had two worlds to learn it.
 */

import { BOSSES, DISPLAY } from '../constants.js'
import type { Box } from '../collision.js'
import { baseBoss, part, phaseOf, type Boss, type BossPart, type BossStepContext } from './types.js'

const T = DISPLAY.TILE

export const KRAKEN_SIZE = { w: 64, h: 48 }
const TENTACLE_SIZE = { w: 16, h: 56 }
const SUCKER_SIZE = { w: 10, h: 10 }

export function spawnKraken(arena: Box): Boss {
  const b = baseBoss('kraken', {
    x: arena.x + arena.w / 2 - KRAKEN_SIZE.w / 2,
    y: arena.y + T,
    w: KRAKEN_SIZE.w,
    h: KRAKEN_SIZE.h,
  })
  b.timer = BOSSES.WAKE_FRAMES

  // Eight tentacles are authored once and only as many as the phase wants are
  // ever alive. The alternative is spawning four of them on the frame the eye
  // opens, which is the frame the player can least afford a screen full of pop.
  const most = BOSSES.KRAKEN_TENTACLES[2]!
  const usable = arena.w - T * 3
  for (let i = 0; i < most; i++) {
    const cx = arena.x + T * 1.5 + (usable * i) / (most - 1)
    const t = part(
      'tentacle',
      i,
      'ink',
      {
        x: cx - TENTACLE_SIZE.w / 2,
        y: arena.y + arena.h - TENTACLE_SIZE.h,
        w: TENTACLE_SIZE.w,
        h: TENTACLE_SIZE.h,
      },
      true,
    )
    t.alive = false
    b.parts.push(t)

    // One sucker per tentacle: the thing you actually shoot. Riding on the arm
    // rather than fixed to the floor, so a sweeping tentacle carries its own
    // weak point across the arena and the shot has to be led.
    const s = part('sucker', i, 'ink', {
      x: t.x + 3,
      y: t.y + T,
      w: SUCKER_SIZE.w,
      h: SUCKER_SIZE.h,
    })
    s.alive = false
    b.parts.push(s)
  }

  const beak = part(
    'beak',
    0,
    'stomp',
    { x: b.x + KRAKEN_SIZE.w / 2 - 14, y: b.y + KRAKEN_SIZE.h, w: 28, h: 20 },
    true,
  )
  beak.alive = false
  b.parts.push(beak)

  const eye = part('eye', 0, 'dash', {
    x: b.x + KRAKEN_SIZE.w / 2 - 12,
    y: b.y + 12,
    w: 24,
    h: 24,
  })
  eye.alive = false
  b.parts.push(eye)
  return b
}

export function tentaclesOf(b: Boss): BossPart[] {
  return b.parts.filter((p) => p.kind === 'tentacle')
}
export function suckersOf(b: Boss): BossPart[] {
  return b.parts.filter((p) => p.kind === 'sucker')
}
export function beakOf(b: Boss): BossPart {
  return b.parts.find((p) => p.kind === 'beak')!
}
export function eyeOf(b: Boss): BossPart {
  return b.parts.find((p) => p.kind === 'eye')!
}

/** How many arms this stage puts in the water. */
export function tentacleCount(b: Boss): number {
  return BOSSES.KRAKEN_TENTACLES[phaseOf(b) - 1]!
}

export function updateKraken(ctx: BossStepContext, b: Boss): void {
  if (b.state === 'dead') return
  if (b.timer > 0) b.timer--
  b.beat++

  if (b.state === 'waking') {
    if (b.timer === 0) enterPhase(ctx, b)
    return
  }
  if (b.state === 'dying') {
    if (b.timer === 0) b.state = 'dead'
    return
  }
  if (b.state === 'exposed' && b.timer === 0) {
    // Staggered between stages. Everything is down; nothing can be hit.
    enterPhase(ctx, b)
    return
  }

  switch (phaseOf(b)) {
    case 1:
      sweepTentacles(ctx, b)
      break
    case 2:
      lungeBeak(ctx, b)
      break
    case 3:
      sweepTentacles(ctx, b)
      openEye(ctx, b)
      break
  }
}

/**
 * Set the arena up for the phase the hit count says we are in.
 *
 * Called on every transition rather than tracked separately, so a stage's
 * contents are a pure function of `hits` — the same property that keeps the
 * phase honest everywhere else in §6.3.
 */
function enterPhase(ctx: BossStepContext, b: Boss): void {
  b.state = 'idle'
  b.timer = 0
  const phase = phaseOf(b)
  const arms = tentacleCount(b)

  tentaclesOf(b).forEach((t, i) => {
    t.alive = i < arms
    t.open = false
    t.timer = 0
  })
  suckersOf(b).forEach((s, i) => {
    s.alive = i < arms
    // Only Stage 1 is about the suckers. In Stage 3 all eight arms sweep and
    // none of them can be taken off — §6.3 says the eye is the answer there,
    // and leaving the suckers shootable would let a player disassemble the
    // last stage instead of timing the dash it is built around.
    s.open = s.alive && phase === 1
  })

  const beak = beakOf(b)
  beak.alive = phase === 2
  beak.open = false
  beak.state = 0
  beak.timer = BOSSES.KRAKEN_BEAK_TELEGRAPH

  const eye = eyeOf(b)
  eye.alive = phase === 3
  eye.open = false
  eye.timer = 0

  if (phase === 3 && !b.spawnedGuards) {
    b.spawnedGuards = true
    ctx.summonGuards()
  }
}

/**
 * The arms sweep on a sine, each a slice of the cycle behind the last.
 *
 * Computed rather than integrated, like every other periodic thing in this
 * game, so that eight of them stay a pattern instead of drifting into a wall.
 */
function sweepTentacles(ctx: BossStepContext, b: Boss): void {
  const cycle = BOSSES.KRAKEN_SWEEP[phaseOf(b) - 1]!
  const arms = tentaclesOf(b)
  const suckers = suckersOf(b)

  arms.forEach((t, i) => {
    if (!t.alive) return
    const k = Math.sin(((b.beat + (i * cycle) / arms.length) / cycle) * Math.PI * 2)
    t.x = t.homeX + k * T * 2.5
    t.y = t.homeY + Math.abs(k) * T
    const s = suckers[i]
    if (s?.alive) {
      s.x = t.x + (t.w - s.w) / 2
      s.y = t.y + T * 1.5
    }
  })

  // Every arm down ends the stage. In phase 3 the eye is the target instead, so
  // clearing the arms only buys room to work in.
  if (phaseOf(b) === 1 && arms.every((t) => !t.alive)) {
    b.state = 'exposed'
    b.timer = BOSSES.KRAKEN_STAGGER
    b.hits++
    if (b.hits >= BOSSES.HITS) {
      b.state = 'dying'
      b.timer = BOSSES.DEATH_FRAMES
    }
  }
  void ctx
}

/**
 * The beak. Telegraph, lunge, and then ninety frames flat on the floor.
 *
 * The recovery is the entire damage window and it is long, because the lunge
 * itself is the fastest thing on screen. Fast strike, slow recovery — the same
 * bargain the Eel offers, at the scale of a boss.
 */
function lungeBeak(ctx: BossStepContext, b: Boss): void {
  const beak = beakOf(b)
  if (!beak.alive) return
  beak.timer--

  switch (beak.state) {
    case 0: // winding up, tracking the player
      beak.x = ctx.player.x + ctx.player.w / 2 - beak.w / 2
      beak.y = b.y + b.h
      beak.open = false
      if (beak.timer <= 0) {
        beak.state = 1
        beak.timer = BOSSES.KRAKEN_BEAK_LUNGE
        beak.vy = (ctx.arena.y + ctx.arena.h - T * 2 - beak.y) / BOSSES.KRAKEN_BEAK_LUNGE
      }
      break

    case 1: // lunging
      beak.y += beak.vy
      if (beak.timer <= 0) {
        beak.state = 2
        beak.timer = BOSSES.KRAKEN_BEAK_RECOVER
        beak.open = true
      }
      break

    case 2: // buried in the floor, and stompable
      if (beak.timer <= 0) {
        beak.state = 0
        beak.timer = BOSSES.KRAKEN_BEAK_TELEGRAPH
        beak.open = false
      }
      break
  }
}

/** Phase 3's eye, on a slow open-and-shut. The dash has to be timed to it. */
function openEye(ctx: BossStepContext, b: Boss): void {
  const eye = eyeOf(b)
  if (!eye.alive) return
  eye.timer++
  const cycle = BOSSES.KRAKEN_EYE_OPEN * 2
  eye.open = eye.timer % cycle < BOSSES.KRAKEN_EYE_OPEN
  eye.x = b.x + b.w / 2 - eye.w / 2
  eye.y = b.y + 12
  void ctx
}

/**
 * Ink into a sucker takes its whole tentacle down.
 *
 * One bolt per arm rather than three, because §7.6 C3 hands the player a shelf
 * with a Bone Shrimp swarm on it and no ground to refill on — a twenty-four-pip
 * fight is not hard, it is a supply problem the level cannot solve.
 */
export function cutTentacle(b: Boss, sucker: BossPart): boolean {
  if (!sucker.alive || !sucker.open) return false
  const arm = tentaclesOf(b)[sucker.index]
  if (!arm?.alive) return false
  arm.alive = false
  sucker.alive = false
  sucker.open = false
  return true
}

/** A stomp on the buried beak, or a dash into the open eye. Both are hits. */
export function hitKraken(b: Boss, hit: BossPart): boolean {
  if (!hit.alive || !hit.open) return false
  if (hit.kind !== 'beak' && hit.kind !== 'eye') return false

  b.hits++
  hit.open = false
  if (b.hits >= BOSSES.HITS) {
    b.state = 'dying'
    b.timer = BOSSES.DEATH_FRAMES
    for (const p of b.parts) {
      p.alive = false
      p.open = false
    }
  } else {
    b.state = 'exposed'
    b.timer = BOSSES.KRAKEN_STAGGER
  }
  return true
}
