/**
 * Input is a bitmask per frame, and the simulation only ever sees that mask.
 *
 * That is what makes replay determinism cheap: an input log is just number[],
 * and feeding the same array twice must produce byte-identical world state.
 * Nothing in src/game reads the keyboard, the clock, or the DOM.
 */

export const Act = {
  Left: 1 << 0,
  Right: 1 << 1,
  Up: 1 << 2,
  Down: 1 << 3,
  Jump: 1 << 4,
  Run: 1 << 5,
  Dash: 1 << 6,
  Shoot: 1 << 7,
} as const
export type Action = (typeof Act)[keyof typeof Act]

export interface InputFrame {
  held: number
  /** Bits that went down this frame: held & ~previouslyHeld. */
  pressed: number
  released: number
}

export const EMPTY_INPUT: InputFrame = { held: 0, pressed: 0, released: 0 }

export function frameFromMasks(held: number, prevHeld: number): InputFrame {
  return { held, pressed: held & ~prevHeld, released: prevHeld & ~held }
}

export function isHeld(input: InputFrame, a: Action): boolean {
  return (input.held & a) !== 0
}
export function isPressed(input: InputFrame, a: Action): boolean {
  return (input.pressed & a) !== 0
}

/** Turn an input log into a per-frame stream, defaulting to "nothing held". */
export function replayStream(log: readonly number[]): (i: number) => InputFrame {
  return (i: number) => frameFromMasks(log[i] ?? 0, log[i - 1] ?? 0)
}

export const DEFAULT_BINDS: Record<string, Action> = {
  ArrowLeft: Act.Left,
  KeyA: Act.Left,
  ArrowRight: Act.Right,
  KeyD: Act.Right,
  ArrowUp: Act.Up,
  KeyW: Act.Up,
  ArrowDown: Act.Down,
  KeyS: Act.Down,
  Space: Act.Jump,
  KeyZ: Act.Jump,
  ShiftLeft: Act.Run,
  ShiftRight: Act.Run,
  KeyX: Act.Dash,
  Slash: Act.Dash,
  KeyC: Act.Shoot,
  Period: Act.Shoot,
}

/**
 * Keyboard driver. Accumulates raw key state as it arrives, and snapshots it
 * once per simulation step so a key tapped between frames is never lost.
 */
export class Keyboard {
  private held = 0
  private prevHeld = 0
  /** Bits pressed since the last snapshot, even if already released again. */
  private stickyPressed = 0
  private binds: Record<string, Action>

  constructor(binds: Record<string, Action> = DEFAULT_BINDS) {
    this.binds = binds
  }

  attach(target: Pick<Window, 'addEventListener'>): void {
    target.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent
      const a = this.binds[ev.code]
      if (a === undefined) return
      ev.preventDefault()
      if (!ev.repeat) this.stickyPressed |= a
      this.held |= a
    })
    target.addEventListener('keyup', (e) => {
      const ev = e as KeyboardEvent
      const a = this.binds[ev.code]
      if (a === undefined) return
      ev.preventDefault()
      this.held &= ~a
    })
    // Held keys would otherwise stick down forever if the tab loses focus.
    target.addEventListener('blur', () => {
      this.held = 0
    })
  }

  snapshot(): InputFrame {
    const held = this.held | this.stickyPressed
    const frame: InputFrame = {
      held,
      pressed: (held & ~this.prevHeld) | this.stickyPressed,
      released: this.prevHeld & ~held,
    }
    this.prevHeld = this.held
    this.stickyPressed = 0
    return frame
  }
}
