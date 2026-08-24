import { Act, isHeld, isPressed, type InputFrame } from '../engine/input.js'
import { ASSIST, CHARGED_TIER, DISPLAY, ENEMIES, FULL, RULES, UPGRADES, type TierIndex } from './constants.js'
import { boxesOverlap, type Box } from './collision.js'
import { Tile, tileAt, type TileMap } from './tilemap.js'
import { loadLevel, type HintDef, type LevelDef, type LoadedLevel } from '../content/levels/format.js'
import {
  createPlayer,
  inkMax,
  promote,
  setTier,
  spendInk,
  updatePlayer,
  type Player,
  type PlayerStepContext,
} from './player.js'
import {
  enemySolids,
  isEnemyKind,
  spawnEnemy,
  updateEnemy,
  type Enemy,
  type EnemyKind,
  type EnemyStepContext,
} from './enemies/index.js'
import { resolveBossInk, resolveCombat } from './combat.js'
import { livesEarned, POINTS } from './score.js'
import {
  checkClams,
  checkPressure,
  pressureLoad,
  clamSolids,
  rideBubbles,
  riseAt,
  spawnBubble,
  spawnClam,
  spawnPressure,
  spawnRise,
  updateBubble,
  updateClam,
  updateRise,
  type Bubble,
  type Clam,
  type Pressure,
  type Rise,
} from './hazards.js'
import { arenaBox, arenaSpecOf, spawnBoss, updateBoss, updateRocks, type Boss, type Rock } from './bosses/index.js'
import { crackedInBlast, fire, updateProjectiles, type Projectile } from './projectiles.js'
import { hasUpgrade, UPGRADE_BIT, type UpgradeId } from './upgrades.js'
import type { Cue } from './cues.js'

const T = DISPLAY.TILE

export type PickupKind = 'inkBulb' | 'inkCore' | 'shell' | 'pearl' | 'deepJet'

export interface Pickup extends Box {
  kind: PickupKind
  /** Pearl slot 0-2 on the world map; -1 for everything else. */
  id: number
  taken: boolean
}

export interface World {
  map: TileMap
  player: Player
  pickups: Pickup[]
  enemies: Enemy[]
  clams: Clam[]
  /** Everything in flight: bolts, bombs, barbs, embers. Pooled and reused. */
  projectiles: Projectile[]
  bubbles: Bubble[]
  rises: Rise[]
  pressure: Pressure[]
  boss: Boss | null
  rocks: Rock[]
  hints: Hint[]
  /**
   * The boss bowl: exactly one screen of the level's right-hand end.
   *
   * Null until the level declares a boss. Crossing into it starts the fight and
   * closes the way back — a soft wall rather than a gate sprite, because the
   * alternative is a King who charges somewhere the camera is not.
   */
  arena: Box | null
  bossActive: boolean
  /** Tile indices of crumble tiles that have fallen away. */
  collapsed: Set<number>
  /** Tile index -> frames of standing left before collapse. */
  crumbling: Map<number, number>
  /** Tile index -> frames until a collapsed tile returns. */
  respawning: Map<number, number>
  spawn: { x: number; y: number }
  checkpoint: { x: number; y: number } | null
  exit: Box | null
  /** Assist Mode is on for this world. See ASSIST in constants.ts. */
  assist: boolean
  frame: number
  cleared: boolean
  respawnTimer: number
  /** 100 shells is an extra life, and shells reset on a continue. */
  shells: number
  /** Which of this level's three pearls have been picked up this run. */
  pearls: [boolean, boolean, boolean]
  score: number
  /** Stomps landed since the last ground contact. Drives the chain payout. */
  chain: number
  /** Frames the simulation is frozen for. Juice with state, so it is hashed. */
  hitstop: number
  /** Extra lives the shell counter has earned but not yet been credited. */
  livesOwed: number
  /** The boss id this level declares, so a restart can respawn him. */
  bossDef: string
  /** How many enemies the level authored, before any the boss summons. */
  baseEnemies: number
  /**
   * Upgrades earned *inside* this level and not yet banked.
   *
   * Only Deep Jet is ever in here (§8.5's one mid-level upgrade). The world
   * raises it and the session persists it, the same split the save flag uses:
   * the simulation never touches storage.
   */
  earned: UpgradeId[]
  /**
   * Sound cues raised this frame, drained by the host.
   *
   * The simulation names what happened; it never makes a noise. That keeps
   * Web Audio out of the replay path entirely — a headless replay raises the
   * same cues and simply has nobody listening.
   */
  cues: Cue[]
  /**
   * Reused array for the per-frame list of solid clams.
   *
   * Ugly, and deliberate: PRD §12.6 asks for zero allocations in the update
   * loop, and rebuilding this list sixty times a second is exactly the kind of
   * garbage that adds up to a dropped frame.
   */
  solidScratch: Box[]
  /** Reused buffer for the tiles an Ink Bomb opens. Same reason as above. */
  blastScratch: number[]
  /**
   * The player's and the enemies' step contexts, built once and mutated.
   *
   * §12.6 again. Both used to be object literals rebuilt every frame, and the
   * enemy one carried two closures with them — the most expensive kind of
   * per-frame garbage, because each one is a fresh function object.
   */
  playerCtx: PlayerStepContext
  enemyCtx: EnemyStepContext
  /** The level's checkpoint boxes, precomputed. They never move. */
  checkpointBoxes: { box: Box; x: number; y: number }[]
}

