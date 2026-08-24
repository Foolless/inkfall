import { describe, expect, test } from 'vitest'
import { Act, frameFromMasks, type InputFrame } from '../src/engine/input.js'
import { RULES } from '../src/game/constants.js'
import { campaign, greybox, loadoutOnArrival } from '../src/content/levels/index.js'
import { createSession, nextLevel, updateSession, type Session } from '../src/game/state.js'
import { GRANTED_ON_CLEAR, hasUpgrade, idsOf, maskOf, UPGRADE_IDS } from '../src/game/upgrades.js'
import { defaultSave, recordUnlock, recordUpgrades } from '../src/engine/save.js'
import { blank } from './helpers.js'

/**
 * The run that spans five levels. PLAN.md checkpoint: "the whole game,
 * completable start to finish".
 *
 * Clearing a level grants its upgrade and hands the player to the next one,
 * and both halves of that are *data* — `GRANTED_ON_CLEAR` and the campaign
 * order — so a sixth level is a registry entry and nothing else. These tests
 * exist to keep it that way.
 */

function press(s: Session, act: number, prev = 0): void {
  updateSession(s, frameFromMasks(act, prev))
}

/** Start a run, clear the current level, and confirm past the tally. */
function clearLevel(s: Session): void {
  s.world.cleared = true
  press(s, 0)
  expect(s.screen).toBe('levelClear')
  // The count-up refuses a confirm on its first frames, so it cannot be
  // skipped by the same keypress that finished the level.
  for (let i = 0; i < 40; i++) updateSession(s, blank())
  press(s, Act.Jump)
}

function startedRun(): Session {
  const s = createSession(campaign()[0]!)
  press(s, Act.Jump)
  expect(s.screen).toBe('playing')
  return s
}

describe('the chain from one level to the next', () => {
  test('the campaign is a chain, and only the last level has nothing after it', () => {
    const ids = campaign().map((d) => d.id)
    for (const id of ids.slice(0, -1)) expect(nextLevel(id)).not.toBeNull()
    expect(nextLevel(ids[ids.length - 1]!)).toBeNull()
  })

  test('a level outside the campaign has no next', () => {
    expect(nextLevel(greybox.id)).toBeNull()
  })

  test('clearing a level hands the player straight to the next one', () => {
    const s = startedRun()
    expect(s.level.id).toBe('w01-tidepools')
    clearLevel(s)
    expect(s.screen).toBe('playing')
    expect(s.level.id).toBe('w02-kelp')
  })

  test('and the new level starts fresh, with the run intact', () => {
    const s = startedRun()
    s.score = 0
    for (let i = 0; i < 120; i++) updateSession(s, blank())
    const framesBefore = s.levelFrames
    expect(framesBefore).toBeGreaterThan(0)

    clearLevel(s)
    expect(s.levelFrames).toBe(0)
    expect(s.noDamage).toBe(true)
    expect(s.lives).toBe(RULES.START_LIVES)
    // The score belongs to the run, not the level.
    expect(s.score).toBeGreaterThan(0)
  })

  test('clearing all five ends the game rather than looping', () => {
    const s = startedRun()
    for (let i = 0; i < campaign().length; i++) clearLevel(s)
    expect(s.screen).toBe('gameClear')
  })

  test('the game-clear screen goes back to the title, and not instantly', () => {
    const s = startedRun()
    for (let i = 0; i < campaign().length; i++) clearLevel(s)
    press(s, Act.Jump)
    expect(s.screen, 'a held key from the last level skipped the ending').toBe('gameClear')
    for (let i = 0; i < 90; i++) updateSession(s, blank())
    press(s, Act.Jump)
    expect(s.screen).toBe('title')
  })

  /** The grey box is a proving ground, not content. It grants nothing. */
  test('clearing the grey box returns to the title and grants nothing', () => {
    const s = createSession(greybox)
    press(s, Act.Jump)
    clearLevel(s)
    expect(s.screen).toBe('title')
    expect(s.upgrades).toBe(0)
  })
})

