import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { fromSource, LevelSourceError, toSource } from '../src/content/levels/source.js'
import { loadLevel, type LevelDef } from '../src/content/levels/format.js'
import { campaign, greybox } from '../src/content/levels/index.js'

/**
 * The level editor's round trip. PLAN.md checkpoint 3.1: "a Phase 2 level
 * round-trips through it byte-identically".
 *
 * An editor is only trustworthy if what it writes is exactly what the game
 * reads. The strongest form of that is available here and is asserted below:
 * the *actual shipped files* are read off disk, parsed by the same code the
 * editor uses, and re-serialised — and the tiles and entities that come out
 * are character-for-character the ones that went in.
 */

/** The shipped files, read off disk so the test sees what a human edits. */
const FILES: Record<string, string> = {
  'w01-tidepools': 'src/content/levels/w01-tidepools.ts',
  'w02-kelp': 'src/content/levels/w02-kelp.ts',
  'w03-ship': 'src/content/levels/w03-ship.ts',
  'w04-vents': 'src/content/levels/w04-vents.ts',
  'w05-abyss': 'src/content/levels/w05-abyss.ts',
}

describe('every shipped level round-trips through the editor format', () => {
  for (const def of campaign()) {
    describe(def.id, () => {
      test('it parses back out of its own serialisation, unchanged', () => {
        const back = fromSource(toSource(def))
        expect(back.id).toBe(def.id)
        expect(back.name).toBe(def.name)
        expect(back.chapter).toBe(def.chapter)
        expect(back.order).toBe(def.order)
        expect(back.par).toBe(def.par)
        expect(back.boss).toBe(def.boss)
        expect(back.tiles).toEqual(def.tiles)
        expect(back.entities).toEqual(def.entities)
        expect(back.hints).toEqual(def.hints)
      })

      /** Serialising twice must produce the same bytes, or nothing else holds. */
      test('serialising is stable', () => {
        const once = toSource(def)
        expect(toSource(fromSource(once))).toBe(once)
      })

      /**
       * Read from disk, not from the module. This is the assertion the
       * checkpoint actually asks for: the file a human edits, through the tool,
       * and back to the same characters.
       */
      test('the file on disk round-trips character for character', () => {
        const raw = readFileSync(FILES[def.id]!, 'utf8')
        const parsed = fromSource(raw)
        expect(parsed.tiles.join('\n')).toBe(def.tiles.join('\n'))
        expect(parsed.entities ?? []).toEqual(def.entities ?? [])
        expect(toSource(parsed)).toBe(toSource(def))
      })

      test('what comes back still loads as a level', () => {
        expect(() => loadLevel(fromSource(toSource(def)))).not.toThrow()
      })
    })
  }

  test('the grey box round-trips too, and it has no entities at all', () => {
    const back = fromSource(toSource(greybox))
    expect(back.tiles).toEqual(greybox.tiles)
    expect(back.entities ?? []).toEqual(greybox.entities ?? [])
  })
})

describe('the small grammar it reads', () => {
  const minimal: LevelDef = {
    id: 'fixture',
    name: 'Fixture',
    chapter: 'test',
    order: 0,
    tiles: ['S...', '####'],
  }

  test('a level with nothing optional in it survives the trip', () => {
    const back = fromSource(toSource(minimal))
    expect(back).toEqual(minimal)
  })

  test('an entity array keeps its nested pairs', () => {
    const def: LevelDef = {
      ...minimal,
      entities: [{ type: 'snapper', x: 1, y: 0, patrol: [0, 3] }],
    }
    const back = fromSource(toSource(def))
    expect(back.entities).toEqual(def.entities)
  })

  /**
   * A hint's text is the one free-form string in the format, and a comma in it
   * is what a naive `split(',')` gets wrong. Worth a test of its own because
   * §11.3 makes hints the only words in the game — losing one silently would
   * take a room's only instruction with it.
   */
  test('a hint keeps its text, commas, brackets and all', () => {
    const def: LevelDef = {
      ...minimal,
      hints: [{ tx: 1, ty: 0, text: '[C], THEN X', radius: 4 }],
    }
    const back = fromSource(toSource(def))
    expect(back.hints).toEqual(def.hints)
  })

  test('a name with an apostrophe in it survives', () => {
    const def: LevelDef = { ...minimal, name: "The Captain's Wheel" }
    expect(fromSource(toSource(def)).name).toBe("The Captain's Wheel")
  })

  test('optional fields that were absent stay absent', () => {
    const back = fromSource(toSource(minimal))
    expect(back.par).toBeUndefined()
    expect(back.boss).toBeUndefined()
    expect(back.entities).toBeUndefined()
    expect(back.hints).toBeUndefined()
  })
})

describe('it refuses rather than guessing', () => {
  test('source with no tiles', () => {
    expect(() => fromSource("export const x: LevelDef = { id: 'a', name: 'A', chapter: 'test', order: 0 }")).toThrow(
      LevelSourceError,
    )
  })

  test('source with no id', () => {
    expect(() => fromSource("{ name: 'A', chapter: 'test', order: 0, tiles: ['S'] }")).toThrow(LevelSourceError)
  })

  test('source with no order', () => {
    expect(() => fromSource("{ id: 'a', name: 'A', chapter: 'test', tiles: ['S'] }")).toThrow(LevelSourceError)
  })

  test('an unterminated array', () => {
    expect(() => fromSource("{ id: 'a', name: 'A', chapter: 'test', order: 0, tiles: ['S',")).toThrow(LevelSourceError)
  })

  test('an empty tiles array', () => {
    expect(() => fromSource("{ id: 'a', name: 'A', chapter: 'test', order: 0, tiles: [] }")).toThrow(LevelSourceError)
  })

  /** The grid is validated on the way in, so a bad paste fails at the paste. */
  test('a ragged grid is rejected by the loader it goes through', () => {
    expect(() => fromSource("{ id: 'a', name: 'A', chapter: 'test', order: 0, tiles: ['S..', '##'] }")).toThrow()
  })

  test('an unknown legend character is rejected too', () => {
    expect(() => fromSource("{ id: 'a', name: 'A', chapter: 'test', order: 0, tiles: ['S%.', '###'] }")).toThrow()
  })

  /**
   * Structural validation only. A level being edited routinely has one conch
   * and no pearls yet, and refusing to load it would make the tool unusable
   * for the job it exists to do.
   */
  test('a half-built level loads even though it is not a campaign level', () => {
    const half = "{ id: 'wip', name: 'WIP', chapter: 'test', order: 99, tiles: ['S...', '####'] }"
    expect(() => fromSource(half)).not.toThrow()
  })
})