/** What the caller already holds when the level starts. */
export interface WorldOptions {
  /** Permanent upgrades, as a bitmask. See game/upgrades.ts. */
  upgrades?: number
  /**
   * Assist Mode (PRD §13). Slows enemies and hands out soft checkpoints.
   *
   * An option on the world rather than a global, so it is part of what a replay
   * is replayed *with* — the same input log against an assist world and a
   * classic one are two different runs, and both are deterministic.
   */
  assist?: boolean
  /**
   * Pearls this player has already banked in this level, by id.
   *
   * §8.3 makes a pearl worth 5,000 points and an extra life **on the run that
   * first finds it**. Without this the game pays both again on every replay,
   * which turns any cleared level into a life farm — and Phase 4's free replay
   * of cleared levels is what makes that reachable rather than theoretical.
   * An already-found pearl is spawned already taken: it is not drawn, cannot be
   * collected, and does not appear in the level's tally.
   */
  found?: readonly boolean[]
}

export interface Hint extends HintDef {
  radius: number
  /** Frames left on screen; -1 once it has been shown and expired. */
  frames: number
  spent: boolean
}

export const HINT_FRAMES = 180

/** Collectible footprints, centred in their tile. Generous, not pixel-exact. */
const PICKUP_BOX: Record<PickupKind, number> = { inkBulb: 8, inkCore: 8, shell: 6, pearl: 8, deepJet: 12 }

const PICKUP_KINDS: readonly string[] = ['inkBulb', 'inkCore', 'shell', 'pearl', 'deepJet']

/**
 * The cap from PRD §12.6. A room may not grow past it at runtime.
 *
 * It exists for the shrimp vents, which are the only thing in the game that
 * produces enemies indefinitely. A player who stands in §7.6 B1 doing nothing
 * should meet a hard ceiling rather than a slowly dying frame rate.
 */
export const MAX_ENTITIES = 64

