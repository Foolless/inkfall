/**
 * The four things worth crossing a room for.
 *
 * Each has to be identifiable at a glance and at speed, so they differ in
 * silhouette before they differ in colour: a shell is a spiral, a pearl is a
 * circle, an Ink Bulb is a teardrop, an Ink Core is a hard-edged knot.
 * Telling a Bulb from a Core is a decision the player makes mid-air.
 */

import { sprite, type SpriteDef } from './format.js'
import { SHALLOWS, SHARED } from '../palettes.js'

/** Shells are the breadcrumb system first and the score second (PRD §8.1). */
export const shell = sprite('shell', [SHALLOWS.CORAL_DARK, SHARED.SHELL, SHALLOWS.FOAM], [
  '00111000',
  '01223100',
  '12231310',
  '12312310',
  '12332210',
  '01222100',
  '00111000',
  '00000000',
])

export const pearl = sprite('pearl', [SHALLOWS.SHALLOW_DEEP, SHARED.PEARL, SHALLOWS.FOAM], [
  '00111100',
  '01233210',
  '12332211',
  '13322111',
  '13221111',
  '12211111',
  '01111110',
  '00111100',
])

/** A bulb of ink: a teardrop, point up, the way ink rises underwater. */
export const inkBulb = sprite('inkBulb', [SHARED.INK_DARK, SHARED.INK_CYAN, SHARED.NIB_PALE], [
  '000001100000',
  '000011110000',
  '000112211000',
  '001123221100',
  '011233222110',
  '112332222211',
  '112322222211',
  '112222222211',
  '011222222110',
  '001122221100',
  '000111111000',
  '000001100000',
])

/**
 * A dense black knot of concentrated ink. Deliberately the darkest thing on
 * screen with the brightest rim — a Core is rare enough that spotting one
 * should feel like spotting something.
 */
export const inkCore = sprite('inkCore', [SHARED.VOID, SHARED.CHARGED_RIM, SHARED.PEARL], [
  '000022220000',
  '002211112200',
  '021111111120',
  '021113311120',
  '211133331112',
  '211133331112',
  '211133331112',
  '211133331112',
  '021113311120',
  '021111111120',
  '002211112200',
  '000022220000',
])

export const PICKUP_FRAMES: readonly SpriteDef[] = [shell, pearl, inkBulb, inkCore]

export const PICKUP_SPRITES: Record<string, SpriteDef> = { shell, pearl, inkBulb, inkCore }
