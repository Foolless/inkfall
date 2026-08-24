/**
 * The Hermit King. World 1's boss. PRD §6.3.
 *
 * Three hits, three phases, one fixed-camera bowl:
 *
 *   P1  charges wall to wall, and bonks. The bonk leaves his soft back exposed
 *       long enough to stomp.
 *   P2  throws rocks in arcs between charges.
 *   P3  charges faster, and two Snappers come out of the sand.
 *
 * There is no health bar. Damage is communicated by the King visibly breaking —
 * his shell cracks a stage per hit — which is the rule for every boss in the
 * game (PRD §6.3) and the reason the fight never needs a UI element.
 *
 * Everything here is a function of frame counters and the player's position.
 * No randomness: a boss that rolls dice cannot be practised, and a boss that
 * cannot be practised is not a NES boss.
 */

import { BOSS, DISPLAY } from '../constants.js'
import { moveX, moveY, type Box } from '../collision.js'
import { baseBoss, isVulnerable, phaseOf, type Boss, type BossStepContext, type Rock } from './types.js'
import type { TileMap } from '../tilemap.js'

const T = DISPLAY.TILE

/** Wide and low, and a good deal smaller than the sprite that draws him. */
export const HERMIT_SIZE = { w: 44, h: 28 }

export function spawnHermitKing(arena: Box): Boss {
  const b = baseBoss('hermitKing', {
    x: arena.x + arena.w - HERMIT_SIZE.w - T,
    // On the arena floor, which is the arena box's own bottom edge.
    y: arena.y + arena.h - HERMIT_SIZE.h,
    w: HERMIT_SIZE.w,
    h: HERMIT_SIZE.h,
  })
  b.timer = BOSS.WAKE_FRAMES
  return b
}

export function updateHermitKing(ctx: BossStepContext, b: Boss): void {
  if (b.state === 'dead') return

  const phase = phaseOf(b)
  if (phase === 3 && !b.spawnedGuards) {
    b.spawnedGuards = true
    ctx.summonGuards()
  }

  if (b.timer > 0) b.timer--

  switch (b.state) {
    case 'waking':
      if (b.timer === 0) startIdle(b)
      break

    case 'idle':
      if (b.timer > 0) break
      // From Phase 2 he alternates: charge, throw, charge, throw. Alternating
      // rather than choosing means a player can learn the fight, which is the
      // whole difference between hard and unfair.
      if (phase >= 2 && b.beat % 2 === 1) startThrow(b)
      else startCharge(ctx, b)
      b.beat++
      break

    case 'charging':
      charge(ctx, b)
      break

    case 'throwing':
      if (b.timer === 0) {
        throwRock(ctx, b)
        startIdle(b)
      }
      break

    case 'exposed':
      // Flat on his face, soft back up. This is the entire damage window.
      if (b.timer === 0) startIdle(b)
      break

    case 'dying':
      if (b.timer === 0) b.state = 'dead'
      break
  }

  fall(ctx, b)
}

function startIdle(b: Boss): void {
  b.state = 'idle'
  b.vx = 0
  b.timer = BOSS.IDLE_FRAMES[phaseOf(b) - 1]!
}

function startCharge(ctx: BossStepContext, b: Boss): void {
  b.state = 'charging'
  // Toward the player, so a player who stands still is never safe.
  const centre = b.x + b.w / 2
  b.facing = ctx.player.x + ctx.player.w / 2 < centre ? -1 : 1
  b.vx = b.facing * BOSS.CHARGE_SPEED[phaseOf(b) - 1]!
  b.timer = 0
}

function charge(ctx: BossStepContext, b: Boss): void {
  const blocked = moveX(ctx.map, b, b.vx)
  const hitArenaEdge = b.x <= ctx.arena.x || b.x + b.w >= ctx.arena.x + ctx.arena.w

  if (blocked || hitArenaEdge) {
    // The bonk. Clamp him inside the bowl first: the arena is a soft wall, and
    // a King who ends up outside it would charge somewhere the camera is not.
    b.x = Math.max(ctx.arena.x, Math.min(b.x, ctx.arena.x + ctx.arena.w - b.w))
    b.vx = 0
    b.state = 'exposed'
    b.timer = BOSS.BONK_STUN
  }
}

function startThrow(b: Boss): void {
  b.state = 'throwing'
  b.vx = 0
  b.timer = BOSS.THROW_TELEGRAPH
}

/**
 * A rock, lobbed at where the player is standing.
 *
 * Aimed rather than fixed, but slow and high — the arc is the telegraph, and
 * PRD's honest-difficulty pillar wants you to be able to see it coming and
 * walk out from under it.
 */
function throwRock(ctx: BossStepContext, b: Boss): void {
  const from = { x: b.x + b.w / 2, y: b.y - 4 }
  const dx = ctx.player.x + ctx.player.w / 2 - from.x
  const flight = BOSS.ROCK_FLIGHT_FRAMES

  const rock = ctx.rocks.find((r) => !r.alive) ?? pushRock(ctx.rocks)
  rock.x = from.x - 4
  rock.y = from.y
  rock.w = 8
  rock.h = 8
  rock.vx = dx / flight
  // Solve for the vertical launch that lands at the player's height in `flight`
  // frames, so the arc always arrives rather than always falling short.
  const dy = ctx.player.y - from.y
  rock.vy = dy / flight - (BOSS.ROCK_GRAVITY * flight) / 2
  rock.alive = true
}

function pushRock(rocks: Rock[]): Rock {
  const rock: Rock = { x: 0, y: 0, w: 8, h: 8, vx: 0, vy: 0, alive: false }
  rocks.push(rock)
  return rock
}

function fall(ctx: BossStepContext, b: Boss): void {
  b.vy = Math.min(b.vy + BOSS.GRAVITY, BOSS.TERMINAL_FALL)
  if (moveY(ctx.map, b, b.vy).blocked) b.vy = 0
}

/** A stomp on the exposed back. Returns true if it counted. */
export function hitHermitKing(b: Boss): boolean {
  if (!isVulnerable(b)) return false
  b.hits++
  b.state = b.hits >= BOSS.HERMIT_HITS ? 'dying' : 'idle'
  b.timer = b.state === 'dying' ? BOSS.DEATH_FRAMES : BOSS.IDLE_FRAMES[phaseOf(b) - 1]!
  b.vx = 0
  return true
}

export function updateRocks(map: TileMap, rocks: Rock[]): void {
  for (const r of rocks) {
    if (!r.alive) continue
    r.vy = Math.min(r.vy + BOSS.ROCK_GRAVITY, BOSS.TERMINAL_FALL)
    if (moveX(map, r, r.vx) || moveY(map, r, r.vy).blocked) r.alive = false
  }
}
