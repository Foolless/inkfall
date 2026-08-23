/**
 * What happens when Nib and something that wants him dead occupy the same
 * pixels.
 *
 * Three outcomes, checked in this order, and the order is the design:
 *
 *   1. A **Charged dash** kills what it passes through.
 *   2. A **stomp** — coming down, onto the band across the thing's head.
 *   3. Anything else **costs a tier**.
 *
 * Charged first because a Charged player who dashes into a crab has earned the
 * kill from any angle; stomp before contact because the whole feel of the genre
 * is that landing on a thing beats touching it, and a frame where both are true
 * must resolve in the player's favour.
 */

import { BOSS, CHARGED_TIER, DISPLAY, ENEMIES, INK, PHYSICS, RULES } from './constants.js'
import { boxesOverlap, type Box } from './collision.js'
import { canStomp, hurtBox, stompBox, type Enemy } from './enemies/index.js'
import { hurt, tierOf, type Player } from './player.js'
import { POINTS, stompValue } from './score.js'
import type { TileMap } from './tilemap.js'
import { hitHermitKing, isVulnerable, type Boss, type Rock } from './bosses/index.js'

const T = DISPLAY.TILE

export interface CombatState {
  map: TileMap
  player: Player
  enemies: Enemy[]
  collapsed: Set<number>
  /** Stomps landed since the last time Nib touched the ground. */
  chain: number
  score: number
  /** Frames the whole simulation is frozen for. Juice, but stateful juice. */
  hitstop: number
  boss: Boss | null
  rocks: Rock[]
  /** Named sounds for this frame. The simulation never makes a noise itself. */
  cues: string[]
}

export function resolveCombat(w: CombatState, jumpHeld: boolean): void {
  const p = w.player
  if (!p.alive) return

  // A chain is "no ground contact between links". Touching down ends it.
  if (p.grounded) w.chain = 0

  // Snapshot how Nib arrived, before any of this frame's contacts change it.
  // Every enemy in this loop is judged against the same approach — otherwise
  // the first stomp's bounce reverses `vy` and the second crab in the same
  // landing reads as a walk into its flank.
  const approach = { descending: p.vy > 0, prevBottom: p.prevY + p.h }
  let stomped = false

  for (const e of w.enemies) {
    if (!e.alive || !boxesOverlap(p, hurtBox(e))) continue

    if (p.tier === CHARGED_TIER && p.dashFrames > 0 && !e.armoured) {
      chargedKill(w, e)
      continue
    }

    if (canStomp(e) && isStompContact(p, approach, e)) {
      stomp(w, e, jumpHeld)
      stomped = true
      continue
    }

    // A landing beats a touch. Come down between two crabs and you have
    // stomped one of them; being bitten by its neighbour in the same instant is
    // exactly the unearned double-hit the whole shrink-cloud rule exists to
    // prevent, and it would be unreadable in hindsight.
    if (stomped) continue

    takeHit(w, e)
  }

  resolveBoss(w, approach, stomped, jumpHeld)
}

/**
 * The King, and the rocks he throws.
 *
 * The only thing that can be hit is the soft back he leaves exposed after a
 * bonk. Every other part of him, in every other state, costs a tier — and the
 * rocks cost a tier too, because they are enemy projectiles rather than
 * geometry (PRD §6.2).
 */
function resolveBoss(w: CombatState, approach: Approach, stomped: boolean, jumpHeld: boolean): void {
  const p = w.player
  const boss = w.boss

  for (const r of w.rocks) {
    if (!r.alive || !boxesOverlap(p, r)) continue
    r.alive = false
    takeHit(w, r)
  }

  if (!p.alive || !boss || boss.state === 'dead' || boss.state === 'dying') return
  if (!boxesOverlap(p, boss)) return

  if (isVulnerable(boss) && (approach.descending || stomped)) {
    const killed = boss.hits + 1 >= BOSS.HERMIT_HITS
    if (hitHermitKing(boss)) {
      w.score += POINTS.BOSS_HIT
      p.ink = Math.min(p.ink + INK.STOMP_REFUND, tierOf(p).inkMax)
      p.vy = jumpHeld ? PHYSICS.STOMP_BOUNCE_HELD : PHYSICS.STOMP_BOUNCE
      p.grounded = false
      p.jumping = false
      p.iframes = Math.max(p.iframes, RULES.HURT_IFRAMES / 2)
      w.hitstop = Math.max(w.hitstop, DISPLAY.HITSTOP_SHRINK)
      w.cues.push('bossHit')
      if (killed) w.score += POINTS.BOSS
    }
    return
  }

  takeHit(w, boss)
}

