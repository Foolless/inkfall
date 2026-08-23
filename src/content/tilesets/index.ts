/**
 * Tileset registry. Chapters name one; levels never do.
 *
 * A chapter with no tileset falls back to the Phase 1 grey box, which is the
 * right answer for the proving ground and for test fixtures: it is supposed to
 * be ugly, and its drabness is what made Gate 1 an honest question.
 */

import type { Tileset } from './shallows.js'
import { shallows } from './shallows.js'

export const TILESETS: Record<string, Tileset> = { shallows }

export function tilesetOf(id: string | undefined): Tileset | null {
  return id === undefined ? null : (TILESETS[id] ?? null)
}

export type { Tileset }
export { shallows }
