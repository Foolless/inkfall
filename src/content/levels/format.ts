/**
 * The level format, and the validator that refuses to load a broken one.
 *
 * Two sources of truth, split by what the thing *is*:
 *
 *   the ASCII grid  — terrain, plus the three markers that are geometry:
 *                     `S` start, `E` exit, `K` checkpoint
 *   the entity list — everything that acts or is collected: enemies, hazards
 *                     with state, shells, pearls, Ink Bulbs, Ink Cores
 *
 * PRD §12.5 sketched checkpoints and pickups in both places. One concept with
 * two authorities is how a level ends up with three checkpoints in the grid and
 * two in the list, so each concept gets exactly one home here. See the
 * decisions log (PRD Appendix C).
 *
 * Everything below throws rather than guessing. A level that silently loads
 * wrong is far more expensive than one that refuses to load at all: the first
 * costs you an afternoon of "why is the Snapper inside the floor", the second
 * costs you a line number.
 */

import { isSolid } from '../../game/collision.js'
import { RULES } from '../../game/constants.js'
import { parseTiles, Tile, tileAt, type TileMap } from '../../game/tilemap.js'

/** Coordinates in every entity are **tile** coordinates, never pixels. */
export interface Placed {
  x: number
  y: number
}

/** Which way a fixed thing points. Turrets, eels and hooks all use it. */
export type Facing = 'left' | 'right' | 'up' | 'down'

export type EntityDef =
  // ── World 1 ────────────────────────────────────────────────────────────────
  /** Crab. Walks a platform, turns at ledges and walls. Patrol clamps it. */
  | (Placed & { type: 'snapper'; patrol?: readonly [number, number] })
  /** Jellyfish. Sine float, ignores terrain, damaging on every side. */
  | (Placed & { type: 'drifter'; amplitude?: number; period?: number })
  /** Inflates within 3 tiles of Nib; stompable only while deflated. */
  | (Placed & { type: 'puffer' })
  /** Crush clam. Open 90 frames, slams in 6. Its closed shell is a platform. */
  | (Placed & { type: 'clam'; phase?: number })

  // ── World 2 ────────────────────────────────────────────────────────────────
  /** Armoured barnacle. Fires along one axis every 100 frames. */
  | (Placed & { type: 'barbTurret'; dir?: Facing; phase?: number })
  /** Anchored stalk. Lashes a 4-tile arc; only the base can be killed. */
  | (Placed & { type: 'whipkelp'; dir?: Facing; phase?: number })
  /** Sits in a wall socket and lunges when Nib crosses its line. */
  | (Placed & { type: 'eel'; dir?: Facing; reach?: number })

  // ── World 3 ────────────────────────────────────────────────────────────────
  /** Drifts at Nib through solid walls. Cannot be killed or stunned. */
  | (Placed & { type: 'ghostDiver' })
  /**
   * Descends, sweeps, retracts. Death on contact; the flat top is a platform.
   * `drop` is how far it comes down, `span` how far it sweeps — both in tiles.
   */
  | (Placed & { type: 'hookline'; dir?: Facing; span?: number; drop?: number; phase?: number })

  // ── World 4 ────────────────────────────────────────────────────────────────
  /** Armoured front and top. Only the exposed rear takes ink. */
  | (Placed & { type: 'magmaSnail'; patrol?: readonly [number, number] })
  /** Flies a patrol and drops a burning ember every 90 frames. */
  | (Placed & { type: 'cinderMoth'; patrol?: readonly [number, number]; phase?: number })

  // ── World 5 ────────────────────────────────────────────────────────────────
  /** Weak, fast, and never alone. */
  | (Placed & { type: 'boneShrimp'; patrol?: readonly [number, number] })
  /** Invisible but for its lure. Charges when Nib enters the light. */
  | (Placed & { type: 'lightless'; reach?: number })
  /** Produces shrimp until it is inked shut. Harmless to touch. */
  | (Placed & { type: 'shrimpVent'; phase?: number })

  // ── Hazards with state ─────────────────────────────────────────────────────
  /**
   * Rising bubbles. One frame of contact, an upward carry, then it pops.
   * `height` is how far up the column reaches, in tiles.
   */
  | (Placed & { type: 'bubble'; height?: number; phase?: number })
  /**
   * A rising surface: World 3's flood and World 4's magma, one entity.
   *
   * `x` is the trigger column — crossing it starts the clock. `y` is where the
   * surface begins and `top` is the row it stops at. Water lifts you; magma
   * kills you, and that difference is a field rather than a module.
   */
  | (Placed & { type: 'rise'; fluid: 'magma' | 'flood'; top: number; rate?: number })
  /** A room that kills you for standing still. `w`/`h` are tiles. */
  | (Placed & { type: 'pressure'; w: number; h: number })

  // ── Collectibles ───────────────────────────────────────────────────────────
  | (Placed & { type: 'shell' })
  /** Three per level. `id` is the slot on the world map, so it is stable. */
  | (Placed & { type: 'pearl'; id: 0 | 1 | 2 })
  | (Placed & { type: 'inkBulb' })
  | (Placed & { type: 'inkCore' })
  /** The one upgrade found inside a level rather than granted for clearing one. */
  | (Placed & { type: 'deepJet' })

