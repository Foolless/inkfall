/**
 * The Sunken Ship tileset. PRD §9.3: rotting brown wood, verdigris brass, cold
 * blue-grey water, one warm lantern amber.
 *
 * The amber is spent on exactly one thing — the Drowned Captain's lantern — and
 * appears nowhere in this file. A single warm point in a cold world only works
 * if it is genuinely single, so the tileset gives it up entirely and the boss
 * gets the only one.
 *
 * Wood is drawn as planks with visible grain running horizontally, which does
 * two jobs at once: it says "ship" without a single decorative sprite, and it
 * makes a wall obviously a wall in a world where half the geometry is
 * cling-only and the other half is not.
 */

import { sprite, type SpriteDef } from '../sprites/format.js'
import { WRECK } from '../palettes.js'
import type { Tileset } from './shallows.js'

const WOOD = [WRECK.COLD_WATER, WRECK.WOOD, WRECK.BRASS]
const IRON = [WRECK.COLD_WATER, WRECK.VERDIGRIS, WRECK.BONE]
const SPIKE = [WRECK.COLD_WATER, WRECK.BRASS, WRECK.BONE]

/** Deck planking with light on it. */
export const wreckTop = sprite('wreckTop', WOOD, [
  '3333333333333333',
  '2222222222222222',
  '2222222222222222',
  '1111111111111111',
  '2222222222222222',
  '2222222222222222',
  '2222222222222222',
  '1111111111111111',
  '2222222222222222',
  '2222222222222222',
  '2222222222222222',
  '1111111111111111',
  '2222222222222222',
  '2222222222222222',
  '2222222222222222',
  '1111111111111111',
])

export const wreckFill = sprite('wreckFill', WOOD, [
  '2222222222222222',
  '2222222222222222',
  '1111111111111111',
  '2222222222222222',
  '2212222222122222',
  '2222222222222222',
  '1111111111111111',
  '2222222222222222',
  '2222222222222222',
  '2222122222222122',
  '1111111111111111',
  '2222222222222222',
  '2222222222222222',
  '2122222212222222',
  '1111111111111111',
  '2222222222222222',
])

/** A crate lid — pass up through it, land on it. */
export const wreckOneway = sprite('wreckOneway', WOOD, [
  '3333333333333333',
  '2112211221122112',
  '2222222222222222',
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

/** Rotten planking. The splits are the timer. */
export const wreckCrumble = sprite('wreckCrumble', WOOD, [
  '3333333333333333',
  '2222122222212222',
  '2222122222122222',
  '1111111111111111',
  '2221222221222222',
  '2212222212222222',
  '2212222122222222',
  '1111111111111111',
  '2122221222222222',
  '2122212222222222',
  '2122122222222222',
  '1111111111111111',
  '2221222222222222',
  '2212222222222222',
  '2212222222222222',
  '1111111111111111',
])

/** Broken brass fittings, points up. Instant death, and it looks it. */
export const wreckHazard = sprite('wreckHazard', SPIKE, [
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

/** Weed-slicked brass. */
export const wreckSlick = sprite('wreckSlick', IRON, [
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

/** Cracked hull plating. The powder magazine is made of it. */
export const wreckCracked = sprite('wreckCracked', IRON, [
  '1111111111111111',
  '1113111111111311',
  '1111311111113111',
  '1111131111131111',
  '1111113113111111',
  '1111111331111111',
  '1333333113333331',
  '1111111331111111',
  '1111113113111111',
  '1111131111131111',
  '1111311111113111',
  '1113111111111311',
  '1131111111111131',
  '1311111111111113',
  '1111111111111111',
  '1111111111111111',
])

/** Heat-fused debris. Only Heat Shell walks through it. Pearl W3 ③ is behind. */
export const wreckFused = sprite('wreckFused', SPIKE, [
  '1111111111111111',
  '1221111221111221',
  '1222112222112221',
  '1122222222222211',
  '1112222222222111',
  '1122122222212211',
  '1221112222111221',
  '1211111221111121',
  '1211111221111121',
  '1221112222111221',
  '1122122222212211',
  '1112222222222111',
  '1122222222222211',
  '1222112222112221',
  '1221111221111221',
  '1111111111111111',
])

export const wreck: Tileset = {
  id: 'wreck',
  solidTop: wreckTop,
  solidFill: wreckFill,
  oneway: wreckOneway,
  crumble: wreckCrumble,
  hazard: wreckHazard,
  slick: wreckSlick,
  cracked: wreckCracked,
  fused: wreckFused,
  water: { body: WRECK.COLD_WATER, surface: WRECK.BONE, current: WRECK.VERDIGRIS },
  sky: '#141c26',
}

export const WRECK_FRAMES: readonly SpriteDef[] = [
  wreckTop,
  wreckFill,
  wreckOneway,
  wreckCrumble,
  wreckHazard,
  wreckSlick,
  wreckCracked,
  wreckFused,
]
