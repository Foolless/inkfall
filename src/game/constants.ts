/**
 * Every number a designer touches. PRD Appendix A.
 *
 * Units are pixels per frame at a fixed 60 Hz timestep.
 *
 * Values marked [tuned] were changed during Phase 1 because the feel-guarantee
 * tests rejected the PRD's original figures — the original JUMP_IMPULSE of
 * -4.60 produced a jump 1.6 tiles high against a stated guarantee of 3. That
 * is exactly what those tests exist to catch. See tests/movement.test.ts and
 * tests/dash.test.ts, which are the executable definition of "correct" here:
 * change a constant below and they will tell you what you broke.
 */

export const DISPLAY = {
  WIDTH: 320,
  HEIGHT: 180,
  TILE: 16,
  CAMERA_LOOKAHEAD: 32,
  CAMERA_EASE_FRAMES: 20,
  CAMERA_DEADZONE_Y: 48,
  HITSTOP_FRAMES: 3,
  /** Shrinking freezes a beat longer than a stomp — PRD §9.5. */
  HITSTOP_SHRINK: 4,
} as const

export const PHYSICS = {
  GRAVITY: 0.42,
  TERMINAL_FALL: 6.0,
  WALK_ACCEL: 0.18,
  WALK_MAX: 1.6,
  RUN_ACCEL: 0.24,
  RUN_MAX: 2.6,
  GROUND_FRICTION: 0.24, // [tuned] 0.22 stopped in exactly 12 frames — no margin
  AIR_ACCEL: 0.1,
  AIR_DRAG: 0.04,
  JUMP_IMPULSE: -6.6, // [tuned] was -4.60, which cleared only 1.6 tiles
  JUMP_CUT: -1.8,
  COYOTE_FRAMES: 6,
  JUMP_BUFFER_FRAMES: 6,
  STOMP_BOUNCE: -4.6, // [tuned] rescaled against the new jump impulse
  STOMP_BOUNCE_HELD: -6.2,
} as const

export const INK = {
  MAX: 3,
  DASH_COST: 1,
  DASH_SPEED: 5.6, // [tuned] was 5.2; 7-tile guarantee missed by half a tile
  DASH_SPEED_WATER: 6.4,
  DASH_LOCK_FRAMES: 10, // [tuned] was 8
  DASH_CARRYOVER: 0.72, // [tuned] was 0.60
  DASH_COOLDOWN: 10,
  DASH_IFRAMES: 4,
  REFILL_GROUND: 45,
  REFILL_WATER: 20,
  REFILL_AIR: Infinity, // disabled by design: hang time must not be farmable
  STOMP_REFUND: 1,
} as const

export const WATER = {
  GRAVITY: 0.14,
  TERMINAL_FALL: 2.2,
  SWIM_STROKE: -1.9,
  SWIM_MAX_X: 1.8,
  ENTRY_DAMP: 0.4,
} as const

/**
 * Tiers, ordered low to high. A hit steps one index down; a pickup steps one up.
 * Only these values differ between tiers — everything else is shared, so the
 * game never feels like three different games.
 */
export const TIERS = [
  { id: 'spent', inkMax: 2, w: 10, h: 10, gravity: 0.4, jump: -6.8, runMax: 2.7, crumbleHold: 36, dashKills: false },
  { id: 'full', inkMax: 3, w: 12, h: 14, gravity: 0.42, jump: -6.6, runMax: 2.6, crumbleHold: 24, dashKills: false },
  { id: 'charged', inkMax: 3, w: 12, h: 14, gravity: 0.42, jump: -6.6, runMax: 2.6, crumbleHold: 24, dashKills: true },
] as const

export type TierIndex = 0 | 1 | 2
export const SPENT = 0 as const
export const FULL = 1 as const
export const CHARGED_TIER = 2 as const

export const CHARGED = {
  DASH_TRAIL_FRAMES: 20,
  BREAKS_CRACKED: true,
  KILL_SCORE: 150,
} as const

