import { describe, expect, test } from 'vitest'
import { Act, DEFAULT_BINDS, frameFromMasks, Keyboard, isHeld } from '../src/engine/input.js'
import { BINDABLE, bindsFrom, keyLabel, LIGHT_RADII, OPTION_ROWS, rebind } from '../src/game/options.js'
import { defaultSave, type Settings } from '../src/engine/save.js'
import { createSession, openOptions, updateSession, type Session } from '../src/game/state.js'
import { campaign } from '../src/content/levels/index.js'
import { glyph, MISSING } from '../src/content/font.js'

/**
 * Options and accessibility. PLAN.md checkpoint 4.7.
 *
 * §13's line is that difficulty is a design choice and *inaccessibility* is a
 * bug, so every provision it names is tested here as a promise rather than as a
 * preference: the flashing can be reduced, the shake can be turned off, the
 * light radius can be widened, and every action in the game can be moved to a
 * different key.
 */

const base = (): Settings => defaultSave().settings

function row(id: string) {
  const found = OPTION_ROWS.find((r) => r.id === id)
  expect(found, `no option row ${id}`).toBeDefined()
  return found!
}

describe('§13 is all on one screen, and near the top of it', () => {
  test('every provision §13 names has a row', () => {
    for (const id of ['assist', 'flash', 'shake', 'light']) expect(row(id).a11y).toBe(true)
    // Rebinding is §13's motor provision, so those rows count too.
    expect(OPTION_ROWS.filter((r) => r.kind === 'bind')).toHaveLength(BINDABLE.length)
  })

  /**
   * A player who opened this because the flashing hurts should not scroll past
   * two volume sliders to reach it.
   */
  test('the accessibility rows come before the taste rows', () => {
    const firstTaste = OPTION_ROWS.findIndex((r) => r.id === 'music')
    const a11yBefore = OPTION_ROWS.slice(0, firstTaste).filter((r) => r.a11y)
    expect(a11yBefore.map((r) => r.id)).toEqual(['assist', 'flash', 'shake', 'light'])
  })

  test('every action in the game can be rebound', () => {
    const bound = new Set(BINDABLE.map((b) => b.action))
    for (const act of [Act.Left, Act.Right, Act.Up, Act.Down, Act.Jump, Act.Run, Act.Dash, Act.Shoot]) {
      expect(bound.has(act)).toBe(true)
    }
  })
})

describe('the rows change what they say they change', () => {
  test('toggles toggle', () => {
    for (const id of ['assist', 'flash', 'ghost']) {
      const before = base()
      const after = row(id).adjust!(before, 1)
      expect(JSON.stringify(after)).not.toBe(JSON.stringify(before))
      expect(row(id).value(after)).toBe('ON')
      expect(row(id).value(row(id).adjust!(after, 1))).toBe('OFF')
    }
  })

  test('sliders move in tenths and read as a percentage', () => {
    const quieter = row('music').adjust!(base(), -1)
    expect(quieter.musicVolume).toBeCloseTo(0.6, 5)
    expect(row('music').value(quieter)).toBe('60%')
  })

  /** A volume slider that jumps from 100% to 0% is a jump-scare, not a wrap. */
  test('sliders clamp at both ends rather than wrapping', () => {
    let s = base()
    for (let i = 0; i < 20; i++) s = row('shake').adjust!(s, -1)
    expect(s.screenShake).toBe(0)
    for (let i = 0; i < 30; i++) s = row('shake').adjust!(s, 1)
    expect(s.screenShake).toBe(1)
  })

  test('the light radius cycles §13’s three values', () => {
    let s = base()
    expect(s.lightRadius).toBe(LIGHT_RADII[0])
    s = row('light').adjust!(s, 1)
    expect(s.lightRadius).toBe(7)
    s = row('light').adjust!(s, 1)
    expect(s.lightRadius).toBe(10)
    s = row('light').adjust!(s, 1)
    expect(s.lightRadius).toBe(5)
  })

  test('the timer cycles §8.4’s four settings, backwards too', () => {
    let s = base()
    expect(s.timerDisplay).toBe('off')
    s = row('timer').adjust!(s, -1)
    expect(s.timerDisplay).toBe('both')
    s = row('timer').adjust!(s, 1)
    expect(s.timerDisplay).toBe('off')
  })

  test('a bind row shows the key, not the browser’s name for it', () => {
    const s = rebind(base(), 'jump', 'Space')
    expect(row('bind.jump').value(s)).toBe('SPACE')
    expect(row('bind.dash').value(base())).toBe('-')
  })
})

describe('key labels a player recognises', () => {
  test('the browser’s codes are translated', () => {
    expect(keyLabel('KeyX')).toBe('X')
    expect(keyLabel('ArrowLeft')).toBe('LEFT')
    expect(keyLabel('Digit1')).toBe('1')
    expect(keyLabel('ShiftLeft')).toBe('LSHIFT')
    expect(keyLabel('Slash')).toBe('/')
  })

  test('unbound reads as a dash, so an empty row is visibly empty', () => {
    expect(keyLabel(undefined)).toBe('-')
    expect(keyLabel('')).toBe('-')
  })

  test('anything unrecognised still prints as something', () => {
    expect(keyLabel('F13')).toBe('F13')
  })
})

describe('rebinding', () => {
  test('one key means one action', () => {
    let s = base()
    s = rebind(s, 'jump', 'KeyQ')
    s = rebind(s, 'dash', 'KeyQ')
    expect(s.keybinds.dash).toEqual(['KeyQ'])
    expect(s.keybinds.jump ?? []).not.toContain('KeyQ')
  })

  test('rebinding an action replaces its key rather than adding one', () => {
    let s = rebind(base(), 'jump', 'KeyQ')
    s = rebind(s, 'jump', 'KeyE')
    expect(s.keybinds.jump).toEqual(['KeyE'])
  })

  test('other actions are left alone', () => {
    let s = rebind(base(), 'jump', 'KeyQ')
    s = rebind(s, 'dash', 'KeyE')
    expect(s.keybinds.jump).toEqual(['KeyQ'])
  })
})