export function createWorld(source: LevelDef | LoadedLevel, options: WorldOptions = {}): World {
  const level = 'map' in source ? source : loadLevel(source)
  const { map } = level

  const spawn = { x: level.start.x * T + 2, y: level.start.y * T + 2 }
  const pickups: Pickup[] = level.entities
    .filter((e) => PICKUP_KINDS.includes(e.type))
    .map((e) => {
      const size = PICKUP_BOX[e.type as PickupKind]
      return {
        kind: e.type as PickupKind,
        id: e.type === 'pearl' ? e.id : -1,
        x: e.x * T + (T - size) / 2,
        y: e.y * T + (T - size) / 2,
        w: size,
        h: size,
        taken: e.type === 'pearl' && options.found?.[e.id] === true,
      }
    })

  const enemies = level.entities
    .filter((e): e is typeof e & { type: EnemyKind } => isEnemyKind(e.type))
    .map(spawnEnemy)

  const clams = level.entities.filter((e): e is typeof e & { type: 'clam' } => e.type === 'clam').map(spawnClam)
  const bubbles = level.entities
    .filter((e): e is typeof e & { type: 'bubble' } => e.type === 'bubble')
    .map(spawnBubble)
  const rises = level.entities.filter((e): e is typeof e & { type: 'rise' } => e.type === 'rise').map(spawnRise)
  const pressure = level.entities
    .filter((e): e is typeof e & { type: 'pressure' } => e.type === 'pressure')
    .map(spawnPressure)

  const arena: Box | null = level.def.boss === undefined ? null : arenaBox(map, level.def.boss)

  const player = createPlayer(spawn.x, spawn.y)
  player.upgrades = options.upgrades ?? 0
  player.ink = inkMax(player)

  const collapsed = new Set<number>()
  openFusedTerrain(map, player, collapsed)

  const world: World = {
    map,
    player,
    pickups,
    enemies,
    clams,
    projectiles: [],
    bubbles,
    rises,
    pressure,
    boss: null,
    rocks: [],

    arena,
    bossActive: false,
    collapsed,
    crumbling: new Map(),
    respawning: new Map(),
    spawn,
    checkpoint: null,
    exit: level.exit ? { x: level.exit.x * T, y: level.exit.y * T, w: T, h: T } : null,
    assist: options.assist ?? false,
    hints: (level.def.hints ?? []).map((h) => ({ ...h, radius: h.radius ?? 5, frames: 0, spent: false })),
    frame: 0,
    cleared: false,
    respawnTimer: 0,
    shells: 0,
    pearls: [false, false, false],
    score: 0,
    chain: 0,
    hitstop: 0,
    livesOwed: 0,
    bossDef: level.def.boss ?? '',
    baseEnemies: enemies.length,
    earned: [],
    cues: [],
    solidScratch: [],
    blastScratch: [],
    // Filled in below: both need the world object that is being built.
    playerCtx: null as unknown as PlayerStepContext,
    enemyCtx: null as unknown as EnemyStepContext,
    checkpointBoxes: map.entities
      .filter((e) => e.kind === 'checkpoint')
      .map((e) => ({
        box: { x: e.tx * T, y: e.ty * T, w: T, h: T },
        x: e.tx * T + 2,
        y: e.ty * T + 2,
      })),
  }

  world.playerCtx = {
    map: world.map,
    collapsed: world.collapsed,
    crumbling: world.crumbling,
    solids: world.solidScratch,
    cues: world.cues,
    flooded: false,
    inMagma: false,
  }
  world.enemyCtx = {
    map: world.map,
    collapsed: world.collapsed,
    player: world.player,
    fire: (kind, x, y, vx, vy) => {
      fire(world.projectiles, kind, x, y, vx, vy, false)
    },
    spawn: (kind, x, y) => spawnFromVent(world, kind, x, y),
  }
  return world
}

/**
 * Heat Shell opens every fused tile in the level, permanently.
 *
 * Expressed as membership of `collapsed` — the same set a fallen crumble tile
 * and a bombed wall live in — rather than as a flag threaded through the
 * collision sweep. `isSolid` stays a function of the map and one set, and
 * "this tile is not solid right now" has exactly one meaning in the codebase.
 *
 * Re-applied after a respawn clears that set, which is why it is a function
 * rather than a line in `createWorld`.
 */
function openFusedTerrain(map: TileMap, player: Player, collapsed: Set<number>): void {
  if (!hasUpgrade(player.upgrades, 'heatShell')) return
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] === Tile.FUSED) collapsed.add(i)
  }
}

/**
 * Where the camera sits during a boss fight, which is not quite the arena.
 *
 * The arena box's bottom edge is the floor, because that is what the boss
 * stands on. The camera drops a little further so there is ground under the
 * fight rather than a horizon. An arena taller than a screen — the Warden's
 * shaft, the Kraken's water — scrolls within the lock instead of pinning.
 */
