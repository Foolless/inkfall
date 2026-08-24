/**
 * Worlds 2 through 5, and the descent they describe. PRD §10.2.
 *
 * One theme per chapter, never per level (§12.7) — five tracks for five worlds
 * now, and five tracks for fifty levels later. That is the constraint that
 * makes the long-term plan an audio budget anyone could meet.
 *
 * Each track is eight bars on a sixteenth grid, laid out one bar per line so
 * the shape is visible in a diff. `-` holds the previous note, `.` rests, `*`
 * strikes the noise channel.
 *
 * ## The descent, as key and tempo
 *
 * The game goes down, and so does the music. World 1 is C major at 132 — the
 * only genuinely happy track. From there:
 *
 *   W2  A minor, 120    still tonal, but the major third is gone
 *   W3  D minor, 108    slower, and the bass starts moving in half steps
 *   W4  E phrygian, 144 fast and wrong-sounding; the flat second does that
 *   W5  C minor, 92     the slowest and the sparsest. Mostly triangle.
 *
 * And each world's bass floor is below the last one's — F2, E2, D2, C2, F1.
 * That is the single property that makes five separately-authored loops feel
 * like one journey rather than five songs, and it is asserted in the tests
 * because it is exactly the kind of thing that erodes silently.
 *
 * The tempo is not monotonic on purpose. World 4 is the fastest thing in the
 * game and World 5 is the slowest, which is the same saw-tooth §7.7 asks the
 * difficulty curve to have — a straight ramp from 132 to 92 would be a
 * five-world diminuendo and nobody would notice it happening.
 *
 * **Checkpoint 2.7's judgement call is still open.** The APU and the tracker
 * are tested, and everything checkable here is checked — pitch, tempo, note
 * length, harmonic structure. Whether it *sounds good* needs ears, and these
 * four tracks are the reason that answer is now worth eleven tracks of
 * commitment in Phase 4 rather than one.
 */

import type { TrackDef } from '../../engine/audio/tracker.js'

// ── World 2 · The Kelp Forest ───────────────────────────────────────────────
// A minor at 120. Filtered and close, like the world: the melody sits low and
// the counter-line drifts above it rather than answering it.

// prettier-ignore
const kelpMelody: string[] = [
  'A4','-','-','.',  'C5','-','.','.',  'E5','-','-','.',  'C5','-','.','.',
  'D5','-','-','.',  'C5','-','.','.',  'B4','-','-','-',  '.','.','.','.',
  'A4','-','-','.',  'E5','-','.','.',  'G5','-','-','.',  'E5','-','.','.',
  'F5','-','-','-',  'E5','-','-','-',  'D5','-','-','-',  '.','.','.','.',
  'C5','-','-','.',  'E5','-','.','.',  'A5','-','-','.',  'G5','-','.','.',
  'F5','-','-','.',  'E5','-','.','.',  'D5','-','-','-',  'C5','-','.','.',
  'B4','-','D5','-', 'F5','-','A5','-', 'G5','-','E5','-', 'C5','-','.','.',
  'A4','-','-','-',  '-','-','-','-',   '.','.','.','.',   '.','.','.','.',
]

// prettier-ignore
const kelpBass: string[] = [
  'A2','.','.','.',  'E2','.','.','.',  'A2','.','.','.',  'C3','.','.','.',
  'D3','.','.','.',  'A2','.','.','.',  'E2','.','.','.',  'G2','.','.','.',
  'A2','.','.','.',  'E2','.','.','.',  'A2','.','.','.',  'C3','.','.','.',
  'F2','.','.','.',  'C3','.','.','.',  'G2','.','.','.',  'D3','.','.','.',
  'F2','.','.','.',  'C3','.','.','.',  'F2','.','.','.',  'A2','.','.','.',
  'D3','.','.','.',  'A2','.','.','.',  'G2','.','.','.',  'B2','.','.','.',
  'E2','.','.','.',  'B2','.','.','.',  'E2','.','.','.',  'G2','.','.','.',
  'A2','.','.','.',  'A2','.','.','.',  'E2','.','.','.',  'E2','.','.','.',
]

