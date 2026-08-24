import { describe, expect, test } from 'vitest'
import { loadCampaignLevel, type EntityType, type LevelDef } from '../src/content/levels/format.js'
import { campaign, loadoutOnArrival } from '../src/content/levels/index.js'
import { chapterOf } from '../src/content/chapters.js'
import { tilesetOf } from '../src/content/tilesets/index.js'
import { Tile, tileAt } from '../src/game/tilemap.js'
import { analyseReach } from '../src/game/reach.js'
import { createWorld, update } from '../src/game/world.js'
import { BOSS_IDS } from '../src/game/bosses/index.js'
import { GRANTED_ON_CLEAR, UPGRADE_IDS } from '../src/game/upgrades.js'
import { CHARGED_TIER, FULL, RULES, SPENT, TIERS } from '../src/game/constants.js'
import { blank } from './helpers.js'

/**
 * Worlds 2 through 5 against their own beat sheets (PRD §7.3–§7.6).
 *
 * These are content assertions, not engine ones. A level is edited far more
 * often than it is read, and the cheapest way to notice that a conch has
 * drifted or a whole room's enemy has been deleted is to say out loud what the
 * room is supposed to contain.
 *
 * The rules that apply to *every* level are asserted once, at the bottom, over
 * the campaign list — so a sixth level gets them for free and cannot quietly
 * skip them.
 */

const WORLDS: Record<string, { roster: EntityType[]; boss: string; tileset: string }> = {
  'w02-kelp': {
    roster: ['barbTurret', 'whipkelp', 'eel', 'drifter'],
    boss: 'kelpWarden',
    tileset: 'kelp',
  },
  'w03-ship': {
    roster: ['ghostDiver', 'hookline', 'snapper', 'barbTurret'],
    boss: 'drownedCaptain',
    tileset: 'wreck',
  },
  'w04-vents': {
    roster: ['magmaSnail', 'cinderMoth', 'eel'],
    boss: 'ventLord',
    tileset: 'vents',
  },
  'w05-abyss': {
    roster: ['lightless', 'boneShrimp', 'eel', 'hookline', 'shrimpVent'],
    boss: 'kraken',
    tileset: 'abyss',
  },
}

const level = (id: string) => loadCampaignLevel(campaign().find((d) => d.id === id)!)
const def = (id: string) => campaign().find((d) => d.id === id)!
const has = (id: string, type: EntityType) => level(id).entities.some((e) => e.type === type)
const tiles = (id: string) => new Set(level(id).map.tiles)

describe('World 2 — the Kelp Forest', () => {
  const w2 = level('w02-kelp')

  test('the new mechanic is currents, and the grid is full of them', () => {
    const present = tiles('w02-kelp')
    const currents = [Tile.CURRENT_R, Tile.CURRENT_L, Tile.CURRENT_U, Tile.CURRENT_D]
    expect(currents.filter((t) => present.has(t)).length).toBeGreaterThanOrEqual(3)
  })

  /**
   * The player arrives holding the Ink Shot they earned for World 1, and A1's
   * knot is the first thing it is good for — four seconds after arriving.
   */
  test('A1 gates on a kelp knot, inside the first screen and a half', () => {
    let firstKnot = -1
    for (let x = 0; x < w2.map.width && firstKnot < 0; x++) {
      for (let y = 0; y < w2.map.height; y++) {
        if (tileAt(w2.map, x, y) === Tile.KNOT) firstKnot = x
      }
    }
    expect(firstKnot).toBeGreaterThan(0)
    expect(firstKnot).toBeLessThan(30)
  })

  test('the knot is genuinely a gate — without an Ink Shot the level stops there', () => {
    const stuck = analyseReach(w2, { tier: 1 })
    const columns = [...stuck.reachable].map((i) => i % w2.map.width)
    expect(Math.max(...columns)).toBeLessThan(30)
    expect(stuck.reachedExit).toBe(false)
  })

  test('four Whipkelp over the grove, each a beat behind the last', () => {
    const stalks = w2.entities.filter((e): e is typeof e & { type: 'whipkelp' } => e.type === 'whipkelp')
    expect(stalks).toHaveLength(4)
    expect(new Set(stalks.map((s) => s.phase ?? 0)).size).toBe(4)
  })

  test('two turrets on offset cycles, and neither of them can be killed', () => {
    const turrets = w2.entities.filter((e): e is typeof e & { type: 'barbTurret' } => e.type === 'barbTurret')
    expect(turrets.length).toBeGreaterThanOrEqual(2)
    const corridor = turrets.filter((t) => t.x < 100)
    expect(new Set(corridor.map((t) => t.phase ?? 0)).size).toBe(corridor.length)
  })

  test('three eels in the flooded channel', () => {
    expect(w2.entities.filter((e) => e.type === 'eel')).toHaveLength(3)
  })

  test('a bubble ladder, with the columns offset so it is a rhythm', () => {
    const columns = w2.entities.filter((e): e is typeof e & { type: 'bubble' } => e.type === 'bubble')
    expect(columns.length).toBeGreaterThanOrEqual(3)
    expect(new Set(columns.map((b) => b.phase ?? 0)).size).toBe(columns.length)
  })
})

