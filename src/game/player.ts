import { Act, isHeld, isPressed, type InputFrame } from '../engine/input.js'
import {
  CHARGED_TIER,
  DISPLAY,
  FULL,
  INK,
  PHYSICS,
  RULES,
  SPENT,
  TIERS,
  WATER,
  type TierIndex,
} from './constants.js'
import {
  centreTile,
  forEachOverlappedTile,
  isGrounded,
  isSolid,
  moveX,
  moveY,
  overlapsSolid,
  type Box,
} from './collision.js'
import { isFluid, Tile, type TileMap } from './tilemap.js'
import { HAZARDS, UPGRADES } from './constants.js'
import { hasUpgrade } from './upgrades.js'

const T = DISPLAY.TILE

export interface Player extends Box {
  vx: number
  vy: number
  tier: TierIndex
  ink: number
  /** Frames accumulated toward the next pip. */
  inkTimer: number
  grounded: boolean
  facing: 1 | -1
  coyote: number
  jumpBuffer: number
  /** Frames of dash lock remaining; velocity is fixed and gravity suspended. */
  dashFrames: number
  dashCooldown: number
  iframes: number
  inWater: boolean
  alive: boolean
  /**
   * Where the top of the hitbox was when this frame began.
   *
   * Carried so a stomp can ask "were his feet above its head *before* the
   * sweep?" — without it a fast dash into a crab's flank reads as a landing.
   */
  prevY: number
  /**
   * True while Nib is in a rise he started himself.
   *
   * The variable-height jump cut must only apply to a *jump*. Without this
   * flag it also clamped stomp bounces, which quietly turned every bounce from
   * the specified -4.60 into -1.80 — a third of the height the PRD promises,
   * and the reason a bounce chain could not reach the next enemy.
   */
  jumping: boolean
  /** Frames left on the ink cloud that stuns nearby enemies after a hit. */
  stunCloud: number
  /** Last vertical direction pressed, and how long it stays live for aiming. */
  aimY: number
  aimYFrames: number
  deaths: number
  /**
   * Permanent upgrades, as a bitmask. See game/upgrades.ts for why a mask.
   *
   * It lives on the player rather than beside him because every one of the five
   * is a change to what *he* can do, and because the world hash that proves
   * replay determinism then picks it up for free.
   */
  upgrades: number
  /** Which wall Cling has hold of: -1 left, 1 right, 0 not clinging. */
  clingDir: number
  /** Frames of grip used. Past CLING_FRAMES he slides instead of holding. */
  clingFrames: number
  /** Grips taken since he last touched the ground. The first is free. */
  clingsUsed: number
  /** Frames cooking in superheated water or magma. Death at the limit. */
  scald: number
  /** Frames until the next Ink Shot or Ink Bomb may be thrown. */
  shootCooldown: number
  /**
   * Frames Nib has been effectively still.
   *
   * Only the abyss reads it (PRD §6.2's pressure crush), but it is cheaper and
   * more honest to measure movement where movement happens than to have a
   * hazard reach back into the player's velocity history.
   */
  stillFrames: number
}

export function tierOf(p: Player) {
  return TIERS[p.tier]!
}

/**
 * Pips this player can hold right now.
 *
 * Tier sets the base and Deep Jet adds one, and those are the only two inputs —
 * which is the §8.5 rule about upgrades and tiers being different currencies,
 * expressed as the one function that has to reconcile them.
 */
export function inkMax(p: Player): number {
  return tierOf(p).inkMax + (hasUpgrade(p.upgrades, 'deepJet') ? UPGRADES.DEEP_JET_PIPS : 0)
}

/** Spend pips if there are pips to spend. Returns false if there were not. */
export function spendInk(p: Player, cost: number): boolean {
  if (p.ink < cost) return false
  p.ink -= cost
  p.inkTimer = 0
  return true
}

