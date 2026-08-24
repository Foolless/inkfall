/**
 * The options screen, as data. PRD §13 and §8.4.
 *
 * A list of rows, each knowing its label, how to render its value, and what
 * left and right do to it. The renderer draws whatever this returns and the
 * state machine moves a cursor through it — so "does Reduce Flashing actually
 * toggle" is a question about an array, answerable without a canvas.
 *
 * ## Why accessibility settings are not buried
 *
 * §13's line is that difficulty is a design choice and *inaccessibility* is a
 * bug. Every provision it names is on this one screen, in plain words, with no
 * submenu: the player who needs `Reduce Flashing` is the least likely to go
 * hunting for it, and the one who needs a bigger light radius is playing the
 * darkest world in the game while they look.
 */

import type { Settings } from '../engine/save.js'
import { Act, type Action } from '../engine/input.js'

/** The six actions a player may rebind. §13: all on single keys, no chords. */
export const BINDABLE: readonly { id: string; label: string; action: Action }[] = [
  { id: 'left', label: 'LEFT', action: Act.Left },
  { id: 'right', label: 'RIGHT', action: Act.Right },
  { id: 'up', label: 'UP', action: Act.Up },
  { id: 'down', label: 'DOWN', action: Act.Down },
  { id: 'jump', label: 'JUMP', action: Act.Jump },
  { id: 'run', label: 'RUN', action: Act.Run },
  { id: 'dash', label: 'INK DASH', action: Act.Dash },
  { id: 'shoot', label: 'INK SHOT', action: Act.Shoot },
]

/** §13's three light radii. The default is §7.6's five tiles. */
export const LIGHT_RADII: readonly number[] = [5, 7, 10]

export type RowKind = 'choice' | 'slider' | 'bind' | 'action'

export interface OptionRow {
  id: string
  label: string
  kind: RowKind
  /** What the row currently reads as, for the renderer. */
  value: (s: Settings) => string
  /** Move the value. `dir` is -1 or +1. Returns the changed settings. */
  adjust?: (s: Settings, dir: number) => Settings
  /** True when this row is one of §13's accessibility provisions. */
  a11y?: boolean
}

const TIMERS: Settings['timerDisplay'][] = ['off', 'level', 'run', 'both']

function cycle<T>(values: readonly T[], current: T, dir: number): T {
  const i = values.indexOf(current)
  const next = (i < 0 ? 0 : i + dir + values.length) % values.length
  return values[next]!
}

/** Clamped rather than wrapped: a volume slider that jumps 100% -> 0% is a jump-scare. */
function step(value: number, dir: number, by = 0.1): number {
  return Math.round(Math.min(1, Math.max(0, value + dir * by)) * 100) / 100
}

function percent(v: number): string {
  return `${Math.round(v * 100)}%`
}

function onOff(v: boolean): string {
  return v ? 'ON' : 'OFF'
}

/**
 * Every row, in the order they are shown.
 *
 * Accessibility first, deliberately. A player who opened this screen because
 * the flashing hurts should not have to scroll past two volume sliders to find
 * the thing they came for.
 */
