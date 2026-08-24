/**
 * Playtest telemetry. PLAN.md Gate 3: "instrument deaths per section during
 * this run; that data drives Phase 4's tuning."
 *
 * Gate 3's first round came back as "I haven't been able to beat it yet", which
 * is true and unactionable — it names no room. The tuning ladder needs to know
 * *where* a run dies, and a person playing their own game is the worst possible
 * instrument for that: they remember the room that annoyed them, not the one
 * that killed them eleven times.
 *
 * ## Sections, without authoring sections
 *
 * A level's beats (A1, B2, C3) live in a comment at the top of its file and
 * nowhere the code can read. Rather than adding a field five levels would have
 * to declare — and §12.7 forbids per-level code — sections are derived: the
 * checkpoints already cut every level into four stretches, and each stretch is
 * split into equal bands. So a death lands in "B, band 2 of 3" without any
 * level knowing this file exists.
 *
 * ## Not part of the simulation
 *
 * Nothing here is read by the game. It observes, and the observation is fed in
 * by the host from state it already has, so a run with telemetry and a run
 * without produce byte-identical worlds (§12.6).
 */

/** How many bands each checkpoint-to-checkpoint stretch is cut into. */
export const BANDS_PER_STRETCH = 3

export interface SectionKey {
  level: string
  /** Which checkpoint stretch: 0 is spawn to the first conch. */
  stretch: number
  /** Which band within it. */
  band: number
}

export interface SectionStats {
  level: string
  stretch: number
  band: number
  /** Tiles the band spans, for reading the numbers against a level file. */
  fromTile: number
  toTile: number
  deaths: number
  /** Tier drops — a hit that cost a tier, not a death. */
  hits: number
}

export interface LevelStats {
  level: string
  /** Every entry, including abandoned ones. A quit is data too. */
  attempts: number
  clears: number
  deaths: number
  hits: number
  /** Frames spent, summed across attempts. */
  frames: number
  pearlsFound: number
  /** True if any attempt at this level was played in Assist Mode. */
  assisted: boolean
}

export interface Telemetry {
  sections: Map<string, SectionStats>
  levels: Map<string, LevelStats>
  /** Where the run was as of the last sample, so a death knows its own place. */
  lastX: number
  lastY: number
  startedAt: string
}

export function createTelemetry(startedAt = ''): Telemetry {
  return { sections: new Map(), levels: new Map(), lastX: 0, lastY: 0, startedAt }
}

function keyOf(k: SectionKey): string {
  return `${k.level}#${k.stretch}.${k.band}`
}

/**
 * Which section an x position falls in, given the level's checkpoint columns.
 *
 * Checkpoints are passed in as tile columns and must be sorted. The stretch
 * boundaries are `[0, ...checkpoints, width]`, so a level with three conches
 * has four stretches and twelve bands.
 */
export function sectionAt(level: string, xTile: number, checkpoints: readonly number[], widthTiles: number): SectionKey {
  const bounds = [0, ...checkpoints, widthTiles]
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = bounds[i]!
    const to = bounds[i + 1]!
    if (xTile >= to && i < bounds.length - 2) continue
    const span = Math.max(1, to - from)
    const band = Math.min(BANDS_PER_STRETCH - 1, Math.floor(((xTile - from) / span) * BANDS_PER_STRETCH))
    return { level, stretch: i, band: Math.max(0, band) }
  }
  return { level, stretch: 0, band: 0 }
}

/** The tile range a section covers, so a number can be read against a level. */
export function sectionRange(
  key: SectionKey,
  checkpoints: readonly number[],
  widthTiles: number,
): { fromTile: number; toTile: number } {
  const bounds = [0, ...checkpoints, widthTiles]
  const from = bounds[key.stretch] ?? 0
  const to = bounds[key.stretch + 1] ?? widthTiles
  const span = Math.max(1, to - from)
  return {
    fromTile: Math.round(from + (span * key.band) / BANDS_PER_STRETCH),
    toTile: Math.round(from + (span * (key.band + 1)) / BANDS_PER_STRETCH),
  }
}

function section(t: Telemetry, key: SectionKey, range: { fromTile: number; toTile: number }): SectionStats {
  const id = keyOf(key)
  let stats = t.sections.get(id)
  if (!stats) {
    stats = { ...key, ...range, deaths: 0, hits: 0 }
    t.sections.set(id, stats)
  }
  return stats
}

export function levelStats(t: Telemetry, level: string): LevelStats {
  let stats = t.levels.get(level)
  if (!stats) {
    stats = { level, attempts: 0, clears: 0, deaths: 0, hits: 0, frames: 0, pearlsFound: 0, assisted: false }
    t.levels.set(level, stats)
  }
  return stats
}

