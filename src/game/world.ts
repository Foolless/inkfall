import { Act, isHeld, type InputFrame } from '../engine/input.js'
import { CHARGED_TIER, DISPLAY, FULL, RULES, type TierIndex } from './constants.js'
import { boxesOverlap, type Box } from './collision.js'
import { Tile, tileAt, type TileMap } from './tilemap.js'
import { loadLevel, type LevelDef, type LoadedLevel } from '../content/levels/format.js'
import { createPlayer, promote, setTier, updatePlayer, type Player, type PlayerStepContext } from './player.js'
import { isEnemyKind, spawnEnemy, updateEnemy, type Enemy, type EnemyKind } from './enemies/index.js'
import { resolveCombat } from './combat.js'
import { livesEarned, POINTS } from './score.js'
import { checkClams, clamSolids, spawnClam, updateClam, type Clam } from './hazards.js'
import { spawnBoss, updateBoss, updateRocks, type Boss, type Rock } from './bosses/index.js'
import { BOSS } from './constants.js'

const T = DISPLAY.TILE

export type PickupKind = 'inkBulb' | 'inkCore' | 'shell' | 'pearl'

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
  boss: Boss | null
  rocks: Rock[]
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
   * Reused array for the per-frame list of solid clams.
   *
   * Ugly, and deliberate: PRD §12.6 asks for zero allocations in the update
   * loop, and rebuilding this list sixty times a second is exactly the kind of
   * garbage that adds up to a dropped frame.
   */
  solidScratch: Box[]
}

/** Collectible footprints, centred in their tile. Generous, not pixel-exact. */
const PICKUP_BOX: Record<PickupKind, number> = { inkBulb: 8, inkCore: 8, shell: 6, pearl: 8 }

export function createWorld(source: LevelDef | LoadedLevel): World {
  const level = 'map' in source ? source : loadLevel(source)
  const { map } = level

  const spawn = { x: level.start.x * T + 2, y: level.start.y * T + 2 }
  const pickups: Pickup[] = level.entities
    .filter((e) => e.type === 'inkBulb' || e.type === 'inkCore' || e.type === 'shell' || e.type === 'pearl')
    .map((e) => {
      const size = PICKUP_BOX[e.type as PickupKind]
      return {
        kind: e.type as PickupKind,
        id: e.type === 'pearl' ? e.id : -1,
        x: e.x * T + (T - size) / 2,
        y: e.y * T + (T - size) / 2,
        w: size,
        h: size,
        taken: false,
      }
    })

  const enemies = level.entities
    .filter((e): e is typeof e & { type: EnemyKind } => isEnemyKind(e.type))
    .map(spawnEnemy)

  const clams = level.entities.filter((e): e is typeof e & { type: 'clam' } => e.type === 'clam').map(spawnClam)

  const arena: Box | null = level.def.boss === undefined ? null : arenaBox(map)

  return {
    map,
    player: createPlayer(spawn.x, spawn.y),
    pickups,
    enemies,
    clams,
    boss: null,
    rocks: [],
    arena,
    bossActive: false,
    collapsed: new Set(),
    crumbling: new Map(),
    respawning: new Map(),
    spawn,
    checkpoint: null,
    exit: level.exit ? { x: level.exit.x * T, y: level.exit.y * T, w: T, h: T } : null,
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
    solidScratch: [],
  }
}

/**
 * The bowl: one screen wide, one screen tall, sitting on the arena's own floor.
 *
 * Anchored to the floor rather than to the map, because a level's grid is
 * taller than a screen and "the bottom of the map" is somewhere underground.
 * Getting this wrong spawns the King inside the sand and points the locked
 * camera at bedrock — which is exactly what it did first time.
 */