export function bossCameraLock(w: World): Box | null {
  if (!w.bossActive || !w.arena) return null
  const drop = arenaSpecOf(w.bossDef).cameraDrop
  return { ...w.arena, y: w.arena.y + drop }
}

export function update(w: World, input: InputFrame): void {
  w.frame++
  w.cues.length = 0

  // Hitstop freezes the whole simulation for a few frames on a stomp or a
  // shrink. The frame counter still advances, so the clock a speedrun is timed
  // against never stops — a hit costs you the time it is worth.
  if (w.hitstop > 0) {
    w.hitstop--
    return
  }

  tickCrumble(w)
  for (const c of w.clams) updateClam(c)
  for (const b of w.bubbles) updateBubble(b)
  for (const r of w.rises) updateRise(r, w.player)

  // Clams first, then the enemies that are also platforms. One list, one sweep:
  // a solid that is not terrain must go through the same sub-stepped move as
  // terrain does, or it becomes a thing that tunnels.
  clamSolids(w.clams, w.solidScratch)
  for (const box of enemySolids(w.enemies, SOLID_SCRATCH_2)) w.solidScratch.push(box)
  const solids = w.solidScratch

  // §10.3's magma rumble: a warning rather than an event, so it repeats on a
  // slow beat for as long as the floor of the world is following you. Only
  // magma — a flood has a visible surface and does not need telling.
  if (w.frame % 150 === 0 && w.rises.some((r) => r.armed && r.fluid === 'magma')) w.cues.push('magma')

  // The step contexts are built once per *world* and mutated here, not rebuilt
  // every frame. PRD §12.6 asks for zero allocations in the update loop, and
  // three object literals plus two closures at 60 Hz is a megabyte of garbage
  // every few minutes — which arrives as one dropped frame at a time.
  const under = riseAt(w.rises, w.player)
  w.playerCtx.solids = solids
  w.playerCtx.flooded = under?.fluid === 'flood'
  w.playerCtx.inMagma = under?.fluid === 'magma'
  updatePlayer(w.playerCtx, w.player, input)
  applyArenaForce(w)
  // After the player's own move, so a bubble caught on the way up overrides
  // the gravity that was applied to reach it.
  rideBubbles(w.bubbles, w.player)
  tryShoot(w, input)

  if (!held(w)) for (const e of w.enemies) updateEnemy(w.enemyCtx, e)

  breakKnots(w)
  updateProjectiles(w.map, w.projectiles, w.collapsed)
  detonateBombs(w)

  stepBoss(w, input)

  resolveCombat(w, isHeld(input, Act.Jump))
  resolveBossInk(w)
  clearDetonations(w)
  // After the move, so the frame a shell slams shut on Nib is the frame he
  // dies rather than the one after.
  checkClams(w.clams, w.player)
  checkPressure(w.pressure, w.player)

  // §7.6's heartbeat, quickening: the closer the crush is, the sooner the next
  // beat. A warning the player can act on without looking away from the room.
  const load = pressureLoad(w.pressure, w.player)
  if (load > 0) {
    const beat = Math.max(18, Math.round(48 - load * 36))
    if (w.frame % beat === 0) w.cues.push('pressure')
  }

  collectPickups(w)
  checkCheckpoints(w)
  checkAssistCheckpoint(w)
  tickHints(w)

  // The exit only counts once the King is finished. A level with a boss ends
  // with the boss, not with a door behind him.
  const bossSettled = w.boss === null || w.boss.state === 'dead'
  if (w.exit && !w.cleared && bossSettled && boxesOverlap(w.player, w.exit)) w.cleared = true

  if (!w.player.alive) {
    w.respawnTimer++
    if (w.respawnTimer >= RULES.DEATH_ANIM_FRAMES) respawn(w)
  }
}

/**
 * Start the fight when Nib crosses into the bowl, then run it.
 *
 * The player is clamped to the arena for the duration. That is the soft wall
 * standing in for a gate: it keeps a fixed camera honest, and it means the
 * fight cannot be walked away from halfway through.
 */
