/**
 * Sound effects, and the gesture gate in front of all of them.
 *
 * Browsers will not start an AudioContext until the player has touched
 * something, which is why the title screen's "PRESS SPACE" exists at all
 * (PRD §10.4). Everything here is safe to call before that: it queues nothing,
 * throws nothing, and simply does not make a sound.
 *
 * Every cue in PRD §10.3 also has a visual counterpart in the renderer, per the
 * accessibility rule in §13 — the audio is never the only channel.
 */

import { Apu, noteToFrequency, type AudioHost } from './apu.js'
import { Tracker, type TrackDef } from './tracker.js'

export type Cue =
  | 'jump'
  | 'swim'
  /** The signature sound: a wet pressurised burst. */
  | 'dash'
  | 'chargedDash'
  | 'bonk'
  | 'stomp'
  | 'shell'
  | 'pearl'
  | 'bulb'
  | 'core'
  | 'shrink'
  | 'death'
  | 'checkpoint'
  | 'bossHit'
  | 'menu'

export interface AudioSettings {
  musicVolume: number
  sfxVolume: number
  muted: boolean
}

/**
 * The whole audio surface. One object, created before the gesture and started
 * after it, so callers never have to ask whether sound is available yet.
 */
export class Audio {
  private apu: Apu | null = null
  private tracker: Tracker | null = null
  private ctx: (AudioHost & { resume?: () => Promise<void> }) | null = null
  private pending: TrackDef | null = null
  private settings: AudioSettings = { musicVolume: 0.7, sfxVolume: 0.9, muted: false }

  get started(): boolean {
    return this.apu !== null
  }

  /** Called from a real user gesture, and only then. Safe to call twice. */
  start(ctx: AudioHost & { resume?: () => Promise<void> }): void {
    if (this.apu) return
    this.ctx = ctx
    this.apu = new Apu(ctx)
    this.tracker = new Tracker(this.apu, this.apu.musicGain)
    this.applySettings()
    void ctx.resume?.()
    if (this.pending) {
      this.playMusic(this.pending)
      this.pending = null
    }
  }

