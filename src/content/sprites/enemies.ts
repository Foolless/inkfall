/**
 * The World 1 roster, hand-authored. PRD §6.1.
 *
 * Same rules as Nib: one hex digit per pixel, three colours plus transparent,
 * every frame facing right. Each species draws from the Tide Pools sub-palette,
 * which is what keeps a crab and a jellyfish looking like they live in the same
 * ocean.
 *
 * Silhouette is doing the work here, not colour. PRD §13 requires every hazard
 * to be legible in greyscale: the crab is wide and low, the jellyfish is a bell
 * with trailing threads, the inflated Puffer is a ball of spikes. You can tell
 * them apart with the colour turned off, which is the test that matters.
 */

import { sprite, type SpriteDef } from './format.js'
import { SHALLOWS } from '../palettes.js'

// ── Snapper · 16x16 ─────────────────────────────────────────────────────────
// Wide shell, claws out to the sides, eyes on stalks. Drawn low in the cell so
// it sits on the floor rather than hovering over it.

const CRAB = [SHALLOWS.CORAL_DARK, SHALLOWS.CORAL, SHALLOWS.SAND]

export const snapper0 = sprite('snapper0', CRAB, [
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0001000000001000',
  '0003000000003000',
  '0000111111110000',
  '0001222222221000',
  '0012233223322100',
  '0122222222222210',
  '1222222222222221',
  '1122222222222211',
  '0112222222222110',
  '0011111111111100',
  '0110010000100110',
  '0100010000100010',
])

export const snapper1 = sprite('snapper1', CRAB, [
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0001000000001000',
  '0003000000003000',
  '0000111111110000',
  '0001222222221000',
  '0012233223322100',
  '0122222222222210',
  '1222222222222221',
  '1122222222222211',
  '0112222222222110',
  '0011111111111100',
  '0011001001001100',
  '0010001001000100',
])

// ── Drifter · 16x16 ─────────────────────────────────────────────────────────
// A bell with threads. Nothing about it suggests a surface to land on, which is
// the whole point: it teaches that not everything is stompable.

const JELLY = [SHALLOWS.SHALLOW_DEEP, SHALLOWS.SHALLOW, SHALLOWS.FOAM]

export const drifter0 = sprite('drifter0', JELLY, [
  '0000000000000000',
  '0000011111100000',
  '0001122222211000',
  '0012222332222100',
  '0122222222222210',
  '1222222222222221',
  '1222222222222221',
  '0122222222222210',
  '0011111111111100',
  '0101010101010100',
  '0010101010101000',
  '0101010101010100',
  '0010101010101000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
])

export const drifter1 = sprite('drifter1', JELLY, [
  '0000000000000000',
  '0000011111100000',
  '0001122222211000',
  '0012222332222100',
  '0122222222222210',
  '1222222222222221',
  '1222222222222221',
  '0122222222222210',
  '0011111111111100',
  '0010101010101000',
  '0101010101010100',
  '0010101010101000',
  '0101010101010100',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
])

// ── Puffer ──────────────────────────────────────────────────────────────────
// Two states that must never be confused at a glance, because confusing them is
// the death. Deflated is a small round fish; inflated is a ball of spikes twice
// the size. No shared silhouette at all — that is deliberate.

const PUFF = [SHALLOWS.CORAL_DARK, SHALLOWS.SAND_SHADE, SHALLOWS.SAND]

export const pufferDeflated = sprite('pufferDeflated', PUFF, [
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000011111100000',
  '0001122222211000',
  '0012231223322100',
  '0122222222222210',
  '0122222222222210',
  '0012222222222100',
  '0001122222211000',
  '0000011111100000',
  '0000000000000000',
])

/** 24x20 — the spike ball is bigger than a 16x16 cell can hold. */
export const pufferInflated = sprite('pufferInflated', PUFF, [
  '000000000000100000000000',
  '000000000000100000000000',
  '000010000000100000010000',
  '000001000000000000100000',
  '000000100111111001000000',
  '000000011322222110000000',
  '000000113332222211000000',
  '000001123322222221100000',
  '000001222222222222100000',
  '000001222222222222100000',
  '011111223312222331111110',
  '000001221122222112100000',
  '000001122222222221100000',
  '000000112222222211000000',
  '000000011222222110000000',
  '000000100111111001000000',
  '000001000000000000100000',
  '000010000000100000010000',
  '000000000000100000000000',
  '000000000000100000000000',
])

export const ENEMY_FRAMES: readonly SpriteDef[] = [
  snapper0,
  snapper1,
  drifter0,
  drifter1,
  pufferDeflated,
  pufferInflated,
]