export function createPlayer(x: number, y: number): Player {
  const tier = TIERS[FULL]!
  return {
    x,
    y,
    w: tier.w,
    h: tier.h,
    vx: 0,
    vy: 0,
    tier: FULL,
    ink: tier.inkMax,
    inkTimer: 0,
    grounded: false,
    facing: 1,
    coyote: 0,
    jumpBuffer: 0,
    dashFrames: 0,
    dashCooldown: 0,
    iframes: 0,
    inWater: false,
    alive: true,
    jumping: false,
    prevY: y,
    stunCloud: 0,
    aimY: 0,
    aimYFrames: 0,
    deaths: 0,
    upgrades: 0,
    clingDir: 0,
    clingFrames: 0,
    clingsUsed: 0,
    scald: 0,
    shootCooldown: 0,
    stillFrames: 0,
  }
}

/**
 * Resize around the bottom-centre so growing never shoves Nib through a floor,
 * then nudge upward if the larger box is stuck in a ceiling. Anchoring at the
 * feet is what keeps a grow-while-standing from teleporting him.
 */
export function setTier(map: TileMap, p: Player, tier: TierIndex, collapsed?: ReadonlySet<number>): void {
  const t = TIERS[tier]!
  const cx = p.x + p.w / 2
  const bottom = p.y + p.h
  p.tier = tier
  p.w = t.w
  p.h = t.h
  p.x = cx - p.w / 2
  p.y = bottom - p.h
  if (p.ink > inkMax(p)) p.ink = inkMax(p)

  // Growing can leave the taller box inside a ceiling; lift it clear.
  const q = { downward: false, prevBottom: p.y + p.h, collapsed }
  const probe: Box = { x: p.x, y: p.y, w: p.w, h: p.h }
  for (let lift = 0; lift <= T; lift++) {
    probe.y = p.y - lift
    if (!overlapsSolid(map, probe, q)) {
      p.y = probe.y
      return
    }
  }
}

/** Drop one tier. At Spent this kills. Returns true if the hit landed. */
export function hurt(map: TileMap, p: Player, fromX: number, collapsed?: ReadonlySet<number>): boolean {
  if (p.iframes > 0 || !p.alive) return false
  if (p.tier === SPENT) {
    kill(p)
    return true
  }
  setTier(map, p, (p.tier - 1) as TierIndex, collapsed)
  p.iframes = RULES.HURT_IFRAMES
  p.stunCloud = RULES.SHRINK_STUN_FRAMES
  const away = p.x + p.w / 2 < fromX ? -1 : 1
  p.vx = away * RULES.HURT_KNOCKBACK * 0.25
  p.vy = Math.min(p.vy, -1.5)
  return true
}

export function kill(p: Player): void {
  if (!p.alive) return
  p.alive = false
  p.deaths++
  p.vx = 0
  p.vy = 0
}

/** Ink Bulb / Ink Core. Promotes exactly one rung — you cannot skip a tier. */
export function promote(map: TileMap, p: Player, max: TierIndex, collapsed?: ReadonlySet<number>): boolean {
  const target = Math.min(p.tier + 1, max) as TierIndex
  if (target === p.tier) {
    p.ink = inkMax(p) // already at that tier: refill instead
    p.inkTimer = 0
    return false
  }
  setTier(map, p, target, collapsed)
  p.ink = inkMax(p)
  p.inkTimer = 0
  return true
}

export interface PlayerStepContext {
  map: TileMap
  collapsed: Set<number>
  /** Tile index -> frames of standing left before it collapses. */
  crumbling: Map<number, number>
  /** Solid boxes that are not terrain — closed clams, hook tops, snail shells. */
  solids?: readonly Box[]
  /** Named sounds this step wants. Filled, never played, by the simulation. */
  cues?: string[]
  /**
   * A rising surface Nib is currently under, resolved by the world.
   *
   * Passed in as two booleans rather than as the `Rise` itself, because
   * hazards.ts already imports the player and the reverse would be a cycle.
   * The player does not need to know a surface is *rising* — only that he is
   * underneath water, or underneath magma.
   */
  flooded?: boolean
  inMagma?: boolean
}

