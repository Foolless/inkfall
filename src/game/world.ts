import type { InputFrame } from '../engine/input.js'
import { CHARGED_TIER, DISPLAY, FULL, RULES, type TierIndex } from './constants.js'
import { boxesOverlap, type Box } from './collision.js'
import { Tile, type TileMap } from './tilemap.js'
import { loadLevel, type LevelDef, type LoadedLevel } from '../content/levels/format.js'
import { createPlayer, promote, setTier, updatePlayer, type Player, type PlayerStepContext } from './player.js'

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

  return {
    map,
    player: createPlayer(spawn.x, spawn.y),
    pickups,
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
  }
}

export function update(w: World, input: InputFrame): void {
  w.frame++

  tickCrumble(w)

  const ctx: PlayerStepContext = { map: w.map, collapsed: w.collapsed, crumbling: w.crumbling }
  updatePlayer(ctx, w.player, input)

  collectPickups(w)
  checkCheckpoints(w)

  if (w.exit && !w.cleared && boxesOverlap(w.player, w.exit)) w.cleared = true

  if (!w.player.alive) {
    w.respawnTimer++
    if (w.respawnTimer >= RULES.DEATH_ANIM_FRAMES) respawn(w)
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
      case 'shell':
        w.shells++
        break
      case 'pearl':
        // Persistent across runs — the save layer reads this on level clear.
        if (pick.id >= 0) w.pearls[pick.id] = true
        break
      default: {
        // A Core promotes one rung like a Bulb does — but its ceiling is Charged.
        const ceiling: TierIndex = pick.kind === 'inkCore' ? CHARGED_TIER : FULL
        promote(w.map, w.player, ceiling, w.collapsed)
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
  p.inkTimer = 0
  setTier(w.map, p, RULES.RESPAWN_TIER, w.collapsed)
  p.ink = 3
  w.respawnTimer = 0
  w.collapsed.clear()
  w.crumbling.clear()
  w.respawning.clear()
}

/** Restart cleanly — used by tests and by the debug reset key. */
export function resetWorld(source: LevelDef | LoadedLevel): World {
  return createWorld(source)
}

export { Tile }
export type { LevelDef, LoadedLevel }
