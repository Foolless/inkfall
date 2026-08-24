/**
 * What happens when Nib and something that wants him dead occupy the same
 * pixels.
 *
 * Four outcomes, checked in this order, and the order is the design:
 *
 *   1. Anything **lethal** kills, whatever the tier. A Hookline's barbs.
 *   2. A **Charged dash** kills what it passes through.
 *   3. A **stomp** — coming down, onto the band across the thing's head.
 *   4. Anything else **costs a tier**.
 *
 * Lethal first because it is geometry wearing an enemy's clothes, and geometry
 * always wins. Charged before stomp because a Charged player who dashes into a
 * crab has earned the kill from any angle; stomp before contact because the
 * whole feel of the genre is that landing on a thing beats touching it, and a
 * frame where both are true must resolve in the player's favour.
 *
 * Projectiles are resolved in the same pass rather than in one of their own,
 * because "an ink bolt kills a Drifter" and "Nib stomps a Snapper" are the same
 * kind of statement and should be readable side by side.
 */

import { CHARGED_TIER, DISPLAY, ENEMIES, INK, PHYSICS, RULES, UPGRADES } from './constants.js'
import { boxesOverlap, type Box } from './collision.js'
import {
  canStomp,
  extraHurtBox,
  hurtBox,
  inkEffect,
  inkTarget,
  lethalBox,
  socketEel,
  stompBox,
  type Enemy,
} from './enemies/index.js'
import { hurt, inkMax, kill, type Player } from './player.js'
import { POINTS, stompValue } from './score.js'
import type { TileMap } from './tilemap.js'
import { blastBox, type Projectile } from './projectiles.js'
import { hasUpgrade } from './upgrades.js'
import { bossHazards, hitBoss, openParts, type Boss, type BossPart, type PartHit, type Rock } from './bosses/index.js'

const T = DISPLAY.TILE

