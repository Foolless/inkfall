import { describe, expect, test } from 'vitest'
import { analyseReach } from '../src/game/reach.js'
import { campaign, loadoutInside, loadoutOnArrival } from '../src/content/levels/index.js'
import { loadCampaignLevel } from '../src/content/levels/format.js'
import { UPGRADE_IDS, type UpgradeId } from '../src/game/upgrades.js'
import { CHARGED_TIER, FULL, SPENT } from '../src/game/constants.js'
import { buildMap, NO_PROGRESS } from '../src/game/map.js'
import {
  checkUnlocks,
  defaultSave,
  PEARLS_TOTAL,
  recordClear,
  totalPearls,
  type SaveData,
} from '../src/engine/save.js'

/**
 * The fifteen pearls, one assertion each. PLAN.md checkpoint 4.1, whose proof
 * is stated as "all 15 collectible — asserted by the reachability solver given
 * each pearl's stated upgrade and tier".
 *
 * §8.5 calls the upgrades "the backtracking engine". That claim is only true if
 * some pearls genuinely cannot be had on the run that first meets them, and
 * false in a worse way if any pearl cannot be had *at all*. The table below is
 * the design of that engine written down, and the solver checks every row.
 *
 * ## The convention the ids follow
 *
 * Pearl ids run **left to right along the level**, not in the order §7 happens
 * to describe them. They are persisted in save files, so they are stable
 * forever (§12.7) — which is why World 4's magma pearl is id 1 even though
 * §7.5's prose calls that one ③. The prose was written before the level was.
 */

/** `requires` is the upgrade that makes the pearl reachable, or null if none. */
interface PearlGate {
  level: string
  id: number
  requires: UpgradeId | null
  where: string
}

const GATES: readonly PearlGate[] = [
  // World 1 — §7.2
  { level: 'w01-tidepools', id: 0, requires: null, where: 'above the A2 ledges, one up-dash from the top step' },
  { level: 'w01-tidepools', id: 1, requires: null, where: 'behind the false wall in the B1 pool' },
  { level: 'w01-tidepools', id: 2, requires: 'deepJet', where: 'across the twelve-tile gap in C1' },

  // World 2 — §7.3
  { level: 'w02-kelp', id: 0, requires: null, where: 'the bottom of the A2 current maze, against the flow' },
  { level: 'w02-kelp', id: 1, requires: null, where: 'inside the kelp knot off the main path in B2' },
  { level: 'w02-kelp', id: 2, requires: 'inkBomb', where: 'behind the cracked wall in C1' },

  // World 3 — §7.4
  { level: 'w03-ship', id: 0, requires: null, where: 'the crate at the bottom of the A2 shaft' },
  { level: 'w03-ship', id: 1, requires: null, where: 'in the flooded room C1, at the cost of the rising-water lead' },
  { level: 'w03-ship', id: 2, requires: 'heatShell', where: 'the powder magazine, behind heat-fused debris' },

  // World 4 — §7.5
  { level: 'w04-vents', id: 0, requires: null, where: 'off the side of the B1 climb' },
  { level: 'w04-vents', id: 1, requires: 'heatShell', where: 'under the permanent magma pool at the end of C1' },
  { level: 'w04-vents', id: 2, requires: null, where: 'behind the cracked crust in the C2 corridor' },

  // World 5 — §7.6
  { level: 'w05-abyss', id: 0, requires: null, where: 'off the A1 descent, in the dark' },
  { level: 'w05-abyss', id: 1, requires: null, where: 'behind the last vent in B1, through cracked crust' },
  { level: 'w05-abyss', id: 2, requires: 'deepJet', where: 'the one-tile island in the C2 gallery' },
]

const ALL = [...UPGRADE_IDS]
const TIERS = [SPENT, FULL, CHARGED_TIER]

function level(id: string) {
  return loadCampaignLevel(campaign().find((d) => d.id === id)!)
}

describe('the table describes the game that was built', () => {
  test('fifteen pearls, three per level, ids running along the level', () => {
    expect(GATES).toHaveLength(15)
    for (const def of campaign()) {
      const placed = def.entities?.filter((e) => e.type === 'pearl') ?? []
      expect(placed.map((e) => e.id), def.id).toEqual([0, 1, 2])
      // Ids are save-file keys, so their order is a promise. Left to right.
      const xs = placed.map((e) => e.x)
      expect([...xs].sort((a, b) => a - b), def.id).toEqual(xs)
      expect(GATES.filter((g) => g.level === def.id)).toHaveLength(3)
    }
  })
})

describe('every pearl can be had', () => {
  for (const gate of GATES) {
    test(`${gate.level} #${gate.id} — ${gate.where}`, () => {
      const r = analyseReach(level(gate.level), { tier: FULL, upgrades: ALL })
      expect(r.unreachablePearls).not.toContain(gate.id)
    })
  }
})

