/**
 * Boss dispatch. One file per boss, per PRD §12.2.
 *
 * Five bosses live behind this and each is a state machine over frame counters.
 * Keeping the registry keyed by the id a level declares is what made adding the
 * Kelp Warden a new file and a new entry rather than a change to the world.
 *
 * The arena shape lives here too, because it is the one thing about a boss the
 * *level* has to accommodate: the King fights in a bowl one screen wide, the
 * Warden fights up a shaft two screens tall, and a level that ends in one has
 * to leave room for it.
 */

import { BOSS, DISPLAY } from '../constants.js'
import type { Box } from '../collision.js'
import { Tile, tileAt, type TileMap } from '../tilemap.js'
import { hitHermitKing, spawnHermitKing, updateHermitKing } from './hermit-king.js'
import { armLash, armsOf, cutArm, hitKelpWarden, spawnKelpWarden, updateKelpWarden } from './kelp-warden.js'
import { hitDrownedCaptain, spawnDrownedCaptain, updateDrownedCaptain } from './drowned-captain.js'
import { hitVentLord, spawnVentLord, updateVentLord } from './vent-lord.js'
import { cutTentacle, hitKraken, spawnKraken, updateKraken } from './kraken.js'
import { isFighting, type Boss, type BossPart, type BossStepContext, type PartHit } from './types.js'

const T = DISPLAY.TILE

/**
 * How much room a boss needs, in tiles, and where the camera sits in it.
 *
 * `cameraDrop` exists because the arena box's bottom edge *is* the floor the
 * boss stands on. Without a drop the King fights on a horizon rather than on a
 * beach — which is exactly what it did the first time.
 */
export interface ArenaSpec {
  tilesW: number
  tilesH: number
  cameraDrop: number
}

const ARENAS: Record<string, ArenaSpec> = {
  /** A tide pool bowl: exactly one screen, so a fixed camera holds the fight. */
  hermitKing: { tilesW: BOSS.ARENA_TILES, tilesH: 11, cameraDrop: BOSS.ARENA_CAMERA_DROP },
  /** A shaft. Taller than a screen on purpose — the camera follows within it. */
  kelpWarden: { tilesW: BOSS.ARENA_TILES, tilesH: 30, cameraDrop: 0 },
  drownedCaptain: { tilesW: BOSS.ARENA_TILES, tilesH: 11, cameraDrop: 0 },
  ventLord: { tilesW: BOSS.ARENA_TILES, tilesH: 11, cameraDrop: 0 },
  /** Full-screen and dark, and one screen taller so the eye is somewhere to go. */
  kraken: { tilesW: BOSS.ARENA_TILES, tilesH: 20, cameraDrop: 0 },
}

export function arenaSpecOf(id: string): ArenaSpec {
  const spec = ARENAS[id]
  if (!spec) throw new Error(`unknown boss ${JSON.stringify(id)}`)
  return spec
}

/**
 * The arena: the level's right-hand end, sitting on its own floor.
 *
 * Anchored to the floor rather than to the map, because a level's grid is
 * taller than a screen and "the bottom of the map" is somewhere underground.
 * Getting this wrong spawns the boss inside the sand and points the locked
 * camera at bedrock.
 */
export function arenaBox(map: TileMap, id: string): Box {
  const spec = arenaSpecOf(id)
  const x = (map.width - spec.tilesW) * T
  const probeColumn = Math.floor(x / T) + 2

  // Scanned upward from the bedrock, not downward from the sky: a platform
  // hanging over the bowl is not its floor, and a downward scan happily
  // reported one as such.
  let ty = map.height - 1
  while (ty >= 0 && tileAt(map, probeColumn, ty) === Tile.SOLID) ty--
  const floorTop = (ty + 1) * T

  const wanted = spec.tilesH * T
  const y = Math.max(0, floorTop - wanted)
  return { x, y, w: spec.tilesW * T, h: floorTop - y }
}

