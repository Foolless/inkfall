/**
 * The level registry: stable string id -> LevelDef.
 *
 * The world map reads this, not a hard-coded list of five nodes (PRD §12.7).
 * Registration validates the whole set on module load, so a duplicate id or an
 * unknown chapter is a startup crash in dev rather than a save file that
 * quietly attributes one level's pearls to another.
 */

import { chapterOf } from '../chapters.js'
import { greybox } from './greybox.js'
import { tidepools } from './w01-tidepools.js'
import { kelpForest } from './w02-kelp.js'
import { sunkenShip } from './w03-ship.js'
import { volcanicVents } from './w04-vents.js'
import { theAbyss } from './w05-abyss.js'
import { loadLevel, type LevelDef, type LoadedLevel } from './format.js'
import { GRANTED_ON_CLEAR, type UpgradeId } from '../../game/upgrades.js'

const ALL: readonly LevelDef[] = [greybox, tidepools, kelpForest, sunkenShip, volcanicVents, theAbyss]

function buildRegistry(defs: readonly LevelDef[]): Map<string, LevelDef> {
  const byId = new Map<string, LevelDef>()
  const orders = new Map<number, string>()
  for (const def of defs) {
    if (byId.has(def.id)) throw new Error(`duplicate level id ${JSON.stringify(def.id)}`)
    chapterOf(def.chapter) // throws on an unknown chapter
    const clash = orders.get(def.order)
    if (clash !== undefined) throw new Error(`levels ${clash} and ${def.id} share order ${def.order}`)
    orders.set(def.order, def.id)
    byId.set(def.id, def)
  }
  return byId
}

const REGISTRY = buildRegistry(ALL)

export function levelIds(): readonly string[] {
  return [...REGISTRY.keys()]
}

export function levelDef(id: string): LevelDef {
  const def = REGISTRY.get(id)
  if (!def) throw new Error(`unknown level id ${JSON.stringify(id)}`)
  return def
}

export function loadLevelById(id: string): LoadedLevel {
  return loadLevel(levelDef(id))
}

/**
 * Every level that is part of the game proper, in play order.
 *
 * The grey box is registered so the debug route can reach it, but it is not a
 * world and never appears on the map.
 */
export function campaign(): readonly LevelDef[] {
  return [...REGISTRY.values()].filter((d) => d.chapter !== 'test').sort((a, b) => a.order - b.order)
}

/**
 * What a player is *guaranteed* to be holding the first time they reach a level.
 *
 * Derived from the campaign order and §8.5's one-upgrade-per-world table, never
 * authored per level. A level that declared its own assumed loadout would
 * eventually disagree with the order it sits in, and the disagreement would
 * show up as a reachability test that passes on a level nobody can finish.
 *
 * This is what the completability gate has to be run against. World 2's first
 * room is a kelp knot that only an Ink Shot opens, and checking it with an
 * empty loadout asks a question about a run that cannot happen.
 */
export function loadoutOnArrival(id: string): UpgradeId[] {
  const order = campaign().findIndex((d) => d.id === id)
  if (order < 0) return []
  return campaign()
    .slice(0, order)
    .map((d) => GRANTED_ON_CLEAR[d.id])
    .filter((u): u is UpgradeId => u !== undefined)
}

/**
 * Everything a player could hold *inside* a level: what they arrived with, plus
 * whatever the level itself hands over.
 *
 * Only World 5 differs from the arrival loadout, because Deep Jet is the one
 * upgrade found rather than granted (§8.5). Detected from the entity list
 * rather than declared, so the two can never disagree.
 */
export function loadoutInside(id: string): UpgradeId[] {
  const def = REGISTRY.get(id)
  const found = (def?.entities ?? []).some((e) => e.type === 'deepJet') ? (['deepJet'] as const) : []
  return [...loadoutOnArrival(id), ...found]
}

/** The upgrade clearing this level hands over, if any. */
export function grantedBy(id: string): UpgradeId | undefined {
  return GRANTED_ON_CLEAR[id]
}

export { greybox, tidepools, kelpForest, sunkenShip, volcanicVents, theAbyss }