describe('the five that need a later upgrade actually need it', () => {
  for (const gate of GATES.filter((g) => g.requires !== null)) {
    test(`${gate.level} #${gate.id} needs ${gate.requires}`, () => {
      const without = ALL.filter((u) => u !== gate.requires)
      // At *every* tier: a gate that only holds for a Spent player is not a gate,
      // it is a difficulty setting.
      for (const tier of TIERS) {
        const r = analyseReach(level(gate.level), { tier, upgrades: without })
        expect(r.unreachablePearls, `${gate.level} @tier ${tier}`).toContain(gate.id)
      }
    })
  }

  /**
   * The engine, as one number. §8.5 says upgrades are what bring a player back
   * to earlier worlds; if that count ever drops to zero the mechanic is real in
   * the document and decorative in the game.
   */
  test('exactly one per world — every level has a reason to come back to it', () => {
    const gated = GATES.filter((g) => g.requires !== null)
    expect(gated).toHaveLength(5)
    expect(gated.map((g) => g.level)).toEqual(campaign().map((d) => d.id))
  })

  /**
   * Deep Jet gates two and is found in the last level, so neither of its pearls
   * can be had before the game is over — which is what makes the *second*
   * playthrough the one that finishes the collection.
   */
  test('the two Deep Jet pearls both sit behind the last level', () => {
    const jet = GATES.filter((g) => g.requires === 'deepJet').map((g) => g.level)
    expect(jet).toEqual(['w01-tidepools', 'w05-abyss'])
  })
})

describe('the other ten are had on the way past', () => {
  for (const gate of GATES.filter((g) => g.requires === null)) {
    test(`${gate.level} #${gate.id} is reachable Spent, on what you walked in with`, () => {
      // Spent, because a player can arrive at any room having been hit, and a
      // pearl that needs three pips is a pearl most players never see.
      const r = analyseReach(level(gate.level), { tier: SPENT, upgrades: loadoutInside(gate.level) })
      expect(r.unreachablePearls).not.toContain(gate.id)
    })
  }

  test('ten of them, so a first playthrough is two thirds of the way to Octo', () => {
    expect(GATES.filter((g) => g.requires === null)).toHaveLength(10)
  })
})

describe('what the arrival loadout can and cannot open', () => {
  /**
   * The solver run exactly as a first playthrough meets each level: the tier a
   * player can always be at, and only the upgrades the campaign guarantees by
   * then. Whatever it cannot reach is what the backtracking is *for*.
   */
  test('the pearls out of reach on arrival are precisely the gated five', () => {
    for (const def of campaign()) {
      const r = analyseReach(level(def.id), { tier: SPENT, upgrades: loadoutInside(def.id) })
      const expected = GATES.filter((g) => g.level === def.id && g.requires !== null).map((g) => g.id)
      expect([...r.unreachablePearls].sort(), def.id).toEqual(expected)
    }
  })

  test('every level is still finishable with what you arrive holding', () => {
    for (const def of campaign()) {
      const r = analyseReach(level(def.id), { tier: SPENT, upgrades: loadoutOnArrival(def.id) })
      expect(r.reachedExit, def.id).toBe(true)
    }
  })
})

describe('the map counts them', () => {
  test('a fresh save shows none of fifteen', () => {
    const nodes = buildMap(NO_PROGRESS)
    expect(nodes.reduce((n, node) => n + node.pearls.filter(Boolean).length, 0)).toBe(0)
    expect(nodes.length * 3).toBe(GATES.length)
  })
})

describe('what fifteen pearls are worth', () => {
  /** Every level's three, banked, the long way round. */
  function collectedEverything(): SaveData {
    let save = defaultSave()
    for (const def of campaign()) {
      save = recordClear(save, def.id, { pearls: [true, true, true], seconds: 200 })
    }
    return checkUnlocks(save)
  }

  test('fourteen unlocks nothing — the last one is the one that counts', () => {
    let save = defaultSave()
    for (const def of campaign().slice(1)) {
      save = recordClear(save, def.id, { pearls: [true, true, true], seconds: 200 })
    }
    save = recordClear(save, campaign()[0]!.id, { pearls: [true, true, false], seconds: 200 })
    expect(totalPearls(save)).toBe(14)

    save = checkUnlocks(save)
    expect(save.characters.unlocked).not.toContain('octo')
    expect(save.progress.trueEndingSeen).toBe(false)
  })

  /**
   * §8.3: all fifteen unlocks Octo and the true ending. Octo's *movement* is
   * §8.6's post-1.0 work and is deliberately not built — but the unlock is
   * recorded now, because the alternative is asking somebody who finished the
   * collection in v1 to do it again in v2.
   */
  test('fifteen unlocks Octo and the true ending', () => {
    const save = collectedEverything()
    expect(totalPearls(save)).toBe(PEARLS_TOTAL)
    expect(save.characters.unlocked).toContain('octo')
    expect(save.progress.trueEndingSeen).toBe(true)
  })

  test('checking twice does not unlock twice', () => {
    const once = collectedEverything()
    const twice = checkUnlocks(once)
    expect(twice.characters.unlocked).toEqual(once.characters.unlocked)
    expect(twice).toBe(once)
  })

  test('Nib is never taken away', () => {
    expect(collectedEverything().characters.unlocked).toContain('nib')
    expect(collectedEverything().characters.selected).toBe('nib')
  })
})
