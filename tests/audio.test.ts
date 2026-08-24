import { describe, expect, test } from 'vitest'
import { midiToFrequency, noteToFrequency, noteToMidi, pulseCoefficients } from '../src/engine/audio/apu.js'
import {
  cellAt,
  channels,
  HIT,
  HOLD,
  noteLength,
  REST,
  rowSeconds,
  TrackError,
  trackRows,
  trackSeconds,
  validateTrack,
  type TrackDef,
} from '../src/engine/audio/tracker.js'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CUES } from '../src/engine/audio/sfx.js'

/** The simulation, where cues are raised. Read off disk so nothing is missed. */
const GAME_DIR = 'src/game'
import { TRACKS, trackFor, world1 } from '../src/content/music/world1.js'
import { CHAPTERS } from '../src/content/chapters.js'

/**
 * The audio that can be tested without ears.
 *
 * Pitch, tempo, note length and pattern validation are arithmetic, and they are
 * where the bugs that make music sound *wrong* rather than *bad* live. Whether
 * it sounds good is checkpoint 2.7's judgement call, and no test can make it.
 */
describe('pitch', () => {
  test('A4 is 440 Hz', () => {
    expect(noteToFrequency('A4')).toBeCloseTo(440, 6)
    expect(noteToMidi('A4')).toBe(69)
  })

  test('middle C is MIDI 60', () => {
    expect(noteToMidi('C4')).toBe(60)
  })

  test('an octave doubles the frequency', () => {
    expect(noteToFrequency('C5') / noteToFrequency('C4')).toBeCloseTo(2, 10)
    expect(noteToFrequency('C3') / noteToFrequency('C4')).toBeCloseTo(0.5, 10)
  })

  test('sharps and flats are the same key', () => {
    expect(noteToMidi('C#4')).toBe(noteToMidi('Db4'))
    expect(noteToMidi('A#3')).toBe(noteToMidi('Bb3'))
  })

  test('the twelfth root of two, twelve times', () => {
    expect(midiToFrequency(69 + 12)).toBeCloseTo(880, 6)
    expect(noteToFrequency('E4') / noteToFrequency('C4')).toBeCloseTo(Math.pow(2, 4 / 12), 10)
  })

  /** A wrong note is a bug; a silently-wrong note is a bug you cannot find. */
  test('nonsense throws rather than playing something arbitrary', () => {
    for (const bad of ['H4', 'C', '4C', '', 'C##4', 'Cb']) {
      expect(() => noteToMidi(bad), bad).toThrow()
    }
  })
})

describe('pulse waves', () => {
  test('a 50% duty cancels every even harmonic — that is the hollow sound', () => {
    const { imag } = pulseCoefficients(0.5)
    for (let n = 2; n < imag.length; n += 2) expect(imag[n]).toBeCloseTo(0, 10)
    expect(Math.abs(imag[1]!)).toBeGreaterThan(0.5)
  })

  test('a 12.5% duty keeps them, which is what makes it thin and reedy', () => {
    const { imag } = pulseCoefficients(0.125)
    expect(Math.abs(imag[2]!)).toBeGreaterThan(0.1)
  })

  test('the DC term is zero, so a voice never carries an offset', () => {
    for (const duty of [0.125, 0.25, 0.5, 0.75] as const) {
      expect(pulseCoefficients(duty).imag[0]).toBe(0)
      expect(pulseCoefficients(duty).real[0]).toBe(0)
    }
  })

  test('harmonics fall away as 1/n, so nothing screams', () => {
    const { imag } = pulseCoefficients(0.25, 16)
    expect(Math.abs(imag[9]!)).toBeLessThan(Math.abs(imag[1]!))
  })

  test('25% and 75% are mirror images — the same timbre, inverted', () => {
    const a = pulseCoefficients(0.25).imag
    const b = pulseCoefficients(0.75).imag
    for (let n = 1; n < a.length; n++) expect(Math.abs(a[n]!)).toBeCloseTo(Math.abs(b[n]!), 10)
  })
})

