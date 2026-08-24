/**
 * Screen shake, silt and the shrink burst. PLAN.md checkpoint 4.6.
 *
 * ## Why none of this is in the simulation
 *
 * All of it is *render-side*, driven by the cues the world already raises and
 * by the player's own state. That is not an implementation convenience — it is
 * what keeps the determinism guarantee (§12.6) intact. A particle that lived in
 * the world would be state the replay hash has to agree on, and a screen shake
 * that moved the camera through the simulation would make two identical input
 * logs produce two different worlds the moment one of them stuttered.
 *
 * So: the simulation says *what happened*, this decides what that looks like,
 * and a headless replay raises the same cues with nobody watching.
 *
 * ## No `Math.random`
 *
 * Not because it would break anything here, but because the habit is worth
 * keeping: a hash of the frame number gives the same scatter every time a
 * moment is replayed, so a recorded bug looks the same on the second viewing.
 */

import { DISPLAY } from '../game/constants.js'
import type { Cue } from '../game/cues.js'

/** Particles are pooled: §12.6's rule applies to the render path too. */
export const MAX_PARTICLES = 96

export interface Particle {
  alive: boolean
  x: number
  y: number
  vx: number
  vy: number
  /** Frames left. Also drives the fade, so it is the only clock a particle has. */
  life: number
  maxLife: number
  /** 0 silt, 1 ink. Two looks, one pool. */
  kind: 0 | 1
}

export interface Juice {
  /** Shake magnitude in pixels, decaying. Zero means still. */
  shake: number
  particles: Particle[]
  /** Ticks with the render, so the scatter is stable across a replay. */
  frame: number
  /** Was the player grounded last frame? Landing is an edge, not a state. */
  wasGrounded: boolean
  wasTier: number
  /** Fall speed on the last airborne frame, so a landing knows how hard it was. */
  lastFall: number
}

export function createJuice(): Juice {
  return {
    shake: 0,
    particles: Array.from({ length: MAX_PARTICLES }, () => ({
      alive: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      kind: 0 as 0 | 1,
    })),
    frame: 0,
    wasGrounded: true,
    wasTier: 1,
    lastFall: 0,
  }
}

/**
 * How hard each cue hits the camera, in pixels.
 *
 * Nothing routine is in here. A stomp does not shake the screen — it happens
 * dozens of times a level and a screen that shakes for everything is a screen
 * that shakes for nothing. What is left is the short list of moments the player
 * should feel in their hands: taking damage, a bomb, a boss.
 */
const SHAKE: Partial<Record<Cue, number>> = {
  shrink: 3.5,
  death: 4.5,
  blast: 3,
  bossHit: 2.5,
  bossDeath: 6,
  bonk: 1.2,
  core: 2,
}

/** Deterministic scatter in [-1, 1), from an integer. No `Math.random`. */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

function spawn(j: Juice, x: number, y: number, vx: number, vy: number, life: number, kind: 0 | 1): void {
  for (const p of j.particles) {
    if (p.alive) continue
    p.alive = true
    p.x = x
    p.y = y
    p.vx = vx
    p.vy = vy
    p.life = life
    p.maxLife = life
    p.kind = kind
    return
  }
  // The pool is full. Dropping the particle is correct: the alternative is
  // growing it, and nobody has ever noticed the ninety-seventh speck of silt.
}

export interface JuiceInput {
  cues: readonly Cue[]
  x: number
  y: number
  w: number
  h: number
  grounded: boolean
  vy: number
  tier: number
  alive: boolean
}

/**
 * Advance the juice by a frame. Called once per simulation step.
 *
 * `intensity` is §13's screen-shake slider, 0 to 1, and it scales the shake to
 * nothing without touching anything else — the particles stay, because they are
 * not what makes anybody motion sick.
 */
export function updateJuice(j: Juice, p: JuiceInput, intensity = 1): void {
  j.frame++

  for (const cue of p.cues) {
    const hit = SHAKE[cue]
    if (hit !== undefined) j.shake = Math.max(j.shake, hit * intensity)
    // §11.2's shrink burst: ink thrown out of Nib in every direction, which is
    // literally what a tier costs him.
    if (cue === 'shrink') {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        spawn(j, p.x + p.w / 2, p.y + p.h / 2, Math.cos(a) * 1.6, Math.sin(a) * 1.6 - 0.4, 26, 1)
      }
    }
    if (cue === 'blast') {
      for (let i = 0; i < 8; i++) {
        spawn(j, p.x + p.w / 2, p.y + p.h / 2, noise(j.frame + i) * 2.2, noise(j.frame * 3 + i) * 2.2, 20, 1)
      }
    }
  }

  // Silt on landing. An edge, not a state — a squid standing on sand does not
  // kick it up forever, and the harder the landing the more of it there is.
  if (p.grounded && !j.wasGrounded && p.alive) {
    const count = Math.min(6, 1 + Math.floor(Math.abs(j.lastFall) / 1.5))
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1
      spawn(j, p.x + p.w / 2 + noise(j.frame + i) * p.w, p.y + p.h - 1, side * (0.4 + Math.abs(noise(i)) * 0.5), -0.5, 18, 0)
    }
  }
  j.lastFall = p.grounded ? 0 : p.vy
  j.wasGrounded = p.grounded
  j.wasTier = p.tier

  // Shake decays fast. A long shake is a rumble, and a rumble reads as a bug.
  j.shake *= 0.82
  if (j.shake < 0.05) j.shake = 0

  for (const particle of j.particles) {
    if (!particle.alive) continue
    particle.x += particle.vx
    particle.y += particle.vy
    particle.vy += particle.kind === 0 ? 0.06 : 0.03
    particle.vx *= 0.94
    particle.life--
    if (particle.life <= 0) particle.alive = false
  }
}

/** The camera offset this frame, in whole pixels. Zero when still. */
export function shakeOffset(j: Juice): { x: number; y: number } {
  if (j.shake === 0) return ZERO
  OFFSET.x = Math.round(noise(j.frame) * j.shake)
  OFFSET.y = Math.round(noise(j.frame + 991) * j.shake)
  return OFFSET
}

const ZERO = { x: 0, y: 0 }
/** Reused, like everything else that would otherwise be per-frame garbage. */
const OFFSET = { x: 0, y: 0 }

/** The HUD strip's height. Silt never lands on it (§11.2). */
export const HUD_HEIGHT = 16

/** Is this screen position inside the playfield, rather than under the HUD? */
export function onScreen(x: number, y: number): boolean {
  return x >= 0 && x < DISPLAY.WIDTH && y >= HUD_HEIGHT && y < DISPLAY.HEIGHT
}
