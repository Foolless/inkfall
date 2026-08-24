/**
 * The world map's model. PRD §11.1 and §8.3.
 *
 * Nodes on a vertical descent line, one per campaign level, built from the
 * registry rather than from a hard-coded list of five — §12.7's rule, and the
 * whole reason the map is a Phase 4 checkpoint rather than a title-screen menu.
 * Adding a sixth level puts a sixth node on the map and nothing here changes.
 *
 * Pure data and pure functions, with no canvas and no storage. The renderer
 * draws what this returns; the host reads the save and hands the numbers in.
 * That split is what lets the map be unit-tested at all — "is World 3 locked
 * after clearing World 2" is a question about a list, not about pixels.
 *
 * ## Why free replay is load-bearing
 *
 * §8.5 gates five of the fifteen pearls behind upgrades earned in *later*
 * worlds. Without a way back into a cleared level those five are unreachable,
 * which would make the backtracking engine — and Octo's unlock, and the true
 * ending — decorative. So replay is not a convenience here: it is the thing
 * that makes a third of the collectibles exist.
 */

import { campaign } from '../content/levels/index.js'
import { chapterOf } from '../content/chapters.js'

export interface MapNode {
  /** The level id. Stable forever (§12.7). */
  id: string
  /** The level's own name — "The Kelp Forest". */
  name: string
  /** The chapter it belongs to, for the map's colouring. */
  chapter: string
  /** May it be entered? The first level always may. */
  unlocked: boolean
  /** Has it ever been finished, on any run? */
  cleared: boolean
  /** Three flags, in pearl-id order. Persistent across runs (§8.3). */
  pearls: readonly boolean[]
  /** Personal best in seconds, or null if it has never been finished. */
  bestSeconds: number | null
}

/** The slice of a save the map needs. Passed in, never read from storage here. */
export interface MapProgress {
  unlocked: readonly string[]
  cleared: readonly string[]
  pearls: Readonly<Record<string, readonly boolean[]>>
  /** Best seconds per level id, for the selected character. */
  bestTimes: Readonly<Record<string, number | null>>
}

export const NO_PROGRESS: MapProgress = { unlocked: [], cleared: [], pearls: {}, bestTimes: {} }

/**
 * One node per campaign level, in descent order.
 *
 * The first level is always unlocked even if the save has never heard of it:
 * a fresh save with an empty `unlocked` list must still be playable, and a map
 * with nothing on it that can be entered is a dead end rather than a start.
 */
export function buildMap(progress: MapProgress = NO_PROGRESS): MapNode[] {
  return campaign().map((def, i) => ({
    id: def.id,
    name: def.name,
    chapter: def.chapter,
    unlocked: i === 0 || progress.unlocked.includes(def.id),
    cleared: progress.cleared.includes(def.id),
    pearls: normalisePearls(progress.pearls[def.id]),
    bestSeconds: progress.bestTimes[def.id] ?? null,
  }))
}

/** Always three, however few flags the save happens to hold. */
function normalisePearls(flags: readonly boolean[] | undefined): readonly boolean[] {
  return [flags?.[0] === true, flags?.[1] === true, flags?.[2] === true]
}

/**
 * Move the cursor by `delta`, skipping locked nodes and stopping at the ends.
 *
 * Stopping rather than wrapping: the map is a descent, and a cursor that leaps
 * from the abyss back to the tide pools loses the one thing the shape is for.
 * Locked nodes are stepped over rather than landed on, so pressing down at the
 * edge of your progress does nothing instead of parking you on a wall.
 */
export function moveCursor(nodes: readonly MapNode[], cursor: number, delta: number): number {
  if (delta === 0) return cursor
  const step = delta > 0 ? 1 : -1
  for (let i = cursor + step; i >= 0 && i < nodes.length; i += step) {
    if (nodes[i]!.unlocked) return i
  }
  return cursor
}

/**
 * Where the cursor starts: the deepest level this player may enter.
 *
 * This is also the game's "continue". Progress was being written to the save
 * from Phase 2 onward and never read back, so every session began at the tide
 * pools no matter how far anyone had got. The map is where that gets fixed,
 * because the map is where progression is meant to be felt (§11.1).
 */
export function furthestUnlocked(nodes: readonly MapNode[]): number {
  let at = 0
  for (let i = 0; i < nodes.length; i++) if (nodes[i]!.unlocked) at = i
  return at
}

export interface MapTotals {
  pearls: number
  pearlsPossible: number
  cleared: number
  levels: number
}

/** The line along the bottom of the map: what is found, out of what exists. */
export function mapTotals(nodes: readonly MapNode[]): MapTotals {
  return {
    pearls: nodes.reduce((n, node) => n + node.pearls.filter(Boolean).length, 0),
    pearlsPossible: nodes.length * 3,
    cleared: nodes.filter((n) => n.cleared).length,
    levels: nodes.length,
  }
}

/** The chapter's display name, for the node's caption. */
export function chapterName(node: MapNode): string {
  return chapterOf(node.chapter).name
}