describe('the tracker grid', () => {
  const track = (over: Partial<TrackDef> = {}): TrackDef => ({
    id: 'test',
    bpm: 120,
    rowsPerBeat: 4,
    pulse1: { rows: ['C4', HOLD, REST, 'E4'] },
    ...over,
  })

  test('a row at 120 bpm on a sixteenth grid is an eighth of a second', () => {
    expect(rowSeconds(track())).toBeCloseTo(0.125, 10)
  })

  test('a non-positive tempo is rejected rather than dividing by zero', () => {
    expect(() => rowSeconds(track({ bpm: 0 }))).toThrow(TrackError)
    expect(() => rowSeconds(track({ rowsPerBeat: 0 }))).toThrow(TrackError)
  })

  test('a track with no channels is rejected', () => {
    expect(() => trackRows({ id: 'empty', bpm: 120, rowsPerBeat: 4 })).toThrow(TrackError)
  })

  /**
   * Shorter channels wrap. That is what lets a one-bar drum pattern sit under
   * an eight-bar melody without being written out eight times.
   */
  test('the loop is as long as its longest channel, and short ones repeat inside it', () => {
    const t = track({ pulse1: { rows: ['C4', 'D4'] }, noise: { rows: [HIT, REST, REST, REST, REST, REST, REST, REST] } })
    expect(trackRows(t)).toBe(8)
    expect(cellAt(t.pulse1!, 0)).toBe('C4')
    expect(cellAt(t.pulse1!, 2)).toBe('C4')
    expect(cellAt(t.pulse1!, 5)).toBe('D4')
  })

  test('a negative row index still wraps forward', () => {
    expect(cellAt({ rows: ['A', 'B', 'C'] }, -1)).toBe('C')
  })

  test('an empty channel rests rather than throwing', () => {
    expect(cellAt({ rows: [] }, 3)).toBe(REST)
  })

  test('a run of holds extends the note it follows', () => {
    const channel = { rows: ['C4', HOLD, HOLD, REST, 'E4'] }
    expect(noteLength(channel, 0)).toBe(3)
    expect(noteLength(channel, 4)).toBe(1)
  })

  test('a note held to the end of the loop does not wrap round forever', () => {
    const channel = { rows: ['C4', HOLD, HOLD, HOLD] }
    expect(noteLength(channel, 0)).toBe(4)
  })

  test('the loop length in seconds is rows times row length', () => {
    const t = track({ pulse1: { rows: new Array(32).fill(REST) } })
    expect(trackSeconds(t)).toBeCloseTo(32 * 0.125, 10)
  })

  test('channels() lists only what the track actually declares', () => {
    expect(channels(track())).toHaveLength(1)
    expect(channels(track({ triangle: { rows: ['C2'] } }))).toHaveLength(2)
  })
})

describe('track validation', () => {
  test('a cell that is not a note, a rest or a hold is rejected, naming the row', () => {
    const bad: TrackDef = { id: 'bad', bpm: 120, rowsPerBeat: 4, pulse1: { rows: ['C4', 'wobble'] } }
    expect(() => validateTrack(bad)).toThrow(/row 1/)
  })

  test('rests, holds and noise hits all pass', () => {
    const t: TrackDef = { id: 'ok', bpm: 120, rowsPerBeat: 4, noise: { rows: [HIT, REST, HOLD] } }
    expect(() => validateTrack(t)).not.toThrow()
  })

  test('whitespace around a note is forgiven', () => {
    expect(() => validateTrack({ id: 'ws', bpm: 120, rowsPerBeat: 4, pulse1: { rows: [' C4 '] } })).not.toThrow()
  })
})

describe("World 1's theme", () => {
  test('validates', () => {
    expect(() => validateTrack(world1)).not.toThrow()
  })

  test('is registered under the id its chapter names', () => {
    expect(trackFor('world1')).toBe(world1)
    expect(trackFor('nope')).toBeNull()
    expect(Object.keys(TRACKS)).toContain('world1')
  })

  test('uses all four channels — it is an APU, not an organ', () => {
    expect(channels(world1)).toHaveLength(4)
  })

  test('is eight bars, and loops in a handful of seconds', () => {
    expect(trackRows(world1)).toBe(8 * 16)
    expect(trackSeconds(world1)).toBeGreaterThan(10)
    expect(trackSeconds(world1)).toBeLessThan(20)
  })

  /** "Bright, bouncy, major key" (PRD §10.2). It should end where it started. */
  test('opens and closes on the tonic', () => {
    expect(cellAt(world1.pulse1!, 0)).toBe('C5')
    expect(cellAt(world1.triangle!, 0)).toBe('C3')
    expect(cellAt(world1.pulse1!, 8 * 16 - 16)).toBe('C5')
  })

  test('the melody sits above the bass, with no crossing', () => {
    const pitches = (rows: readonly string[]) =>
      rows.filter((r) => r !== REST && r !== HOLD).map((r) => noteToFrequency(r))
    expect(Math.min(...pitches(world1.pulse1!.rows))).toBeGreaterThan(Math.max(...pitches(world1.triangle!.rows)))
  })

  test('the drum pattern is one bar, and wraps under everything else', () => {
    expect(world1.noise!.rows).toHaveLength(16)
    expect(cellAt(world1.noise!, 0)).toBe(HIT)
    expect(cellAt(world1.noise!, 16)).toBe(HIT)
  })
})

