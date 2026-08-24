import { describe, expect, test } from 'vitest'
import { Act, frameFromMasks } from '../src/engine/input.js'
import {
  buildMap,
  chapterName,
  furthestUnlocked,
  mapTotals,
  moveCursor,
  NO_PROGRESS,
  type MapProgress,
} from '../src/game/map.js'
import { campaign } from '../src/content/levels/index.js'
import { RULES } from '../src/game/constants.js'
import { createSession, openMap, updateSession, type Session } from '../src/game/state.js'
import { defaultSave, recordClear, recordUnlock, type SaveData } from '../src/engine/save.js'

/**
 * The world map. PLAN.md checkpoint 4.4, whose proof is stated as "renders
 * correctly from an arbitrary node list, not five hard-coded ones".
 *
 * So that is what these test: the map is a *function of the registry*, and the
 * one place that would be tempting to hard-code — five nodes, one per world —
 * is exactly the thing §12.7 forbids. Everything below asks about a list, never
 * about pixels.
 *
 * It is also where the game's continue lives. Progress had been written to the
 * save since Phase 2 and never read back, so every session started at the tide
 * pools no matter how far anyone had got; the map's cursor is the fix.
 */

function progressFrom(save: SaveData): MapProgress {
  return {
    unlocked: save.progress.unlocked,
    cleared: save.progress.cleared,
    pearls: save.progress.pearls,
    bestTimes: save.records.bestTimes[save.characters.selected] ?? {},
  }
}

describe('the map is built from the registry', () => {
  test('one node per campaign level, in descent order', () => {
    expect(buildMap().map((n) => n.id)).toEqual(campaign().map((d) => d.id))
  })

  /** The grey box is registered so the debug route can reach it. It is not a world. */
  test('the proving ground never appears on it', () => {
    expect(buildMap().map((n) => n.id)).not.toContain('greybox')
  })

  test('a node carries its own name and its chapter’s', () => {
    const first = buildMap()[0]!
    expect(first.name).toBe(campaign()[0]!.name)
    expect(chapterName(first)).toBeTruthy()
  })

  /**
   * A fresh save has an empty `unlocked` list, and a map with nothing enterable
   * on it is a dead end rather than a start.
   */
  test('the first level is open on a save that has never heard of it', () => {
    const nodes = buildMap(NO_PROGRESS)
    expect(nodes[0]!.unlocked).toBe(true)
    expect(nodes.slice(1).every((n) => !n.unlocked)).toBe(true)
  })

  test('pearls are always three flags, however few the save holds', () => {
    const nodes = buildMap({ ...NO_PROGRESS, pearls: { [campaign()[0]!.id]: [true] } })
    expect(nodes[0]!.pearls).toEqual([true, false, false])
  })

  test('a level never finished has no best time', () => {
    expect(buildMap().every((n) => n.bestSeconds === null)).toBe(true)
  })

  test('the totals count what exists, not what is hard-coded', () => {
    const totals = mapTotals(buildMap())
    expect(totals.levels).toBe(campaign().length)
    expect(totals.pearlsPossible).toBe(campaign().length * 3)
    expect(totals.pearls).toBe(0)
  })
})

describe('it reads a real save', () => {
  test('clearing a level opens the next one on the map', () => {
    let save = defaultSave()
    const [first, second] = campaign()
    save = recordClear(save, first!.id, { pearls: [true, false, true], seconds: 122.5 })
    save = recordUnlock(save, second!.id)

    const nodes = buildMap(progressFrom(save))
    expect(nodes[0]!.cleared).toBe(true)
    expect(nodes[0]!.pearls).toEqual([true, false, true])
    expect(nodes[0]!.bestSeconds).toBe(122.5)
    expect(nodes[1]!.unlocked).toBe(true)
    expect(nodes[1]!.cleared).toBe(false)
    expect(nodes[2]!.unlocked).toBe(false)
  })

  test('found pearls survive a run that missed them', () => {
    let save = defaultSave()
    const id = campaign()[0]!.id
    save = recordClear(save, id, { pearls: [true, true, false], seconds: 200 })
    save = recordClear(save, id, { pearls: [false, false, false], seconds: 180 })
    expect(buildMap(progressFrom(save))[0]!.pearls).toEqual([true, true, false])
  })
})