export function updatePlayer(ctx: PlayerStepContext, p: Player, input: InputFrame): void {
  if (!p.alive) return
  p.prevY = p.y
  const { map, collapsed } = ctx
  const solids = ctx.solids
  const tier = tierOf(p)

  if (p.dashCooldown > 0) p.dashCooldown--
  if (p.iframes > 0) p.iframes--
  if (p.stunCloud > 0) p.stunCloud--
  if (p.jumpBuffer > 0) p.jumpBuffer--
  if (p.coyote > 0) p.coyote--
  if (p.shootCooldown > 0) p.shootCooldown--

  const wasInWater = p.inWater
  // A rising flood is water the grid does not know about, so it is asked
  // alongside the tile rather than instead of it.
  p.inWater = isFluid(centreTile(map, p)) || ctx.flooded === true
  if (p.inWater && !wasInWater) p.vy *= WATER.ENTRY_DAMP

  const left = isHeld(input, Act.Left)
  const right = isHeld(input, Act.Right)
  const dir = (right ? 1 : 0) - (left ? 1 : 0)
  if (dir !== 0 && p.dashFrames === 0) p.facing = dir as 1 | -1

  if (isPressed(input, Act.Jump)) p.jumpBuffer = PHYSICS.JUMP_BUFFER_FRAMES

  const heldY = (isHeld(input, Act.Down) ? 1 : 0) - (isHeld(input, Act.Up) ? 1 : 0)
  if (heldY !== 0) {
    p.aimY = heldY
    p.aimYFrames = INK.DASH_DIR_BUFFER
  }

  refillInk(p)
  const wasDashing = p.dashFrames > 0
  tryStartDash(p, input)
  if (!wasDashing && p.dashFrames > 0) {
    ctx.cues?.push(p.tier === CHARGED_TIER ? 'chargedDash' : 'dash')
  }
  // Decremented after the dash check, so DASH_DIR_BUFFER frames of grace means
  // exactly that many rather than one fewer.
  if (heldY === 0 && p.aimYFrames > 0) p.aimYFrames--

  // Carryover is applied *after* the move, not before it, so the dash delivers
  // exactly DASH_LOCK_FRAMES of full-speed travel rather than one frame fewer.
  let dashEnding = false
  if (p.dashFrames > 0) {
    p.dashFrames--
    dashEnding = p.dashFrames === 0
    releaseCling(p)
  } else if (p.inWater) {
    releaseCling(p)
    swim(p, dir, ctx.cues)
  } else if (!cling(ctx, p, dir, tier)) {
    walk(p, input, dir, tier)
    fall(p, input, tier, ctx.cues)
  }

  applyCurrents(map, p)

  // X then Y, each in sub-steps — see collision.ts.
  moveX(map, p, p.vx, collapsed, solids)
  const vres = moveY(map, p, p.vy, collapsed, solids)
  if (vres.blocked) {
    if (p.vy > 0 && vres.landedTile >= 0) startCrumble(ctx, vres.landedTile, tier.crumbleHold)
    p.vy = 0
    // A dash into a ceiling or floor ends there — no carryover to hand back.
    p.dashFrames = 0
    dashEnding = false
  }
  if (dashEnding) {
    p.vx *= INK.DASH_CARRYOVER
    p.vy *= INK.DASH_CARRYOVER
  }

  const grounded = isGrounded(map, p, collapsed, solids)
  if (grounded) p.jumping = false
  if (grounded && !p.grounded) p.dashCooldown = 0
  if (grounded) p.coyote = PHYSICS.COYOTE_FRAMES
  // Touching down is what makes the next grip free again, so a wall run has to
  // be paid for out of pips rather than repeated forever.
  if (grounded) {
    p.clingsUsed = 0
    releaseCling(p)
  }
  p.grounded = grounded

  trackStillness(p)
  checkHazards(ctx, p)
  if (p.y > (map.height + 4) * T) kill(p) // fell out of the world
}

