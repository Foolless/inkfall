/**
 * Chapters own tilesets, palettes and music. Levels do not.
 *
 * PRD §12.7: v1's five levels are five chapters of one level each, and the
 * 50-level shape is ~8-10 chapters of 5-6 levels sharing a tileset. Enforcing
 * the ownership now costs nothing; retrofitting it at fifty levels means fifty
 * tilesets and an unbuildable art budget.
 *
 * A `LevelDef` has a `chapter` string and no way to declare a palette of its
 * own. That absence is the constraint — see tests/level.test.ts.
 */

import { ABYSS, KELP, SHALLOWS, SHARED, VENTS, WRECK } from './palettes.js'

export interface Chapter {
  /** Stable forever, like a level id. */
  id: string
  name: string
  /** The world's sub-palette, drawn from the master palette. PRD §9.1. */
  palette: readonly string[]
  /**
   * Tileset id. Undefined means the grey box, which is what the proving ground
   * and the test fixtures want — Phase 1's drabness is a feature there.
   */
  tileset?: string
  /** Track id for the tracker. One theme per chapter, not per level. */
  music: string
  /**
   * Light radius in tiles, or undefined for a lit world.
   *
   * A chapter property rather than a level one, like the tileset and the
   * music, because darkness *is* the look of a world (PRD §12.7). The Abyss is
   * the only chapter that has it, and the value is §7.6's five tiles.
   */
  dark?: number
}

export const CHAPTERS: Record<string, Chapter> = {
  shallows: {
    id: 'shallows',
    name: 'The Tide Pools',
    palette: Object.values(SHALLOWS),
    tileset: 'shallows',
    music: 'world1',
  },
  kelp: {
    id: 'kelp',
    name: 'The Kelp Forest',
    palette: Object.values(KELP),
    music: 'world2',
  },
  wreck: {
    id: 'wreck',
    name: 'The Sunken Ship',
    palette: Object.values(WRECK),
    music: 'world3',
  },
  vents: {
    id: 'vents',
    name: 'The Volcanic Vents',
    palette: Object.values(VENTS),
    music: 'world4',
  },
  abyss: {
    id: 'abyss',
    name: 'The Abyss',
    palette: Object.values(ABYSS),
    music: 'world5',
    dark: 5,
  },
  /** Not a world — the Phase 1 proving ground and the test fixtures. */
  test: {
    id: 'test',
    name: 'Grey Box',
    palette: [SHARED.UI_DIM, SHARED.UI_TEXT],
    music: 'none',
  },
}

export function chapterOf(id: string): Chapter {
  const c = CHAPTERS[id]
  if (!c) throw new Error(`unknown chapter ${JSON.stringify(id)}`)
  return c
}