export function spawnBoss(id: string, arena: Box): Boss {
  switch (id) {
    case 'hermitKing':
      return spawnHermitKing(arena)
    case 'kelpWarden':
      return spawnKelpWarden(arena)
    case 'drownedCaptain':
      return spawnDrownedCaptain(arena)
    case 'ventLord':
      return spawnVentLord(arena)
    case 'kraken':
      return spawnKraken(arena)
    default:
      throw new Error(`unknown boss ${JSON.stringify(id)}`)
  }
}

export function updateBoss(ctx: BossStepContext, b: Boss): void {
  switch (b.id) {
    case 'hermitKing':
      updateHermitKing(ctx, b)
      return
    case 'kelpWarden':
      updateKelpWarden(ctx, b)
      return
    case 'drownedCaptain':
      updateDrownedCaptain(ctx, b)
      return
    case 'ventLord':
      updateVentLord(ctx, b)
      return
    case 'kraken':
      updateKraken(ctx, b)
      return
    default:
      throw new Error(`unknown boss ${JSON.stringify(b.id)}`)
  }
}

/**
 * What landing a hit on a boss part did.
 *
 * `hit` is a hit on the *boss* — one of the three, worth the payout and the
 * bounce. `part` is progress toward one: an arm cut down, a tentacle taken
 * off. Distinguishing them is what lets the Warden and the Kraken be two-step
 * fights without the score thinking they are six-hit ones.
 */
export type BossHit = 'none' | 'part' | 'hit'

/**
 * Land a hit on a boss, given the part and how it was struck.
 *
 * The one place that knows which boss reads which part. Everything upstream
 * asks only "is this part open, and did the player hit it the way it asked",
 * which is a question with the same shape for all five.
 */
export function hitBoss(b: Boss, target: BossPart, how: PartHit): BossHit {
  if (!isFighting(b)) return 'none'
  if (!target.alive || !target.open || target.hit !== how) return 'none'

  switch (b.id) {
    case 'hermitKing':
      return hitHermitKing(b) ? 'hit' : 'none'
    case 'kelpWarden':
      if (target.kind === 'arm') return cutArm(target) ? 'part' : 'none'
      return hitKelpWarden(b) ? 'hit' : 'none'
    case 'drownedCaptain':
      // A decoy is not a miss and not a hit: it is a pip and a second spent in
      // a room with a tilting floor, which is punishment enough.
      return hitDrownedCaptain(b, target) ? 'hit' : 'none'
    case 'ventLord':
      return hitVentLord(b) ? 'hit' : 'none'
    case 'kraken':
      if (target.kind === 'sucker') return cutTentacle(b, target) ? 'part' : 'none'
      return hitKraken(b, target) ? 'hit' : 'none'
    default:
      return 'none'
  }
}

/**
 * Boxes that cost a tier on contact, beyond the boss's own body.
 *
 * The Warden's lashing arms are the only *dynamic* ones — every other hurtful
 * part is already a box in `parts` — but returning them all through one call
 * keeps the combat pass from having a Warden branch in it.
 */
export function bossHazards(b: Boss, into: Box[]): Box[] {
  into.length = 0
  // Nothing a boss owns hurts before it has woken up or after it has died.
  if (!isFighting(b)) return into

  for (const p of b.parts) {
    if (!p.alive || !p.hurtful) continue
    // An open part is the thing you are *supposed* to touch, on the terms the
    // fight set. It stops being a hazard for exactly as long as it is a target.
    if (p.open) continue
    into.push(p)
  }

  if (b.id === 'kelpWarden') {
    for (const arm of armsOf(b)) {
      const lash = armLash(b, arm)
      if (lash) into.push(lash)
    }
  }
  return into
}

export const BOSS_IDS: readonly string[] = Object.keys(ARENAS)

export * from './types.js'
export * from './hermit-king.js'
export * from './kelp-warden.js'
export * from './drowned-captain.js'
export * from './vent-lord.js'
export * from './kraken.js'