export const OPTION_ROWS: readonly OptionRow[] = [
  {
    id: 'assist',
    label: 'ASSIST MODE',
    kind: 'choice',
    a11y: true,
    value: (s) => onOff(s.assistMode),
    adjust: (s) => ({ ...s, assistMode: !s.assistMode }),
  },
  {
    id: 'flash',
    label: 'REDUCE FLASHING',
    kind: 'choice',
    a11y: true,
    value: (s) => onOff(s.flashReduction),
    adjust: (s) => ({ ...s, flashReduction: !s.flashReduction }),
  },
  {
    id: 'shake',
    label: 'SCREEN SHAKE',
    kind: 'slider',
    a11y: true,
    value: (s) => percent(s.screenShake),
    adjust: (s, dir) => ({ ...s, screenShake: step(s.screenShake, dir) }),
  },
  {
    id: 'light',
    label: 'LIGHT RADIUS',
    kind: 'choice',
    a11y: true,
    value: (s) => `${s.lightRadius} TILES`,
    adjust: (s, dir) => ({ ...s, lightRadius: cycle(LIGHT_RADII, s.lightRadius, dir) }),
  },
  {
    id: 'music',
    label: 'MUSIC',
    kind: 'slider',
    value: (s) => percent(s.musicVolume),
    adjust: (s, dir) => ({ ...s, musicVolume: step(s.musicVolume, dir) }),
  },
  {
    id: 'sfx',
    label: 'SOUND',
    kind: 'slider',
    value: (s) => percent(s.sfxVolume),
    adjust: (s, dir) => ({ ...s, sfxVolume: step(s.sfxVolume, dir) }),
  },
  {
    id: 'timer',
    label: 'TIMER',
    kind: 'choice',
    value: (s) => s.timerDisplay.toUpperCase(),
    adjust: (s, dir) => ({ ...s, timerDisplay: cycle(TIMERS, s.timerDisplay, dir) }),
  },
  {
    id: 'ghost',
    label: 'PB GHOST',
    kind: 'choice',
    value: (s) => onOff(s.ghost),
    adjust: (s) => ({ ...s, ghost: !s.ghost }),
  },
  ...BINDABLE.map(
    (b): OptionRow => ({
      id: `bind.${b.id}`,
      label: b.label,
      kind: 'bind',
      a11y: true,
      value: (s) => keyLabel(s.keybinds[b.id]?.[0]),
    }),
  ),
  { id: 'reset', label: 'RESET TO DEFAULTS', kind: 'action', value: () => '' },
]

/**
 * A `KeyboardEvent.code` as something a player recognises.
 *
 * `ArrowLeft` and `KeyX` are how the browser names keys and not how anybody
 * else does. Unbound reads as a dash rather than as blank, so an empty row is
 * visibly empty rather than possibly broken.
 */
export function keyLabel(code: string | undefined): string {
  if (!code) return '-'
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Arrow')) return code.slice(5).toUpperCase()
  const named: Record<string, string> = {
    Space: 'SPACE',
    ShiftLeft: 'LSHIFT',
    ShiftRight: 'RSHIFT',
    Escape: 'ESC',
    Enter: 'ENTER',
    Slash: '/',
    Period: '.',
    Comma: ',',
  }
  return named[code] ?? code.toUpperCase()
}

/**
 * The bind table the keyboard driver wants, from the one a save holds.
 *
 * Saves store `action -> codes` because that is what a human edits and what an
 * options screen shows; the driver wants `code -> action` because that is what
 * a keydown gives it. Anything the settings do not mention keeps its default,
 * so a save written before a new action existed does not leave it unbound.
 */
export function bindsFrom(settings: Settings, defaults: Record<string, Action>): Record<string, Action> {
  const named = new Map(BINDABLE.map((b) => [b.id, b.action]))
  const custom: Record<string, Action> = {}
  let any = false
  for (const [id, codes] of Object.entries(settings.keybinds)) {
    const action = named.get(id)
    if (action === undefined) continue
    for (const code of codes) {
      custom[code] = action
      any = true
    }
  }
  if (!any) return defaults

  // An action the player never touched keeps its default keys — but only the
  // ones no custom binding has claimed, or rebinding Left onto A would leave A
  // meaning both Left and Left.
  const claimed = new Set(Object.values(custom))
  for (const [code, action] of Object.entries(defaults)) {
    if (!claimed.has(action) && custom[code] === undefined) custom[code] = action
  }
  return custom
}

/**
 * Bind `code` to one action, taking it off whatever else held it.
 *
 * One key, one action. Letting a key mean two things is how a player rebinds
 * Jump onto X and finds that jumping also spends a pip.
 */
export function rebind(settings: Settings, id: string, code: string): Settings {
  const keybinds: Record<string, string[]> = {}
  for (const [other, codes] of Object.entries(settings.keybinds)) {
    const kept = codes.filter((c) => c !== code)
    if (other !== id) keybinds[other] = kept
  }
  keybinds[id] = [code]
  return { ...settings, keybinds }
}
