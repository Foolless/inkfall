import type { InputFrame } from '../engine/input.js'
import { CHARGED_TIER, DISPLAY, FULL, RULES, type TierIndex } from './constants.js'
import { boxesOverlap, type Box } from './collision.js'
import { parseTiles, Tile, type TileMap } from './tilemap.js'
import { createPlayer, promote, setTier, updatePlayer, type Player, type PlayerStepContext } from './player.js'

const T = DISPLAY.TILE

export interface Pickup extends Box {
  kind: 'inkBulb' | 'inkCore'
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
}

export interface LevelDef {
  id: string
  name: string
  chapter: string
  order: number
  tiles: readonly string[]
}

export function createWorld(def: LevelDef): World {
  const map = parseTiles(def.tiles)
  const start = map.entities.find((e) => e.kind === 'start')!
  const exitMark = map.entities.find((e) => e.kind === 'exit')

  const spawn = { x: start.tx * T + 2, y: start.ty * T + 2 }
  const pickups: Pickup[] = map.entities
    .filter((e) => e.kind === 'inkBulb' || e.kind === 'inkCore')
    .map((e) => ({
      kind: e.kind as 'inkBulb' | 'inkCore',
      x: e.tx * T + 4,
      y: e.ty * T + 4,
      w: 8,
      h: 8,
      taken: false,
    }))

  return {
    map,
    player: createPlayer(spawn.x, spawn.y),
    pickups,
    collapsed: new Set(),
    crumbling: new Map(),
    respawning: new Map(),
    spawn,
    checkpoint: null,
    exit: exitMark ? { x: exitMark.tx * T, y: exitMark.ty * T, w: T, h: T } : null,
    frame: 0,
    cleared: false,
    respawnTimer: 0,
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
    if (pick.taken || !boxesOverlap(w.player, pick)) continue
    pick.taken = true
    // A Core promotes one rung like a Bulb does — but its ceiling is Charged.
    const ceiling: TierIndex = pick.kind === 'inkCore' ? CHARGED_TIER : FULL
    promote(w.map, w.player, ceiling, w.collapsed)
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
export function resetWorld(def: LevelDef): World {
  return createWorld(def)
}

export { Tile }
