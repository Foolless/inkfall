/**
 * The Volcanic Vents tileset. PRD §9.3: black basalt, magma orange, sulphur
 * yellow, heavy red rim-light. High contrast, low mid-tones.
 *
 * The lowest-value tileset in the game and deliberately so. Every hazard in
 * World 4 is *bright* — magma, embers, superheated water — so the rock they sit
 * on has to be nearly black or the room becomes unreadable at speed. A player
 * looking at a vent chamber should be able to answer "where can I stand" from
 * the value alone, with the colour turned off.
 *
 * Ash is the exception and it is meant to be: it reads as a slightly warmer
 * grey than basalt, because §7.5 B2 asks the player to notice that a bridge is
 * ash rather than rock *before* a Cinder Moth sets it alight.
 */

import { sprite, type SpriteDef } from '../sprites/format.js'
import { VENTS } from '../palettes.js'
import type { Tileset } from './shallows.js'

const BASALT = [VENTS.BASALT, VENTS.ASH, VENTS.ROCK_RED]
const ASH = [VENTS.BASALT, VENTS.ASH, VENTS.SULPHUR]
const SPIKE = [VENTS.BASALT, VENTS.ROCK_RED, VENTS.MAGMA]
const GLASS = [VENTS.BASALT, VENTS.ROCK_RED, VENTS.EMBER]

/** Basalt with a red rim on it, wherever there is open water above. */
export const ventsTop = sprite('ventsTop', BASALT, [
  '3333333333333333',
  '3323333233323333',
  '2222222222222222',
  '1112111111121111',
  '1111111111111111',
  '1121111111211111',
  '1111111111111111',
  '1111112111111121',
  '1111111111111111',
  '1211111112111111',
  '1111111111111111',
  '1111211111112111',
  '1111111111111111',
  '1112111111121111',
  '1111111111111111',
  '1121111111211111',
])

export const ventsFill = sprite('ventsFill', BASALT, [
  '1111111111111111',
  '1121111111211111',
  '1111111111111111',
  '1111112111111121',
  '1111111111111111',
  '1211111112111111',
  '1111111111111111',
  '1111211111112111',
  '1111111111111111',
  '1112111111121111',
  '1111111111111111',
  '1121111111211111',
  '1111111111111111',
  '1111112111111121',
  '1111111111111111',
  '1211111112111111',
])

/** A basalt shelf. */
export const ventsOneway = sprite('ventsOneway', BASALT, [
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
 * Ash. Warmer than basalt on purpose — §7.5 B2 wants the player to know a
 * bridge will not hold *before* a moth's ember lands on it.
 */
export const ventsCrumble = sprite('ventsCrumble', ASH, [
  '3333333333333333',
  '2222222222222222',
  '2232222222322222',
  '2231222221322222',
  '2231222213222222',
  '2231222132222222',
  '2221221222222222',
  '2222213222222222',
  '2222213222222222',
  '2222132222222222',
  '2221322222222232',
  '2213222222222322',
  '2222222222222222',
  '2222132222222222',
  '2222312222222222',
  '2222312222222222',
])

/** Volcanic glass shards. */
export const ventsHazard = sprite('ventsHazard', SPIKE, [
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

/** Cooled flow. Glassy and treacherous. */
export const ventsSlick = sprite('ventsSlick', GLASS, [
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

/** Cracked basalt. C3's two mandatory bomb walls are made of it. */
export const ventsCracked = sprite('ventsCracked', GLASS, [
  '1111111111111111',
  '1131111111111311',
  '1113111111113111',
  '1111311111131111',
  '1111131113111111',
  '1111113331111111',
  '1333333113333331',
  '1111113331111111',
  '1111131113111111',
  '1111311111131111',
  '1113111111113111',
  '1131111111111311',
  '1311111111111131',
  '1111111111111111',
  '1111111111111111',
  '1111111111111111',
])

/** Heat-fused rock. Pearl W4 ③ is under a permanent pool behind it. */
export const ventsFused = sprite('ventsFused', SPIKE, [
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

export const vents: Tileset = {
  id: 'vents',
  solidTop: ventsTop,
  solidFill: ventsFill,
  oneway: ventsOneway,
  crumble: ventsCrumble,
  hazard: ventsHazard,
  slick: ventsSlick,
  cracked: ventsCracked,
  fused: ventsFused,
  water: { body: '#2c3e50', surface: VENTS.SULPHUR, current: VENTS.ROCK_RED },
  heat: { magma: VENTS.MAGMA, hot: VENTS.ROCK_RED, crest: VENTS.SULPHUR },
  sky: '#120c0a',
}

export const VENTS_FRAMES: readonly SpriteDef[] = [
  ventsTop,
  ventsFill,
  ventsOneway,
  ventsCrumble,
  ventsHazard,
  ventsSlick,
  ventsCracked,
  ventsFused,
]