// prettier-ignore
const kelpCounter: string[] = [
  '.','.','E4','.',  '.','A4','.','.',  '.','.','E4','.',  '.','A4','.','.',
  '.','.','F4','.',  '.','A4','.','.',  '.','.','D4','.',  '.','G4','.','.',
  '.','.','E4','.',  '.','A4','.','.',  '.','.','E4','.',  '.','C5','.','.',
  '.','.','F4','.',  '.','A4','.','.',  '.','.','G4','.',  '.','B4','.','.',
  '.','.','A4','.',  '.','C5','.','.',  '.','.','A4','.',  '.','F4','.','.',
  '.','.','D4','.',  '.','A4','.','.',  '.','.','G4','.',  '.','B4','.','.',
  '.','.','E4','.',  '.','B4','.','.',  '.','.','E4','.',  '.','G4','.','.',
  '.','.','A4','.',  '.','E4','.','.',  '.','.','A4','.',  '.','.','.','.',
]

// prettier-ignore
const kelpDrums: string[] = [
  '*','.','.','.',  '.','.','*','.',  '*','.','.','.',  '.','*','.','.',
]

export const world2: TrackDef = {
  id: 'world2',
  bpm: 120,
  rowsPerBeat: 4,
  pulse1: { rows: kelpMelody, duty: 0.5, volume: 0.28 },
  pulse2: { rows: kelpCounter, duty: 0.125, volume: 0.14 },
  triangle: { rows: kelpBass, volume: 0.44, sustain: 0.85 },
  noise: { rows: kelpDrums, volume: 0.13 },
}

// ── World 3 · The Sunken Ship ───────────────────────────────────────────────
// D minor at 108. The bass moves in half steps under a held melody, which is
// the cheapest way to make a room feel like it is settling around you.

// prettier-ignore
const wreckMelody: string[] = [
  'D5','-','-','-',  '-','-','.','.',  'F5','-','-','-',  '-','-','.','.',
  'E5','-','-','-',  'D5','-','-','-',  'C5','-','-','-',  '.','.','.','.',
  'D5','-','-','-',  '-','-','.','.',  'A5','-','-','-',  '-','-','.','.',
  'G5','-','-','-',  'F5','-','-','-',  'E5','-','-','-',  '.','.','.','.',
  'F5','-','.','.',  'E5','-','.','.',  'D5','-','.','.',  'C5','-','.','.',
  'B4','-','-','-',  'C5','-','-','-',  'D5','-','-','-',  '.','.','.','.',
  'A4','-','-','.',  'D5','-','-','.',  'F5','-','-','.',  'A5','-','.','.',
  'D5','-','-','-',  '-','-','-','-',   '.','.','.','.',   '.','.','.','.',
]

/**
 * The half-step walk that makes the room feel like it is settling around you.
 *
 * Voiced from A2 down to D2 rather than an octave lower, which it was first.
 * The descent through the five worlds has to be monotonic — each world's floor
 * below the last — and a World 3 that reached G1 undercut World 4 entirely,
 * which made the fourth world sound like a step back up. Audible, once you
 * knew to listen for it; caught by a test before anyone had to.
 */
// prettier-ignore
const wreckBass: string[] = [
  'A2','.','.','.',  'A2','.','.','.',  'G#2','.','.','.', 'G#2','.','.','.',
  'G2','.','.','.',  'G2','.','.','.',  'F#2','.','.','.', 'F#2','.','.','.',
  'F2','.','.','.',  'F2','.','.','.',  'E2','.','.','.',  'E2','.','.','.',
  'D2','.','.','.',  'D2','.','.','.',  'A2','.','.','.',  'A2','.','.','.',
  'F2','.','.','.',  'F2','.','.','.',  'E2','.','.','.',  'E2','.','.','.',
  'D2','.','.','.',  'D2','.','.','.',  'E2','.','.','.',  'E2','.','.','.',
  'D2','.','.','.',  'D2','.','.','.',  'F2','.','.','.',  'F2','.','.','.',
  'A2','.','.','.',  'A2','.','.','.',  'D2','.','.','.',  'D2','.','.','.',
]

// prettier-ignore
const wreckCounter: string[] = [
  '.','.','.','A4',  '.','.','.','.',   '.','.','.','A4',  '.','.','.','.',
  '.','.','.','G4',  '.','.','.','.',   '.','.','.','F4',  '.','.','.','.',
  '.','.','.','A4',  '.','.','.','.',   '.','.','.','D5',  '.','.','.','.',
  '.','.','.','C5',  '.','.','.','.',   '.','.','.','A4',  '.','.','.','.',
  '.','.','.','D5',  '.','.','.','.',   '.','.','.','C5',  '.','.','.','.',
  '.','.','.','G4',  '.','.','.','.',   '.','.','.','A4',  '.','.','.','.',
  '.','.','.','F4',  '.','.','.','.',   '.','.','.','A4',  '.','.','.','.',
  '.','.','.','D5',  '.','.','.','.',   '.','.','.','A4',  '.','.','.','.',
]