function stepBoss(w: World, input: InputFrame): void {
  const { arena } = w
  if (!arena) return

  if (!w.bossActive) {
    if (w.player.x + w.player.w < arena.x) return
    w.bossActive = true
    w.boss = spawnBoss(w.bossDef, arena)
  }

  if (w.player.x < arena.x) {
    w.player.x = arena.x
    if (w.player.vx < 0) w.player.vx = 0
  }

  updateRocks(w.map, w.rocks)

  const boss = w.boss
  if (!boss || boss.state === 'dead') return
  // A boss is an enemy, and it is the wall a beginner actually hits. Held on
  // the same frames as the roster, after the rocks so anything already thrown
  // keeps travelling.
  if (held(w)) return
  updateBoss(
    {
      map: w.map,
      arena,
      player: w.player,
      rocks: w.rocks,
      // Phase 3 lets two Snappers out of the sand, one either side of the bowl.
      summonGuards: () => summonGuards(w, arena, boss),
      fire: (kind, x, y, vx, vy) => {
        fire(w.projectiles, kind, x, y, vx, vy, false)
      },
    },
    boss,
  )
  void input
}

/**
 * Two Snappers out of the sand, one either side of the bowl.
 *
 * Their row comes from the King's own feet rather than from the arena box: the
 * arena spans the level's full height, and deriving a floor from it put crabs
 * in mid-air in any level whose ground was not where the arithmetic assumed.
 */
function summonGuards(w: World, arena: Box, boss: Boss): void {
  const row = Math.floor((boss.y + boss.h - 1) / T)
  for (const tx of [Math.floor(arena.x / T) + 2, Math.floor((arena.x + arena.w) / T) - 3]) {
    w.enemies.push(spawnEnemy({ type: 'snapper', x: tx, y: row }))
  }
}

/**
 * A second scratch list, so enemy platforms can be appended to the clam list
 * without either of them allocating. Module-level for the same reason
 * `solidScratch` is on the world: PRD §12.6 asks for zero allocations in the
 * update loop, and two `[]` a frame is sixty of them a second.
 */
const SOLID_SCRATCH_2: Box[] = []

/**
 * Ink Shot and Ink Bomb, both on `C`. PRD §5 allocates one key, so the bomb is
 * the crouched version of the same verb: tap to shoot, hold Down and tap to lob.
 *
 * That is a deviation from §5's table, which names only "Ink Shot (W2
 * upgrade)". It is recorded in the decisions log. The alternative was a sixth
 * key on a keyboard-only game that deliberately fits on one hand.
 */
function tryShoot(w: World, input: InputFrame): void {
  const p = w.player
  if (!p.alive || !isPressed(input, Act.Shoot) || p.shootCooldown > 0) return

  const down = isHeld(input, Act.Down)
  const bomb = down && hasUpgrade(p.upgrades, 'inkBomb')
  if (!bomb && !hasUpgrade(p.upgrades, 'inkShot')) return

  const cost = bomb ? UPGRADES.BOMB_COST : UPGRADES.SHOT_COST
  if (!spendInk(p, cost)) return

  p.shootCooldown = UPGRADES.SHOT_COOLDOWN
  const x = p.x + p.w / 2 + p.facing * (p.w / 2 + 2)
  const y = p.y + p.h / 2
  if (bomb) {
    // Lobbed forward and up, so it clears the ledge in front of Nib rather than
    // landing at his own feet — the blast radius is three tiles and he is one.
    fire(w.projectiles, 'bomb', x, y, p.facing * UPGRADES.BOMB_SPEED, -UPGRADES.BOMB_SPEED * 0.8, true)
    w.cues.push('bomb')
  } else {
    fire(w.projectiles, 'bolt', x, y, p.facing * UPGRADES.SHOT_SPEED, -0.8, true)
    w.cues.push('shoot')
  }
}

/**
 * Bombs that went off this frame: open the cracked terrain in the blast.
 *
 * Enemies caught in it are handled by the combat pass, which is where every
 * other "this killed that" decision lives. Terrain is handled here because a
 * blast opening a wall is not combat, and `collapsed` is the world's to own.
 */