export interface Approach {
  descending: boolean
  prevBottom: number
}

/**
 * Was this contact a landing, rather than a walk into the side?
 *
 * Two conditions, and both matter. Nib must have been moving down, and his feet
 * must have been above the enemy's head band when the frame began — `prevY` is
 * carried for exactly this. Without the second test, a fast horizontal dash
 * into a crab's flank reads as a stomp because the sweep put him briefly above
 * its centre line.
 */
function isStompContact(p: Player, approach: Approach, e: Enemy): boolean {
  if (!approach.descending) return false
  const band = stompBox(e, ENEMIES.STOMP_BAND)
  return approach.prevBottom <= band.y + band.h && boxesOverlap(p, band)
}

function stomp(w: CombatState, e: Enemy, jumpHeld: boolean): void {
  const p = w.player
  e.alive = false

  w.score += stompValue(w.chain)
  w.chain++

  // The refund is the core of chained aerial traversal: bounce, dash, bounce.
  p.ink = Math.min(p.ink + INK.STOMP_REFUND, tierOf(p).inkMax)
  p.vy = jumpHeld ? PHYSICS.STOMP_BOUNCE_HELD : PHYSICS.STOMP_BOUNCE
  p.grounded = false
  // Not a jump, so the variable-height cut must leave it alone.
  p.jumping = false
  w.hitstop = Math.max(w.hitstop, DISPLAY.HITSTOP_FRAMES)
  w.cues.push('stomp')
}

/**
 * A Charged dash-through counts as a stomp chain (PRD §8.2), so a dash down a
 * corridor of Snappers escalates the same way a bounce chain does. The first
 * kill is worth the flat Charged value because that is higher than the first
 * link; after that the chain table takes over.
 */
function chargedKill(w: CombatState, e: Enemy): void {
  e.alive = false
  w.score += Math.max(POINTS.CHARGED_KILL, stompValue(w.chain))
  w.chain++
  w.hitstop = Math.max(w.hitstop, DISPLAY.HITSTOP_FRAMES)
}

function takeHit(w: CombatState, source: Box): void {
  const p = w.player
  const landed = hurt(w.map, p, source.x + source.w / 2, w.collapsed)
  if (!landed) return

  w.hitstop = Math.max(w.hitstop, DISPLAY.HITSTOP_SHRINK)
  w.cues.push(p.alive ? 'shrink' : 'death')
  if (p.alive) stunNearby(w, p)
}

/**
 * The expelled ink cloud stuns every enemy within two tiles for thirty frames.
 *
 * This is what makes the classic Mario failure of being hit twice in half a
 * second essentially impossible. It is tuned to prevent double-hits, not to be
 * a weapon — if players start farming hits to clear rooms, PRD §15 says cut the
 * radius before the duration, because the anti-double-hit property is the part
 * that must survive.
 */
function stunNearby(w: CombatState, p: Box): void {
  const radius = RULES.SHRINK_STUN_RADIUS * T
  const cx = p.x + p.w / 2
  const cy = p.y + p.h / 2
  for (const e of w.enemies) {
    if (!e.alive) continue
    const dx = e.x + e.w / 2 - cx
    const dy = e.y + e.h / 2 - cy
    if (Math.hypot(dx, dy) <= radius) e.stun = RULES.SHRINK_STUN_FRAMES
  }
}
