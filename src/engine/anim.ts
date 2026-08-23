/**
 * Nib's animation state machine.
 *
 * Deliberately outside the simulation. Animation is presentation: it reads the
 * player's state and picks a frame, and nothing it does can feed back into
 * physics. Keeping it here is what lets the determinism hash stay a statement
 * about the *simulation* rather than about how the squid happened to be drawn.
 *
 * It is still a pure state machine over plain numbers, so it unit-tests without
 * a canvas.
 */

import { CHARGED_TIER, RULES, SPENT, type TierIndex } from '../game/constants.js'
import { NIB_CHARGED_PALETTE, NIB_PALETTE, NIB_SPENT_PALETTE } from '../content/palettes.js'
import * as nib from '../content/sprites/nib.js'
import type { SpriteDef } from '../content/sprites/format.js'

export type Pose = 'idle' | 'walk' | 'rise' | 'fall' | 'dash' | 'swim' | 'hurt' | 'death'

/** Everything animation is allowed to know about the player. */
export interface AnimView {
  vx: number
  vy: number
  grounded: boolean
  inWater: boolean
  dashFrames: number
  stunCloud: number
  alive: boolean
  tier: TierIndex
}

export interface Anim {
  pose: Pose
  /** Frames in the current pose. Resets on change so a cycle starts at 0. */
  clock: number
  /** Pixels travelled on the ground, so the scud cycle syncs with speed. */
  stride: number
}

export function createAnim(): Anim {
  return { pose: 'idle', clock: 0, stride: 0 }
}

/** Below this the squid is loitering, not moving. */
const MOVING = 0.1
/** How long the recoil frame holds after a hit. Matches the shrink hitstop. */
const HURT_POSE_FRAMES = 8

export function poseFor(v: AnimView): Pose {
  if (!v.alive) return 'death'
  if (v.stunCloud > RULES.SHRINK_STUN_FRAMES - HURT_POSE_FRAMES) return 'hurt'
  if (v.dashFrames > 0) return 'dash'
  if (v.inWater) return 'swim'
  if (!v.grounded) return v.vy < 0 ? 'rise' : 'fall'
  return Math.abs(v.vx) > MOVING ? 'walk' : 'idle'
}

export function updateAnim(a: Anim, v: AnimView): Anim {
  const pose = poseFor(v)
  if (pose === a.pose) a.clock++
  else {
    a.pose = pose
    a.clock = 0
  }
  if (pose === 'walk') a.stride += Math.abs(v.vx)
  else if (pose !== 'dash') a.stride = 0
  return a
}

const FULL_FRAMES: Record<Pose, readonly SpriteDef[]> = {
  idle: [nib.nibIdle0, nib.nibIdle1],
  walk: [nib.nibWalk0, nib.nibWalk1, nib.nibWalk2, nib.nibWalk3],
  rise: [nib.nibRise],
  fall: [nib.nibFall],
  dash: [nib.nibDash0, nib.nibDash1],
  swim: [nib.nibSwim0, nib.nibSwim1, nib.nibSwim2, nib.nibSwim3],
  hurt: [nib.nibHurt],
  death: [nib.nibDeath0, nib.nibDeath1, nib.nibDeath2],
}

const SPENT_FRAMES: Record<Pose, readonly SpriteDef[]> = {
  idle: [nib.spentIdle0, nib.spentIdle1],
  walk: [nib.spentWalk0, nib.spentWalk1],
  rise: [nib.spentRise],
  fall: [nib.spentFall],
  dash: [nib.spentDash],
  swim: [nib.spentSwim0, nib.spentSwim1],
  hurt: [nib.spentHurt],
  death: [nib.spentDeath0, nib.spentDeath1],
}

/** How many frames each cycle holds a single cel. Idle is the slow mantle pulse. */
const HOLD: Record<Pose, number> = {
  idle: 30,
  walk: 6,
  rise: 1,
  fall: 1,
  dash: 4,
  swim: 6,
  hurt: 1,
  death: RULES.DEATH_ANIM_FRAMES / 3,
}

export function frameFor(a: Anim, tier: TierIndex): SpriteDef {
  const set = tier === SPENT ? SPENT_FRAMES : FULL_FRAMES
  const frames = set[a.pose]
  if (frames.length === 1) return frames[0]!

  // The scud cycle advances with distance travelled; everything else with time.
  const tick = a.pose === 'walk' ? a.stride / 6 : a.clock / HOLD[a.pose]
  // Death plays once and holds its last cel rather than looping back to alive.
  const index = a.pose === 'death' ? Math.min(frames.length - 1, Math.floor(tick)) : Math.floor(tick) % frames.length
  return frames[index]!
}

export function paletteFor(tier: TierIndex): readonly string[] {
  if (tier === SPENT) return NIB_SPENT_PALETTE
  return tier === CHARGED_TIER ? NIB_CHARGED_PALETTE : NIB_PALETTE
}