export const RULES = {
  START_LIVES: 3,
  CONTINUES: 3,
  SHELLS_PER_LIFE: 100,
  CHECKPOINTS_PER_LEVEL: 2,
  INK_BULBS_PER_LEVEL: [4, 6],
  INK_CORES_PER_LEVEL: [1, 2],
  RESPAWN_IFRAMES: 60,
  HURT_IFRAMES: 90,
  HURT_KNOCKBACK: 8,
  SHRINK_STUN_FRAMES: 30,
  SHRINK_STUN_RADIUS: 2,
  RESPAWN_TIER: FULL, // never Spent, never Charged
  DEATH_ANIM_FRAMES: 90,
  CRUMBLE_RESPAWN: 180,
} as const

/**
 * The World 1 roster. PRD §6.1.
 *
 * Speeds are pixels per frame; distances in this block are **tiles**, because
 * that is the unit a level designer thinks in when placing a Puffer.
 */
export const ENEMIES = {
  /** Crab. Walks a platform and turns at ledges and walls. */
  SNAPPER_SPEED: 0.6,
  /** Jellyfish. Sine float, ignores terrain, damaging on every side. */
  DRIFTER_AMPLITUDE: 3,
  DRIFTER_PERIOD: 120,
  /** Inflates within this many tiles of Nib, and stays inflated this long. */
  PUFFER_TRIGGER: 3,
  PUFFER_INFLATE: 90,
  /** Enemies fall at Nib's rate — one gravity for the whole world. */
  GRAVITY: 0.42,
  TERMINAL_FALL: 6.0,
  /**
   * How far into an enemy's head still counts as a stomp.
   *
   * The forgiveness that makes stomping feel fair: land anywhere in the top few
   * pixels and it reads as a stomp, not as walking into the side of a crab.
   */
  STOMP_BAND: 6,
} as const

/**
 * Hazards with a clock. PRD §6.2.
 *
 * The crush clam's numbers are the honest-difficulty pillar in miniature: the
 * slam is fast because a slow one is not frightening, and the telegraph is long
 * because a death the player could not have seen coming is the one thing the
 * game promises never to do.
 */
export const HAZARDS = {
  CLAM_OPEN: 90,
  CLAM_SLAM: 6,
  CLAM_CLOSED: 60,
  CLAM_TELEGRAPH: 20,
} as const

/**
 * Bosses. PRD §6.3: three hits, three phases, one arena, no health bar.
 *
 * Per-phase values are indexed by phase - 1. Nothing here is random: a boss
 * that rolls dice cannot be practised, and a boss that cannot be practised is
 * not a NES boss.
 */
export const BOSS = {
  HERMIT_HITS: 3,
  /** He rears up before the first charge, so the fight has a beginning. */
  WAKE_FRAMES: 90,
  CHARGE_SPEED: [1.6, 1.6, 2.4],
  IDLE_FRAMES: [70, 55, 40],
  /** The damage window. Long, because the whole fight is this one moment. */
  BONK_STUN: 90,
  /** The wind-up before a rock leaves his claw. The arc is the rest of it. */
  THROW_TELEGRAPH: 40,
  ROCK_FLIGHT_FRAMES: 80,
  ROCK_GRAVITY: 0.16,
  GRAVITY: 0.42,
  TERMINAL_FALL: 6.0,
  DEATH_FRAMES: 120,
  /** Exactly one screen wide, so a fixed camera can hold the whole fight. */
  ARENA_TILES: 20,
  /**
   * How much sand the locked camera shows below the arena floor.
   *
   * Without it the floor sits exactly on the bottom edge of the screen and the
   * King fights on a horizon rather than on a beach.
   */
  ARENA_CAMERA_DROP: 28,
} as const

/** Collision resolves in sub-steps no larger than this, so nothing tunnels. */
export const MAX_SUBSTEP = 8