/**
 * Nib is "still" when neither axis is really moving.
 *
 * Measured against velocity rather than position because a player wedged
 * against a wall while holding into it is standing still by any honest reading,
 * and the abyss should say so.
 */
function trackStillness(p: Player): void {
  const moving = Math.abs(p.vx) > HAZARDS.PRESSURE_STILL || Math.abs(p.vy) > HAZARDS.PRESSURE_STILL
  p.stillFrames = moving ? 0 : p.stillFrames + 1
}

function refillInk(p: Player): void {
  const max = inkMax(p)
  if (p.ink >= max) {
    p.inkTimer = 0
    return
  }
  const rate = p.inWater ? INK.REFILL_WATER : p.grounded ? INK.REFILL_GROUND : INK.REFILL_AIR
  if (!Number.isFinite(rate)) return // airborne: refill is disabled by design
  p.inkTimer++
  if (p.inkTimer >= rate) {
    p.ink++
    p.inkTimer = 0
  }
}

/**
 * Cling — the World 2 upgrade. PRD §8.5.
 *
 * Hold into a wall and Nib grips it for sixty frames, then slides. Returns true
 * when it has taken over the frame's physics, so the caller skips walk and fall
 * entirely rather than fighting them.
 *
 * Two rules do all the design work here. **You must hold into the wall**, so a
 * cling is never something that happens to you on the way past. And **only the
 * first grip of an airtime is free** — every later one costs a pip, which is
 * what makes a cling shaft a route with a budget instead of a free elevator.
 *
 * Jumping off is allowed and is not in §8.5. It is here because a wall Nib can
 * hold and cannot leave reads as a bug, and because World 3's cargo hold is
 * three storeys: without it, the shaft costs a pip per floor and a Spent player
 * simply cannot climb it. Recorded in the PRD's decisions log.
 */
function cling(ctx: PlayerStepContext, p: Player, dir: number, tier: (typeof TIERS)[number]): boolean {
  if (!hasUpgrade(p.upgrades, 'cling') || p.grounded) {
    releaseCling(p)
    return false
  }

  const wall = dir !== 0 && wallBeside(ctx, p, dir) ? dir : 0
  if (wall === 0) {
    releaseCling(p)
    return false
  }

  if (p.clingDir !== wall) {
    // A fresh grip. The first of this airtime is free; the rest are pips.
    if (p.clingsUsed > 0 && !spendInk(p, UPGRADES.CLING_REGRIP_COST)) {
      releaseCling(p)
      return false
    }
    p.clingsUsed++
    p.clingDir = wall
    p.clingFrames = 0
    ctx.cues?.push('cling')
  }

  p.clingFrames++
  p.facing = wall as 1 | -1

  if (p.jumpBuffer > 0) {
    // Off the wall, away from it. The height is an ordinary jump; only the
    // push-off is the upgrade's.
    p.vy = tier.jump
    p.vx = -wall * UPGRADES.CLING_JUMP_X
    p.jumping = true
    p.jumpBuffer = 0
    releaseCling(p)
    ctx.cues?.push('jump')
    p.vy = Math.min(p.vy + tier.gravity, PHYSICS.TERMINAL_FALL)
    return true
  }

  // Held, then sliding. The slide is the timer made visible: by the time the
  // player notices they are descending, they have had a second to decide.
  p.vy = p.clingFrames <= UPGRADES.CLING_FRAMES ? 0 : UPGRADES.CLING_SLIDE
  p.vx = wall * 0.5 // stay pressed against it through the sweep
  return true
}

function releaseCling(p: Player): void {
  p.clingDir = 0
  p.clingFrames = 0
}

