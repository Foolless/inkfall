/**
 * Score arithmetic. PRD §8.2.
 *
 * Pure functions over numbers, tested to 100%, because scoring is the one
 * system where a player will notice a discrepancy of ten points and nobody will
 * be able to reproduce it. Keeping it free of world state is what makes that
 * coverage cheap.
 */

export const POINTS = {
  SHELL: 10,
  STOMP: 100,
  INKED: 50,
  PEARL: 5_000,
  CHARGED_KILL: 150,
  /** A Bulb or Core collected at a tier you already hold pays out instead. */
  BULB_AT_TIER: 1_000,
  CORE_AT_TIER: 2_000,
  BOSS: 5_000,
  /** Each of the three hits pays, so a fight in progress feels like progress. */
  BOSS_HIT: 500,
  LEVEL_CLEAR: 1_000,
  PER_SECOND_REMAINING: 50,
  NO_DAMAGE: 5_000,
  NO_DEATH: 10_000,
} as const

/**
 * A stomp chain, per link, with no ground contact between links.
 *
 * Caps at the fifth link rather than growing forever: the reward for a long
 * chain is that it is *possible*, not that it is worth arbitrarily much.
 */
export const STOMP_CHAIN: readonly number[] = [100, 200, 400, 800, 1000]

/** `link` is 0-based: the first stomp of a chain is link 0. */
export function stompValue(link: number): number {
  if (link < 0) throw new RangeError(`chain link cannot be negative: ${link}`)
  return STOMP_CHAIN[Math.min(link, STOMP_CHAIN.length - 1)]!
}

/** The whole chain, for a tally line on the level-clear screen. */
export function chainTotal(links: number): number {
  let total = 0
  for (let i = 0; i < links; i++) total += stompValue(i)
  return total
}

export interface ClearSummary {
  /** Seconds left on the level's par clock, floored. Never negative. */
  secondsRemaining: number
  shells: number
  pearlsFound: number
  bossDefeated: boolean
  /** Never dropped a tier this run through the level. */
  noDamage: boolean
  /** Never lost a life this run through the level. */
  noDeath: boolean
  /**
   * Everything the world scored inside the level: shells, pearls, the boss,
   * and every enemy stomped, inked or dashed through.
   *
   * The tally itemises *this same number* rather than recomputing it, which is
   * what keeps the count-up honest: the HUD ticks live as points are earned,
   * and the clear screen starts from exactly where the HUD left off instead of
   * quietly disagreeing with it.
   */
  levelPoints: number
}

export interface TallyLine {
  label: string
  points: number
}

/**
 * The itemised tally the level-clear screen counts up.
 *
 * Returned as lines rather than a total because the count-up *is* the reward
 * (PRD §8.2) — a single number would throw away the thing worth showing.
 * Zero-valued lines are dropped, except the clear bonus, which always earned.
 */
export function clearTally(s: ClearSummary): TallyLine[] {
  const seconds = Math.max(0, Math.floor(s.secondsRemaining))
  const lines: TallyLine[] = [{ label: 'LEVEL CLEAR', points: POINTS.LEVEL_CLEAR }]

  if (seconds > 0) lines.push({ label: 'TIME', points: seconds * POINTS.PER_SECOND_REMAINING })

  // The itemised half. Shells, pearls and the boss are named because the player
  // went and got them; everything else the level was worth — stomps, chains,
  // inked kills, Charged dash-throughs, a Bulb taken at a tier already held —
  // is one ENEMIES line, because "STOMP CHAIN x3" is a receipt, not a reward.
  const shells = s.shells * POINTS.SHELL
  const pearls = s.pearlsFound * POINTS.PEARL
  const boss = s.bossDefeated ? POINTS.BOSS : 0
  if (s.shells > 0) lines.push({ label: 'SHELLS', points: shells })
  if (s.pearlsFound > 0) lines.push({ label: 'PEARLS', points: pearls })
  if (s.bossDefeated) lines.push({ label: 'BOSS', points: boss })

  // Whatever the world scored that the three lines above have not claimed.
  // Derived by subtraction rather than counted separately, so the tally and the
  // HUD cannot drift apart: the lines always sum to exactly `levelPoints`.
  const enemies = s.levelPoints - shells - pearls - boss
  if (enemies > 0) lines.push({ label: 'ENEMIES', points: enemies })

  if (s.noDamage) lines.push({ label: 'NO DAMAGE', points: POINTS.NO_DAMAGE })
  if (s.noDeath) lines.push({ label: 'NO DEATH', points: POINTS.NO_DEATH })

  return lines
}

export function tallyTotal(lines: readonly TallyLine[]): number {
  return lines.reduce((sum, l) => sum + l.points, 0)
}

/**
 * Extra lives owed for a shell count. 100 shells is a life (PRD §4.5).
 *
 * Takes the count before and after so it can be called on every pickup without
 * the caller tracking thresholds — the awkward case it exists to get right is
 * a pearl and a shell crossing 100 on the same frame.
 */
export function livesEarned(before: number, after: number): number {
  return Math.floor(after / 100) - Math.floor(before / 100)
}