export type EntityType = EntityDef['type']

export const ENTITY_TYPES: readonly EntityType[] = [
  'snapper',
  'drifter',
  'puffer',
  'clam',
  'barbTurret',
  'whipkelp',
  'eel',
  'ghostDiver',
  'hookline',
  'magmaSnail',
  'cinderMoth',
  'boneShrimp',
  'lightless',
  'shrimpVent',
  'bubble',
  'rise',
  'pressure',
  'shell',
  'pearl',
  'inkBulb',
  'inkCore',
  'deepJet',
]

/** Types that float, walk through walls, or are anchored inside terrain. */
const MAY_BE_BURIED: readonly EntityType[] = [
  'drifter',
  'ghostDiver',
  'hookline',
  'barbTurret',
  'shrimpVent',
  'lightless',
  'eel',
  'rise',
  'pressure',
  'bubble',
]

export interface LevelDef {
  /**
   * Stable forever. Save data, records and map nodes key on this, never on an
   * index — see PRD §12.7. Lowercase kebab, enforced below.
   */
  id: string
  name: string
  /** Owns the palette, tileset and music. Levels never declare their own. */
  chapter: string
  /** Sparse, so a level can be inserted between two others without renumbering. */
  order: number
  tiles: readonly string[]
  entities?: readonly EntityDef[]
  /**
   * One-time key prompts. PRD §11.3 allows exactly this and nothing more.
   *
   * Level data rather than code, so `[C] INK SHOT` in World 2 is a line in a
   * level file. Kept out of the `entities` list because a hint is not a thing
   * in the world — it is a caption on one, and it has no box to collide with.
   */
  hints?: readonly HintDef[]
  /** Boss id, if the level ends in one. A level needs an exit or a boss. */
  boss?: string
  /**
   * Par time in seconds. Seconds left on it at the exit pay 50 points each.
   *
   * Authored per level rather than derived, because par is a *design* statement
   * about how fast the room should read, not a measurement of how fast the
   * developer happens to be at it.
   */
  par?: number
}

/**
 * A one-time key prompt, shown on first approach and never again.
 *
 * Gate 1 found that the dash reads as horizontal-only, so the prompt worth
 * spending is the up-dash. Everything else is taught by geometry.
 */
export interface HintDef {
  tx: number
  ty: number
  text: string
  /** Tiles from the anchor at which the prompt triggers. */
  radius?: number
}

export class LevelValidationError extends Error {
  constructor(readonly levelId: string, message: string) {
    super(`${levelId}: ${message}`)
    this.name = 'LevelValidationError'
  }
}

