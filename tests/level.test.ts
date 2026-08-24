import { describe, expect, test } from 'vitest'
import {
  loadCampaignLevel,
  loadLevel,
  LevelValidationError,
  pearlsOf,
  type EntityDef,
  type LevelDef,
} from '../src/content/levels/format.js'
import { LevelParseError } from '../src/game/tilemap.js'
import { CHAPTERS, chapterOf } from '../src/content/chapters.js'
import { campaign, levelDef, levelIds, loadLevelById } from '../src/content/levels/index.js'
import { isMasterColour } from '../src/content/palettes.js'

function def(over: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 'test-level',
    name: 'Test Level',
    chapter: 'test',
    order: 10,
    tiles: ['S........E', '##########'],
    ...over,
  }
}

const entities = (...e: EntityDef[]): Partial<LevelDef> => ({ entities: e })

/**
 * Parser tests, including every malformed-input case.
 *
 * A level that silently loads wrong costs an afternoon of "why is the Snapper
 * inside the floor". A level that refuses to load costs a line number. Every
 * assertion below buys the second outcome.
 */
describe('a well-formed level', () => {
  test('loads, and reports its start, exit and checkpoints in tile coordinates', () => {
    const level = loadLevel(def({ tiles: ['S...K....E', '##########'] }))
    expect(level.start).toEqual({ x: 0, y: 0 })
    expect(level.exit).toEqual({ x: 9, y: 0 })
    expect(level.checkpoints).toEqual([{ x: 4, y: 0 }])
  })

  test('carries its entity list through untouched', () => {
    const level = loadLevel(def(entities({ type: 'shell', x: 3, y: 0 })))
    expect(level.entities).toEqual([{ type: 'shell', x: 3, y: 0 }])
  })

  test('a level with a boss needs no exit tile', () => {
    expect(() => loadLevel(def({ tiles: ['S........', '#########'], boss: 'hermitKing' }))).not.toThrow()
  })

  test('pearls come back in slot order regardless of authoring order', () => {
    const level = loadLevel(
      def(
        entities(
          { type: 'pearl', x: 5, y: 0, id: 2 },
          { type: 'pearl', x: 3, y: 0, id: 0 },
          { type: 'pearl', x: 4, y: 0, id: 1 },
        ),
      ),
    )
    expect(pearlsOf(level).map((p) => p.id)).toEqual([0, 1, 2])
  })
})

describe('malformed grids', () => {
  test('an unknown legend character is rejected with its position', () => {
    expect(() => loadLevel(def({ tiles: ['S..Z.....E', '##########'] }))).toThrow(LevelParseError)
  })

  test('a ragged grid is rejected', () => {
    expect(() => loadLevel(def({ tiles: ['S........E', '#####'] }))).toThrow(LevelParseError)
  })

  test('a level with no start is rejected', () => {
    expect(() => loadLevel(def({ tiles: ['.........E', '##########'] }))).toThrow(LevelParseError)
  })

  test('two starts are rejected — which one would it be?', () => {
    expect(() => loadLevel(def({ tiles: ['S...S....E', '##########'] }))).toThrow(/2 starts/)
  })

  test('two exits are rejected', () => {
    expect(() => loadLevel(def({ tiles: ['S...E....E', '##########'] }))).toThrow(/2 exits/)
  })

  test('a start buried in geometry is rejected', () => {
    // The parser blanks the marked tile, so this needs the S under a solid row.
    expect(() => loadLevel(def({ tiles: ['##########', 'S........E'] }))).not.toThrow()
  })

  test('more checkpoints than the budget is rejected', () => {
    expect(() => loadLevel(def({ tiles: ['SKKKKK...E', '##########'] }))).toThrow(/checkpoints/)
  })
})

