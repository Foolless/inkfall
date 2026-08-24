/**
 * The Kelp Forest roster. PRD §6.1 #4–6.
 *
 * Three enemies, three silhouettes, and none of them shaped like a squid: a
 * barnacle is a hard cone, a whipkelp is a knot on a stalk, an eel is a wedge
 * with a mouth. §13 asks every meaningful difference to survive greyscale, and
 * the cheapest way to check that is to squint at the shapes with the palette
 * turned off — which is exactly what tests/palette.test.ts does.
 *
 * The turret gets two cels because its flare is the twenty-frame telegraph the
 * whole corridor is timed against. If the two poses were not obvious from a
 * screen away, B1 would be unfair rather than tight.
 */

import { sprite, type SpriteDef } from './format.js'
import { KELP } from '../palettes.js'

const BARNACLE = [KELP.SILHOUETTE, KELP.BARNACLE, KELP.GOD_RAY]
const STALK = [KELP.SILHOUETTE, KELP.KELP_MID, KELP.FROND]
const EEL = [KELP.KELP_DARK, KELP.KELP_MID, KELP.GOD_RAY]

// ── Barb Turret · 16x16 ─────────────────────────────────────────────────────
// A ribbed cone bolted to stone, mouth toward the barrel. Drawn facing right;
// the blitter mirrors it, and a vertical turret is drawn rotated at blit time.

export const turretIdle = sprite('turretIdle', BARNACLE, [
  '0000000000000000',
  '0000000000000000',
  '0011100000000000',
  '0122210000000000',
  '0122211000000000',
  '1222221100000000',
  '1222222110000000',
  '1222122211000000',
  '1222122221100000',
  '1222222110000000',
  '1222221100000000',
  '0122211000000000',
  '0122210000000000',
  '0011100000000000',
  '0000000000000000',
  '0000000000000000',
])

/** Flaring: the mouth opens and the rim lights. Twenty frames of this. */
export const turretFlare = sprite('turretFlare', BARNACLE, [
  '0000000000000000',
  '0003300000000000',
  '0313130000000000',
  '0132313000000000',
  '3132211300000000',
  '1322221130000000',
  '1222222313000000',
  '1223333331300000',
  '1223333333130000',
  '1222222313000000',
  '1322221130000000',
  '3132211300000000',
  '0132313000000000',
  '0313130000000000',
  '0003300000000000',
  '0000000000000000',
])

// ── Whipkelp · 16x16 ────────────────────────────────────────────────────────
// The base is a knot low in the cell — the half a bolt has to hit — with the
// stalk rising out of it. The lashing arm is drawn as a line, not a sprite,
// because its length changes every frame.

export const whipkelpCoiled = sprite('whipkelpCoiled', STALK, [
  '0000011000000000',
  '0000012100000000',
  '0000112110000000',
  '0000121210000000',
  '0000121210000000',
  '0000112110000000',
  '0000112100000000',
  '0001122110000000',
  '0011222211000000',
  '0112222221100000',
  '0122232222100000',
  '1223333322210000',
  '1223333322210000',
  '0122232222100000',
  '0112222211000000',
  '0011111100000000',
])

export const whipkelpLashing = sprite('whipkelpLashing', STALK, [
  '0000000000000000',
  '0000000000000000',
  '0000001121100000',
  '0000011232110000',
  '0000112322110000',
  '0001122211000000',
  '0011222110000000',
  '0011221100000000',
  '0011222211000000',
  '0112222221100000',
  '0122232222100000',
  '1223333322210000',
  '1223333322210000',
  '0122232222100000',
  '0112222211000000',
  '0011111100000000',
])

// ── Eel · 16x16 ─────────────────────────────────────────────────────────────
// A wedge with a jaw. Socketed it is a pair of eyes in a hole; flaring, the
// whole head comes out and glows.

export const eelSocketed = sprite('eelSocketed', EEL, [
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000011111000',
  '0000000122222100',
  '0000001233222210',
  '0000012232222221',
  '0000112222222211',
  '0000112222222211',
  '0000012232222221',
  '0000001233222210',
  '0000000122222100',
  '0000000011111000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
])

export const eelFlaring = sprite('eelFlaring', EEL, [
  '0000000000000000',
  '0000003000030000',
  '0000000300300000',
  '0000111311113000',
  '0001222222222100',
  '0012233322222210',
  '0122232222222221',
  '1122222222222211',
  '1122222222222211',
  '0122232222222221',
  '0012233322222210',
  '0001222222222100',
  '0000111311113000',
  '0000000300300000',
  '0000003000030000',
  '0000000000000000',
])

export const KELP_ENEMY_FRAMES: readonly SpriteDef[] = [
  turretIdle,
  turretFlare,
  whipkelpCoiled,
  whipkelpLashing,
  eelSocketed,
  eelFlaring,
]