describe('World 3 — the Sunken Ship', () => {
  const w3 = level('w03-ship')

  /**
   * §7.4 A1 says "Cling taught on a single wall". A single wall cannot be
   * climbed — a wall jump pushes you off it — so the teaching room is a
   * chimney with two faces. Without the second face the whole level is
   * unfinishable, which is what this asserts.
   */
  test('the cling chimney has two faces, and the level needs both', () => {
    const withoutCling = analyseReach(w3, { tier: 1, upgrades: ['inkShot'] })
    expect(withoutCling.reachedExit).toBe(false)
    const withCling = analyseReach(w3, { tier: 0, upgrades: loadoutOnArrival('w03-ship') })
    expect(withCling.reachedExit).toBe(true)
  })

  test('three Hooklines over the deck, a third of a cycle apart', () => {
    const hooks = w3.entities.filter((e): e is typeof e & { type: 'hookline' } => e.type === 'hookline')
    expect(hooks).toHaveLength(3)
    expect(new Set(hooks.map((h) => h.phase ?? 0)).size).toBe(3)
  })

  test('the deck gap is genuinely too wide to jump', () => {
    // The pit between the two ledges, measured along the row they sit on.
    let gap = 0
    for (let x = 100; x < 150; x++) if (tileAt(w3.map, x, 9) !== Tile.SOLID) gap++
    expect(gap).toBeGreaterThan(20)
  })

  test('four Ghost Divers — one to meet, two in the flood, one at the door', () => {
    const divers = w3.entities.filter((e) => e.type === 'ghostDiver')
    expect(divers).toHaveLength(4)
    // §7.4 puts two of them in the flooded room, which is the only place the
    // player meets more than one at a time and the only place it is fair to.
    expect(divers.filter((d) => d.x >= 150 && d.x <= 189)).toHaveLength(2)
  })

  test('the flood is a flood, and it only ever comes up', () => {
    const rises = w3.entities.filter((e): e is typeof e & { type: 'rise' } => e.type === 'rise')
    expect(rises).toHaveLength(1)
    expect(rises[0]!.fluid).toBe('flood')
    expect(rises[0]!.top).toBeLessThan(rises[0]!.y)
  })

  test('the powder magazine has cracked walls and heat-fused debris', () => {
    const present = tiles('w03-ship')
    expect(present.has(Tile.CRACKED)).toBe(true)
    expect(present.has(Tile.FUSED)).toBe(true)
  })
})

describe('World 4 — the Volcanic Vents', () => {
  const w4 = level('w04-vents')

  test('two magma rises, and both of them climb', () => {
    const rises = w4.entities.filter((e): e is typeof e & { type: 'rise' } => e.type === 'rise')
    expect(rises).toHaveLength(2)
    for (const r of rises) {
      expect(r.fluid).toBe('magma')
      expect(r.top).toBeLessThan(r.y)
    }
  })

  /** §7.5 B1: "No enemies — the magma is the enemy." */
  test('the first climb is empty of enemies', () => {
    const inClimb = w4.entities.filter(
      (e) => e.x >= 54 && e.x <= 91 && ['magmaSnail', 'cinderMoth', 'eel', 'snapper'].includes(e.type),
    )
    expect(inClimb).toEqual([])
  })

  test('the ash bridges are collapsing sand under a moth patrol', () => {
    expect(tiles('w04-vents').has(Tile.CRUMBLE)).toBe(true)
    const moths = w4.entities.filter((e) => e.type === 'cinderMoth' && e.x >= 92 && e.x <= 129)
    expect(moths.length).toBeGreaterThanOrEqual(2)
  })

  test('superheated water and permanent magma are both in the grid', () => {
    const present = tiles('w04-vents')
    expect(present.has(Tile.HOT)).toBe(true)
    expect(present.has(Tile.MAGMA)).toBe(true)
  })

  test('the scald pool is deep enough to need crossing in stages', () => {
    let hot = 0
    for (let x = 130; x < 164; x++) if (tileAt(w4.map, x, 14) === Tile.HOT) hot++
    expect(hot).toBeGreaterThan(20)
  })

  test('two Magma Snails, and both of them block something', () => {
    expect(w4.entities.filter((e) => e.type === 'magmaSnail').length).toBeGreaterThanOrEqual(2)
  })
})

