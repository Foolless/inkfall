/**
 * Tracker playback.
 *
 * Music is authored as rows of note names, one array per channel — the same
 * shape a 1988 tracker used, and for the same reason: it is legible in a diff
 * and needs no tooling to edit.
 *
 *   pulse1:   ['C4', '-',  'E4', '.',  'G4', ...]
 *
 *   'C4'  strike this note      '-'  hold the last one
 *   '.'   rest                  '*'  noise channel: hit
 *
 * Everything about *when* a note sounds is pure arithmetic over row indices and
 * is unit-tested. Only `schedule` touches an AudioContext.
 */

import { noteToFrequency, type Apu, type Duty } from './apu.js'

export const REST = '.'
export const HOLD = '-'
export const HIT = '*'

export interface ChannelDef {
  rows: readonly string[]
  duty?: Duty
  volume?: number
  /** Rows a note rings for, as a fraction of the row length. */
  sustain?: number
}

export interface TrackDef {
  id: string
  bpm: number
  /** Rows per beat. Four is a sixteenth-note grid at 4/4. */
  rowsPerBeat: number
  pulse1?: ChannelDef
  pulse2?: ChannelDef
  triangle?: ChannelDef
  noise?: ChannelDef
}

export class TrackError extends Error {}

/** Seconds one row lasts. */
export function rowSeconds(track: TrackDef): number {
  if (!(track.bpm > 0) || !(track.rowsPerBeat > 0)) throw new TrackError(`${track.id}: bpm and rowsPerBeat must be positive`)
  return 60 / track.bpm / track.rowsPerBeat
}

export function channels(track: TrackDef): ChannelDef[] {
  return [track.pulse1, track.pulse2, track.triangle, track.noise].filter((c): c is ChannelDef => c !== undefined)
}

/**
 * How long the loop is, in rows.
 *
 * The longest channel wins and the shorter ones repeat inside it, so a bass
 * line four rows long can sit under a sixty-four-row melody without being
 * written out sixteen times.
 */
export function trackRows(track: TrackDef): number {
  const lengths = channels(track).map((c) => c.rows.length)
  if (lengths.length === 0) throw new TrackError(`${track.id}: no channels`)
  return Math.max(...lengths)
}

export function trackSeconds(track: TrackDef): number {
  return trackRows(track) * rowSeconds(track)
}

/** What a channel does on a given row of the loop. Channels wrap. */
export function cellAt(channel: ChannelDef, row: number): string {
  if (channel.rows.length === 0) return REST
  const value = channel.rows[((row % channel.rows.length) + channel.rows.length) % channel.rows.length]!
  return value.trim()
}

/**
 * How many rows a note struck at `row` should ring for.
 *
 * A run of holds after a note extends it. This is what lets a melody breathe
 * instead of machine-gunning every sixteenth.
 */
export function noteLength(channel: ChannelDef, row: number): number {
  let length = 1
  const limit = channel.rows.length
  while (length < limit && cellAt(channel, row + length) === HOLD) length++
  return length
}

export function validateTrack(track: TrackDef): void {
  rowSeconds(track)
  trackRows(track)
  for (const [name, channel] of Object.entries(track)) {
    if (typeof channel !== 'object' || channel === null || !('rows' in channel)) continue
    const def = channel as ChannelDef
    def.rows.forEach((cell, i) => {
      const value = cell.trim()
      if (value === REST || value === HOLD || value === HIT) return
      try {
        noteToFrequency(value)
      } catch {
        throw new TrackError(`${track.id}: ${name} row ${i} is ${JSON.stringify(cell)}, which is not a note`)
      }
    })
  }
}

/**
 * Plays a track by scheduling a little ahead of the clock.
 *
 * Scheduling ahead rather than firing on the frame is the whole trick: audio
 * timing has to come from the AudioContext's own clock, because a dropped
 * frame that nobody sees is a stutter everybody hears.
 */
export class Tracker {
  /** Seconds of music queued before it is needed. */
  static readonly LOOKAHEAD = 0.25

  private track: TrackDef | null = null
  private startedAt = 0
  /** The next row not yet scheduled. Counts up forever; channels wrap. */
  private cursor = 0

  constructor(
    private readonly apu: Apu,
    private readonly out: GainNode,
  ) {}

  get playing(): boolean {
    return this.track !== null
  }

  get current(): string | null {
    return this.track?.id ?? null
  }

  play(track: TrackDef, now: number): void {
    if (this.track?.id === track.id) return
    validateTrack(track)
    this.track = track
    this.startedAt = now
    this.cursor = 0
  }

  stop(): void {
    this.track = null
  }

  /** Call once a frame. Queues every row that starts inside the lookahead. */
  schedule(now: number): void {
    const track = this.track
    if (!track) return

    const step = rowSeconds(track)
    const horizon = now + Tracker.LOOKAHEAD
    while (this.startedAt + this.cursor * step < horizon) {
      const at = this.startedAt + this.cursor * step
      // A tab that was backgrounded for a minute must not now play a minute of
      // music at once; skip forward instead of catching up.
      if (at >= now - step) this.emit(track, this.cursor, at, step)
      this.cursor++
    }
  }

  private emit(track: TrackDef, row: number, at: number, step: number): void {
    const voice = (channel: ChannelDef | undefined, play: (freq: number, seconds: number) => void) => {
      if (!channel) return
      const cell = cellAt(channel, row)
      if (cell === REST || cell === HOLD) return
      const seconds = noteLength(channel, row) * step * (channel.sustain ?? 0.9)
      if (cell === HIT) play(0, seconds)
      else play(noteToFrequency(cell), seconds)
    }

    voice(track.pulse1, (f, s) =>
      this.apu.pulse(at, f, s, this.out, { duty: track.pulse1!.duty ?? 0.5, volume: track.pulse1!.volume ?? 0.34 }),
    )
    voice(track.pulse2, (f, s) =>
      this.apu.pulse(at, f, s, this.out, { duty: track.pulse2!.duty ?? 0.25, volume: track.pulse2!.volume ?? 0.24 }),
    )
    voice(track.triangle, (f, s) => this.apu.triangle(at, f, s, this.out, { volume: track.triangle!.volume ?? 0.5 }))
    voice(track.noise, (_f, s) => this.apu.noise(at, Math.min(s, 0.08), this.out, { volume: track.noise!.volume ?? 0.25 }))
  }
}