describe('the cursor', () => {
  const half = buildMap({ ...NO_PROGRESS, unlocked: campaign().slice(0, 3).map((d) => d.id) })

  test('starts on the deepest level you may enter — the game’s continue', () => {
    expect(furthestUnlocked(half)).toBe(2)
    expect(furthestUnlocked(buildMap())).toBe(0)
  })

  test('steps over locked nodes rather than landing on one', () => {
    expect(moveCursor(half, 2, 1)).toBe(2)
    expect(moveCursor(half, 0, 1)).toBe(1)
  })

  /** The map is a descent. Wrapping from the abyss to the tide pools loses that. */
  test('stops at both ends instead of wrapping', () => {
    expect(moveCursor(half, 0, -1)).toBe(0)
    expect(moveCursor(half, 2, 1)).toBe(2)
  })

  test('a delta of zero is a no-op', () => {
    expect(moveCursor(half, 1, 0)).toBe(1)
  })
})

describe('the map screen, driven from the keyboard', () => {
  function press(s: Session, act: number, prev = 0): void {
    updateSession(s, frameFromMasks(act, prev))
  }

  function atMap(unlocked: string[] = []): Session {
    const s = createSession(campaign()[0]!, { progress: () => ({ ...NO_PROGRESS, unlocked }) })
    press(s, Act.Jump)
    expect(s.screen).toBe('worldMap')
    return s
  }

  test('the title opens the map, and the map starts the level', () => {
    const s = atMap()
    press(s, Act.Jump)
    expect(s.screen).toBe('playing')
    expect(s.level.id).toBe(campaign()[0]!.id)
  })

  test('it opens on the deepest unlocked level, not always on World 1', () => {
    const s = atMap(campaign().slice(0, 4).map((d) => d.id))
    expect(s.cursor).toBe(3)
    press(s, Act.Jump)
    expect(s.level.id).toBe(campaign()[3]!.id)
  })

  test('up and down move it, and a locked node cannot be entered', () => {
    const s = atMap(campaign().slice(0, 2).map((d) => d.id))
    expect(s.cursor).toBe(1)
    press(s, Act.Up)
    expect(s.cursor).toBe(0)
    press(s, Act.Down)
    expect(s.cursor).toBe(1)
    press(s, Act.Down) // level 3 is locked
    expect(s.cursor).toBe(1)
  })

  /**
   * §11.1: "Any cleared level can be replayed freely... never re-locks
   * anything and never costs a continue; it starts a fresh score." Five of the
   * fifteen pearls are gated behind later worlds, so this is what makes a third
   * of the collectibles reachable at all.
   */
  test('a replay starts a fresh run at full lives and no score', () => {
    const ids = campaign().map((d) => d.id)
    const s = createSession(campaign()[0]!, {
      progress: () => ({ ...NO_PROGRESS, unlocked: ids, cleared: ids }),
    })
    s.score = 90_000
    s.continues = 1
    press(s, Act.Jump)
    press(s, Act.Up, Act.Jump) // step back up the descent
    press(s, Act.Jump)

    expect(s.screen).toBe('playing')
    expect(s.score).toBe(0)
    expect(s.lives).toBe(RULES.START_LIVES)
    expect(s.continues).toBe(RULES.CONTINUES)
    expect(s.replay).toBe(true)
  })

  test('a level not yet cleared is not a replay, so it rolls into the next world', () => {
    const s = atMap()
    press(s, Act.Jump)
    expect(s.replay).toBe(false)
  })

  test('pausing and quitting to the map abandons the level without failing it', () => {
    const s = atMap()
    press(s, Act.Jump)
    const continues = s.continues
    press(s, Act.Pause)
    expect(s.screen).toBe('paused')
    press(s, Act.Down)
    expect(s.screen).toBe('worldMap')
    expect(s.continues).toBe(continues)
  })

  /** Anything outside the campaign has no node, so it is entered directly. */
  test('the grey box skips the map entirely', () => {
    const s = createSession({ id: 'gb', name: 'GB', chapter: 'test', order: 0, tiles: ['S.', '##'] })
    press(s, Act.Jump)
    expect(s.screen).toBe('playing')
  })

  test('opening the map re-reads the save rather than trusting a stale list', () => {
    let unlocked: string[] = []
    const s = createSession(campaign()[0]!, { progress: () => ({ ...NO_PROGRESS, unlocked }) })
    press(s, Act.Jump)
    expect(s.nodes[1]!.unlocked).toBe(false)

    unlocked = [campaign()[1]!.id]
    openMap(s)
    expect(s.nodes[1]!.unlocked).toBe(true)
    expect(s.cursor).toBe(1)
  })
})
