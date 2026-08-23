import { describe, expect, test } from 'vitest'
import { Act, frameFromMasks, isHeld, isPressed, Keyboard, replayStream } from '../src/engine/input.js'

/** A stand-in for `window` that lets a test fire synthetic key events. */
class FakeTarget {
  private handlers = new Map<string, Array<(e: unknown) => void>>()
  addEventListener(type: string, fn: (e: unknown) => void): void {
    const list = this.handlers.get(type) ?? []
    list.push(fn)
    this.handlers.set(type, list)
  }
  fire(type: string, event: Record<string, unknown>): void {
    for (const fn of this.handlers.get(type) ?? []) fn({ preventDefault() {}, ...event })
  }
  down(code: string, repeat = false): void {
    this.fire('keydown', { code, repeat })
  }
  up(code: string): void {
    this.fire('keyup', { code })
  }
}

function attached(): { kb: Keyboard; t: FakeTarget } {
  const t = new FakeTarget()
  const kb = new Keyboard()
  kb.attach(t as unknown as Window)
  return { kb, t }
}

describe('edge detection', () => {
  test('pressed fires on the first frame only, held persists', () => {
    const { kb, t } = attached()
    t.down('Space')

    let f = kb.snapshot()
    expect(isPressed(f, Act.Jump)).toBe(true)
    expect(isHeld(f, Act.Jump)).toBe(true)

    f = kb.snapshot()
    expect(isPressed(f, Act.Jump)).toBe(false)
    expect(isHeld(f, Act.Jump)).toBe(true)
  })

  test('released fires once when the key comes up', () => {
    const { kb, t } = attached()
    t.down('Space')
    kb.snapshot()
    t.up('Space')
    const f = kb.snapshot()
    expect(f.released & Act.Jump).toBeTruthy()
    expect(isHeld(f, Act.Jump)).toBe(false)
  })

  /**
   * A key tapped and released between two simulation steps must still register.
   * At 60 Hz a fast tap can easily fall entirely inside one frame, and losing
   * it would read to the player as the game dropping their input.
   */
  test('a tap that starts and ends between frames is not lost', () => {
    const { kb, t } = attached()
    t.down('KeyX')
    t.up('KeyX')
    const f = kb.snapshot()
    expect(isPressed(f, Act.Dash)).toBe(true)
  })

  test('auto-repeat does not re-trigger pressed', () => {
    const { kb, t } = attached()
    t.down('Space')
    kb.snapshot()
    t.down('Space', true) // OS key repeat
    const f = kb.snapshot()
    expect(isPressed(f, Act.Jump)).toBe(false)
  })

  test('losing focus releases everything rather than sticking keys down', () => {
    const { kb, t } = attached()
    t.down('ArrowRight')
    kb.snapshot()
    t.fire('blur', {})
    const f = kb.snapshot()
    expect(isHeld(f, Act.Right)).toBe(false)
  })

  test('arrows and WASD are both live, no scheme to choose', () => {
    const { kb, t } = attached()
    t.down('ArrowLeft')
    t.down('KeyD')
    const f = kb.snapshot()
    expect(isHeld(f, Act.Left)).toBe(true)
    expect(isHeld(f, Act.Right)).toBe(true)
  })

  test('unbound keys are ignored', () => {
    const { kb, t } = attached()
    t.down('KeyQ')
    expect(kb.snapshot().held).toBe(0)
  })
})

describe('replay streams', () => {
  test('a log replays with correct press edges', () => {
    const stream = replayStream([0, Act.Jump, Act.Jump, 0])
    expect(isPressed(stream(0), Act.Jump)).toBe(false)
    expect(isPressed(stream(1), Act.Jump)).toBe(true)
    expect(isPressed(stream(2), Act.Jump)).toBe(false)
    expect(isHeld(stream(2), Act.Jump)).toBe(true)
    expect(stream(3).released & Act.Jump).toBeTruthy()
  })

  test('reading past the end of a log yields no input', () => {
    const stream = replayStream([Act.Right])
    expect(stream(50).held).toBe(0)
  })

  test('frameFromMasks derives edges from two masks', () => {
    const f = frameFromMasks(Act.Right | Act.Jump, Act.Right)
    expect(f.pressed).toBe(Act.Jump)
    expect(f.released).toBe(0)
    expect(f.held).toBe(Act.Right | Act.Jump)
  })
})