/** Is there wall to grip on the given side, at the height of Nib's own box? */
function wallBeside(ctx: PlayerStepContext, p: Player, dir: number): boolean {
  const q = { downward: false, prevBottom: p.y + p.h, collapsed: ctx.collapsed }
  const tx = Math.floor((dir > 0 ? p.x + p.w + 1 : p.x - 1) / T)
  const top = Math.floor(p.y / T)
  const bottom = Math.floor((p.y + p.h - 1) / T)
  for (let ty = top; ty <= bottom; ty++) {
    if (isSolid(ctx.map, tx, ty, q)) return true
  }
  return false
}

function tryStartDash(p: Player, input: InputFrame): void {
  if (!isPressed(input, Act.Dash)) return
  if (p.ink < INK.DASH_COST || p.dashCooldown > 0 || p.dashFrames > 0) return

  let dx = (isHeld(input, Act.Right) ? 1 : 0) - (isHeld(input, Act.Left) ? 1 : 0)
  let dy = (isHeld(input, Act.Down) ? 1 : 0) - (isHeld(input, Act.Up) ? 1 : 0)
  // A vertical direction released a few frames ago still aims the dash, so a
  // near-simultaneous Up+X reliably goes up rather than sideways.
  if (dy === 0 && p.aimYFrames > 0) dy = p.aimY
  if (dx === 0 && dy === 0) dx = p.facing // nothing at all: dash where you face

  const len = Math.hypot(dx, dy)
  dx /= len
  dy /= len

  // Deep Jet is a faster jet on a shorter recharge, not a different dash. It
  // changes how often and how far, never what the dash does on contact — that
  // belongs to the Charged tier, and the two are kept apart on purpose (§8.5).
  const jet = hasUpgrade(p.upgrades, 'deepJet')
  const speed = (p.inWater ? INK.DASH_SPEED_WATER : INK.DASH_SPEED) + (jet ? UPGRADES.DEEP_JET_SPEED : 0)
  p.ink -= INK.DASH_COST
  p.inkTimer = 0
  p.dashFrames = INK.DASH_LOCK_FRAMES
  p.dashCooldown = INK.DASH_LOCK_FRAMES + (jet ? UPGRADES.DEEP_JET_COOLDOWN : INK.DASH_COOLDOWN)
  p.vx = dx * speed
  p.vy = dy * speed
  p.iframes = Math.max(p.iframes, INK.DASH_IFRAMES)
  if (dx !== 0) p.facing = Math.sign(dx) as 1 | -1
}

function walk(p: Player, input: InputFrame, dir: number, tier: (typeof TIERS)[number]): void {
  const running = isHeld(input, Act.Run)
  const max = running ? tier.runMax : PHYSICS.WALK_MAX
  const accel = p.grounded ? (running ? PHYSICS.RUN_ACCEL : PHYSICS.WALK_ACCEL) : PHYSICS.AIR_ACCEL

  if (dir === 0) {
    const drag = p.grounded ? PHYSICS.GROUND_FRICTION : PHYSICS.AIR_DRAG
    p.vx = approach(p.vx, 0, drag)
    return
  }
  if (Math.abs(p.vx) > max && Math.sign(p.vx) === dir) {
    // Above the cap — dash carryover. Bleed off slowly instead of snapping down,
    // which is what makes a dash worth spending a pip on.
    p.vx = approach(p.vx, dir * max, PHYSICS.AIR_DRAG)
    return
  }
  p.vx = approach(p.vx, dir * max, accel)
}

function fall(p: Player, input: InputFrame, tier: (typeof TIERS)[number], cues?: string[]): void {
  if (p.jumpBuffer > 0 && (p.grounded || p.coyote > 0)) {
    p.vy = tier.jump
    p.grounded = false
    p.jumping = true
    p.jumpBuffer = 0
    p.coyote = 0
    cues?.push('jump')
  }
  // Variable jump height: releasing early cuts the rise — but only a rise Nib
  // started himself. A stomp bounce is not a jump and is not the player's to
  // shorten.
  if (p.jumping && !isHeld(input, Act.Jump) && p.vy < PHYSICS.JUMP_CUT) {
    p.vy = PHYSICS.JUMP_CUT
    p.jumping = false
  }
  if (p.vy >= 0) p.jumping = false

  p.vy = Math.min(p.vy + tier.gravity, PHYSICS.TERMINAL_FALL)
}