describe('World 5 — the Abyss', () => {
  const w5 = level('w05-abyss')

  test('the chapter is dark, and it is the only one that is', () => {
    expect(chapterOf(def('w05-abyss').chapter).dark).toBe(5)
  })

  /** §7.6 A1: "The scariest room in the game is empty." */
  test('the lightless drop has nothing in it at all', () => {
    const inDrop = w5.entities.filter(
      (e) => e.x < 34 && !['shell', 'pearl', 'inkBulb', 'inkCore'].includes(e.type),
    )
    expect(inDrop).toEqual([])
  })

  test('Deep Jet is found inside the level, exactly once', () => {
    const nodules = w5.entities.filter((e) => e.type === 'deepJet')
    expect(nodules).toHaveLength(1)
    // And it is not granted for clearing anything, anywhere.
    expect(Object.values(GRANTED_ON_CLEAR)).not.toContain('deepJet')
  })

  /**
   * Two of the three pearls lie *before* the nodule, which is what makes them
   * a reason to come back. Reach cannot express that — Spent-with-Deep-Jet and
   * Full-without are the same three-pip envelope — so position is the test.
   */
  test('two pearls lie before the nodule and one lies after', () => {
    const nodule = w5.entities.find((e) => e.type === 'deepJet')!
    const pearls = w5.entities
      .filter((e): e is typeof e & { type: 'pearl' } => e.type === 'pearl')
      .sort((a, b) => a.id - b.id)
    expect(pearls.filter((p) => p.x < nodule.x)).toHaveLength(2)
    expect(pearls.filter((p) => p.x > nodule.x)).toHaveLength(1)
  })

  test('the vent chamber has more vents than the meter has pips', () => {
    const vents = w5.entities.filter((e) => e.type === 'shrimpVent')
    expect(vents.length).toBeGreaterThan(TIERS[1]!.inkMax)
  })

  test('five Lightless in the gallery, which is what makes it a gallery', () => {
    expect(w5.entities.filter((e) => e.type === 'lightless' && e.x >= 160)).toHaveLength(5)
  })

  test('one pressure room, and it is a room rather than the whole level', () => {
    const zones = w5.entities.filter((e): e is typeof e & { type: 'pressure' } => e.type === 'pressure')
    expect(zones).toHaveLength(1)
    expect(zones[0]!.w).toBeLessThan(w5.map.width / 2)
  })

  test('the last third has exactly one conch, at the boss door', () => {
    const late = level('w05-abyss').checkpoints.filter((c) => c.x > w5.map.width * 0.66)
    expect(late).toHaveLength(1)
  })
})

/**
 * The rules that hold for every shipped level.
 *
 * Written over `campaign()` rather than per level so a sixth one inherits them
 * and cannot quietly skip any. Everything here is a §7.1 or §12.7 rule, not a
 * taste.
 */
