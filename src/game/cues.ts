/**
 * Every sound the simulation can ask for. PRD §10.3.
 *
 * The names live in the *game* layer, not the audio one, and that direction
 * matters. The simulation names what happened; the engine decides what that
 * sounds like. Keeping the vocabulary here means the world never imports Web
 * Audio — a headless replay raises the same cues and simply has nobody
 * listening — while still being type-checked end to end.
 *
 * That check is not theoretical. Six cues (`shoot`, `bomb`, `blast`,
 * `inkKill`, `inkStun`, `upgrade`) were raised by the game for a whole phase
 * and silently dropped by the synth, because the host cast them to the audio
 * layer's narrower type on the way in. A union both sides share cannot drift
 * like that.
 */

export const CUES = [
  'jump',
  'swim',
  /** The signature sound: a wet pressurised burst. */
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
  'bossDeath',
  'menu',
  /** Ranged ink (§8.5): the bolt, the thrown bomb, and the bomb going off. */
  'shoot',
  'bomb',
  'blast',
  /** What a bolt did when it landed: killed the thing, or only stunned it. */
  'inkKill',
  'inkStun',
  /** A permanent upgrade, earned or found. It happens five times in the game. */
  'upgrade',
  /** Cling: catching a wall, and starting to slide down it. */
  'clingGrip',
  'clingSlip',
  /** An enemy dying to something other than a stomp. */
  'enemyDeath',
  /** World 4's magma and World 5's pressure. Both are warnings, not events. */
  'magma',
  'pressure',
] as const

export type Cue = (typeof CUES)[number]

export function isCue(value: string): value is Cue {
  return (CUES as readonly string[]).includes(value)
}
