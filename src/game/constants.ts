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
  /**
   * Frames a vertical direction stays "live" for aiming a dash after release.
   *
   * Gate 1 finding: players pressed X expecting to gain height and got a
   * horizontal dash, because the direction is sampled on the exact frame X goes
   * down. Only the vertical axis is buffered -- horizontal already falls back
   * to facing, which is almost always what the player wanted anyway.
   */
  DASH_DIR_BUFFER: 6,
  REFILL_GROUND: 45,
  REFILL_WATER: 20,
  REFILL_AIR: Infinity, // disabled by design: hang time must not be farmable
  STOMP_REFUND: 1,
} as const

/**
 * The five permanent upgrades. PRD §8.5.
 *
 * Every one of these is a *traversal* number. None of them touches how many
 * hits Nib can take — that is the tier system's job, and the two are kept
 * apart deliberately (see game/upgrades.ts).
 */
export const UPGRADES = {
  /** Ink Shot: a lobbed bolt. Kills Drifter, Whipkelp, Bone Shrimp; stuns Eel. */
  SHOT_SPEED: 4.0,
  SHOT_GRAVITY: 0.12,
  SHOT_COST: 1,
  SHOT_LIFE: 120,
  /** Long enough that spraying is not a strategy, short enough to feel like a verb. */
  SHOT_COOLDOWN: 20,
  SHOT_STUN: 90,

  /** Cling: grip for 60 frames, then slide. PRD §8.5. */
  CLING_FRAMES: 60,
  CLING_SLIDE: 1.2,
  /**
   * The first grip of an airtime is free; every later one costs a pip.
   *
   * That is what makes a cling shaft a *route* rather than a free elevator: a
   * three-storey climb on two pips is exactly three grips, and there is no
   * fourth.
   */
  CLING_REGRIP_COST: 1,
  /** Push-off from a wall jump. Small — the height comes from the jump itself. */
  CLING_JUMP_X: 2.4,

  /** Ink Bomb: 20-frame fuse, 3-tile radius (PRD §8.5). */
  BOMB_FUSE: 20,
  BOMB_RADIUS: 3,
  BOMB_COST: 1,
  BOMB_SPEED: 3.0,
  BOMB_GRAVITY: 0.2,

  /** Heat Shell: he survives standing in magma itself for 90 frames. */
  MAGMA_GRACE: 90,

  /** Deep Jet: a fourth pip, a shorter cooldown, a faster dash. */
  DEEP_JET_PIPS: 1,
  DEEP_JET_COOLDOWN: 6,
  DEEP_JET_SPEED: 0.6,
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
 * The roster. PRD §6.1 — twelve enemies, one lesson each.
 *
 * Speeds are pixels per frame; distances in this block are **tiles**, because
 * that is the unit a level designer thinks in when placing a Puffer.
 *
 * Every telegraph in here is long and every strike is fast. That asymmetry is
 * the honest-difficulty pillar written as numbers: a death the player could not
 * have seen coming is the one thing the game promises never to do.
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

  // ── World 2 ────────────────────────────────────────────────────────────────
  /** Barb Turret. Armoured barnacle; fires along one axis on a fixed cycle. */
  TURRET_CYCLE: 100,
  TURRET_TELEGRAPH: 20,
  BARB_SPEED: 2.6,
  BARB_LIFE: 120,
  /** Whipkelp. Lashes a 4-tile arc; only the base can be killed. */
  WHIPKELP_CYCLE: 120,
  WHIPKELP_LASH: 40,
  WHIPKELP_REACH: 4,
  /** Eel. Sits in a socket, lunges when Nib crosses its line. */
  EEL_TELEGRAPH: 40,
  EEL_LUNGE_SPEED: 3.2,
  EEL_REACH: 5,
  EEL_RETREAT: 90,
  /** How far off the eel's own row still counts as crossing its line. */
  EEL_SIGHT_BAND: 1.5,

  // ── World 3 ────────────────────────────────────────────────────────────────
  /** Ghost Diver. Drifts at Nib through walls. Cannot be killed or stunned. */
  GHOST_SPEED: 0.5,
  /** Hookline. Descends, sweeps, retracts. Death on contact, platform on top. */
  HOOK_DROP: 60,
  HOOK_SWEEP: 120,
  HOOK_RETRACT: 60,
  HOOK_SWEEP_SPEED: 0.9,
  /** The flat top that can be ridden, measured down from the hook's own top. */
  HOOK_RIDE_BAND: 4,

  // ── World 4 ────────────────────────────────────────────────────────────────
  /** Magma Snail. Armoured front and top; only the exposed rear takes ink. */
  SNAIL_SPEED: 0.3,
  /** How much of its length, from the tail, is soft. */
  SNAIL_REAR: 5,
  /** Cinder Moth. Flies a patrol and drops embers that burn where they land. */
  MOTH_SPEED: 0.8,
  MOTH_DROP_CYCLE: 90,
  EMBER_BURN: 60,
  EMBER_GRAVITY: 0.3,

  // ── World 5 ────────────────────────────────────────────────────────────────
  /** Bone Shrimp. Weak, fast, and there are always more of them. */
  SHRIMP_SPEED: 1.4,
  /** A vent keeps producing until it is inked shut. */
  VENT_CYCLE: 150,
  VENT_MAX_ALIVE: 4,
  /** Lightless. Invisible but for its lure; charges when you enter the light. */
  LIGHTLESS_LURE_RADIUS: 3,
  LIGHTLESS_CHARGE: 4.0,
  LIGHTLESS_WINDUP: 24,
  LIGHTLESS_CHARGE_FRAMES: 70,
  LIGHTLESS_RECOVER: 60,
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

  /**
   * Bubble stream. One frame of contact, an upward carry, then it pops.
   *
   * PRD §6.2 gives the carry as -1.2. It is applied as a velocity rather than
   * an impulse so a bubble ladder is a *rhythm* — you have to keep arriving.
   */
  BUBBLE_CARRY: -1.2,
  BUBBLE_RISE: 0.7,
  BUBBLE_SPACING: 40,
  BUBBLE_RESPAWN: 60,

  /**
   * A rising surface — World 3's flood and World 4's magma, one entity.
   *
   * Two hazards in the PRD, one mechanic: a horizontal line that starts when
   * Nib crosses a trigger and climbs at a fixed rate. Water lifts you and
   * magma kills you, and that difference is a field rather than a module.
   */
  RISE_MAGMA: 0.25,
  RISE_FLOOD: 0.2,

  /** Superheated water. 90 frames before the scald kills, and it resets in air. */
  SCALD_FRAMES: 90,
  /** How fast the scald timer bleeds back down once Nib surfaces. */
  SCALD_RECOVER: 2,

  /**
   * Pressure crush. Stand still longer than this in the abyss and it kills.
   *
   * PRD §6.2. The vignette closes over the last third of the timer, which is
   * the telegraph — the room has to say "move" before it says "dead".
   */
  PRESSURE_FRAMES: 180,
  PRESSURE_WARN: 60,
  /** Pixels of movement per frame that count as moving at all. */
  PRESSURE_STILL: 0.35,
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

/**
 * The other four bosses. PRD §6.3: three hits, three phases, one arena each.
 *
 * Same contract as the King, and the same prohibition: nothing here rolls dice.
 * Every window below is generous because each boss has exactly one, and a
 * player who cannot find it has not been beaten — they have been stonewalled.
 */
export const BOSSES = {
  /** Every boss dies in three. The number is the genre, not a tuning dial. */
  HITS: 3,
  WAKE_FRAMES: 90,
  DEATH_FRAMES: 120,

  /**
   * The Kelp Warden. A vertical shaft: four arms, then the core.
   *
   * Two-step damage per hit — ink an arm's base, then dash the exposed core —
   * so the fight is about spending pips in the right order rather than about
   * landing three of the same thing.
   */
  WARDEN_ARMS: 4,
  WARDEN_LASH: [140, 110, 84],
  WARDEN_ARM_REGROW: 260,
  /** Frames the core stays open once every arm is down. The whole damage window. */
  WARDEN_CORE_OPEN: 120,
  /** Phase 3's downdraft, which a dash has to be spent against. */
  WARDEN_DOWNDRAFT: 0.2,

  /**
   * The Drowned Captain. The ghost is scenery; the lantern is the fight.
   *
   * The floor tilt is the reason he is hard: every shot is taken while sliding,
   * and the 200-frame cycle is slow enough to plan around and long enough that
   * waiting for level ground costs you the window.
   */
  CAPTAIN_DRIFT: 0.6,
  CAPTAIN_TILT_CYCLE: 200,
  CAPTAIN_TILT_FORCE: 0.13,
  CAPTAIN_PHASE_SHIFT: [150, 120, 96],
  /** Phase 3 splits the lantern three ways; exactly one of them is real. */
  CAPTAIN_DECOYS: 2,
  CAPTAIN_STAGGER: 90,

  /**
   * The Vent Lord. Five vents, one worm, and a floor that keeps rising.
   *
   * The arena shrinks by a tile per hit, so winning is what makes the fight
   * harder — the only boss in the game whose difficulty curve is the player's
   * own progress.
   */
  VENT_COUNT: 5,
  VENT_RUMBLE: 45,
  VENT_CREST: 30,
  VENT_SUBMERGE: 40,
  VENT_IDLE: [70, 55, 40],
  /** Tiles of magma that rise for each hit landed. */
  VENT_MAGMA_PER_HIT: 1,

  /**
   * The Kraken. Three stages, no checkpoint, about three minutes.
   *
   * P1 tentacles and their suckers, P2 the beak, P3 everything plus the eye.
   * The eye is only open at the top of a Hookline ride, which is the last thing
   * World 3 taught and the reason the fight is placed where it is.
   */
  KRAKEN_TENTACLES: [2, 2, 8],
  KRAKEN_SWEEP: [180, 150, 120],
  KRAKEN_SUCKERS: 3,
  KRAKEN_BEAK_TELEGRAPH: 45,
  KRAKEN_BEAK_LUNGE: 40,
  KRAKEN_BEAK_RECOVER: 90,
  KRAKEN_EYE_OPEN: 150,
  KRAKEN_STAGGER: 100,
} as const

/** Collision resolves in sub-steps no larger than this, so nothing tunnels. */
export const MAX_SUBSTEP = 8