  configure(settings: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...settings }
    this.applySettings()
  }

  /** One keystroke, at any time, per PRD §10.4. */
  toggleMute(): boolean {
    this.settings.muted = !this.settings.muted
    this.applySettings()
    return this.settings.muted
  }

  get muted(): boolean {
    return this.settings.muted
  }

  private applySettings(): void {
    if (!this.apu) return
    const { musicVolume, sfxVolume, muted } = this.settings
    this.apu.musicGain.gain.value = muted ? 0 : musicVolume
    this.apu.sfxGain.gain.value = muted ? 0 : sfxVolume
  }

  playMusic(track: TrackDef): void {
    if (!this.tracker || !this.ctx) {
      // Asked for before the gesture: remember it and start it when we can.
      this.pending = track
      return
    }
    this.tracker.play(track, this.ctx.currentTime)
  }

  stopMusic(): void {
    this.tracker?.stop()
    this.pending = null
  }

  get nowPlaying(): string | null {
    return this.tracker?.current ?? this.pending?.id ?? null
  }

  /** Call once a frame. Does nothing until the context exists. */
  update(): void {
    if (!this.tracker || !this.ctx) return
    this.tracker.schedule(this.ctx.currentTime)
  }

  play(cue: Cue): void {
    const apu = this.apu
    const ctx = this.ctx
    if (!apu || !ctx) return
    const at = ctx.currentTime
    const out = apu.sfxGain

    switch (cue) {
      case 'jump':
        apu.pulse(at, noteToFrequency('C5'), 0.09, out, { duty: 0.25, glide: 14, volume: 0.3 })
        return
      case 'swim':
        apu.noise(at, 0.07, out, { volume: 0.16 })
        apu.pulse(at, noteToFrequency('G4'), 0.08, out, { duty: 0.5, glide: 8, volume: 0.16 })
        return
      /**
       * The game's signature sound. A wet pressurised burst: a short noise
       * transient for the spray, under a pulse falling fast for the jet.
       */
      case 'dash':
        apu.noise(at, 0.06, out, { volume: 0.3 })
        apu.pulse(at, noteToFrequency('A5'), 0.16, out, { duty: 0.125, glide: -26, volume: 0.34 })
        return
      /** The same sound an octave down, with grit. Charged should feel heavier. */
      case 'chargedDash':
        apu.noise(at, 0.1, out, { volume: 0.42 })
        apu.pulse(at, noteToFrequency('A4'), 0.22, out, { duty: 0.125, glide: -26, volume: 0.4 })
        return
      case 'bonk':
        apu.noise(at, 0.09, out, { volume: 0.3 })
        apu.triangle(at, noteToFrequency('E2'), 0.12, out, { volume: 0.5 })
        return
      case 'stomp':
        apu.noise(at, 0.05, out, { volume: 0.32 })
        apu.pulse(at, noteToFrequency('E4'), 0.07, out, { duty: 0.5, glide: 20, volume: 0.3 })
        return
      case 'shell':
        apu.pulse(at, noteToFrequency('E6'), 0.05, out, { duty: 0.125, volume: 0.22 })
        return
      /** Three notes, audible from six tiles away. A mechanic, not decoration. */
      case 'pearl':
        apu.pulse(at, noteToFrequency('E5'), 0.12, out, { duty: 0.25, volume: 0.3 })
        apu.pulse(at + 0.12, noteToFrequency('A5'), 0.12, out, { duty: 0.25, volume: 0.3 })
        apu.pulse(at + 0.24, noteToFrequency('C#6'), 0.3, out, { duty: 0.25, volume: 0.3 })
        return
      /** A rising two-note sting, so growing is unmistakably good news. */
      case 'bulb':
        apu.pulse(at, noteToFrequency('C5'), 0.1, out, { duty: 0.5, volume: 0.32 })
        apu.pulse(at + 0.1, noteToFrequency('G5'), 0.2, out, { duty: 0.5, volume: 0.32 })
        return
      /** The only bass-heavy sound in the game. A Core should land like a rock. */
      case 'core':
        apu.triangle(at, noteToFrequency('C2'), 0.5, out, { volume: 0.8 })
        apu.noise(at, 0.16, out, { volume: 0.3 })
        return
      /** A descending wet gasp. The sound of losing a pip you were counting on. */
      case 'shrink':
        apu.pulse(at, noteToFrequency('G4'), 0.3, out, { duty: 0.125, glide: -18, volume: 0.34 })
        apu.noise(at, 0.14, out, { volume: 0.24 })
        return
      case 'death':
        apu.pulse(at, noteToFrequency('C5'), 0.6, out, { duty: 0.25, glide: -22, volume: 0.36 })
        apu.triangle(at, noteToFrequency('C3'), 0.7, out, { volume: 0.5 })
        return
      case 'checkpoint':
        apu.pulse(at, noteToFrequency('D5'), 0.14, out, { duty: 0.5, volume: 0.3 })
        apu.pulse(at + 0.14, noteToFrequency('A5'), 0.28, out, { duty: 0.5, volume: 0.3 })
        return
      case 'bossHit':
        apu.noise(at, 0.18, out, { volume: 0.42 })
        apu.triangle(at, noteToFrequency('A2'), 0.3, out, { volume: 0.7 })
        return
      case 'menu':
        apu.pulse(at, noteToFrequency('A5'), 0.04, out, { duty: 0.5, volume: 0.2 })
        return
    }
  }
}

/** Every cue the game knows how to make, for the coverage test. */
export const CUES: readonly Cue[] = [
  'jump',
  'swim',
  'dash',
  'chargedDash',
  'bonk',
  'stomp',
  'shell',
  'pearl',
  'bulb',
  'core',
  'shrink',
  'death',
  'checkpoint',
  'bossHit',
  'menu',
]
