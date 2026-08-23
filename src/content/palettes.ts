/**
 * The 48-colour master palette. PRD §9.1.
 *
 * Every colour that ever reaches the screen comes from here, and each world
 * draws from a 12-colour sub-palette. The constraint is not decoration: it is
 * the single thing that will make five worlds authored over weeks look like one
 * game rather than a hobby project. tests/palette.test.ts holds the line —
 * a sprite whose palette wanders off this list fails the build.
 *
 * Organised as four rows of twelve, one per world plus a shared row. The shared
 * row carries Nib himself, the UI, and the pickups, because those appear in
 * every world and must not be re-tinted per chapter.
 */

/** Shared across every world: Nib, UI, pickups, ink. */
export const SHARED = {
  VOID: '#05090f',
  INK_DARK: '#2a1b45',
  NIB_BODY: '#7d5fc4',
  NIB_PALE: '#d8ccec',
  NIB_SPENT: '#b9a6d8',
  CHARGED_BODY: '#1b1230',
  CHARGED_RIM: '#00e5cc',
  INK_CYAN: '#00e5cc',
  PEARL: '#fdf6ff',
  SHELL: '#ffd9a0',
  UI_DIM: '#4d565d',
  UI_TEXT: '#d6e4ea',
} as const

/** World 1 — Tide Pools. Warm, open, safe. */
export const SHALLOWS = {
  SAND: '#f4e4c1',
  SAND_SHADE: '#d6bd8f',
  SAND_DEEP: '#a8875c',
  SHALLOW: '#4fc3d9',
  SHALLOW_DEEP: '#2a7f8f',
  CORAL: '#e8825a',
  CORAL_DARK: '#b4553a',
  ROCK: '#7b8b94',
  ROCK_DARK: '#4a5a63',
  FOAM: '#ddf6fb',
  URCHIN: '#3a2a4a',
  URCHIN_TIP: '#e0705c',
} as const

/** World 2 — Kelp Forest. Filtered, close. */
export const KELP = {
  KELP_DARK: '#1e4d3a',
  FROND: '#7fb069',
  SILHOUETTE: '#0d2a1f',
  GOD_RAY: '#c8e6a0',
} as const

/** World 3 — Sunken Ship. Cold, decayed, one warm point. */
export const WRECK = {
  WOOD: '#5a4632',
  VERDIGRIS: '#4a8f7b',
  COLD_WATER: '#2c3e50',
  LANTERN: '#ffb347',
} as const

/** World 4 — Volcanic Vents. Violent, high-contrast. */
export const VENTS = {
  BASALT: '#1a1a1a',
  MAGMA: '#ff6b35',
  SULPHUR: '#ffd23f',
  ROCK_RED: '#8b2c1f',
} as const

/** World 5 — The Abyss. Near-monochrome, alien. */
export const ABYSS = {
  ABYSS_VOID: '#050508',
  BIO_CYAN: '#00e5cc',
  BIO_MAGENTA: '#e040fb',
  SHAPE: '#1a1a2e',
} as const

/**
 * Every colour in the game, flattened. The membership test reads this.
 *
 * Duplicates across groups are intentional and collapse here — INK_CYAN and
 * BIO_CYAN are the same ink, seen in two worlds.
 */
export const MASTER: readonly string[] = [
  ...new Set([
    ...Object.values(SHARED),
    ...Object.values(SHALLOWS),
    ...Object.values(KELP),
    ...Object.values(WRECK),
    ...Object.values(VENTS),
    ...Object.values(ABYSS),
  ]),
]

export function isMasterColour(hex: string): boolean {
  return MASTER.includes(hex)
}

/** Nib's three-colour set, shared by every frame he has. */
export const NIB_PALETTE = [SHARED.INK_DARK, SHARED.NIB_BODY, SHARED.NIB_PALE]

/** Spent Nib is the same silhouette, one shade paler. PRD §9.2. */
export const NIB_SPENT_PALETTE = [SHARED.INK_DARK, SHARED.NIB_SPENT, SHARED.NIB_PALE]

/**
 * Charged Nib is a recolour of the Full set, not a redraw — darker and denser
 * with a hard sheen. A third tier costs far less art than a third character.
 */
export const NIB_CHARGED_PALETTE = [SHARED.VOID, SHARED.CHARGED_BODY, SHARED.CHARGED_RIM]