function detonateBombs(w: World): void {
  for (const p of w.projectiles) {
    if (!p.detonated) continue
    w.cues.push('blast')
    for (const tile of crackedInBlast(w.map, p, w.blastScratch)) w.collapsed.add(tile)
  }
}

/**
 * Clear the detonation flags, once both passes that care have run.
 *
 * This used to happen inside `detonateBombs`, which runs *before* the combat
 * pass — so `resolveBlasts` never saw a single detonation and an Ink Bomb
 * opened walls but could not kill anything. The flag has to outlive both
 * readers, so it is cleared at the end of the frame instead of by the first
 * thing to look at it.
 */
function clearDetonations(w: World): void {
  for (const p of w.projectiles) p.detonated = false
}

/**
 * A kelp knot in front of a bolt. PRD §8.5: the Ink Shot "breaks kelp knots".
 *
 * Checked one frame *before* the bolt would hit it, so the knot opens and the
 * bolt flies through the hole rather than dying against a tile that is about
 * to stop existing. The alternative is asking the collision sweep to report
 * what it hit, which would make every projectile pay for a feature one of them
 * uses.
 */
function breakKnots(w: World): void {
  for (const p of w.projectiles) {
    if (!p.alive || !p.friendly || p.kind !== 'bolt') continue
    const ahead = Math.sign(p.vx) * p.w
    const tx = Math.floor((p.x + p.w / 2 + ahead) / T)
    const ty = Math.floor((p.y + p.h / 2) / T)
    const index = ty * w.map.width + tx
    if (tileAt(w.map, tx, ty) !== Tile.KNOT || w.collapsed.has(index)) continue
    w.collapsed.add(index)
    p.alive = false
    w.cues.push('inkKill')
  }
}

/**
 * A vent asking for one more shrimp.
 *
 * The world says no, not the vent: the entity cap is a property of the room
 * (PRD §12.6), and a vent that enforced it would have to know about every other
 * vent in the level.
 */
function spawnFromVent(w: World, kind: EnemyKind, x: number, y: number): boolean {
  if (w.enemies.length >= MAX_ENTITIES) return false
  const near = w.enemies.filter(
    (e) => e.alive && e.kind === kind && Math.abs(e.homeX - x) < T * 2,
  ).length
  if (near >= ENEMIES.VENT_MAX_ALIVE) return false
  w.enemies.push(spawnEnemy({ type: kind, x: Math.floor(x / T), y: Math.floor(y / T) } as never))
  return true
}

/**
 * A force the arena itself applies — the Warden's downdraft, the Captain's
 * tilting floor.
 *
 * Applied to Nib after his own move, so it reads as the room pushing him rather
 * than as a change to how he moves. That distinction matters: a player who
 * cannot tell the difference between "the floor is sliding" and "my controls
 * are wrong" will blame the controls.
 */
function applyArenaForce(w: World): void {
  const b = w.boss
  if (!b || !w.bossActive || b.state === 'dead') return
  if (b.arenaForceX === 0 && b.arenaForceY === 0) return
  w.player.vx += b.arenaForceX
  w.player.vy += b.arenaForceY
}

function tickCrumble(w: World): void {
  for (const [tile, frames] of w.crumbling) {
    if (frames <= 1) {
      w.crumbling.delete(tile)
      w.collapsed.add(tile)
      w.respawning.set(tile, RULES.CRUMBLE_RESPAWN)
    } else {
      w.crumbling.set(tile, frames - 1)
    }
  }
  for (const [tile, frames] of w.respawning) {
    if (frames <= 1) {
      w.respawning.delete(tile)
      w.collapsed.delete(tile)
    } else {
      w.respawning.set(tile, frames - 1)
    }
  }
}


