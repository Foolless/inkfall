/**
 * Tileset registry. Chapters name one; levels never do.
 *
 * A chapter with no tileset falls back to the Phase 1 grey box, which is the
 * right answer for the proving ground and for test fixtures: it is supposed to
 * be ugly, and its drabness is what made Gate 1 an honest question.
 *
 * Five worlds, five tilesets — and at fifty levels this is still five to ten
 * entries rather than fifty, which is the whole reason chapters own art (PRD
 * §12.7).
 */

import type { Tileset } from './shallows.js'
import { shallows } from './shallows.js'
import { kelp } from './kelp.js'
import { wreck } from './wreck.js'
import { vents } from './vents.js'
import { abyss } from './abyss.js'

export const TILESETS: Record<string, Tileset> = { shallows, kelp, wreck, vents, abyss }

export function tilesetOf(id: string | undefined): Tileset | null {
  return id === undefined ? null : (TILESETS[id] ?? null)
}

export type { Tileset }
export { shallows, kelp, wreck, vents, abyss }
