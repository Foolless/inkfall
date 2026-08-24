/**
 * The Tide Pools tileset. PRD §9.3: warm sun-bleached coral, turquoise
 * shallows, cream sand.
 *
 * Owned by the chapter, not by the level (PRD §12.7) — five levels of the
 * shallows would share exactly this, which is the whole reason fifty levels is
 * a content problem rather than an art budget.
 *
 * Solids come in two cels, a capped one and a fill. Which one a tile gets is
 * decided at draw time by whether anything sits above it, so a designer never
 * has to think about edges while authoring a grid.
 */

import { sprite, type SpriteDef } from '../sprites/format.js'
import { SHALLOWS } from '../palettes.js'

const SAND = [SHALLOWS.SAND_DEEP, SHALLOWS.SAND_SHADE, SHALLOWS.SAND]
const CORAL = [SHALLOWS.CORAL_DARK, SHALLOWS.CORAL, SHALLOWS.SAND]
const URCHIN = [SHALLOWS.URCHIN, SHALLOWS.URCHIN_TIP, SHALLOWS.FOAM]
const ALGAE = [SHALLOWS.SHALLOW_DEEP, SHALLOWS.SHALLOW, SHALLOWS.FOAM]

/** Sand with sun on it. Drawn wherever a solid has open water above it. */
export const sandTop = sprite('sandTop', SAND, [
  '3333333333333333',
  '3333333333333333',
  '3323333233323333',
  '2232322322232232',
  '2222222222222222',
  '2212222222212222',
  '2222222222222222',
  '2222222222222222',
  '2222122222222122',
  '2222222222222222',
  '2122222212222222',
  '2222222222222222',
  '2222222222222222',
  '2222212222222212',
  '2222222222222222',
  '2212222222122222',
])

export const sandFill = sprite('sandFill', SAND, [
  '2222222222222222',
  '2212222222122222',
  '2222222222222222',
  '2222222222222222',
  '2222122222222122',
  '2222222222222222',
  '2122222212222222',
  '2222222222222222',
  '2222222222222222',
  '2222212222222212',
  '2222222222222222',
  '2212222222122222',
  '2222222222222222',
  '2222122222222122',
  '2222222222222222',
  '2122222212222222',
])

/** A coral ledge you can pass up through and land on. */
export const oneway = sprite('shallowsOneway', CORAL, [
  '3333333333333333',
  '2222222222222222',
  '2112211221122112',
  '1111111111111111',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
])

/**
 * Collapsing sand. The cracks are the timer, so they have to be visible from
 * a screen away and unmistakable next to ordinary sand.
 */
export const crumble = sprite('shallowsCrumble', SAND, [
  '3333333333333333',
  '3333333333333333',
  '2222222222222222',
  '2221222222122222',
  '2221222212222222',
  '2221222122222222',
  '1111112111111222',
  '2222221222222222',
  '2222221222222222',
  '2222122222222222',
  '2221222222222222',
  '1112222111112222',
  '2222222222222222',
  '2222222222222222',
  '2222122222222222',
  '2222122222222222',
])

/**
 * Urchin spikes. Shape does the work, not colour — PRD §13 requires every
 * hazard to be legible in greyscale, and a bed of spikes is unmistakable with
 * the colour turned off.
 */
export const urchin = sprite('shallowsUrchin', URCHIN, [
  '0000000000000000',
  '0000000000000000',
  '0002000000200000',
  '0002000020200000',
  '0012001021200100',
  '0112011121201210',
  '0111111111111110',
  '0111121111211110',
  '1111111111111111',
  '1111111111111111',
  '1112111111112111',
  '1111111111111111',
  '1111111111111111',
  '1111211111111111',
  '1111111111111111',
  '1111111111111111',
])

/** Algae. Slick underfoot, and it reads wet. */
export const slick = sprite('shallowsSlick', ALGAE, [
  '3333333333333333',
  '2323232323232323',
  '2222222222222222',
  '2212221222122212',
  '1111111111111111',
  '1112111211121112',
  '1111111111111111',
  '1111111111111111',
  '1211112111121111',
  '1111111111111111',
  '1111111111111111',
  '1112111211121112',
  '1111111111111111',
  '1111111111111111',
  '1211112111121111',
  '1111111111111111',
])

export interface Tileset {
  id: string
  solidTop: SpriteDef
  solidFill: SpriteDef
  oneway: SpriteDef
  crumble: SpriteDef
  hazard: SpriteDef
  slick: SpriteDef
  /**
   * Terrain an upgrade opens. Optional, because a world with no cracked walls
   * in it has no business authoring a cel for them — the Tide Pools have
   * neither, and a required field would mean two unused sprites per chapter.
   */
  cracked?: SpriteDef
  fused?: SpriteDef
  knot?: SpriteDef
  /**
   * Molten rock and superheated water, painted rather than blitted for the
   * same reason water is: both are translucent and both move.
   */
  heat?: { magma: string; hot: string; crest: string }
  /**
   * Water is painted rather than blitted: it is translucent, so what is behind
   * it has to show through. A sprite would have to be opaque or carry an alpha
   * channel the format deliberately does not have.
   */
  water: { body: string; surface: string; current: string }
  /** What the empty space behind everything is. */
  sky: string
}

export const shallows: Tileset = {
  id: 'shallows',
  solidTop: sandTop,
  solidFill: sandFill,
  oneway,
  crumble,
  hazard: urchin,
  slick,
  water: { body: SHALLOWS.SHALLOW_DEEP, surface: SHALLOWS.FOAM, current: SHALLOWS.SHALLOW },
  sky: '#0d3f4d',
}

export const SHALLOWS_FRAMES: readonly SpriteDef[] = [sandTop, sandFill, oneway, crumble, urchin, slick]