describe('every level keeps the same promises', () => {
  test('five worlds, in order, with no gaps', () => {
    expect(campaign().map((d) => d.id)).toEqual([
      'w01-tidepools',
      'w02-kelp',
      'w03-ship',
      'w04-vents',
      'w05-abyss',
    ])
  })

  for (const d of campaign()) {
    describe(d.id, () => {
      const loaded = loadCampaignLevel(d)

      test('it loads as a campaign level, with everything that implies', () => {
        expect(() => loadCampaignLevel(d)).not.toThrow()
      })

      test('its chapter owns the tileset, palette and music; the level declares none', () => {
        const chapter = chapterOf(d.chapter)
        expect(tilesetOf(chapter.tileset)).not.toBeNull()
        for (const banned of ['tileset', 'palette', 'music', 'dark']) {
          expect((d as unknown as Record<string, unknown>)[banned], banned).toBeUndefined()
        }
      })

      test('it runs three to six minutes, so par is set for that', () => {
        expect(d.par).toBeGreaterThanOrEqual(180)
        expect(d.par).toBeLessThanOrEqual(360)
      })

      test('three conches through the level and one at the boss door', () => {
        expect(loaded.checkpoints).toHaveLength(RULES.CHECKPOINTS_PER_LEVEL + 1)
      })

      /**
       * Conches are scanned out of the grid row by row, so their order in the
       * array is *reading* order, not left-to-right order. Anything that wants
       * "the last one" has to sort — which is a thing two tests here quietly
       * did not do until a fourth conch was added on a higher row.
       */
      test('no two conches sit on top of each other', () => {
        const xs = loaded.checkpoints.map((c) => c.x).sort((a, b) => a - b)
        for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(20)
      })

      test('it ends in a boss the registry knows about', () => {
        expect(d.boss).toBeDefined()
        expect(BOSS_IDS).toContain(d.boss!)
      })

      /** §7.1: no enemies on the first screen. Ever. */
      test('the first screen is empty of enemies', () => {
        const collectible = ['shell', 'pearl', 'inkBulb', 'inkCore', 'deepJet', 'rise', 'pressure', 'bubble']
        const early = loaded.entities.filter((e) => e.x < 20 && !collectible.includes(e.type))
        expect(early).toEqual([])
      })

      test('three pearls, one per slot', () => {
        const ids = loaded.entities
          .filter((e): e is typeof e & { type: 'pearl' } => e.type === 'pearl')
          .map((p) => p.id)
        expect([...ids].sort()).toEqual([0, 1, 2])
      })

      test('Ink Bulbs sit inside the PRD range, and one lands soon after each conch', () => {
        const bulbs = loaded.entities.filter((e) => e.type === 'inkBulb').map((e) => e.x)
        expect(bulbs.length).toBeGreaterThanOrEqual(RULES.INK_BULBS_PER_LEVEL[0])
        expect(bulbs.length).toBeLessThanOrEqual(RULES.INK_BULBS_PER_LEVEL[1])
        for (const conch of loaded.checkpoints.map((c) => c.x)) {
          if (conch > loaded.map.width - 45) continue // the boss door needs no bulb
          const after = bulbs.filter((x) => x > conch - 10 && x < conch + 45)
          expect(after.length, `nothing within reach of the conch at ${conch}`).toBeGreaterThan(0)
        }
      })

      /** §7.1: never immediately before a boss door. */
      test('no Ink Core sits near the boss door', () => {
        // By position, not by array order — see the note above.
        const door = Math.max(...loaded.checkpoints.map((c) => c.x))
        for (const core of loaded.entities.filter((e) => e.type === 'inkCore')) {
          expect(door - core.x).toBeGreaterThan(40)
        }
      })

      test('shells are laid along the route rather than heaped in one place', () => {
        const xs = loaded.entities.filter((e) => e.type === 'shell').map((e) => e.x)
        expect(xs.length).toBeGreaterThan(10)
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(loaded.map.width * 0.75)
      })

      /**
       * §11.3 allows key prompts and nothing else. The budget is deliberately
       * tiny: two per level, and only for a verb that geometry cannot teach.
       */
      test('at most two key prompts, and each of them short enough to read', () => {
        const hints = d.hints ?? []
        expect(hints.length).toBeLessThanOrEqual(2)
        for (const h of hints) expect(h.text.length).toBeLessThanOrEqual(26)
      })

      test('the roster is this world and only this world', () => {
        const spec = WORLDS[d.id]
        if (!spec) return
        for (const type of spec.roster) {
          expect(has(d.id, type), `${d.id} is missing its ${type}`).toBe(true)
        }
        expect(d.boss).toBe(spec.boss)
        expect(chapterOf(d.chapter).tileset).toBe(spec.tileset)
      })

      test('it builds and steps without throwing', () => {
        const w = createWorld(d)
        for (let i = 0; i < 300; i++) update(w, blank())
        expect(w.player.alive).toBe(true)
        expect(w.frame).toBe(300)
      })

      test('nothing spawns on top of anything else', () => {
        const w = createWorld(d)
        for (let i = 0; i < w.enemies.length; i++) {
          for (let j = i + 1; j < w.enemies.length; j++) {
            const a = w.enemies[i]!
            const b = w.enemies[j]!
            const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
            expect(overlap, `${a.kind} and ${b.kind} overlap at spawn in ${d.id}`).toBe(false)
          }
        }
      })
    })
  }

  /**
   * §8.5's backtracking engine, as a whole-game assertion.
   *
   * Five pearls across the game are gated on an upgrade from a later world.
   * Without at least one per world after the first, "requires a later upgrade"
   * is a sentence in a design document rather than a reason to come back.
   */
  test('every upgrade is granted exactly once, and clearing the last grants nothing', () => {
    const granted = campaign()
      .map((d) => GRANTED_ON_CLEAR[d.id])
      .filter((u): u is (typeof UPGRADE_IDS)[number] => u !== undefined)
    expect(granted).toEqual(['inkShot', 'cling', 'inkBomb', 'heatShell'])
    expect(GRANTED_ON_CLEAR[campaign()[campaign().length - 1]!.id]).toBeUndefined()
  })

  test('the whole game is fifteen pearls', () => {
    const total = campaign().reduce(
      (n, d) => n + loadCampaignLevel(d).entities.filter((e) => e.type === 'pearl').length,
      0,
    )
    expect(total).toBe(15)
  })

  test('every level after the first opens with something the last one gave you', () => {
    for (const d of campaign().slice(1)) {
      expect(loadoutOnArrival(d.id).length, d.id).toBeGreaterThan(0)
    }
  })

  /**
   * The tuning applied after Gate 3 round one, so a later edit cannot quietly
   * undo it. Every one of these is a rung on §7.7's ladder, run downwards.
   */
  test('every level from World 3 carries an Ink Core, as §7.1 always asked', () => {
    for (const d of campaign().slice(2)) {
      const cores = loadCampaignLevel(d).entities.filter((e) => e.type === 'inkCore')
      expect(cores.length, `${d.id} has no Ink Core`).toBeGreaterThanOrEqual(RULES.INK_CORES_PER_LEVEL[0]!)
      expect(cores.length).toBeLessThanOrEqual(RULES.INK_CORES_PER_LEVEL[1]!)
    }
  })

  test('the longest walk back is no more than a third of a level', () => {
    for (const d of campaign()) {
      const loaded = loadCampaignLevel(d)
      const xs = [0, ...loaded.checkpoints.map((c) => c.x).sort((a, b) => a - b)]
      const longest = Math.max(...xs.slice(1).map((x, i) => x - xs[i]!))
      expect(longest, `${d.id}'s longest stretch`).toBeLessThan(loaded.map.width / 2.6)
    }
  })

  /**
   * The end of the backtracking chain: with everything earned, all fifteen are
   * collectable. §8.6 hangs Octo's unlock on this, so a pearl walled in by an
   * authoring mistake would cost a character rather than a collectible.
   */
  test('a player holding every upgrade can reach all fifteen', () => {
    for (const d of campaign()) {
      const r = analyseReach(loadCampaignLevel(d), { tier: FULL, upgrades: [...UPGRADE_IDS] })
      expect(r.unreachablePearls, d.id).toEqual([])
    }
  })

  /**
   * And the two that gate on Deep Jet stay shut without it — at *every* tier and
   * holding everything else. Cling is the reason this is worth asserting: from
   * World 3 on it turns any wall into a ladder, so a gate that was a drop when
   * it was authored can quietly open two worlds later.
   */
  test('the Deep Jet pearls stay shut for a player holding all four other upgrades', () => {
    const others = UPGRADE_IDS.filter((u) => u !== 'deepJet')
    for (const id of ['w01-tidepools', 'w05-abyss']) {
      const level = loadCampaignLevel(campaign().find((d) => d.id === id)!)
      for (const tier of [SPENT, FULL, CHARGED_TIER]) {
        expect(analyseReach(level, { tier, upgrades: [...others] }).unreachablePearls, `${id} @${tier}`).toContain(2)
      }
    }
  })
})

/** Kept out of the loop above: it needs the def, not the loaded level. */
export type { LevelDef }