function collectPickups(w: World): void {
  for (const pick of w.pickups) {
    if (pick.taken || !w.player.alive || !boxesOverlap(w.player, pick)) continue
    pick.taken = true
    switch (pick.kind) {
      case 'shell': {
        const before = w.shells
        w.shells++
        w.livesOwed += livesEarned(before, w.shells)
        w.score += POINTS.SHELL
        w.cues.push('shell')
        break
      }
      case 'pearl':
        w.cues.push('pearl')
        // Persistent across runs — the save layer reads this on level clear.
        if (pick.id >= 0) w.pearls[pick.id] = true
        w.score += POINTS.PEARL
        // A pearl is worth a life on the run that first finds it (PRD §8.3).
        w.livesOwed++
        break
      case 'deepJet': {
        // The one upgrade found rather than granted (PRD §8.5). The rooms after
        // it are built for four pips and are impossible on three, so it is
        // handed over and the meter is topped up in the same instant.
        w.player.upgrades |= UPGRADE_BIT.deepJet
        w.player.ink = inkMax(w.player)
        if (!w.earned.includes('deepJet')) w.earned.push('deepJet')
        w.score += POINTS.CORE_AT_TIER
        w.cues.push('upgrade')
        break
      }
      default: {
        // A Core promotes one rung like a Bulb does — but its ceiling is Charged.
        const ceiling: TierIndex = pick.kind === 'inkCore' ? CHARGED_TIER : FULL
        w.cues.push(pick.kind === 'inkCore' ? 'core' : 'bulb')
        const promoted = promote(w.map, w.player, ceiling, w.collapsed)
        // Collected at a tier you already hold, it refills and pays out instead.
        if (!promoted) w.score += pick.kind === 'inkCore' ? POINTS.CORE_AT_TIER : POINTS.BULB_AT_TIER
        break
      }
    }
  }
}

/**
 * One-time key hints. PRD §11.3: no tutorial screens, no text boxes, and these
 * are the only words in the game.
 *
 * Shown once each, on approach, for three seconds. A prompt that reappears
 * reads as a nag, so `spent` is never cleared — not even by a respawn.
 */
function tickHints(w: World): void {
  const cx = w.player.x + w.player.w / 2
  const cy = w.player.y + w.player.h / 2
  for (const hint of w.hints) {
    if (hint.frames > 0) {
      hint.frames--
      if (hint.frames === 0) hint.spent = true
      continue
    }
    if (hint.spent || !w.player.alive) continue
    const near =
      Math.abs(cx - (hint.tx * T + T / 2)) <= hint.radius * T && Math.abs(cy - (hint.ty * T + T / 2)) <= hint.radius * T
    if (near) hint.frames = HINT_FRAMES
  }
}

/**
 * Assist Mode's quarter-speed enemies: is this a frame they hold still on?
 *
 * A skipped step rather than scaled speeds. Every species is a pure function of
 * its own clock, so holding the clock slows the patrol, the sine, the fire
 * cycle and the lunge by the same 25% at once — and no species, and no boss,
 * has to know the mode exists. Projectiles already in the air are not held:
 * a barb that has been fired is the player's problem either way, and freezing
 * it mid-flight would look like a bug rather than a mercy.
 */
function held(w: World): boolean {
  return w.assist && w.frame % ASSIST.ENEMY_HOLD_EVERY === 0
}

/**
 * Assist Mode's soft checkpoints — §13's "checkpoint density doubled", without
 * editing five levels.
 *
 * Set at Nib's feet once he is 32 tiles past the last one, which roughly halves
 * §7.1's ~70-tile conch spacing. Three guards, and each one is a respawn loop
 * that would otherwise be possible:
 *
 *   - **Standing still on real ground.** Not mid-jump, not on a crumbling tile
 *     that will not be there on the way back, and not on a Hookline — the
 *     footing has to outlive the death that sends him to it.
 *   - **Forward only.** Backtracking for a pearl must never move the checkpoint
 *     behind the room the player is actually in.
 *   - **Never inside the arena.** A boss is authored to start from its door.
 */
function checkAssistCheckpoint(w: World): void {
  if (!w.assist) return
  const p = w.player
  if (!p.alive || !p.grounded || p.vy !== 0) return
  if (w.arena && p.x + p.w > w.arena.x) return

  const at = w.checkpoint ?? w.spawn
  if (p.x - at.x < ASSIST.CHECKPOINT_TILES * T) return

  // The tile he is standing on has to still be there after he dies on it.
  const below = tileAt(w.map, Math.floor((p.x + p.w / 2) / T), Math.floor((p.y + p.h) / T))
  if (below !== Tile.SOLID && below !== Tile.ONEWAY) return

  w.checkpoint = { x: p.x, y: p.y }
  w.cues.push('checkpoint')
}

