/**
 * The Volcanic Vents roster. PRD §6.1 #9–10.
 *
 * The Snail is drawn asymmetrically on purpose. Its armoured face and shell are
 * hard black basalt; its rear is soft and glowing, and it is the only part of
 * the sprite that is bright. A player who has never read §8.5 can still see
 * which end to shoot, which is the difference between a positioning puzzle and
 * a guessing game.
 *
 * The Moth is wide and pale so it reads against black rock, and its embers are
 * drawn in the same orange as its underside — the thing it drops looks like a
 * piece of the thing that dropped it.
 */

import { sprite, type SpriteDef } from './format.js'
import { VENTS } from '../palettes.js'

const SNAIL = [VENTS.BASALT, VENTS.ROCK_RED, VENTS.MAGMA]
const MOTH = [VENTS.ASH, VENTS.EMBER, VENTS.SULPHUR]

// ── Magma Snail · 24x16 ─────────────────────────────────────────────────────
// Facing right: the armoured head is at the right, the exposed rear at the
// left, glowing. Wide enough to genuinely block a two-tile corridor.

export const magmaSnail0 = sprite('magmaSnail0', SNAIL, [
  '000000000000000000000000',
  '000000000011111000000000',
  '000000001112211100000000',
  '000000011122221110000000',
  '000000111222222111000000',
  '000001112222221111100000',
  '033001112222211111110000',
  '333011112222111111111000',
  '333111112211111111111100',
  '333111111111111111111110',
  '033311111111111111111111',
  '003331111111111111111111',
  '000333111111111111111110',
  '000033311111111111111100',
  '000003331111111111111000',
  '000000333111111111100000',
])

export const magmaSnail1 = sprite('magmaSnail1', SNAIL, [
  '000000000000000000000000',
  '000000000111111000000000',
  '000000001112221100000000',
  '000000011122222110000000',
  '000000111222222211000000',
  '000001112222222111100000',
  '033001112222221111110000',
  '333011112222211111111000',
  '333111112221111111111100',
  '333111111111111111111110',
  '033311111111111111111111',
  '003331111111111111111111',
  '000333111111111111111110',
  '000033111111111111111100',
  '000003311111111111111000',
  '000000331111111111110000',
])

// ── Cinder Moth · 16x16 ─────────────────────────────────────────────────────

export const cinderMoth0 = sprite('cinderMoth0', MOTH, [
  '0000000000000000',
  '0110000000000110',
  '1221000000001221',
  '1222100000012221',
  '0122210001222210',
  '0012221012222100',
  '0001222122221000',
  '0000122333221000',
  '0000012333210000',
  '0000012322210000',
  '0000011222110000',
  '0000011211100000',
  '0000001210000000',
  '0000001100000000',
  '0000000000000000',
  '0000000000000000',
])

export const cinderMoth1 = sprite('cinderMoth1', MOTH, [
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0011000000001100',
  '0122100000012210',
  '0122210001222100',
  '0012221012222100',
  '0001222122221000',
  '0000122333221000',
  '0000012333210000',
  '0000012322210000',
  '0000011222110000',
  '0000011211100000',
  '0000001210000000',
  '0000001100000000',
  '0000000000000000',
])

export const VENTS_ENEMY_FRAMES: readonly SpriteDef[] = [magmaSnail0, magmaSnail1, cinderMoth0, cinderMoth1]
