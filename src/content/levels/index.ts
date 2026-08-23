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
import { loadLevel, type LevelDef, type LoadedLevel } from './format.js'

const ALL: readonly LevelDef[] = [greybox]

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

export { greybox }
