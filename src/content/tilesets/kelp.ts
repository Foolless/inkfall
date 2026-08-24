/**
 * The Kelp Forest tileset. PRD §9.3: deep greens, olive, filtered god-rays,
 * black silhouette kelp in the foreground.
 *
 * Owned by the chapter, not by the level (PRD §12.7).
 *
 * The one thing this set has to get right is that **a current is not a wall**.
 * World 2 is built on force zones, and a player who cannot tell moving water
 * from still water at a glance will read every chamber as a maze. That is why
 * the water body is a shade lighter here than in the Tide Pools and why the
 * surface line is the brightest thing in the palette.
 */

import { sprite, type SpriteDef } from '../sprites/format.js'
import { KELP } from '../palettes.js'
import type { Tileset } from './shallows.js'

const ROCK = [KELP.SILHOUETTE, KELP.KELP_DARK, KELP.KELP_MID]
const FROND = [KELP.KELP_DARK, KELP.KELP_MID, KELP.FROND]
const BARB = [KELP.SILHOUETTE, KELP.BARNACLE, KELP.GOD_RAY]
const RAY = [KELP.KELP_DARK, KELP.FROND, KELP.GOD_RAY]

/** Rock with light on it. Mossy, so the forest reads as overgrown. */
export const kelpTop = sprite('kelpTop', ROCK, [
  '3333333333333333',
  '3233332333233333',
  '2332233223322332',
  '2222222222222222',
  '2212222222122222',
  '2222222222222222',
  '1222222122222221',
  '2222222222222222',
  '2222122222222122',
  '2222222222222222',
  '2122222212222222',
  '2222222222222222',
  '2222212222222212',
  '2222222222222222',
  '2212222222122222',
  '2222122222222122',
])

export const kelpFill = sprite('kelpFill', ROCK, [
  '1111111111111111',
  '1121111112111111',
  '1111111111111111',
  '1211111111121111',
  '1111111111111111',
  '1111211111111121',
  '1111111111111111',
  '1121111112111111',
  '1111111111111111',
  '1211111111121111',
  '1111111111111111',
  '1111211111111121',
  '1111111111111111',
  '1121111112111111',
  '1111111111111111',
  '1211111111121111',
])

/** A frond mat you can pass up through and land on. */
export const kelpOneway = sprite('kelpOneway', FROND, [
  '3333333333333333',
  '2323232323232323',
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

/** Rotting kelp mat. It gives way, and the holes in it are the timer. */
export const kelpCrumble = sprite('kelpCrumble', FROND, [
  '3333333333333333',
  '2222222222222222',
  '2212222222122222',
  '2211222221122222',
  '2211222211222222',
  '2211222112222222',
  '1111221111112222',
  '2222211222222222',
  '2222211222222222',
  '2222112222222222',
  '2221122222222222',
  '1112222111112222',
  '2222222222222222',
  '2222112222222222',
  '2222122222222222',
  '2222122222222222',
])

/** Barbed shells on the sea floor. Shape does the work, not colour. */
export const kelpHazard = sprite('kelpHazard', BARB, [
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

/** Slime. Slick underfoot and unmistakably wet. */
export const kelpSlick = sprite('kelpSlick', RAY, [
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

/** A kelp knot only an Ink Shot or a bomb opens. Pearl W2 ② sits behind one. */
export const kelpCracked = sprite('kelpCracked', FROND, [
  '1111111111111111',
  '1221111111112211',
  '1222111111122221',
  '1122211111222211',
  '1112221112222111',
  '1111222122221111',
  '1111122222211111',
  '1111112222111111',
  '1111122222211111',
  '1111222122221111',
  '1112221112222111',
  '1122211111222211',
  '1222111111122221',
  '1221111111112211',
  '1111111111111111',
  '1111111111111111',
])

export const kelp: Tileset = {
  id: 'kelp',
  solidTop: kelpTop,
  solidFill: kelpFill,
  oneway: kelpOneway,
  crumble: kelpCrumble,
  hazard: kelpHazard,
  slick: kelpSlick,
  cracked: kelpCracked,
  water: { body: KELP.KELP_DARK, surface: KELP.GOD_RAY, current: KELP.FROND },
  sky: '#0a1f18',
}

export const KELP_FRAMES: readonly SpriteDef[] = [
  kelpTop,
  kelpFill,
  kelpOneway,
  kelpCrumble,
  kelpHazard,
  kelpSlick,
  kelpCracked,
]
