/**
 * The four things in flight.
 *
 * Small, and each one legible as *whose* it is before it is legible as what it
 * is. Nib's bolt and bomb are ink — the same cyan as the meter he paid for them
 * out of — and the barb and the ember are the colours of the world that fired
 * them. A player under pressure reads "mine / not mine" first and everything
 * else second.
 *
 * Ink is shared rather than per-chapter (PRD §9.1's shared row) because the
 * bolt follows Nib into every world and must not be re-tinted per chapter, or
 * the one cue that says "this is yours" stops being a cue.
 */

import { sprite, type SpriteDef } from './format.js'
import { KELP, SHARED, VENTS } from '../palettes.js'

const INK = [SHARED.INK_DARK, SHARED.INK_CYAN, SHARED.NIB_PALE]

/** A bolt of ink, drawn as a comma so its direction of travel is visible. */
export const inkBolt = sprite('inkBolt', INK, [
  '001100',
  '012210',
  '123321',
  '122210',
  '011100',
  '001000',
])

/** The bomb: a dense knot with a lit fuse. Reads apart from the bolt at speed. */
export const inkBomb = sprite('inkBomb', INK, [
  '00003300',
  '00033000',
  '01111000',
  '12222110',
  '12222210',
  '12222210',
  '01222100',
  '00111000',
])

export const barb = sprite('barb', [KELP.SILHOUETTE, KELP.BARNACLE, KELP.GOD_RAY], [
  '001111',
  '132222',
  '132222',
  '001111',
])

/** An ember. Bright while it falls, and it keeps burning where it lands. */
export const ember = sprite('ember', [VENTS.ROCK_RED, VENTS.MAGMA, VENTS.SULPHUR], [
  '01111100',
  '12233210',
  '12333221',
  '01222110',
  '00111000',
  '00010000',
])

export const PROJECTILE_FRAMES: readonly SpriteDef[] = [inkBolt, inkBomb, barb, ember]

export const PROJECTILE_SPRITES: Record<string, SpriteDef> = {
  bolt: inkBolt,
  bomb: inkBomb,
  barb,
  ember,
}