export interface CombatState {
  map: TileMap
  player: Player
  enemies: Enemy[]
  projectiles: Projectile[]
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

/** Reused across frames — PRD §12.6 wants no garbage in the update loop. */
const HAZARD_SCRATCH: Box[] = []

export function resolveCombat(w: CombatState, jumpHeld: boolean): void {
  const p = w.player
  if (!p.alive) return

  // A chain is "no ground contact between links". Touching down ends it.
  if (p.grounded) w.chain = 0

  resolveInk(w)
  if (!p.alive) return

  // Snapshot how Nib arrived, before any of this frame's contacts change it.
  // Every enemy in this loop is judged against the same approach — otherwise
  // the first stomp's bounce reverses `vy` and the second crab in the same
  // landing reads as a walk into its flank.
  const approach = { descending: p.vy > 0, prevBottom: p.prevY + p.h }
  let stomped = false

  for (const e of w.enemies) {
    if (!e.alive || e.harmless) continue

    // Geometry wearing an enemy's clothes. Nothing survives it, and nothing
    // needs to be checked after it.
    const lethal = lethalBox(e)
    if (lethal && boxesOverlap(p, lethal)) {
      kill(p)
      w.cues.push('death')
      return
    }

    // A Whipkelp's arm: the half you are *not* meant to attack.
    const arm = extraHurtBox(e)
    if (arm && !stomped && boxesOverlap(p, arm)) {
      takeHit(w, arm)
      if (!p.alive) return
    }

    if (!boxesOverlap(p, hurtBox(e))) continue

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
    if (!p.alive) return
  }

  resolveEnemyProjectiles(w)
  if (!p.alive) return

  resolveBoss(w, approach, stomped, jumpHeld)
}

/**
 * Nib's own ink, and what it does to what it lands on.
 *
 * The `inkTarget` indirection is the whole of §6.1's "Ink?" column: for most
 * things a bolt anywhere on the hurtbox counts, but a Whipkelp's base, a
 * Snail's rear and a Lightless's lure are the three enemies built around
 * *where* the shot lands, and the combat pass never needs to know which is
 * which.
 */
function resolveInk(w: CombatState): void {
  for (const proj of w.projectiles) {
    if (!proj.alive || !proj.friendly) continue

    for (const e of w.enemies) {
      if (!e.alive) continue
      const effect = inkEffect(e)
      if (effect === 'none') continue
      if (!boxesOverlap(proj, inkTarget(e))) continue

      proj.alive = false
      if (effect === 'kill') {
        e.alive = false
        w.score += POINTS.INKED
        w.cues.push('inkKill')
      } else {
        // Stun, not death. An Eel cannot be solved, only bought time from —
        // §8.5 is emphatic that the Ink Shot is a key and not a gun.
        e.stun = UPGRADES.SHOT_STUN
        if (e.kind === 'eel') socketEel(e)
        w.cues.push('inkStun')
      }
      break
    }
  }

  resolveBlasts(w)
}

/**
 * An Ink Bomb going off. Terrain is the world's business; this is the rest.
 *
 * Everything unarmoured in the radius dies, which is the one moment in the game
 * where ink is genuinely a weapon rather than a key — and it costs a pip, a
 * twenty-frame fuse, and standing three tiles clear of your own blast.
 *
 * Nib is deliberately not in his own blast. A bomb that could kill the player
 * would make every cracked wall a coin toss, and §8.5 sells it as a door.
 */
function resolveBlasts(w: CombatState): void {
  for (const proj of w.projectiles) {
    if (!proj.detonated) continue
    const blast = blastBox(proj)
    for (const e of w.enemies) {
      if (!e.alive || e.armoured) continue
      if (!boxesOverlap(blast, hurtBox(e))) continue
      e.alive = false
      w.score += POINTS.INKED
    }
  }
}

/**
 * Barbs and embers. The two things in the game that are fired *at* Nib.
 *
 * An ember costs a tier rather than killing — PRD §6.2's one exception to
 * "hazards are instant death" — because it is an enemy projectile rather than
 * geometry. Heat Shell turns it off entirely, which is that upgrade's pitch.
 */
function resolveEnemyProjectiles(w: CombatState): void {
  const p = w.player
  const shell = hasUpgrade(p.upgrades, 'heatShell')

  for (const proj of w.projectiles) {
    if (!proj.alive || proj.friendly) continue
    if (!boxesOverlap(p, proj)) continue
    if (proj.kind === 'ember' && shell) continue

    // A barb is spent on contact. An ember goes on burning where it lies, so a
    // player who took the hit still cannot walk back across it.
    if (proj.kind !== 'ember') proj.alive = false
    takeHit(w, proj)
    if (!p.alive) return
  }
}

/**
 * The boss: everything that hurts, and the one thing that can be hurt.
 *
 * Five bosses go through this unchanged, because the question is the same for
 * all of them — is a part open, and did the player hit it the way it asked. The
 * King answers with his own body; the other four answer with a part.
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

  // How Nib is currently touching things, in the vocabulary the parts speak.
  // Ink is handled where all the other ink is; this is the contact half.
  //
  // A dash is checked *first*. Descending and dashing are not exclusive — the
  // Kelp Warden's third phase adds a downdraft to `vy` every frame — and
  // resolving `descending` first meant every dash into that arena read as a
  // stomp, so the Warden's dash-gated core refused all of them and the player
  // took a tier for it.
  const how: PartHit | null = p.dashFrames > 0 ? 'dash' : approach.descending || stomped ? 'stomp' : null

  // The King is the one boss whose body *is* the open part, because he predates
  // the part system and his window is a state rather than a box.
  if (boss.id === 'hermitKing') {
    if (!boxesOverlap(p, boss)) return
    if (boss.state === 'exposed' && (approach.descending || stomped)) {
      // `payBossHit` already pays the kill bonus when the hit is the last one,
      // so paying it again here made the King worth 10,500 instead of 5,500.
      if (hitBoss(boss, KING_BACK, 'stomp') === 'hit') payBossHit(w, 'hit', jumpHeld)
      return
    }
    takeHit(w, boss)
    return
  }

  if (how !== null) {
    for (const target of openParts(boss)) {
      if (!boxesOverlap(p, target)) continue
      const result = hitBoss(boss, target, how)
      if (result === 'none') continue
      payBossHit(w, result, jumpHeld)
      return
    }
  }

  for (const box of bossHazards(boss, HAZARD_SCRATCH)) {
    if (!boxesOverlap(p, box)) continue
    takeHit(w, box)
    return
  }
  if (boxesOverlap(p, boss)) takeHit(w, boss)
}

/**
 * Ink into an open boss part, resolved alongside the bolts that hit enemies.
 *
 * Separate from `resolveInk` only because a boss is not in the enemy list. The
 * rule is identical: an open part, hit the way it asked, counts.
 */
export function resolveBossInk(w: CombatState): void {
  const boss = w.boss
  if (!boss || boss.state === 'dead' || boss.state === 'dying') return

  for (const proj of w.projectiles) {
    if (!proj.alive || !proj.friendly) continue
    for (const target of openParts(boss)) {
      if (target.hit !== 'ink' || !boxesOverlap(proj, target)) continue
      proj.alive = false
      const result = hitBoss(boss, target, 'ink')
      if (result !== 'none') payBossHit(w, result, false)
      break
    }
  }
}

/**
 * A stand-in part for the King, who has none.
 *
 * Rather than retrofit him with a part he does not need, `hitBoss` is handed
 * something open and stompable and asked the same question as everyone else —
 * his own state is what actually decides.
 */
const KING_BACK: BossPart = {
  kind: 'core',
  index: 0,
  alive: true,
  open: true,
  hit: 'stomp',
  hurtful: false,
  state: 0,
  timer: 0,
  vx: 0,
  vy: 0,
  homeX: 0,
  homeY: 0,
  x: 0,
  y: 0,
  w: 0,
  h: 0,
}

/** The payout, the refund and the bounce. Identical for all five bosses. */
function payBossHit(w: CombatState, result: 'part' | 'hit', jumpHeld: boolean): void {
  const p = w.player
  w.score += result === 'hit' ? POINTS.BOSS_HIT : POINTS.INKED

  if (result === 'hit') {
    p.ink = Math.min(p.ink + INK.STOMP_REFUND, inkMax(p))
    p.vy = jumpHeld ? PHYSICS.STOMP_BOUNCE_HELD : PHYSICS.STOMP_BOUNCE
    p.grounded = false
    p.jumping = false
    p.iframes = Math.max(p.iframes, RULES.HURT_IFRAMES / 2)
    w.hitstop = Math.max(w.hitstop, DISPLAY.HITSTOP_SHRINK)
    if (w.boss?.state === 'dying') w.score += POINTS.BOSS
  }
  // The hit that ends a fight gets the longer sound. Five of these exist and
  // each one is something the player will remember.
  w.cues.push(w.boss?.state === 'dying' ? 'bossDeath' : 'bossHit')
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
  p.ink = Math.min(p.ink + INK.STOMP_REFUND, inkMax(p))
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
  // Not a stomp: nothing was landed on. §10.3 lists enemy death separately
  // from stomp for exactly this reason — the two do not feel the same.
  w.cues.push('enemyDeath')
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
 *
 * A Ghost Diver ignores it, which is the point of a Ghost Diver.
 */
function stunNearby(w: CombatState, p: Box): void {
  const radius = RULES.SHRINK_STUN_RADIUS * T
  const cx = p.x + p.w / 2
  const cy = p.y + p.h / 2
  for (const e of w.enemies) {
    if (!e.alive || e.stunProof) continue
    const dx = e.x + e.w / 2 - cx
    const dy = e.y + e.h / 2 - cy
    if (Math.hypot(dx, dy) <= radius) e.stun = RULES.SHRINK_STUN_FRAMES
  }
}