describe('sound cues', () => {
  test('the list has no duplicates', () => {
    expect(new Set(CUES).size).toBe(CUES.length)
  })

  /**
   * The bug this exists to stop coming back.
   *
   * Six cues — `shoot`, `bomb`, `blast`, `inkKill`, `inkStun`, `upgrade` —
   * plus `cling` were raised by the game for a whole phase and silently
   * dropped by the synth, because the host cast them to the audio layer's
   * narrower type on the way in. The vocabulary now lives in game/cues.ts and
   * both sides share it, but a grep is what catches the *next* one: a cue that
   * appears in the simulation and not in the list.
   */
  test('every cue string the simulation pushes is a cue the synth knows', () => {
    const sources = readdirSync(GAME_DIR, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(join(GAME_DIR, f), 'utf8'))

    const raised = new Set<string>()
    for (const src of sources) {
      for (const [, cue] of src.matchAll(/cues[?]?\.push\(\s*'([a-zA-Z]+)'/g)) raised.add(cue!)
      // The ternary form: `push(cond ? 'a' : 'b')`.
      for (const [, a, b] of src.matchAll(/cues[?]?\.push\([^)]*\?\s*'([a-zA-Z]+)'\s*:\s*'([a-zA-Z]+)'/g)) {
        raised.add(a!)
        raised.add(b!)
      }
    }

    expect(raised.size, 'found no cues at all — the pattern stopped matching').toBeGreaterThan(10)
    for (const cue of raised) {
      expect(CUES, `${cue} is raised by the game but the synth has no case for it`).toContain(cue)
    }
  })

  /** §10.3's roster. Every one of these is a sound the design asked for. */
  test('§10.3 is covered, including the ones that were missing', () => {
    for (const cue of [
      'jump', 'swim', 'dash', 'chargedDash', 'bonk', 'stomp', 'enemyDeath',
      'shoot', 'bomb', 'blast', 'clingGrip', 'clingSlip', 'shrink', 'bulb',
      'core', 'shell', 'pearl', 'checkpoint', 'death', 'bossHit', 'bossDeath',
      'magma', 'pressure', 'menu', 'inkKill', 'inkStun', 'upgrade',
    ]) {
      expect(CUES, `§10.3 asks for ${cue}`).toContain(cue)
    }
  })

  test('there are the two dozen §10.3 asks for, not five', () => {
    expect(CUES.length).toBeGreaterThanOrEqual(26)
  })
})


/**
 * The whole soundtrack. PRD §10.2, and §12.7's rule that chapters own music.
 *
 * The load-bearing assertion is the last one: **the descent is audible.** Every
 * world's bass is lower than the last, which is the one property that makes
 * five separately-authored loops feel like one journey rather than five songs.
 */
describe('the five world themes', () => {
  const WORLDS = ['world1', 'world2', 'world3', 'world4', 'world5'] as const

  test('every chapter names a track, and every track exists', () => {
    for (const chapter of Object.values(CHAPTERS)) {
      if (chapter.id === 'test') continue
      expect(trackFor(chapter.music), `${chapter.id} names ${chapter.music}`).not.toBeNull()
    }
  })

  test('one track per chapter, and no orphans', () => {
    const named = Object.values(CHAPTERS)
      .map((c) => c.music)
      .filter((m) => m !== 'none')
    expect(new Set(named).size).toBe(named.length)
    expect(new Set(named)).toEqual(new Set(Object.keys(TRACKS)))
  })

  for (const id of WORLDS) {
    describe(id, () => {
      const track = trackFor(id)!

      test('it is a valid track', () => {
        expect(() => validateTrack(track)).not.toThrow()
      })

      test('it uses all four channels', () => {
        expect(channels(track)).toHaveLength(4)
      })

      test('it is eight bars on a sixteenth grid', () => {
        expect(track.rowsPerBeat).toBe(4)
        expect(trackRows(track)).toBe(8 * 16)
      })

      test('it loops in well under a minute, so it can be judged quickly', () => {
        expect(trackSeconds(track)).toBeGreaterThan(10)
        expect(trackSeconds(track)).toBeLessThan(35)
      })

      test('the bass sits below the melody, everywhere', () => {
        const low = Math.max(...pitches(track.triangle!.rows))
        const high = Math.min(...pitches(track.pulse1!.rows))
        expect(high).toBeGreaterThan(low)
      })

      test('the drums are one bar, repeated inside the loop', () => {
        expect(track.noise!.rows).toHaveLength(16)
      })
    })
  }

  /**
   * The game goes down, and so does the music. Each world's lowest bass note is
   * below the last one's — the single property that turns five loops into a
   * descent.
   */
  test('each world sits lower than the one before it', () => {
    const floors = WORLDS.map((id) => Math.min(...pitches(trackFor(id)!.triangle!.rows)))
    for (let i = 1; i < floors.length; i++) {
      expect(floors[i], `${WORLDS[i]} is not below ${WORLDS[i - 1]}`).toBeLessThan(floors[i - 1]!)
    }
  })

  /**
   * §7.7's saw-tooth, in tempo. World 4 is the fastest thing in the game and
   * World 5 is the slowest, which is why the descent is not a five-world
   * diminuendo nobody would notice.
   */
  test('the tempo is not a straight ramp', () => {
    const bpm = WORLDS.map((id) => trackFor(id)!.bpm)
    expect(Math.max(...bpm)).toBe(trackFor('world4')!.bpm)
    expect(Math.min(...bpm)).toBe(trackFor('world5')!.bpm)
    // Not monotonic: somewhere in the five it goes back up.
    const descending = bpm.every((v, i) => i === 0 || v <= bpm[i - 1]!)
    expect(descending).toBe(false)
  })
})

function pitches(rows: readonly string[]): number[] {
  return rows
    .map((r) => r.trim())
    .filter((r) => r !== '.' && r !== '-' && r !== '*')
    .map(noteToFrequency)
}