/**
 * Boxes precomputed at load rather than rebuilt per entity per frame — a conch
 * does not move, and this loop ran over every entity in the level sixty times a
 * second allocating one box for each.
 */
function checkCheckpoints(w: World): void {
  for (const c of w.checkpointBoxes) {
    if (!boxesOverlap(w.player, c.box)) continue
    if (w.checkpoint?.x === c.x && w.checkpoint.y === c.y) continue
    w.checkpoint = { x: c.x, y: c.y }
    w.cues.push('checkpoint')
  }
}

/**
 * Respawn always restores Full — never Spent, never Charged. A section authored
 * for a 3-pip budget is not honestly completable on 2, and handing back a
 * Charged tier would return a reward the player already spent.
 */
export function respawn(w: World): void {
  const at = w.checkpoint ?? w.spawn
  const p = w.player
  p.x = at.x
  p.y = at.y
  p.vx = 0
  p.vy = 0
  p.alive = true
  p.iframes = RULES.RESPAWN_IFRAMES
  p.dashFrames = 0
  p.dashCooldown = 0
  p.stunCloud = 0
  p.jumping = false
  p.inkTimer = 0
  setTier(w.map, p, RULES.RESPAWN_TIER, w.collapsed)
  p.ink = inkMax(p)
  p.scald = 0
  p.stillFrames = 0
  p.clingsUsed = 0
  p.clingDir = 0
  p.clingFrames = 0
  p.shootCooldown = 0
  p.prevY = p.y
  w.respawnTimer = 0
  w.chain = 0
  w.hitstop = 0
  w.collapsed.clear()
  w.crumbling.clear()
  w.respawning.clear()
  // Everything the room contained comes back, exactly as it was authored. A
  // half-cleared room on a retry would make the second attempt a different
  // level from the first, which is not the one the checkpoint promised.
  // The boss fight restarts from its own beginning, guards and all. Half a
  // fight is not the fight the conch at the door promised.
  w.enemies.length = w.baseEnemies
  for (const e of w.enemies) resetEnemy(e)
  for (const c of w.clams) c.clock = c.phase
  for (const b of w.bubbles) {
    b.clock = b.phase
    b.popped.fill(-1)
  }
  // A rising surface goes all the way back down and re-arms. A flood that kept
  // its level would make the second attempt at a room a different room, which
  // is not what the conch at the door promised.
  for (const r of w.rises) {
    r.y = r.startY
    r.armed = false
  }
  for (const proj of w.projectiles) {
    proj.alive = false
    proj.detonated = false
  }
  for (const r of w.rocks) r.alive = false
  w.boss = null
  w.bossActive = false
  // Heat Shell's doors are not part of the room's state, so they are reopened
  // rather than restored: the upgrade is permanent and a respawn is not a loss.
  openFusedTerrain(w.map, p, w.collapsed)
}

function resetEnemy(e: Enemy): void {
  e.alive = true
  e.x = e.homeX
  e.y = e.homeY
  // Size too: a Puffer killed mid-inflate must not come back as a spike ball.
  e.w = e.spawnW
  e.h = e.spawnH
  e.vx = 0
  e.vy = 0
  e.facing = e.dirX > 0 ? 1 : -1
  // Back to the authored phase, not to zero: a corridor of three turrets is a
  // rhythm, and a respawn that reset every one of them to the same beat would
  // hand the player a different room from the one they died in.
  e.clock = e.phase
  e.stun = 0
  e.inflated = 0
  e.state = 0
  e.timer = 0
  e.spawned = 0
}

/** Restart cleanly — used by tests and by the debug reset key. */
export function resetWorld(source: LevelDef | LoadedLevel): World {
  return createWorld(source)
}

export { Tile }
export type { HintDef, LevelDef, LoadedLevel }
