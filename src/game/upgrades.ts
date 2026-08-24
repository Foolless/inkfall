/**
 * The five permanent ink upgrades. PRD §8.5.
 *
 * Upgrades are the backtracking engine: one per world, each opening pearls in
 * worlds already cleared. That is the whole reason free replay exists, and the
 * reason five of the fifteen pearls are deliberately out of reach on the run
 * that first meets them.
 *
 * **Upgrades and tiers are different currencies**, and the rule that falls out
 * of it is absolute: *no permanent upgrade ever changes how many hits Nib can
 * take, and no tier is ever permanent.* Deep Jet owns pip count, Charged owns
 * dash damage, and the two never overlap. Anything added here later must
 * respect that split or the tier system stops meaning anything.
 *
 * Held as a **bitmask** rather than a Set. Three reasons, all of them the same
 * reason: the update loop must not allocate (PRD §12.6), the world hash that
 * proves replay determinism wants a number, and "does he have Cling" is asked
 * on nearly every frame Nib is airborne.
 */

/** Stable ids. These reach save data, so they are as permanent as a level id. */
export type UpgradeId = 'inkShot' | 'cling' | 'inkBomb' | 'heatShell' | 'deepJet'

export const UPGRADE_IDS: readonly UpgradeId[] = ['inkShot', 'cling', 'inkBomb', 'heatShell', 'deepJet']

export const UPGRADE_BIT: Record<UpgradeId, number> = {
  inkShot: 1 << 0,
  cling: 1 << 1,
  inkBomb: 1 << 2,
  heatShell: 1 << 3,
  deepJet: 1 << 4,
}

/** Every bit set. Used by the reachability tests and the debug route. */
export const ALL_UPGRADES: number = UPGRADE_IDS.reduce((m, id) => m | UPGRADE_BIT[id], 0)

export function isUpgradeId(id: string): id is UpgradeId {
  return (UPGRADE_IDS as readonly string[]).includes(id)
}

/**
 * Ids to a mask, ignoring anything unrecognised.
 *
 * Lenient on purpose: save data is the caller here, and an id written by a
 * newer build must not throw on an older one. The save layer already preserves
 * what it does not understand (engine/save.ts); this is the same promise seen
 * from the other side.
 */
export function maskOf(ids: readonly string[] | undefined): number {
  let mask = 0
  for (const id of ids ?? []) if (isUpgradeId(id)) mask |= UPGRADE_BIT[id]
  return mask
}

export function idsOf(mask: number): UpgradeId[] {
  return UPGRADE_IDS.filter((id) => (mask & UPGRADE_BIT[id]) !== 0)
}

export function hasUpgrade(mask: number, id: UpgradeId): boolean {
  return (mask & UPGRADE_BIT[id]) !== 0
}

export function withUpgrade(mask: number, id: UpgradeId): number {
  return mask | UPGRADE_BIT[id]
}

/**
 * Which upgrade clearing a level hands over, keyed by the level's stable id.
 *
 * Data rather than a `switch`, so adding a chapter is an entry here and nothing
 * else (PRD §12.7: no per-level code). Deep Jet is deliberately absent — it is
 * the one upgrade found *inside* a level rather than granted for finishing one,
 * which is why World 5's B2 exists.
 */
export const GRANTED_ON_CLEAR: Readonly<Record<string, UpgradeId>> = {
  'w01-tidepools': 'inkShot',
  'w02-kelp': 'cling',
  'w03-ship': 'inkBomb',
  'w04-vents': 'heatShell',
}

/** Human-readable, for the level-clear screen. The only place these are words. */
export const UPGRADE_NAMES: Readonly<Record<UpgradeId, string>> = {
  inkShot: 'INK SHOT',
  cling: 'CLING',
  inkBomb: 'INK BOMB',
  heatShell: 'HEAT SHELL',
  deepJet: 'DEEP JET',
}

/** The key prompt each upgrade earns, shown once in the level that teaches it. */
export const UPGRADE_HINTS: Readonly<Record<UpgradeId, string>> = {
  inkShot: '[C] INK SHOT',
  cling: 'HOLD INTO A WALL',
  inkBomb: '[↓ + C] INK BOMB',
  heatShell: 'HEAT SHELL: WALK IT',
  deepJet: 'DEEP JET: 4 PIPS',
}
