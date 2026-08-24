import { DISPLAY } from './constants.js'

export const Tile = {
  EMPTY: 0,
  SOLID: 1,
  ONEWAY: 2,
  WATER: 3,
  HAZARD: 4,
  CRUMBLE: 5,
  CURRENT_R: 6,
  CURRENT_L: 7,
  CURRENT_U: 8,
  CURRENT_D: 9,
  SLICK: 10,
  /** Solid until an Ink Bomb or a Charged dash opens it. PRD §8.5. */
  CRACKED: 11,
  /** Solid until Heat Shell lets Nib walk through it. PRD §8.5. */
  FUSED: 12,
  /** Molten rock. Instant death, and Heat Shell buys only 90 frames of it. */
  MAGMA: 13,
  /** Superheated water. Swimmable, on a scald timer. */
  HOT: 14,
} as const
export type TileId = (typeof Tile)[keyof typeof Tile]

/** Legend for the ASCII grids that levels are authored as. */
export const LEGEND: Record<string, TileId> = {
  '.': Tile.EMPTY,
  '#': Tile.SOLID,
  '-': Tile.ONEWAY,
  '~': Tile.WATER,
  '^': Tile.HAZARD,
  c: Tile.CRUMBLE,
  '>': Tile.CURRENT_R,
  '<': Tile.CURRENT_L,
  u: Tile.CURRENT_U,
  d: Tile.CURRENT_D,
  '=': Tile.SLICK,
  x: Tile.CRACKED,
  f: Tile.FUSED,
  m: Tile.MAGMA,
  h: Tile.HOT,
}

/**
 * Markers that occupy a grid cell but leave the tile itself empty.
 *
 * Only geometry lives here — where the level starts, where it ends, and where
 * its conches stand. Everything that acts or is collected is authored in the
 * `entities` list instead (src/content/levels/format.ts), so no concept has two
 * places it could have been written.
 */
export const ENTITY_CHARS = {
  S: 'start',
  E: 'exit',
  K: 'checkpoint',
} as const
export type EntityKind = (typeof ENTITY_CHARS)[keyof typeof ENTITY_CHARS]

export interface EntityMark {
  kind: EntityKind
  /** Tile coordinates, not pixels. */
  tx: number
  ty: number
}

export interface TileMap {
  width: number
  height: number
  tiles: Uint8Array
  entities: EntityMark[]
}

export class LevelParseError extends Error {
  constructor(message: string, readonly row: number, readonly col: number) {
    super(`${message} (row ${row}, col ${col})`)
    this.name = 'LevelParseError'
  }
}

/**
 * Parse an ASCII grid into a tilemap. Throws loudly rather than guessing —
 * a level that silently loads wrong is far more expensive than one that
 * refuses to load at all.
 */
export function parseTiles(rows: readonly string[]): TileMap {
  if (rows.length === 0) throw new LevelParseError('level has no rows', 0, 0)

  const width = rows[0]!.length
  if (width === 0) throw new LevelParseError('first row is empty', 0, 0)

  const height = rows.length
  const tiles = new Uint8Array(width * height)
  const entities: EntityMark[] = []

  for (let ty = 0; ty < height; ty++) {
    const row = rows[ty]!
    if (row.length !== width) {
      throw new LevelParseError(`ragged row: expected width ${width}, got ${row.length}`, ty, 0)
    }
    for (let tx = 0; tx < width; tx++) {
      const ch = row[tx]!
      const entity = ENTITY_CHARS[ch as keyof typeof ENTITY_CHARS]
      if (entity !== undefined) {
        entities.push({ kind: entity, tx, ty })
        tiles[ty * width + tx] = Tile.EMPTY
        continue
      }
      const tile = LEGEND[ch]
      if (tile === undefined) throw new LevelParseError(`unknown legend character ${JSON.stringify(ch)}`, ty, tx)
      tiles[ty * width + tx] = tile
    }
  }

  if (!entities.some((e) => e.kind === 'start')) {
    throw new LevelParseError('level has no start (S)', 0, 0)
  }

  return { width, height, tiles, entities }
}

/** Out-of-bounds reads return SOLID at the sides and EMPTY above/below, so a
 *  level can't be walked out of sideways but can still be fallen out of. */
export function tileAt(map: TileMap, tx: number, ty: number): TileId {
  if (tx < 0 || tx >= map.width) return Tile.SOLID
  if (ty < 0 || ty >= map.height) return Tile.EMPTY
  return map.tiles[ty * map.width + tx] as TileId
}

export function tileAtPixel(map: TileMap, x: number, y: number): TileId {
  return tileAt(map, Math.floor(x / DISPLAY.TILE), Math.floor(y / DISPLAY.TILE))
}

export function pixelWidth(map: TileMap): number {
  return map.width * DISPLAY.TILE
}

export function pixelHeight(map: TileMap): number {
  return map.height * DISPLAY.TILE
}

export function isCurrent(t: TileId): boolean {
  return t === Tile.CURRENT_R || t === Tile.CURRENT_L || t === Tile.CURRENT_U || t === Tile.CURRENT_D
}

/**
 * Water and currents both count as fluid.
 *
 * A current tile drawn inside a pool replaces the water glyph in the grid, and
 * before this existed the player switched to land gravity the moment they hit
 * one -- sinking through an updraft they should have ridden. The whole game
 * takes place underwater, so treating every current as fluid is both the fix
 * and the honest model.
 */
export function isFluid(t: TileId): boolean {
  return t === Tile.WATER || t === Tile.HOT || isCurrent(t)
}

/**
 * Terrain an upgrade opens. PRD §8.5.
 *
 * Both are solid until the player holds the right upgrade, and both are
 * expressed the same way at runtime: the tile joins the world's `collapsed`
 * set, which is already the answer to "is this tile currently not solid".
 * Reusing that rather than threading a loadout through the collision sweep is
 * what keeps `isSolid` a function of the map and nothing else.
 */
export function isBreakable(t: TileId): boolean {
  return t === Tile.CRACKED || t === Tile.FUSED
}

/** Tiles that burn. Heat Shell is the only thing that survives either. */
export function isHeat(t: TileId): boolean {
  return t === Tile.MAGMA || t === Tile.HOT
}
