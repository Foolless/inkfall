/**
 * A four-channel APU: two pulses, one triangle, one noise.
 *
 * Synthesised at runtime through Web Audio — no audio files anywhere in the
 * repo (PRD §10.1). That keeps the bundle tiny, sidesteps licensing entirely,
 * and produces a sound that matches art drawn from a 48-colour palette.
 *
 * The pulse voices are built as `PeriodicWave`s from the Fourier series of a
 * square wave at a given duty. That is worth doing properly rather than
 * approximating with a plain square: the *duty* is what distinguishes a NES
 * lead from a NES bass, and 12.5% against 50% is most of the character of the
 * whole console.
 *
 * The coefficient maths is pure and unit-tested; everything that touches an
 * AudioContext is a thin shell over it.
 */

export type Duty = 0.125 | 0.25 | 0.5 | 0.75

/** A4 = 440 Hz, twelve-tone equal temperament. */
export const A4_MIDI = 69
export const A4_HZ = 440

const SEMITONES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiToFrequency(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - A4_MIDI) / 12)
}

/** `C4`, `F#3`, `Bb5`. Throws rather than silently playing the wrong note. */
export function noteToMidi(note: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note.trim())
  if (!m) throw new Error(`not a note: ${JSON.stringify(note)}`)
  const letter = m[1]!.toUpperCase()
  const accidental = m[2]!
  const octave = Number(m[3])

  let semitone = SEMITONES.indexOf(letter)
  if (accidental === '#') semitone += 1
  if (accidental === 'b') semitone -= 1
  // MIDI 60 is C4, so C-1 is 0.
  return (octave + 1) * 12 + semitone
}

export function noteToFrequency(note: string): number {
  return midiToFrequency(noteToMidi(note))
}

/**
 * Fourier coefficients for a pulse wave of the given duty.
 *
 * A square of duty `d` has harmonic amplitudes `2/(n*pi) * sin(n*pi*d)`. At
 * 50% the even harmonics vanish, which is exactly why a 50% pulse sounds
 * hollow and a 12.5% one sounds thin and reedy.
 */
export function pulseCoefficients(duty: Duty, harmonics = 32): { real: Float32Array; imag: Float32Array } {
  const real = new Float32Array(harmonics + 1)
  const imag = new Float32Array(harmonics + 1)
  for (let n = 1; n <= harmonics; n++) {
    imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty)
  }
  return { real, imag }
}

export interface VoiceOptions {
  duty?: Duty
  /** 0..1, before the master and category gains. */
  volume?: number
  /** Seconds. A NES envelope is a fast attack and a long-ish decay. */
  attack?: number
  release?: number
  /** Semitones per second, for the dash's downward sweep. */
  glide?: number
}

/** The slice of Web Audio this needs, so a test can hand it a fake. */
export interface AudioHost {
  readonly currentTime: number
  readonly destination: AudioNode
  createGain(): GainNode
  createOscillator(): OscillatorNode
  createBufferSource(): AudioBufferSourceNode
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer
  createPeriodicWave(real: Float32Array, imag: Float32Array): PeriodicWave
  readonly sampleRate: number
}

export class Apu {
  readonly master: GainNode
  readonly musicGain: GainNode
  readonly sfxGain: GainNode
  private waves = new Map<Duty, PeriodicWave>()
  private noiseBuffer: AudioBuffer | null = null

  constructor(readonly ctx: AudioHost) {
    this.master = ctx.createGain()
    this.master.gain.value = 0.5
    this.master.connect(ctx.destination)

    this.musicGain = ctx.createGain()
    this.sfxGain = ctx.createGain()
    this.musicGain.connect(this.master)
    this.sfxGain.connect(this.master)
  }

  private wave(duty: Duty): PeriodicWave {
    let w = this.waves.get(duty)
    if (!w) {
      const { real, imag } = pulseCoefficients(duty)
      w = this.ctx.createPeriodicWave(real, imag)
      this.waves.set(duty, w)
    }
    return w
  }

  pulse(at: number, freq: number, seconds: number, out: GainNode, o: VoiceOptions = {}): void {
    const osc = this.ctx.createOscillator()
    osc.setPeriodicWave(this.wave(o.duty ?? 0.5))
    osc.frequency.setValueAtTime(freq, at)
    if (o.glide) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, freq * Math.pow(2, (o.glide * seconds) / 12)),
        at + seconds,
      )
    }
    this.play(osc, at, seconds, out, o)
  }

  triangle(at: number, freq: number, seconds: number, out: GainNode, o: VoiceOptions = {}): void {
    const osc = this.ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, at)
    this.play(osc, at, seconds, out, { volume: 0.6, ...o })
  }

  /**
   * The noise channel: white noise through the same envelope.
   *
   * One second of samples, generated once and looped. Random values are fine
   * here precisely because nothing in the simulation can hear them — audio is
   * downstream of the world and never feeds back into it.
   */
  noise(at: number, seconds: number, out: GainNode, o: VoiceOptions = {}): void {
    if (!this.noiseBuffer) {
      const length = this.ctx.sampleRate
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
      this.noiseBuffer = buffer
    }
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    this.play(src, at, seconds, out, { volume: 0.35, ...o })
  }

  private play(
    source: OscillatorNode | AudioBufferSourceNode,
    at: number,
    seconds: number,
    out: GainNode,
    o: VoiceOptions,
  ): void {
    const gain = this.ctx.createGain()
    const volume = o.volume ?? 0.5
    const attack = o.attack ?? 0.005
    const release = o.release ?? 0.04

    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(volume, at + attack)
    gain.gain.setValueAtTime(volume, at + Math.max(attack, seconds - release))
    // Exponential to a floor rather than to zero: ramping to zero is undefined
    // in Web Audio and clicks on some implementations.
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds)

    source.connect(gain)
    gain.connect(out)
    source.start(at)
    source.stop(at + seconds + 0.02)
  }
}
