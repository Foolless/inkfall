/**
 * World 1 — The Tide Pools. PRD §10.2: "bright, bouncy, major key — the only
 * genuinely happy track".
 *
 * Eight bars in C major at 132 bpm on a sixteenth grid, which is a shade under
 * fifteen seconds. Shorter than the sixty seconds §10.2 asks for, deliberately:
 * this checkpoint is a spike whose job is to answer "does the synth sound
 * acceptable", and a loop you can hear four times in a minute answers that
 * faster than one you hear once.
 *
 * Laid out one bar per line so the shape is visible in a diff. `-` holds the
 * previous note, `.` rests, `*` strikes the noise channel.
 */

import type { TrackDef } from '../../engine/audio/tracker.js'
import { WORLD_TRACKS } from './worlds.js'

// prettier-ignore
const melody: string[] = [
  'C5','-','-','.',  'E5','-','.','.',  'G5','-','-','.',  'E5','-','.','.',
  'F5','-','-','.',  'E5','-','.','.',  'D5','-','-','-',  '.','.','.','.',
  'C5','-','-','.',  'E5','-','.','.',  'A5','-','-','.',  'G5','-','.','.',
  'E5','-','-','-',  'C5','-','-','-',  '.','.','.','.',   '.','.','.','.',
  'D5','-','-','.',  'F5','-','.','.',  'A5','-','-','.',  'F5','-','.','.',
  'G5','-','-','.',  'F5','-','.','.',  'E5','-','-','-',  '.','.','.','.',
  'C5','-','E5','-', 'G5','-','C6','-', 'B5','-','G5','-', 'E5','-','.','.',
  'C5','-','-','-',  '-','-','-','-',   '.','.','.','.',   '.','.','.','.',
]

/** The bass, on the triangle. Roots and fifths, one per beat. */
// prettier-ignore
const bass: string[] = [
  'C3','.','.','.',  'G2','.','.','.',  'C3','.','.','.',  'E3','.','.','.',
  'F2','.','.','.',  'C3','.','.','.',  'F2','.','.','.',  'A2','.','.','.',
  'C3','.','.','.',  'G2','.','.','.',  'C3','.','.','.',  'E3','.','.','.',
  'G2','.','.','.',  'D3','.','.','.',  'G2','.','.','.',  'B2','.','.','.',
  'D3','.','.','.',  'A2','.','.','.',  'D3','.','.','.',  'F3','.','.','.',
  'G2','.','.','.',  'D3','.','.','.',  'G2','.','.','.',  'B2','.','.','.',
  'C3','.','.','.',  'G2','.','.','.',  'C3','.','.','.',  'E3','.','.','.',
  'G2','.','.','.',  'G2','.','.','.',  'C3','.','.','.',  'C3','.','.','.',
]

/** The offbeat that does the bouncing: second pulse, thin duty, quiet. */
// prettier-ignore
const counter: string[] = [
  '.','E4','.','G4',  '.','C5','.','G4',  '.','E4','.','G4',  '.','C5','.','G4',
  '.','F4','.','A4',  '.','C5','.','A4',  '.','F4','.','A4',  '.','C5','.','A4',
  '.','E4','.','G4',  '.','C5','.','G4',  '.','E4','.','G4',  '.','C5','.','G4',
  '.','D4','.','G4',  '.','B4','.','G4',  '.','D4','.','G4',  '.','B4','.','G4',
  '.','F4','.','A4',  '.','D5','.','A4',  '.','F4','.','A4',  '.','D5','.','A4',
  '.','D4','.','G4',  '.','B4','.','G4',  '.','D4','.','G4',  '.','B4','.','G4',
  '.','E4','.','G4',  '.','C5','.','G4',  '.','E4','.','G4',  '.','C5','.','G4',
  '.','D4','.','G4',  '.','B4','.','G4',  '.','E4','.','G4',  '.','C5','.','G4',
]

/** One bar of percussion, repeated. Shorter channels wrap inside the loop. */
// prettier-ignore
const drums: string[] = [
  '*','.','.','.',  '*','.','*','.',  '*','.','.','.',  '*','.','*','.',
]

export const world1: TrackDef = {
  id: 'world1',
  bpm: 132,
  rowsPerBeat: 4,
  pulse1: { rows: melody, duty: 0.5, volume: 0.3 },
  pulse2: { rows: counter, duty: 0.25, volume: 0.16 },
  triangle: { rows: bass, volume: 0.42, sustain: 0.7 },
  noise: { rows: drums, volume: 0.16 },
}

/**
 * The whole soundtrack, keyed by the id a *chapter* names.
 *
 * Five tracks for five worlds, and five tracks for fifty levels later — PRD
 * §12.7's rule that chapters own music rather than levels is what keeps that
 * true. Nothing in here is looked up by level id, and nothing should be.
 */
export const TRACKS: Record<string, TrackDef> = { world1, ...WORLD_TRACKS }

export function trackFor(id: string): TrackDef | null {
  return TRACKS[id] ?? null
}
