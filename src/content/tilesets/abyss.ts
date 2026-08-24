/**
 * The Abyss tileset. PRD §9.3: near-black, bioluminescent cyan and magenta
 * accents, no ambient light. The most restrained palette in the game — often
 * three colours on screen.
 *
 * This set is drawn to be seen through a five-tile hole in a black sheet, which
 * is a genuinely different design problem from every other chapter. Two rules
 * fall out of it:
 *
 * **Edges over fill.** Inside the light radius the player has a second to read
 * a room, so what matters is where a surface *ends*. Every solid here is dark
 * with a bright cap; the interiors are nearly empty because nobody will ever
 * look at them.
 *
 * **The bright colour belongs to the hazards.** Bioluminescent cyan is the
 * brightest thing available and it is spent on spikes and on the one-way
 * shelves — the two things it is worth burning the light budget to see coming.
 */

import { sprite, type SpriteDef } from '../sprites/format.js'
import { ABYSS } from '../palettes.js'
import type { Tileset } from './shallows.js'

const STONE = [ABYSS.ABYSS_VOID, ABYSS.SHAPE, ABYSS.BIO_DIM]
const LIT = [ABYSS.ABYSS_VOID, ABYSS.SHAPE, ABYSS.BIO_CYAN]
const BONE = [ABYSS.ABYSS_VOID, ABYSS.SHAPE, ABYSS.BONE_PALE]

/** Black rock with a bioluminescent crust on top. The crust is the readout. */
export const abyssTop = sprite('abyssTop', LIT, [
  '3333333333333333',
  '3232332333233323',
  '2222222222222222',
  '1121111111211111',
  '1111111111111111',
  '1111111112111111',
  '1111111111111111',
  '1211111111111211',
  '1111111111111111',
  '1111121111111111',
  '1111111111111111',
  '1111111111211111',
  '1111111111111111',
  '1121111111111111',
  '1111111111111111',
  '1111111121111111',
])

export const abyssFill = sprite('abyssFill', STONE, [
  '1111111111111111',
  '1111111111111111',
  '1121111111111111',
  '1111111111111111',
  '1111111112111111',
  '1111111111111111',
  '1211111111111111',
  '1111111111111111',
  '1111121111111111',
  '1111111111111111',
  '1111111111211111',
  '1111111111111111',
  '1121111111111111',
  '1111111111111111',
  '1111111121111111',
  '1111111111111111',
])

/** A shelf of bone. Bright, because falling past one in the dark is a death. */
export const abyssOneway = sprite('abyssOneway', BONE, [
  '3333333333333333',
  '3223322332233223',
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

/** Silt. It gives way, and the cracks glow as it goes. */
export const abyssCrumble = sprite('abyssCrumble', LIT, [
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

/**
 * Abyssal spines. The brightest thing in the chapter that is not a lure, and
 * that is the whole point — §13 asks every hazard to be legible in greyscale,
 * and in a dark room "legible" has to mean "emits its own light".
 */
export const abyssHazard = sprite('abyssHazard', LIT, [
  '0000000000000000',
  '0000000000000000',
  '0003000000300000',
  '0003000030300000',
  '0013001031300100',
  '0113011131301310',
  '0111111111111110',
  '0111131111311110',
  '1111111111111111',
  '1111111111111111',
  '1113111111113111',
  '1111111111111111',
  '1111111111111111',
  '1111311111111111',
  '1111111111111111',
  '1111111111111111',
])

export const abyssSlick = sprite('abyssSlick', BONE, [
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

/**
 * A thin crust. Pearl W5 ② is behind one of these.
 *
 * Drawn with a visible seam down the middle, because a cracked wall you cannot
 * see is a cracked wall nobody bombs — and in the dark that is a real risk.
 */
export const abyssCracked = sprite('abyssCracked', LIT, [
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

export const abyss: Tileset = {
  id: 'abyss',
  solidTop: abyssTop,
  solidFill: abyssFill,
  oneway: abyssOneway,
  crumble: abyssCrumble,
  hazard: abyssHazard,
  slick: abyssSlick,
  cracked: abyssCracked,
  water: { body: '#050508', surface: ABYSS.BIO_DIM, current: ABYSS.BIO_CYAN },
  /** Cold vents, not hot ones — §7.6 C3's magma-analog. Same rule, no heat. */
  heat: { magma: ABYSS.BIO_MAGENTA, hot: ABYSS.BIO_DIM, crest: ABYSS.BIO_CYAN },
  sky: '#050508',
}

export const ABYSS_FRAMES: readonly SpriteDef[] = [
  abyssTop,
  abyssFill,
  abyssOneway,
  abyssCrumble,
  abyssHazard,
  abyssSlick,
  abyssCracked,
]