describe('the table the keyboard driver actually reads', () => {
  test('untouched settings mean the defaults, unchanged', () => {
    expect(bindsFrom(base(), DEFAULT_BINDS)).toBe(DEFAULT_BINDS)
  })

  test('a custom key works', () => {
    const binds = bindsFrom(rebind(base(), 'jump', 'KeyQ'), DEFAULT_BINDS)
    expect(binds.KeyQ).toBe(Act.Jump)
  })

  /**
   * Rebinding Jump must take Jump off Space — otherwise the old key keeps
   * working and the player has two Jumps and no idea why.
   */
  test('a rebound action loses its default keys', () => {
    const binds = bindsFrom(rebind(base(), 'jump', 'KeyQ'), DEFAULT_BINDS)
    expect(binds.Space).toBeUndefined()
    expect(binds.KeyZ).toBeUndefined()
  })

  test('actions the player never touched keep theirs', () => {
    const binds = bindsFrom(rebind(base(), 'jump', 'KeyQ'), DEFAULT_BINDS)
    expect(binds.KeyX).toBe(Act.Dash)
    expect(binds.ArrowLeft).toBe(Act.Left)
  })

  test('a custom key that was a default for something else belongs to its new owner', () => {
    const binds = bindsFrom(rebind(base(), 'jump', 'KeyX'), DEFAULT_BINDS)
    expect(binds.KeyX).toBe(Act.Jump)
  })
})

describe('the driver takes a new table live', () => {
  /** A minimal window stand-in that records its listeners. */
  class FakeWindow {
    handlers = new Map<string, ((e: unknown) => void)[]>()
    addEventListener(type: string, fn: (e: unknown) => void): void {
      const list = this.handlers.get(type) ?? []
      list.push(fn)
      this.handlers.set(type, list)
    }
    press(code: string): void {
      for (const fn of this.handlers.get('keydown') ?? []) fn({ code, preventDefault() {}, repeat: false })
    }
  }

  test('the new key works and the old one does not', () => {
    const win = new FakeWindow()
    const kb = new Keyboard()
    kb.attach(win as unknown as Window)

    win.press('Space')
    expect(isHeld(kb.snapshot(), Act.Jump)).toBe(true)

    kb.setBinds(bindsFrom(rebind(base(), 'jump', 'KeyQ'), DEFAULT_BINDS))
    win.press('Space')
    expect(isHeld(kb.snapshot(), Act.Jump)).toBe(false)
    win.press('KeyQ')
    expect(isHeld(kb.snapshot(), Act.Jump)).toBe(true)
  })

  /**
   * A key that was down under the old table has no keyup under the new one, so
   * without clearing the held mask a rebind mid-stride leaves Nib walking into
   * a wall forever.
   */
  test('held keys are dropped when the table changes', () => {
    const win = new FakeWindow()
    const kb = new Keyboard()
    kb.attach(win as unknown as Window)
    win.press('ArrowRight')
    expect(isHeld(kb.snapshot(), Act.Right)).toBe(true)

    kb.setBinds(DEFAULT_BINDS)
    expect(isHeld(kb.snapshot(), Act.Right)).toBe(false)
  })
})

describe('reaching the screen and getting back', () => {
  function press(s: Session, act: number, prev = 0): void {
    updateSession(s, frameFromMasks(act, prev))
  }

  test('up from the title opens it, and it remembers where from', () => {
    const s = createSession(campaign()[0]!)
    press(s, Act.Up)
    expect(s.screen).toBe('options')
    expect(s.optionsFrom).toBe('title')
  })

  /**
   * §11.1 reaches Options from the pause menu too, and landing on the title
   * after adjusting the volume mid-level would throw the run away.
   */
  test('up from the pause menu opens it, and going back returns to the pause', () => {
    const s = createSession(campaign()[0]!)
    press(s, Act.Jump) // map
    press(s, Act.Jump, Act.Jump === 0 ? 0 : 0) // level
    expect(s.screen).toBe('playing')
    press(s, Act.Pause)
    expect(s.screen).toBe('paused')
    press(s, Act.Up)
    expect(s.screen).toBe('options')
    expect(s.optionsFrom).toBe('paused')
  })

  test('it opens at the top with nothing listening', () => {
    const s = createSession(campaign()[0]!)
    openOptions(s)
    expect(s.options).toEqual({ cursor: 0, listening: null })
  })

  test('the simulation does not run underneath it', () => {
    const s = createSession(campaign()[0]!)
    press(s, Act.Jump)
    press(s, Act.Jump)
    const frame = s.world.frame
    press(s, Act.Pause)
    press(s, Act.Up)
    for (let i = 0; i < 30; i++) press(s, 0)
    expect(s.world.frame).toBe(frame)
  })
})

describe('everything the screen prints is drawable', () => {
  test('labels, values and hints all have glyphs', () => {
    const s = base()
    const text = [
      'OPTIONS',
      'PRESS A KEY',
      'ESC TO CANCEL',
      'SPACE TO REBIND   ESC TO GO BACK',
      'LEFT RIGHT TO CHANGE   ESC TO GO BACK',
      ...OPTION_ROWS.map((r) => r.label + r.value(s)),
      '+>-',
      '100% 5 TILES BOTH LSHIFT',
    ].join('')
    for (const ch of new Set(text)) {
      expect(glyph(ch), `no glyph for ${JSON.stringify(ch)}`).not.toBe(MISSING)
    }
  })
})