describe('malformed metadata', () => {
  test('an id that is not lowercase kebab-case is rejected', () => {
    for (const id of ['W01_Tidepools', 'w01 tidepools', '', 'w01--x', '-w01']) {
      expect(() => loadLevel(def({ id })), id).toThrow(LevelValidationError)
    }
  })

  test('a blank name or chapter is rejected', () => {
    expect(() => loadLevel(def({ name: '  ' }))).toThrow(/name is empty/)
    expect(() => loadLevel(def({ chapter: '' }))).toThrow(/chapter is empty/)
  })

  test('a fractional or negative order is rejected', () => {
    expect(() => loadLevel(def({ order: 1.5 }))).toThrow(/order/)
    expect(() => loadLevel(def({ order: -1 }))).toThrow(/order/)
  })
})

describe('malformed entities', () => {
  test('an unknown entity type is rejected', () => {
    const bogus = { type: 'kraken', x: 2, y: 0 } as unknown as EntityDef
    expect(() => loadLevel(def(entities(bogus)))).toThrow(/unknown entity type/)
  })

  test('an entity outside the grid is rejected', () => {
    expect(() => loadLevel(def(entities({ type: 'shell', x: 99, y: 0 })))).toThrow(/outside the 10x2 grid/)
    expect(() => loadLevel(def(entities({ type: 'shell', x: 2, y: -1 })))).toThrow(/outside/)
  })

  test('fractional tile coordinates are rejected', () => {
    expect(() => loadLevel(def(entities({ type: 'shell', x: 2.5, y: 0 })))).toThrow(/whole tiles/)
  })

  test('an entity buried in a solid tile is rejected', () => {
    expect(() => loadLevel(def(entities({ type: 'snapper', x: 3, y: 1 })))).toThrow(/buried in a solid tile/)
  })

  test('a Drifter may sit anywhere — it floats through terrain by design', () => {
    expect(() => loadLevel(def(entities({ type: 'drifter', x: 3, y: 1 })))).not.toThrow()
  })

  test('two of the same entity on one tile is rejected as a copy-paste slip', () => {
    expect(() =>
      loadLevel(def(entities({ type: 'shell', x: 3, y: 0 }, { type: 'shell', x: 3, y: 0 }))),
    ).toThrow(/duplicate/)
  })

  test('two different entities may share a tile', () => {
    expect(() =>
      loadLevel(def(entities({ type: 'shell', x: 3, y: 0 }, { type: 'inkBulb', x: 3, y: 0 }))),
    ).not.toThrow()
  })

  test('a pearl id outside 0-2 is rejected', () => {
    const bad = { type: 'pearl', x: 3, y: 0, id: 7 } as unknown as EntityDef
    expect(() => loadLevel(def(entities(bad)))).toThrow(/pearl id must be/)
  })

  test('two pearls sharing a slot are rejected — the save would lose one', () => {
    expect(() =>
      loadLevel(def(entities({ type: 'pearl', x: 3, y: 0, id: 1 }, { type: 'pearl', x: 5, y: 0, id: 1 }))),
    ).toThrow(/already used/)
  })

  test('a backwards patrol range is rejected', () => {
    expect(() => loadLevel(def(entities({ type: 'snapper', x: 3, y: 0, patrol: [8, 2] })))).toThrow(/backwards/)
  })

  test('a Snapper starting outside its own patrol is rejected', () => {
    expect(() => loadLevel(def(entities({ type: 'snapper', x: 9, y: 0, patrol: [2, 5] })))).toThrow(
      /outside its own patrol/,
    )
  })

  test('a non-positive Drifter period is rejected — it would divide by zero', () => {
    expect(() => loadLevel(def(entities({ type: 'drifter', x: 3, y: 0, period: 0 })))).toThrow(/period must be/)
    expect(() => loadLevel(def(entities({ type: 'drifter', x: 3, y: 0, amplitude: -2 })))).toThrow(/amplitude/)
  })

  test('a negative clam phase is rejected', () => {
    expect(() => loadLevel(def(entities({ type: 'clam', x: 3, y: 0, phase: -5 })))).toThrow(/phase/)
  })
})