// prettier-ignore
const wreckDrums: string[] = [
  '*','.','.','.',  '.','.','.','.',  '.','.','*','.',  '.','.','.','.',
]

export const world3: TrackDef = {
  id: 'world3',
  bpm: 108,
  rowsPerBeat: 4,
  pulse1: { rows: wreckMelody, duty: 0.25, volume: 0.26 },
  pulse2: { rows: wreckCounter, duty: 0.125, volume: 0.12 },
  triangle: { rows: wreckBass, volume: 0.5, sustain: 0.95 },
  noise: { rows: wreckDrums, volume: 0.11 },
}

// ── World 4 · The Volcanic Vents ────────────────────────────────────────────
// E phrygian at 144. The flat second is the whole idea: it is the interval that
// makes a fast major-ish line sound *wrong*, and World 4 is the fastest and
// most hostile world in the game.

// prettier-ignore
const ventsMelody: string[] = [
  'E5','-','F5','-',  'E5','-','.','.',  'G5','-','F5','-',  'E5','-','.','.',
  'F5','-','E5','-',  'D5','-','.','.',  'E5','-','-','-',   '.','.','.','.',
  'E5','-','F5','-',  'G5','-','A5','-', 'B5','-','A5','-',  'G5','-','.','.',
  'F5','-','E5','-',  'F5','-','G5','-', 'E5','-','-','-',   '.','.','.','.',
  'B5','-','A5','-',  'G5','-','F5','-', 'E5','-','F5','-',  'G5','-','.','.',
  'A5','-','G5','-',  'F5','-','E5','-', 'D5','-','E5','-',  'F5','-','.','.',
  'E5','.','E5','.',  'F5','.','F5','.', 'E5','.','D5','.',  'C5','-','.','.',
  'E5','-','-','-',   '-','-','.','.',   'F5','-','E5','-',  '.','.','.','.',
]

// prettier-ignore
const ventsBass: string[] = [
  'E2','.','E2','.',  'F2','.','.','.',  'E2','.','E2','.',  'F2','.','.','.',
  'D2','.','D2','.',  'E2','.','.','.',  'E2','.','E2','.',  'E2','.','.','.',
  'E2','.','E2','.',  'F2','.','.','.',  'G2','.','G2','.',  'A2','.','.','.',
  'F2','.','F2','.',  'E2','.','.','.',  'E2','.','E2','.',  'E2','.','.','.',
  'C3','.','C3','.',  'B2','.','.','.',  'A2','.','A2','.',  'G2','.','.','.',
  'F2','.','F2','.',  'E2','.','.','.',  'D2','.','D2','.',  'F2','.','.','.',
  'E2','.','E2','.',  'F2','.','F2','.', 'E2','.','D2','.',  'C2','.','.','.',
  'E2','.','E2','.',  'E2','.','.','.',  'F2','.','E2','.',  'E2','.','.','.',
]

// prettier-ignore
const ventsCounter: string[] = [
  'B4','.','.','.',  'C5','.','.','.',  'B4','.','.','.',  'C5','.','.','.',
  'A4','.','.','.',  'B4','.','.','.',  'B4','.','.','.',  'B4','.','.','.',
  'B4','.','.','.',  'C5','.','.','.',  'D5','.','.','.',  'E5','.','.','.',
  'C5','.','.','.',  'B4','.','.','.',  'B4','.','.','.',  'B4','.','.','.',
  'E5','.','.','.',  'D5','.','.','.',  'C5','.','.','.',  'B4','.','.','.',
  'A4','.','.','.',  'B4','.','.','.',  'A4','.','.','.',  'C5','.','.','.',
  'B4','.','.','.',  'C5','.','.','.',  'B4','.','.','.',  'G4','.','.','.',
  'B4','.','.','.',  'B4','.','.','.',  'C5','.','.','.',  'B4','.','.','.',
]

// prettier-ignore
const ventsDrums: string[] = [
  '*','.','*','.',  '*','.','*','.',  '*','.','*','.',  '*','*','*','.',
]