describe('upgrades across the run', () => {
  test('a run starts with what the save says the player already earned', () => {
    const s = createSession(campaign()[0]!, { upgrades: maskOf(['cling', 'inkBomb']) })
    expect(hasUpgrade(s.upgrades, 'cling')).toBe(true)
    expect(hasUpgrade(s.world.player.upgrades, 'inkBomb')).toBe(true)
  })

  test('clearing each world grants exactly the upgrade §8.5 promises', () => {
    const s = startedRun()
    for (const level of campaign()) {
      const expected = GRANTED_ON_CLEAR[level.id]
      const before = s.upgrades
      clearLevel(s)
      if (expected === undefined) {
        expect(s.upgrades, `${level.id} granted something it should not`).toBe(before)
      } else {
        expect(hasUpgrade(s.upgrades, expected), `${level.id} did not grant ${expected}`).toBe(true)
      }
    }
  })

  test('what you hold on arriving at a level is what the run gave you', () => {
    const s = startedRun()
    for (const level of campaign()) {
      expect(idsOf(s.upgrades).sort(), level.id).toEqual([...loadoutOnArrival(level.id)].sort())
      clearLevel(s)
    }
  })

  test('the new level is built with the upgrades, not just the session', () => {
    const s = startedRun()
    clearLevel(s)
    expect(hasUpgrade(s.world.player.upgrades, 'inkShot')).toBe(true)
  })

  test('a continue keeps everything earned', () => {
    const s = startedRun()
    clearLevel(s) // now holding Ink Shot, in World 2
    s.lives = 1
    s.world.player.deaths += 1
    updateSession(s, blank())
    expect(s.screen).toBe('gameOver')

    press(s, Act.Jump)
    expect(s.screen).toBe('playing')
    expect(hasUpgrade(s.upgrades, 'inkShot')).toBe(true)
    expect(hasUpgrade(s.world.player.upgrades, 'inkShot')).toBe(true)
  })

  /**
   * Deep Jet is banked the instant it is picked up rather than on the level
   * clear. Dying with it in your hand and losing it would be the worst thing
   * this game could do to someone, and §7.6 B2 is a third of the way through
   * the last level.
   */
  test('an upgrade found mid-level is banked before the level ends', () => {
    const s = startedRun()
    s.world.earned.push('deepJet')
    updateSession(s, blank())
    expect(hasUpgrade(s.upgrades, 'deepJet')).toBe(true)
    expect(s.granted).toContain('deepJet')
    expect(s.pendingSave).toBe(true)
    // Drained, so a respawn cannot grant the same nodule twice.
    expect(s.world.earned).toEqual([])
  })

  test('banking the same upgrade twice grants it once', () => {
    const s = startedRun()
    s.world.earned.push('deepJet')
    updateSession(s, blank())
    s.granted.length = 0
    s.world.earned.push('deepJet')
    updateSession(s, blank())
    expect(s.granted).toEqual([])
  })

  test('every upgrade in the game is reachable by playing it through', () => {
    const s = startedRun()
    // Deep Jet is found rather than granted, so it is stood in for here; the
    // level test proves the nodule is where it says it is.
    s.world.earned.push('deepJet')
    for (let i = 0; i < campaign().length; i++) clearLevel(s)
    expect(idsOf(s.upgrades).sort()).toEqual([...UPGRADE_IDS].sort())
  })
})

describe('what the save records', () => {
  test('upgrades accumulate and are never taken away', () => {
    let save = defaultSave()
    save = recordUpgrades(save, ['inkShot'])
    save = recordUpgrades(save, ['cling', 'inkShot'])
    expect(save.progress.upgrades).toEqual(['inkShot', 'cling'])
  })

  test('recording nothing new leaves the save object untouched', () => {
    const save = recordUpgrades(defaultSave(), [])
    expect(recordUpgrades(save, [])).toBe(save)
  })

  test('unlocking is permanent and idempotent', () => {
    let save = defaultSave()
    save = recordUnlock(save, 'w02-kelp')
    expect(save.progress.unlocked).toContain('w02-kelp')
    expect(recordUnlock(save, 'w02-kelp')).toBe(save)
  })

  test('a fresh save unlocks the first level and nothing else', () => {
    expect(defaultSave().progress.unlocked).toEqual([campaign()[0]!.id])
    expect(defaultSave().progress.upgrades).toEqual([])
  })
})

/** The session never touches storage; it flags, and the host writes. */
describe('the state machine stays a pure function', () => {
  test('clearing a level raises the save flag rather than saving', () => {
    const s = startedRun()
    expect(s.pendingSave).toBe(false)
    clearLevel(s)
    expect(s.pendingSave).toBe(true)
  })

  test('a session steps identically twice from the same inputs', () => {
    const script: InputFrame[] = Array.from({ length: 200 }, (_, i) =>
      frameFromMasks(i % 20 < 10 ? Act.Right : Act.Right | Act.Jump, 0),
    )
    const run = () => {
      const s = startedRun()
      for (const f of script) updateSession(s, f)
      return { x: s.world.player.x, y: s.world.player.y, score: s.world.score, frame: s.world.frame }
    }
    expect(run()).toEqual(run())
  })
})
