/**
 * The Sunken Ship roster. PRD §6.1 #7–8.
 *
 * Two enemies, and they are opposites on purpose. The Ghost Diver is a soft
 * shape with no hard edge anywhere on it, because nothing about it can be
 * interacted with; the Hookline is all straight lines and a flat top, because
 * the top is a floor you are meant to stand on.
 *
 * That reads before a player has learned either rule, which is the whole job of
 * a silhouette in a game with no tutorial screens (§11.3).
 */

import { sprite, type SpriteDef } from './format.js'
import { WRECK } from '../palettes.js'

const GHOST = [WRECK.COLD_WATER, WRECK.VERDIGRIS, WRECK.BONE]
const IRON = [WRECK.WOOD, WRECK.BRASS, WRECK.BONE]

// ── Ghost Diver · 16x16 ─────────────────────────────────────────────────────
// A brass helmet over a suit that trails off into nothing. It never has a
// bottom edge: a thing that walks through walls should not look like it stands
// anywhere.

export const ghostDiver0 = sprite('ghostDiver0', GHOST, [
  '0000111111000000',
  '0001222221100000',
  '0012233322210000',
  '0122333332221000',
  '0122333332221000',
  '0012233322210000',
  '0111222222111000',
  '1122222222211100',
  '1222222222221100',
  '1222222222221100',
  '0122222222211000',
  '0112222222110000',
  '0011222221100000',
  '0001122110000000',
  '0000110100000000',
  '0000010000000000',
])

export const ghostDiver1 = sprite('ghostDiver1', GHOST, [
  '0000111111000000',
  '0001222221100000',
  '0012333333210000',
  '0122333332221000',
  '0122333332221000',
  '0012233322210000',
  '0111222222111000',
  '1122222222211100',
  '1222222222221100',
  '0122222222211000',
  '0112222222110000',
  '0011222221100000',
  '0001122110000000',
  '0000110110000000',
  '0000001010000000',
  '0000010000000000',
])

// ── Hookline · 16x12 ────────────────────────────────────────────────────────
// The flat top is the first four rows and is drawn as a plain bar, because
// those four pixels are the ride band the collision sweep hands out as a
// platform. Everything under it is barbs, and everything under it kills.

export const hookline = sprite('hookline', IRON, [
  '3333333333333333',
  '3222222222222223',
  '2222222222222222',
  '1111111111111111',
  '0112000000002110',
  '0112000000002110',
  '0121000000001210',
  '0121000000001210',
  '0011000000001100',
  '0011100000011100',
  '0001110000111000',
  '0000111111110000',
])

/** The chain it hangs on, tiled upward from the hook. */
export const hookChain = sprite('hookChain', IRON, [
  '0000011000000000',
  '0000121000000000',
  '0000121000000000',
  '0000011000000000',
])

export const WRECK_ENEMY_FRAMES: readonly SpriteDef[] = [ghostDiver0, ghostDiver1, hookline, hookChain]