function swim(p: Player, dir: number, cues?: string[]): void {
  if (p.jumpBuffer > 0) {
    p.vy = WATER.SWIM_STROKE
    p.jumpBuffer = 0
    cues?.push('swim')
  }
  if (dir === 0) p.vx = approach(p.vx, 0, PHYSICS.AIR_DRAG)
  else if (Math.abs(p.vx) > WATER.SWIM_MAX_X && Math.sign(p.vx) === dir) {
    p.vx = approach(p.vx, dir * WATER.SWIM_MAX_X, PHYSICS.AIR_DRAG)
  } else p.vx = approach(p.vx, dir * WATER.SWIM_MAX_X, PHYSICS.AIR_ACCEL)

  p.vy = Math.min(p.vy + WATER.GRAVITY, WATER.TERMINAL_FALL)
}

function applyCurrents(map: TileMap, p: Player): void {
  let fx = 0
  let fy = 0
  forEachOverlappedTile(map, p, (t) => {
    if (t === Tile.CURRENT_R) fx += 0.18
    else if (t === Tile.CURRENT_L) fx -= 0.18
    else if (t === Tile.CURRENT_U) fy -= 0.18
    else if (t === Tile.CURRENT_D) fy += 0.18
  })
  p.vx += fx
  p.vy += fy
}

/**
 * Terrain that kills, and the one upgrade that argues with it.
 *
 * Urchins are absolute — no tier and no upgrade has ever survived a spike, and
 * that is what makes "geometry kills, creatures cost" a rule a player can
 * learn once. Heat is the deliberate exception, and it is an exception with a
 * clock rather than an exemption: Heat Shell makes superheated water safe and
 * buys ninety frames of magma, which is enough to cross one and not enough to
 * live in it.
 */
function checkHazards(ctx: PlayerStepContext, p: Player): void {
  let deadly = false
  let cooking = false
  const shell = hasUpgrade(p.upgrades, 'heatShell')

  // Molten rock that arrived as a rising surface burns exactly like molten rock
  // that was authored into the grid. Same grace, same clock, same death.
  if (ctx.inMagma === true) {
    if (shell) cooking = true
    else deadly = true
  }

  forEachOverlappedTile(ctx.map, p, (t) => {
    if (t === Tile.HAZARD) deadly = true
    else if (t === Tile.MAGMA) {
      if (shell) cooking = true
      else deadly = true
    } else if (t === Tile.HOT && !shell) cooking = true
  })

  if (cooking) {
    p.scald++
    // Magma spends the same grace faster than hot water does, because standing
    // in the fire is not the same act as swimming near it.
    const limit = shell ? UPGRADES.MAGMA_GRACE : HAZARDS.SCALD_FRAMES
    if (p.scald >= limit) deadly = true
  } else if (p.scald > 0) {
    // Surfacing resets it, but not instantly: crossing in stages is the lesson.
    p.scald = Math.max(0, p.scald - HAZARDS.SCALD_RECOVER)
  }

  if (deadly) kill(p)
}

function startCrumble(ctx: PlayerStepContext, tileIndex: number, hold: number): void {
  const { map, crumbling, collapsed } = ctx
  if (map.tiles[tileIndex] !== Tile.CRUMBLE) return
  if (collapsed.has(tileIndex) || crumbling.has(tileIndex)) return
  crumbling.set(tileIndex, hold)
}

export function approach(value: number, target: number, step: number): number {
  if (value < target) return Math.min(value + step, target)
  if (value > target) return Math.max(value - step, target)
  return target
}

export const TIER_NAMES = ['spent', 'full', 'charged'] as const
export { SPENT, FULL, CHARGED_TIER }
