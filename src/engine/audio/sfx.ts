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

import { CUES, type Cue } from '../../game/cues.js'

export type { Cue }

/** A shell within this many seconds of the last one continues the run. */
const SHELL_CHAIN_SECONDS = 0.6

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
  /** When the last shell was picked up, and how far up the run has climbed. */
  private lastShell = -Infinity
  private shellStep = 0

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
      /**
       * §10.3: "pitch rises with combo". Tracked here rather than passed in,
       * because a run of shells is a fact about *sound* — the simulation has no
       * shell chain, and giving it one so the synth could read it would be the
       * tail wagging the dog.
       */
      case 'shell': {
        const consecutive = at - this.lastShell < SHELL_CHAIN_SECONDS ? Math.min(this.shellStep + 1, 7) : 0
        this.lastShell = at
        this.shellStep = consecutive
        apu.pulse(at, noteToFrequency('E6') * Math.pow(2, consecutive / 12), 0.05, out, { duty: 0.125, volume: 0.22 })
        return
      }
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
      /**
       * The end of a fight. Deliberately the longest sound in the game: five
       * of these exist and each one is a thing the player will remember.
       */
      case 'bossDeath':
        apu.triangle(at, noteToFrequency('A2'), 0.9, out, { volume: 0.8 })
        apu.pulse(at, noteToFrequency('A4'), 0.5, out, { duty: 0.25, glide: -30, volume: 0.34 })
        apu.noise(at + 0.1, 0.5, out, { volume: 0.34 })
        apu.pulse(at + 0.5, noteToFrequency('A3'), 0.6, out, { duty: 0.5, glide: -12, volume: 0.3 })
        return
      case 'menu':
        apu.pulse(at, noteToFrequency('A5'), 0.04, out, { duty: 0.5, volume: 0.2 })
        return

      /** Thinner and drier than the dash — ink leaving, not ink pushing. */
      case 'shoot':
        apu.pulse(at, noteToFrequency('D5'), 0.07, out, { duty: 0.125, glide: -14, volume: 0.22 })
        apu.noise(at, 0.03, out, { volume: 0.12 })
        return
      /** A lob: the same ink, thrown rather than fired, so it rises. */
      case 'bomb':
        apu.pulse(at, noteToFrequency('A4'), 0.1, out, { duty: 0.25, glide: 10, volume: 0.24 })
        return
      /** The bomb landing. Bass first, because a blast is felt before it is heard. */
      case 'blast':
        apu.triangle(at, noteToFrequency('D2'), 0.28, out, { volume: 0.75 })
        apu.noise(at, 0.22, out, { volume: 0.45 })
        return
      case 'inkKill':
        apu.noise(at, 0.06, out, { volume: 0.26 })
        apu.pulse(at, noteToFrequency('A4'), 0.1, out, { duty: 0.25, glide: -16, volume: 0.26 })
        return
      /**
       * Deliberately unresolved — a stun is not a solution, and the sound
       * should not sign off on it the way `inkKill` does.
       */
      case 'inkStun':
        apu.pulse(at, noteToFrequency('F4'), 0.09, out, { duty: 0.5, volume: 0.2 })
        return
      /** Four notes rising. The rarest sound in the game: it happens five times. */
      case 'upgrade':
        apu.pulse(at, noteToFrequency('C5'), 0.1, out, { duty: 0.25, volume: 0.3 })
        apu.pulse(at + 0.1, noteToFrequency('E5'), 0.1, out, { duty: 0.25, volume: 0.3 })
        apu.pulse(at + 0.2, noteToFrequency('G5'), 0.1, out, { duty: 0.25, volume: 0.3 })
        apu.pulse(at + 0.3, noteToFrequency('C6'), 0.4, out, { duty: 0.25, volume: 0.32 })
        apu.triangle(at + 0.3, noteToFrequency('C3'), 0.5, out, { volume: 0.45 })
        return
      /** Short and dry. A grip is a *catch*, and a catch has no ring to it. */
      case 'clingGrip':
        apu.noise(at, 0.04, out, { volume: 0.18 })
        apu.pulse(at, noteToFrequency('C4'), 0.05, out, { duty: 0.5, volume: 0.16 })
        return
      /** Falling, quietly. It is telling you the clock ran out, not scolding you. */
      case 'clingSlip':
        apu.noise(at, 0.12, out, { volume: 0.1 })
        apu.pulse(at, noteToFrequency('E4'), 0.14, out, { duty: 0.125, glide: -10, volume: 0.12 })
        return
      case 'enemyDeath':
        apu.noise(at, 0.08, out, { volume: 0.28 })
        apu.pulse(at, noteToFrequency('C4'), 0.12, out, { duty: 0.25, glide: -20, volume: 0.24 })
        return
      /**
       * A warning rather than an event, so it is low, long and quiet enough to
       * sit under the music instead of interrupting it.
       */
      case 'magma':
        apu.triangle(at, noteToFrequency('E1'), 0.6, out, { volume: 0.45 })
        apu.noise(at, 0.5, out, { volume: 0.12 })
        return
      /** §7.6's heartbeat. Two beats, and the caller quickens it by calling sooner. */
      case 'pressure':
        apu.triangle(at, noteToFrequency('C2'), 0.1, out, { volume: 0.6 })
        apu.triangle(at + 0.14, noteToFrequency('C2'), 0.14, out, { volume: 0.42 })
        return
    }
  }
}

/** Every cue the game can raise, for the coverage test. The game owns this list. */
export { CUES }