export const world4: TrackDef = {
  id: 'world4',
  bpm: 144,
  rowsPerBeat: 4,
  pulse1: { rows: ventsMelody, duty: 0.5, volume: 0.3 },
  pulse2: { rows: ventsCounter, duty: 0.25, volume: 0.15 },
  triangle: { rows: ventsBass, volume: 0.46, sustain: 0.55 },
  noise: { rows: ventsDrums, volume: 0.17 },
}

// ── World 5 · The Abyss ─────────────────────────────────────────────────────
// C minor at 92. The slowest and the sparsest: the melody is long held notes
// with silence between them, and for two bars there is nothing but the bass.
//
// §7.6 calls A1 "the scariest room in the game is empty", and the track has to
// agree with that. A dense loop under a six-screen descent in total darkness
// would fill the space the room is made of.

// prettier-ignore
const abyssMelody: string[] = [
  'C5','-','-','-',  '-','-','-','-',   '.','.','.','.',   '.','.','.','.',
  'D#5','-','-','-', '-','-','.','.',   'C5','-','-','-',  '.','.','.','.',
  '.','.','.','.',   '.','.','.','.',   '.','.','.','.',   '.','.','.','.',
  'G5','-','-','-',  '-','-','-','-',   'D#5','-','-','-', '.','.','.','.',
  'F5','-','-','-',  '-','-','.','.',   'D#5','-','-','-', '.','.','.','.',
  'D5','-','-','-',  'C5','-','-','-',  '.','.','.','.',   '.','.','.','.',
  '.','.','.','.',   'G4','-','-','-',  'A#4','-','-','-', 'C5','-','.','.',
  'C5','-','-','-',  '-','-','-','-',   '-','-','.','.',   '.','.','.','.',
]

// prettier-ignore
const abyssBass: string[] = [
  'C2','.','.','.',  '.','.','.','.',   'C2','.','.','.',  '.','.','.','.',
  'G#1','.','.','.', '.','.','.','.',   'G#1','.','.','.', '.','.','.','.',
  'A#1','.','.','.', '.','.','.','.',   'A#1','.','.','.', '.','.','.','.',
  'G1','.','.','.',  '.','.','.','.',   'G1','.','.','.',  '.','.','.','.',
  'F1','.','.','.',  '.','.','.','.',   'F1','.','.','.',  '.','.','.','.',
  'G1','.','.','.',  '.','.','.','.',   'G1','.','.','.',  '.','.','.','.',
  'G#1','.','.','.', '.','.','.','.',   'A#1','.','.','.', '.','.','.','.',
  'C2','.','.','.',  '.','.','.','.',   'C2','.','.','.',  '.','.','.','.',
]

/** Two notes a bar, and both of them a long way from the melody. */
// prettier-ignore
const abyssCounter: string[] = [
  '.','.','.','.',   '.','.','G3','-',  '.','.','.','.',   '.','.','.','.',
  '.','.','.','.',   '.','.','D#3','-', '.','.','.','.',   '.','.','.','.',
  '.','.','.','.',   '.','.','F3','-',  '.','.','.','.',   '.','.','.','.',
  '.','.','.','.',   '.','.','A#3','-', '.','.','.','.',   '.','.','.','.',
  '.','.','.','.',   '.','.','C4','-',  '.','.','.','.',   '.','.','.','.',
  '.','.','.','.',   '.','.','G3','-',  '.','.','.','.',   '.','.','.','.',
  '.','.','.','.',   '.','.','D#3','-', '.','.','.','.',   '.','.','.','.',
  '.','.','.','.',   '.','.','G3','-',  '.','.','.','.',   '.','.','.','.',
]

/** One hit a bar. In the abyss, percussion is a sound rather than a rhythm. */
// prettier-ignore
const abyssDrums: string[] = [
  '*','.','.','.',  '.','.','.','.',  '.','.','.','.',  '.','.','.','.',
]

export const world5: TrackDef = {
  id: 'world5',
  bpm: 92,
  rowsPerBeat: 4,
  pulse1: { rows: abyssMelody, duty: 0.125, volume: 0.2 },
  pulse2: { rows: abyssCounter, duty: 0.125, volume: 0.1 },
  triangle: { rows: abyssBass, volume: 0.52, sustain: 1 },
  noise: { rows: abyssDrums, volume: 0.08 },
}

export const WORLD_TRACKS: Record<string, TrackDef> = { world2, world3, world4, world5 }