export interface Sample {
  level: string
  /** Tile columns of this level's checkpoints, ascending. */
  checkpoints: readonly number[]
  widthTiles: number
  /** Pixel position of the player this frame. */
  x: number
  y: number
  tile: number
  /** The world's monotonic death count, and the run's tier. */
  deaths: number
  tier: number
  assist: boolean
}

/**
 * Record one frame.
 *
 * Deaths and hits are *edges*, detected by the caller passing the same counters
 * every frame — this compares against what it saw last time. A death is
 * attributed to where the player was on the last frame they were alive, not to
 * where they respawned, which is the whole reason the position is sampled at
 * all rather than read when the counter moves.
 */
export function observe(t: Telemetry, s: Sample, prev: { deaths: number; tier: number } | null): void {
  const level = levelStats(t, s.level)
  level.frames++
  if (s.assist) level.assisted = true

  if (prev && s.deaths > prev.deaths) {
    const key = sectionAt(s.level, Math.floor(t.lastX / s.tile), s.checkpoints, s.widthTiles)
    const stats = section(t, key, sectionRange(key, s.checkpoints, s.widthTiles))
    stats.deaths += s.deaths - prev.deaths
    level.deaths += s.deaths - prev.deaths
  }

  // A tier drop is a hit. Going *up* is an Ink Bulb and is not.
  if (prev && s.tier < prev.tier) {
    const key = sectionAt(s.level, Math.floor(t.lastX / s.tile), s.checkpoints, s.widthTiles)
    section(t, key, sectionRange(key, s.checkpoints, s.widthTiles)).hits++
    level.hits++
  }

  t.lastX = s.x
  t.lastY = s.y
}

export function recordAttempt(t: Telemetry, level: string): void {
  levelStats(t, level).attempts++
}

export function recordClear(t: Telemetry, level: string, pearlsFound: number): void {
  const stats = levelStats(t, level)
  stats.clears++
  stats.pearlsFound = Math.max(stats.pearlsFound, pearlsFound)
}

/**
 * The whole thing as plain data, ready to be printed or pasted into an issue.
 *
 * Sections sorted by deaths, because the only question this answers is "which
 * room is killing people" and the answer should be the first line.
 */
export interface Report {
  startedAt: string
  levels: LevelStats[]
  worst: SectionStats[]
  totals: { deaths: number; hits: number; minutes: number; cleared: number }
}

export function report(t: Telemetry, limit = 12): Report {
  const levels = [...t.levels.values()]
  const sections = [...t.sections.values()].filter((s) => s.deaths > 0 || s.hits > 0)
  sections.sort((a, b) => b.deaths - a.deaths || b.hits - a.hits)
  return {
    startedAt: t.startedAt,
    levels,
    worst: sections.slice(0, limit),
    totals: {
      deaths: levels.reduce((n, l) => n + l.deaths, 0),
      hits: levels.reduce((n, l) => n + l.hits, 0),
      minutes: Math.round(levels.reduce((n, l) => n + l.frames, 0) / 3_600),
      cleared: levels.filter((l) => l.clears > 0).length,
    },
  }
}

/** The report as a table somebody can read without a spreadsheet. */
export function formatReport(r: Report): string {
  const lines: string[] = []
  lines.push(`INKFALL playtest — ${r.totals.minutes} min, ${r.totals.deaths} deaths, ${r.totals.cleared} levels cleared`)
  lines.push('')
  lines.push('LEVEL            ATTEMPTS  CLEARS  DEATHS  HITS  MIN  PEARLS  ASSIST')
  for (const l of r.levels) {
    lines.push(
      [
        l.level.padEnd(16),
        String(l.attempts).padStart(8),
        String(l.clears).padStart(8),
        String(l.deaths).padStart(8),
        String(l.hits).padStart(6),
        String(Math.round(l.frames / 3_600)).padStart(5),
        String(l.pearlsFound).padStart(8),
        l.assisted ? '   yes' : '    no',
      ].join(''),
    )
  }

  if (r.worst.length > 0) {
    lines.push('')
    lines.push('WORST SECTIONS   (stretch 0 is spawn to the first conch)')
    lines.push('LEVEL             SECTION   TILES        DEATHS  HITS')
    for (const s of r.worst) {
      lines.push(
        [
          s.level.padEnd(18),
          `${s.stretch}.${s.band}`.padEnd(10),
          `${s.fromTile}-${s.toTile}`.padEnd(13),
          String(s.deaths).padStart(6),
          String(s.hits).padStart(6),
        ].join(''),
      )
    }
  }
  return lines.join('\n')
}