/** A parsed, validated level: the grid plus its entities, ready to instantiate. */
export interface LoadedLevel {
  def: LevelDef
  map: TileMap
  entities: readonly EntityDef[]
  start: Placed
  exit: Placed | null
  checkpoints: readonly Placed[]
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

const FACING_NAMES: readonly string[] = ['left', 'right', 'up', 'down']

/**
 * Parse and validate. Every failure names the level and the coordinate.
 *
 * Ordering matters: the grid is parsed first, because an entity's bounds check
 * needs the grid's dimensions, and "unknown legend character" is a better first
 * error than fifty out-of-bounds entities.
 */
export function loadLevel(def: LevelDef): LoadedLevel {
  const fail = (message: string): never => {
    throw new LevelValidationError(def.id, message)
  }

  if (!ID_PATTERN.test(def.id)) fail(`id must be lowercase kebab-case, got ${JSON.stringify(def.id)}`)
  if (def.name.trim() === '') fail('name is empty')
  if (def.chapter.trim() === '') fail('chapter is empty')
  if (!Number.isInteger(def.order) || def.order < 0) fail(`order must be a non-negative integer, got ${def.order}`)
  if (def.par !== undefined && !(def.par > 0)) fail(`par must be a positive number of seconds, got ${def.par}`)

  const map = parseTiles(def.tiles)

  const starts = map.entities.filter((e) => e.kind === 'start')
  // `!== 1`, not `> 1`: a grid with no `S` at all fell straight through to
  // `starts[0]!.tx` and threw a bare TypeError, which for a level compiled into
  // the bundle means the module crashes on import rather than saying what is
  // wrong with it.
  if (starts.length !== 1) fail(`${starts.length} starts (S); a level has exactly one`)
  const start = { x: starts[0]!.tx, y: starts[0]!.ty }

  const exits = map.entities.filter((e) => e.kind === 'exit')
  if (exits.length > 1) fail(`${exits.length} exits (E); a level has at most one`)
  const exit = exits[0] ? { x: exits[0].tx, y: exits[0].ty } : null

  const checkpoints = map.entities.filter((e) => e.kind === 'checkpoint').map((e) => ({ x: e.tx, y: e.ty }))
  // Three through the level plus one at the boss door. More than that and the
  // difficulty has quietly left the checkpoint spacing, which is where the PRD
  // puts it (§4.5). Raised from two after Gate 3 round one.
  const maxCheckpoints = RULES.CHECKPOINTS_PER_LEVEL + 1
  if (checkpoints.length > maxCheckpoints) {
    fail(`${checkpoints.length} checkpoints (K); the budget is ${maxCheckpoints}`)
  }

  for (const [i, hint] of (def.hints ?? []).entries()) {
    if (hint.text.trim() === '') fail(`hint ${i} has no text`)
    if (hint.text.length > 26) fail(`hint ${i} is ${hint.text.length} characters; keep it under 26`)
    if (hint.tx < 0 || hint.tx >= map.width || hint.ty < 0 || hint.ty >= map.height) {
      fail(`hint ${i} at ${hint.tx},${hint.ty} is outside the grid`)
    }
    if (hint.radius !== undefined && !(hint.radius > 0)) fail(`hint ${i} has a non-positive radius`)
  }

  const entities = def.entities ?? []
  const pearlIds = new Set<number>()
  const occupied = new Set<string>()

  entities.forEach((e, i) => {
    const where = `entity ${i} (${e.type}) at ${e.x},${e.y}`
    if (!(ENTITY_TYPES as readonly string[]).includes(e.type)) fail(`${where}: unknown entity type`)
    if (!Number.isInteger(e.x) || !Number.isInteger(e.y)) fail(`${where}: coordinates must be whole tiles`)
    if (e.x < 0 || e.x >= map.width || e.y < 0 || e.y >= map.height) fail(`${where}: outside the ${map.width}x${map.height} grid`)

    // Some things live inside terrain by design — a turret is bolted to a wall,
    // an eel's socket *is* a hole in one, a hook hangs from the ceiling. For
    // everything else, being buried means a pickup nobody can see or an enemy
    // stuck in the floor, and both are authoring slips worth a line number.
    if (
      !(MAY_BE_BURIED as readonly string[]).includes(e.type) &&
      isSolid(map, e.x, e.y, { downward: false, prevBottom: 0 })
    ) {
      fail(`${where}: buried in a solid tile`)
    }

    const key = `${e.type}:${e.x},${e.y}`
    if (occupied.has(key)) fail(`${where}: duplicate of another ${e.type} at the same tile`)
    occupied.add(key)

    switch (e.type) {
      case 'pearl':
        if (![0, 1, 2].includes(e.id)) fail(`${where}: pearl id must be 0, 1 or 2`)
        if (pearlIds.has(e.id)) fail(`${where}: pearl id ${e.id} is already used`)
        pearlIds.add(e.id)
        break
      case 'snapper':
      case 'magmaSnail':
      case 'cinderMoth':
      case 'boneShrimp':
        if (e.patrol) {
          const [lo, hi] = e.patrol
          if (!Number.isInteger(lo) || !Number.isInteger(hi)) fail(`${where}: patrol bounds must be whole tiles`)
          if (lo > hi) fail(`${where}: patrol [${lo}, ${hi}] runs backwards`)
          if (e.x < lo || e.x > hi) fail(`${where}: starts outside its own patrol [${lo}, ${hi}]`)
        }
        break
      case 'barbTurret':
      case 'whipkelp':
      case 'eel':
      case 'hookline':
        if ('dir' in e && e.dir !== undefined && !FACING_NAMES.includes(e.dir)) {
          fail(`${where}: dir must be one of ${FACING_NAMES.join(', ')}`)
        }
        if ('reach' in e && e.reach !== undefined && !(e.reach > 0)) fail(`${where}: reach must be positive`)
        if ('span' in e && e.span !== undefined && !(e.span > 0)) fail(`${where}: span must be positive`)
        if ('drop' in e && e.drop !== undefined && !(e.drop > 0)) fail(`${where}: drop must be positive`)
        break
      case 'bubble':
        if (e.height !== undefined && !(e.height > 0)) fail(`${where}: height must be positive`)
        break
      case 'rise':
        if (e.fluid !== 'magma' && e.fluid !== 'flood') fail(`${where}: fluid must be magma or flood`)
        if (!Number.isInteger(e.top) || e.top < 0) fail(`${where}: top must be a row in the grid`)
        // Upward only. A "rising" surface that starts above where it stops is a
        // transposed pair of numbers, and it would silently never trigger.
        if (e.top >= e.y) fail(`${where}: top ${e.top} is not above the surface at ${e.y}`)
        if (e.rate !== undefined && !(e.rate > 0)) fail(`${where}: rate must be positive`)
        break
      case 'pressure':
        if (!Number.isInteger(e.w) || !Number.isInteger(e.h) || e.w <= 0 || e.h <= 0) {
          fail(`${where}: a pressure room needs a positive whole-tile size`)
        }
        if (e.x + e.w > map.width || e.y + e.h > map.height) fail(`${where}: pressure room runs off the grid`)
        break
      case 'drifter':
        if (e.amplitude !== undefined && e.amplitude < 0) fail(`${where}: amplitude cannot be negative`)
        if (e.period !== undefined && e.period <= 0) fail(`${where}: period must be positive`)
        break
      case 'clam':
        if (e.phase !== undefined && (!Number.isInteger(e.phase) || e.phase < 0)) {
          fail(`${where}: phase must be a non-negative whole number of frames`)
        }
        break
      default:
        break
    }
  })

  // The first screen never has an enemy on it (PRD §7.1), and a pickup floating
  // in a wall is invisible. Both are caught above; this one catches the level
  // that forgot the player has to stand somewhere.
  if (tileAt(map, start.x, start.y) !== Tile.EMPTY) fail('the start (S) is not on an empty tile')

  return { def, map, entities, start, exit, checkpoints }
}

/**
 * The extra rules a *shipped* level must satisfy, on top of parsing.
 *
 * Split from `loadLevel` on purpose. A twenty-character strip of floor in a
 * physics test is a valid grid but not a level: it has no exit, no conches and
 * no pearls, and demanding those of it would only teach the fixtures to lie.
 * These are the rules for content that a player will actually be handed.
 */
export function loadCampaignLevel(def: LevelDef): LoadedLevel {
  const level = loadLevel(def)
  const fail = (message: string): never => {
    throw new LevelValidationError(def.id, message)
  }

  if (!level.exit && def.boss === undefined) fail('has neither an exit (E) nor a boss — it cannot be finished')

  // Sparse, NES-style: three through the level, one at the boss door.
  const wanted = RULES.CHECKPOINTS_PER_LEVEL + (def.boss === undefined ? 0 : 1)
  if (level.checkpoints.length !== wanted) {
    fail(`${level.checkpoints.length} checkpoints (K), expected ${wanted}`)
  }

  const pearls = level.entities.filter((e) => e.type === 'pearl')
  if (pearls.length !== 3) fail(`${pearls.length} pearls, expected 3 (PRD §8.3)`)

  const bulbs = level.entities.filter((e) => e.type === 'inkBulb').length
  const [minBulbs, maxBulbs] = RULES.INK_BULBS_PER_LEVEL
  if (bulbs < minBulbs || bulbs > maxBulbs) fail(`${bulbs} Ink Bulbs, expected ${minBulbs}-${maxBulbs} (PRD §4.5)`)

  return level
}

/** Every pearl this level declares, in slot order. */
export function pearlsOf(level: LoadedLevel): readonly (Placed & { id: number })[] {
  return level.entities
    .filter((e): e is Extract<EntityDef, { type: 'pearl' }> => e.type === 'pearl')
    .map((e) => ({ x: e.x, y: e.y, id: e.id }))
    .sort((a, b) => a.id - b.id)
}
