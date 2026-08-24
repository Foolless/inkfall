/**
 * The Abyss roster. PRD §6.1 #11–12.
 *
 * The Lightless is the one sprite in the game drawn to be *almost invisible*.
 * Its body is `SHAPE`, which is barely a shade off the void it swims in, and
 * the only bright pixels on it are the lure. That is not a stylistic choice —
 * the lure being the only visible part, the only hittable part and the only
 * trigger is the entire enemy, and the art has to say all three at once.
 *
 * Bone Shrimp are small and pale so a swarm of six reads as a swarm rather than
 * as a wall, and vents are drawn as holes with something moving in them.
 */

import { sprite, type SpriteDef } from './format.js'
import { ABYSS } from '../palettes.js'

const SHRIMP = [ABYSS.SHAPE, ABYSS.BONE_PALE, ABYSS.BIO_CYAN]
const ANGLER = [ABYSS.SHAPE, ABYSS.BIO_DIM, ABYSS.BIO_CYAN]
const VENT = [ABYSS.SHAPE, ABYSS.BIO_DIM, ABYSS.BIO_MAGENTA]

// ── Bone Shrimp · 12x12 ─────────────────────────────────────────────────────

export const boneShrimp0 = sprite('boneShrimp0', SHRIMP, [
  '000000000000',
  '000000000000',
  '000000000000',
  '000011110000',
  '000122221000',
  '001233222100',
  '012222222110',
  '112222222211',
  '011111111110',
  '001010010100',
  '010001001000',
  '000000000000',
])

export const boneShrimp1 = sprite('boneShrimp1', SHRIMP, [
  '000000000000',
  '000000000000',
  '000000000000',
  '000011110000',
  '000122221000',
  '001233222100',
  '012222222110',
  '112222222211',
  '011111111110',
  '010100101000',
  '001000010010',
  '000000000000',
])

// ── Lightless · 24x16 ───────────────────────────────────────────────────────
// Facing right: the lure is on a stalk out in front, and the body behind it is
// two shades of almost-nothing. The jaw only becomes visible on the charge.

export const lightlessLurking = sprite('lightlessLurking', ANGLER, [
  '000000000000000000033000',
  '000000000000000000330000',
  '000000000000000003300000',
  '000000000000000033000000',
  '000000111111111110000000',
  '000011111111111111000000',
  '000111111111111111100000',
  '001111111111111111110000',
  '011111111111111111111000',
  '011111111111111111111000',
  '001111111111111111110000',
  '000111111111111111100000',
  '000011111111111111000000',
  '000000111111111110000000',
  '000000000000000000000000',
  '000000000000000000000000',
])

export const lightlessCharging = sprite('lightlessCharging', ANGLER, [
  '000000000000000000033000',
  '000000000000000000330000',
  '000000000000000003300000',
  '000000000000000033000000',
  '000000222222222222000000',
  '000022222222222222330000',
  '000222222222222223333000',
  '002222222222222233333300',
  '022222222222222333333330',
  '022222222222222333333330',
  '002222222222222233333300',
  '000222222222222223333000',
  '000022222222222222330000',
  '000000222222222222000000',
  '000000000000000000000000',
  '000000000000000000000000',
])

// ── Shrimp vent · 16x16 ─────────────────────────────────────────────────────

export const shrimpVentOpen = sprite('shrimpVentOpen', VENT, [
  '0011111111111100',
  '0122222222222210',
  '1223333333332221',
  '1233000000033221',
  '1230000000003321',
  '1230000000000321',
  '1230000000000321',
  '1230000000000321',
  '1230000000000321',
  '1230000000000321',
  '1233000000003321',
  '1223333333333221',
  '1222222222222221',
  '0122222222222210',
  '0011111111111100',
  '0000000000000000',
])

/** Inked shut: the mouth is plugged and the glow has gone out. */
export const shrimpVentSealed = sprite('shrimpVentSealed', VENT, [
  '0011111111111100',
  '0122222222222210',
  '1222222222222221',
  '1222111111122221',
  '1221111111111221',
  '1221111111111221',
  '1221111111111221',
  '1221111111111221',
  '1221111111111221',
  '1221111111111221',
  '1222111111112221',
  '1222222222222221',
  '1222222222222221',
  '0122222222222210',
  '0011111111111100',
  '0000000000000000',
])

export const ABYSS_ENEMY_FRAMES: readonly SpriteDef[] = [
  boneShrimp0,
  boneShrimp1,
  lightlessLurking,
  lightlessCharging,
  shrimpVentOpen,
  shrimpVentSealed,
]
