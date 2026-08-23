import { describe, expect, test } from 'vitest'
import { LevelParseError, parseTiles, Tile, tileAt } from '../src/game/tilemap.js'
import { greybox } from '../src/content/levels/greybox.js'
import { createWorld } from '../src/game/world.js'

/**
 * A level that silently loads wrong is far more expensive than one that refuses
 * to load, so the parser throws loudly and every malformed case is covered.
 */
describe('level parsing', () => {
  test('every legend character maps to a tile', () => {
    const map = parseTiles(['S#-~^c><ud=.'])
    const expected = [
      Tile.EMPTY, // S becomes an entity mark
      Tile.SOLID,
      Tile.ONEWAY,
      Tile.WATER,
      Tile.HAZARD,
      Tile.CRUMBLE,
      Tile.CURRENT_R,
      Tile.CURRENT_L,
      Tile.CURRENT_U,
      Tile.CURRENT_D,
      Tile.SLICK,
      Tile.EMPTY,
    ]
    expected.forEach((t, i) => expect(tileAt(map, i, 0), `column ${i}`).toBe(t))
  })

  test('the grid carries only geometry markers, and they leave the tile empty', () => {
    const map = parseTiles(['S.E.K.'])
    expect(map.entities.map((e) => e.kind)).toEqual(['start', 'exit', 'checkpoint'])
    expect(map.entities[1]).toMatchObject({ kind: 'exit', tx: 2, ty: 0 })
    for (let x = 0; x < 6; x++) expect(tileAt(map, x, 0)).toBe(Tile.EMPTY)
  })

  test('a pickup glyph is no longer a legend character — pickups are entities', () => {
    expect(() => parseTiles(['S.b.'])).toThrow(LevelParseError)
    expect(() => parseTiles(['S.o.'])).toThrow(LevelParseError)
  })

  test('rejects an unknown legend character, naming the position', () => {
    expect(() => parseTiles(['S...', '..Z.'])).toThrow(LevelParseError)
    try {
      parseTiles(['S...', '..Z.'])
    } catch (e) {
      expect((e as LevelParseError).message).toContain('row 1')
      expect((e as LevelParseError).message).toContain('col 2')
      expect((e as LevelParseError).message).toContain('"Z"')
    }
  })

  test('rejects ragged rows', () => {
    expect(() => parseTiles(['S....', '...'])).toThrow(/ragged/)
  })

  test('rejects an empty level', () => {
    expect(() => parseTiles([])).toThrow(/no rows/)
    expect(() => parseTiles([''])).toThrow(/empty/)
  })

  test('rejects a level with no start', () => {
    expect(() => parseTiles(['....', '####'])).toThrow(/no start/)
  })

  test('out of bounds reads are solid at the sides and empty above and below', () => {
    const map = parseTiles(['S..', '###'])
    expect(tileAt(map, -1, 0)).toBe(Tile.SOLID)
    expect(tileAt(map, 99, 0)).toBe(Tile.SOLID)
    expect(tileAt(map, 1, -1)).toBe(Tile.EMPTY)
    expect(tileAt(map, 1, 99)).toBe(Tile.EMPTY)
  })
})

describe('the grey box', () => {
  test('parses', () => {
    expect(() => createWorld(greybox)).not.toThrow()
  })

  test('is rectangular', () => {
    const widths = new Set(greybox.tiles.map((r: string) => r.length))
    expect(widths.size).toBe(1)
  })

  test('exercises every mechanic the engine has', () => {
    const map = parseTiles(greybox.tiles)
    const present = new Set(map.tiles)
    for (const t of [Tile.SOLID, Tile.ONEWAY, Tile.WATER, Tile.HAZARD, Tile.CRUMBLE, Tile.SLICK]) {
      expect(present.has(t), `tile ${t} missing from the grey box`).toBe(true)
    }
    expect(present.has(Tile.CURRENT_L) || present.has(Tile.CURRENT_R)).toBe(true)
    expect(present.has(Tile.CURRENT_U) || present.has(Tile.CURRENT_D)).toBe(true)
  })

  test('has a start, an exit, checkpoints and both pickups', () => {
    const w = createWorld(greybox)
    const kinds = w.map.entities.map((e) => e.kind)
    expect(kinds).toContain('start')
    expect(kinds).toContain('exit')
    expect(kinds.filter((k) => k === 'checkpoint').length).toBeGreaterThanOrEqual(2)
    expect(w.pickups.some((p) => p.kind === 'inkBulb')).toBe(true)
    expect(w.pickups.some((p) => p.kind === 'inkCore')).toBe(true)
  })

  test('spawns the player on solid footing, not inside geometry or in the void', () => {
    const w = createWorld(greybox)
    expect(w.player.alive).toBe(true)
    expect(w.spawn.y).toBeLessThan(greybox.tiles.length * 16)
  })
})