function arenaBox(map: TileMap): Box {
  const x = (map.width - BOSS.ARENA_TILES) * T
  const probeColumn = Math.floor(x / T) + 2

  // Scanned upward from the bedrock, not downward from the sky: a platform
  // hanging over the bowl is not its floor, and a downward scan happily
  // reported one as such.
  let ty = map.height - 1
  while (ty >= 0 && tileAt(map, probeColumn, ty) === Tile.SOLID) ty--
  const floorTop = (ty + 1) * T
  // The box's bottom edge *is* the floor, so `y + h` is somewhere to stand.
  // A level shorter than a screen clamps the top rather than the bottom.
  const y = Math.max(0, floorTop - DISPLAY.HEIGHT)
  return { x, y, w: BOSS.ARENA_TILES * T, h: floorTop - y }
}

/**
 * Where the camera sits during a boss fight, which is not quite the arena.
 *
 * The arena box's bottom edge is the floor, because that is what the King
 * stands on. The camera drops a little further so there is ground under the
 * fight rather than a horizon.
 */
export function bossCameraLock(w: World): Box | null {
  if (!w.bossActive || !w.arena) return null
  return { ...w.arena, y: w.arena.y + BOSS.ARENA_CAMERA_DROP }
}

export function update(w: World, input: InputFrame): void {
  w.frame++

  // Hitstop freezes the whole simulation for a few frames on a stomp or a
  // shrink. The frame counter still advances, so the clock a speedrun is timed
  // against never stops — a hit costs you the time it is worth.
  if (w.hitstop > 0) {
    w.hitstop--
    return
  }

  tickCrumble(w)
  for (const c of w.clams) updateClam(c)
  const solids = clamSolids(w.clams, w.solidScratch)

  const ctx: PlayerStepContext = { map: w.map, collapsed: w.collapsed, crumbling: w.crumbling, solids }
  updatePlayer(ctx, w.player, input)

  const enemyCtx = { map: w.map, collapsed: w.collapsed, player: w.player }
  for (const e of w.enemies) updateEnemy(enemyCtx, e)

  stepBoss(w, input)

  resolveCombat(w, isHeld(input, Act.Jump))
  // After the move, so the frame a shell slams shut on Nib is the frame he
  // dies rather than the one after.
  checkClams(w.clams, w.player)

  collectPickups(w)
  checkCheckpoints(w)

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
  updateBoss(
    {
      map: w.map,
      arena,
      player: w.player,
      rocks: w.rocks,
      // Phase 3 lets two Snappers out of the sand, one either side of the bowl.
      summonGuards: () => summonGuards(w, arena, boss),
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
        break
      }
      case 'pearl':
        // Persistent across runs — the save layer reads this on level clear.
        if (pick.id >= 0) w.pearls[pick.id] = true
        w.score += POINTS.PEARL
        // A pearl is worth a life on the run that first finds it (PRD §8.3).
        w.livesOwed++
        break
      default: {
        // A Core promotes one rung like a Bulb does — but its ceiling is Charged.
        const ceiling: TierIndex = pick.kind === 'inkCore' ? CHARGED_TIER : FULL
        const promoted = promote(w.map, w.player, ceiling, w.collapsed)
        // Collected at a tier you already hold, it refills and pays out instead.
        if (!promoted) w.score += pick.kind === 'inkCore' ? POINTS.CORE_AT_TIER : POINTS.BULB_AT_TIER
        break
      }
    }
  }
}

function checkCheckpoints(w: World): void {
  for (const e of w.map.entities) {
    if (e.kind !== 'checkpoint') continue
    const box: Box = { x: e.tx * T, y: e.ty * T, w: T, h: T }
    if (!boxesOverlap(w.player, box)) continue
    if (w.checkpoint?.x === box.x && w.checkpoint.y === box.y) continue
    w.checkpoint = { x: e.tx * T + 2, y: e.ty * T + 2 }
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
  p.ink = 3
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
  for (const r of w.rocks) r.alive = false
  w.boss = null
  w.bossActive = false
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
  e.facing = -1
  e.clock = 0
  e.stun = 0
  e.inflated = 0
}

/** Restart cleanly — used by tests and by the debug reset key. */
export function resetWorld(source: LevelDef | LoadedLevel): World {
  return createWorld(source)
}

export { Tile }
export type { LevelDef, LoadedLevel }