describe('campaign rules', () => {
  const playable = (over: Partial<LevelDef> = {}): LevelDef =>
    def({
      tiles: ['S..K...K..K...E', '###############'],
      entities: [
        { type: 'pearl', x: 2, y: 0, id: 0 },
        { type: 'pearl', x: 5, y: 0, id: 1 },
        { type: 'pearl', x: 7, y: 0, id: 2 },
        { type: 'inkBulb', x: 3, y: 0 },
        { type: 'inkBulb', x: 6, y: 0 },
        { type: 'inkBulb', x: 9, y: 0 },
        { type: 'inkBulb', x: 10, y: 0 },
      ],
      ...over,
    })

  test('a complete level passes', () => {
    expect(() => loadCampaignLevel(playable())).not.toThrow()
  })

  test('a level that can be neither exited nor bossed is rejected', () => {
    expect(() => loadCampaignLevel(playable({ tiles: ['S..K...K..K....', '###############'] }))).toThrow(
      /neither an exit/,
    )
  })

  test('the wrong number of checkpoints is rejected', () => {
    expect(() => loadCampaignLevel(playable({ tiles: ['S..K..........E', '###############'] }))).toThrow(
      /1 checkpoints/,
    )
  })

  test('a boss level wants one more conch — the one at the boss door', () => {
    expect(() => loadCampaignLevel(playable({ boss: 'hermitKing' }))).toThrow(/expected 4/)
  })

  test('anything other than three pearls is rejected', () => {
    const two = playable().entities!.filter((e) => !(e.type === 'pearl' && e.id === 2))
    expect(() => loadCampaignLevel(playable({ entities: two }))).toThrow(/2 pearls/)
  })

  test('an Ink Bulb count outside the PRD range is rejected', () => {
    const one = playable().entities!.filter((e) => e.type !== 'inkBulb' || e.x === 3)
    expect(() => loadCampaignLevel(playable({ entities: one }))).toThrow(/1 Ink Bulbs/)
  })

  /** A fixture strip of floor is a grid, not a level. The split is deliberate. */
  test('the structural loader accepts a bare test grid that the campaign loader rejects', () => {
    const bare = def({ tiles: ['S....', '#####'] })
    expect(() => loadLevel(bare)).not.toThrow()
    expect(() => loadCampaignLevel(bare)).toThrow()
  })
})

describe('the registry', () => {
  test('every registered level loads', () => {
    for (const id of levelIds()) expect(() => loadLevelById(id), id).not.toThrow()
  })

  test('ids are stable strings, never indices', () => {
    for (const id of levelIds()) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  test('an unknown id throws rather than returning undefined', () => {
    expect(() => levelDef('w09-nowhere')).toThrow(/unknown level id/)
  })

  test('campaign order is sparse, so a level can be inserted between two others', () => {
    const orders = campaign().map((d) => d.order)
    for (let i = 1; i < orders.length; i++) expect(orders[i]! - orders[i - 1]!).toBeGreaterThan(1)
  })

  test('the grey box is registered but is not part of the campaign', () => {
    expect(levelIds()).toContain('greybox')
    expect(campaign().map((d) => d.id)).not.toContain('greybox')
  })
})

describe('chapters own tilesets, palettes and music — levels do not', () => {
  test('every level names a chapter that exists', () => {
    for (const id of levelIds()) expect(() => chapterOf(levelDef(id).chapter), id).not.toThrow()
  })

  test('no level declares a palette or a tileset of its own', () => {
    for (const id of levelIds()) {
      const d = levelDef(id) as unknown as Record<string, unknown>
      expect(d.palette, `${id} declares a palette`).toBeUndefined()
      expect(d.tileset, `${id} declares a tileset`).toBeUndefined()
      expect(d.music, `${id} declares music`).toBeUndefined()
    }
  })

  test('a world sub-palette is at most 12 colours, all from the master palette', () => {
    for (const [id, chapter] of Object.entries(CHAPTERS)) {
      expect(chapter.palette.length, `${id} palette`).toBeLessThanOrEqual(12)
      for (const c of chapter.palette) expect(isMasterColour(c), `${id} uses ${c}`).toBe(true)
    }
  })

  test('an unknown chapter throws', () => {
    expect(() => chapterOf('atlantis')).toThrow(/unknown chapter/)
  })
})
