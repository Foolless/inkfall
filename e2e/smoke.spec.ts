import { expect, test, type Page } from '@playwright/test'

/**
 * Confirm past a screen that ignores the key until it is ready.
 *
 * The level-clear tally gates its confirm on `tallyClock > TALLY_LINE_FRAMES`
 * — a count of *simulation frames*, not wall time. On a loaded machine 600 ms
 * of `waitForTimeout` is not 24 frames, and a single press lands on a screen
 * that is still counting and is dropped. Pressing until the screen actually
 * changes is the same user action and is not a race.
 */
async function confirmUntil(page: Page, screen: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const now = await page.evaluate(() => window.__inkfall!.screen())
    if (now === screen) return
    await page.keyboard.press('Space')
    // `press` only *dispatches* the key — the simulation consumes it on its next
    // frame. Waiting for the screen to actually change is what stops the next
    // press landing on the screen this one just reached, which is how a target
    // of `title` gets overshot into `playing` and never observed at all.
    await page.waitForFunction((s) => window.__inkfall?.screen() !== s, now, { timeout: 2_000 }).catch(() => {})
  }
  throw new Error(`never reached the ${screen} screen`)
}

/**
 * Wait for the simulation to advance N frames.
 *
 * Not `waitForTimeout`: the game steps on a fixed 60 Hz accumulator, and on a
 * loaded machine 120 ms of wall clock is not seven frames. Every "press a key
 * and see what happened" check below needs *frames*, not milliseconds.
 */
async function advance(page: Page, frames: number): Promise<void> {
  const from = await page.evaluate(() => window.__inkfall!.frame())
  await page.waitForFunction((n) => (window.__inkfall?.frame() ?? 0) >= n, from + frames)
}

/**
 * Browser smoke: does it load, run, respond to input, and survive a reload?
 *
 * Deliberately thin. Rendering internals are covered by human eyes, not by
 * pixel diffs — those fail for reasons nobody can act on. What this catches is
 * the class of bug unit tests structurally cannot: a broken module graph, a
 * canvas that never gets a context, a base path that 404s its own bundle.
 */
test('the game loads and runs', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page.locator('canvas#game')).toBeVisible()
  await page.waitForFunction(() => window.__inkfall !== undefined)
  await confirmUntil(page, 'playing') // title, world map, World 1

  // The canvas must be at the internal resolution, integer-scaled by CSS.
  const size = await page.locator('canvas#game').evaluate((el: HTMLCanvasElement) => ({
    w: el.width,
    h: el.height,
    cssW: parseInt(getComputedStyle(el).width, 10),
  }))
  expect(size.w).toBe(320)
  expect(size.h).toBe(180)
  expect(size.cssW % 320).toBe(0)

  await page.waitForFunction(() => (window.__inkfall?.frame() ?? 0) > 30)
  expect(errors, `console errors: ${errors.join('; ')}`).toEqual([])
})

test('the simulation advances and responds to the keyboard', async ({ page }) => {
  await page.goto('/?level=greybox')
  await page.waitForFunction(() => window.__inkfall !== undefined)
  await page.keyboard.press('Space')
  await page.waitForFunction(() => (window.__inkfall?.frame() ?? 0) > 10)

  const before = await page.evaluate(() => window.__inkfall!.frame())
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => window.__inkfall!.frame())
  expect(after).toBeGreaterThan(before)

  // Dashing must spend a pip — proof that input reaches the simulation.
  const inkBefore = await page.evaluate(() => window.__inkfall!.ink())
  await page.keyboard.press('KeyX')
  await advance(page, 10)
  const inkAfter = await page.evaluate(() => window.__inkfall!.ink())
  expect(inkAfter).toBeLessThan(inkBefore)
})

test('respawn restores Full — never Spent, never Charged', async ({ page }) => {
  await page.goto('/?level=greybox')
  await page.waitForFunction(() => window.__inkfall !== undefined)
  await page.keyboard.press('Space')
  await page.waitForFunction(() => (window.__inkfall?.frame() ?? 0) > 10)
  await page.evaluate(() => window.__inkfall!.kill())
  expect(await page.evaluate(() => window.__inkfall!.tier())).toBe(1)
})

/**
 * The whole shell, driven from the keyboard: title, play, clear, and straight
 * into the next world. This is the class of bug unit tests structurally cannot
 * catch — a screen the state machine can reach but that never renders, or a key
 * the browser swallows before the simulation sees it.
 */
test('title to play to level clear to the next world, without touching the console', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await page.waitForFunction(() => window.__inkfall !== undefined)
  expect(await page.evaluate(() => window.__inkfall!.screen())).toBe('title')

  // The map is the campaign's front door as of 4.4: title, map, then a level.
  await page.keyboard.press('Space')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'worldMap')
  await confirmUntil(page, 'playing')
  expect(await page.evaluate(() => window.__inkfall!.lives())).toBe(3)

  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'paused')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'playing')

  expect(await page.evaluate(() => window.__inkfall!.level())).toBe('w01-tidepools')
  await page.evaluate(() => window.__inkfall!.clear())
  await page.waitForFunction(() => window.__inkfall!.screen() === 'levelClear')

  await confirmUntil(page, 'playing')

  // Clearing World 1 grants the Ink Shot and opens World 2 — the first link of
  // the chain that makes five levels one game.
  expect(await page.evaluate(() => window.__inkfall!.level())).toBe('w02-kelp')
  expect(await page.evaluate(() => window.__inkfall!.upgrades())).toContain('inkShot')
  expect(await page.evaluate(() => window.__inkfall!.score())).toBeGreaterThan(0)
  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
})

/** The chapter owns the music, so crossing into a new world changes the track. */
test('the theme follows the chapter across a world boundary', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__inkfall !== undefined)
  await confirmUntil(page, 'playing')
  await page.waitForFunction(() => window.__inkfall!.audio().started)
  expect(await page.evaluate(() => window.__inkfall!.audio().playing)).toBe('world1')

  await page.evaluate(() => window.__inkfall!.clear())
  await page.waitForFunction(() => window.__inkfall!.screen() === 'levelClear')
  await confirmUntil(page, 'playing')
  await page.waitForFunction(() => window.__inkfall!.audio().playing === 'world2')
})

/**
 * Progress survives a reload. The one bug class that costs a player their
 * evening, so it gets a browser test rather than a unit test with a fake.
 */
test('clearing a level persists to localStorage and survives a reload', async ({ page }) => {
  await page.goto('/?level=greybox')
  await page.waitForFunction(() => window.__inkfall !== undefined)
  await page.keyboard.press('Space')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'playing')

  await page.evaluate(() => window.__inkfall!.clear())
  await page.waitForFunction(() => window.__inkfall!.screen() === 'levelClear')
  await confirmUntil(page, 'title')

  const stored = await page.evaluate(() => window.localStorage.getItem('inkfall.save.v1'))
  expect(stored, 'nothing was written to the save key').not.toBeNull()
  expect(JSON.parse(stored!).progress.cleared).toContain('greybox')

  await page.reload()
  await page.waitForFunction(() => window.__inkfall !== undefined)
  const after = await page.evaluate(() => window.localStorage.getItem('inkfall.save.v1'))
  expect(JSON.parse(after!).progress.cleared).toContain('greybox')
})

/** A save we cannot read must never be the reason someone loses their progress. */
test('a corrupt save falls back to defaults, keeps a backup, and never clears the key', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.addInitScript(() => {
    window.localStorage.setItem('inkfall.save.v1', '{"version":1,"progress":')
  })
  await page.goto('/')
  await page.waitForFunction(() => window.__inkfall !== undefined)

  const state = await page.evaluate(() => ({
    original: window.localStorage.getItem('inkfall.save.v1'),
    backup: window.localStorage.getItem('inkfall.save.v1.bak'),
  }))
  expect(state.original).toBe('{"version":1,"progress":')
  expect(state.backup).toBe('{"version":1,"progress":')

  await expect(page.locator('#toast')).toBeVisible()
  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
})

/**
 * Audio, as far as a machine can check it: nothing before the gesture, a real
 * context and the chapter's theme after it, and mute on one key. Whether the
 * synth sounds *good* is checkpoint 2.7's judgement call, and needs ears.
 */
test('audio stays silent until a gesture, then plays the chapter theme', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/?level=w01-tidepools')
  await page.waitForFunction(() => window.__inkfall !== undefined)
  expect(await page.evaluate(() => window.__inkfall!.audio().started)).toBe(false)

  await page.keyboard.press('Space')
  await page.waitForFunction(() => window.__inkfall!.audio().started)

  const state = await page.evaluate(() => window.__inkfall!.audio())
  expect(state.playing).toBe('world1')
  expect(state.muted).toBe(false)

  await page.keyboard.press('KeyM')
  await page.waitForFunction(() => window.__inkfall!.audio().muted)

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
})

/**
 * The level editor's round trip, driven in a real browser.
 *
 * The unit tests prove the *format* round-trips; this proves the tool wired to
 * it does — that painting a tile changes exactly one character of the source
 * and nothing else, which is the property that makes it safe to use on a level
 * somebody already built.
 */
test('the level editor round-trips a level and paints exactly what it says', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/tools/level-editor/index.html')
  await page.waitForFunction(() => window.__editor !== undefined)
  await expect(page.locator('canvas#grid')).toBeVisible()

  const original = [
    "export const fixture: LevelDef = {",
    "  id: 'fixture',",
    "  name: 'Fixture',",
    "  chapter: 'test',",
    "  order: 0,",
    "  tiles: [",
    "    'S.........',",
    "    '..........',",
    "    '##########',",
    "  ],",
    "  entities: [",
    "    { type: 'snapper', x: 4, y: 1, patrol: [2, 7] },",
    "  ],",
    "}",
    "",
  ].join('\n')

  // In and straight back out again: what the tool writes is what it read.
  await page.evaluate((src) => window.__editor!.load(src), original)
  expect(await page.evaluate(() => window.__editor!.source())).toBe(original)

  // One tile painted changes one character, and the entity list is untouched.
  await page.evaluate(() => window.__editor!.paint(3, 1, '#'))
  const painted = await page.evaluate(() => window.__editor!.source())
  expect(painted).toContain("'...#......',")
  expect(painted).toContain("{ type: 'snapper', x: 4, y: 1, patrol: [2, 7] }")

  // And a placed entity lands in the list rather than in the grid.
  await page.evaluate(() => window.__editor!.place('pearl', 8, 1))
  const withPearl = await page.evaluate(() => window.__editor!.source())
  expect(withPearl).toContain("{ type: 'pearl', x: 8, y: 1, id: 0 }")
  expect(withPearl).toContain("'...#......',")

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
})

/** A grid the game would refuse must be refused here, under the grid. */
test('the level editor reports what is wrong instead of accepting it', async ({ page }) => {
  await page.goto('/tools/level-editor/index.html')
  await page.waitForFunction(() => window.__editor !== undefined)

  const ragged = "{ id: 'bad', name: 'Bad', chapter: 'test', order: 0, tiles: ['S..', '##'] }"
  await page.evaluate((src) => window.__editor!.load(src), ragged)
  expect(await page.evaluate(() => window.__editor!.status())).toContain('ragged')
})

/**
 * Assist Mode, driven exactly as a player reaches it: one key on the title.
 *
 * The unit tests prove the *rules* — lives do not go down, enemies are slower.
 * This proves the switch is reachable without a console, that the setting
 * survives a reload, and that a death in an assist run does not end it. Gate 3
 * failed on that last point, so it gets a browser test rather than trust.
 */
test('assist mode is one key on the title, and it survives a reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/?level=greybox')
  await page.waitForFunction(() => window.__inkfall !== undefined)
  expect(await page.evaluate(() => window.__inkfall!.assist())).toBe(false)

  await page.keyboard.press('KeyA')
  await page.waitForFunction(() => window.__inkfall!.assist())

  const stored = await page.evaluate(() => window.localStorage.getItem('inkfall.save.v1'))
  expect(JSON.parse(stored!).settings.assistMode).toBe(true)

  // Into a level, and die more times than a classic run has lives.
  await page.keyboard.press('Space')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'playing')
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__inkfall!.kill())
    await advance(page, 10)
  }
  expect(await page.evaluate(() => window.__inkfall!.screen())).toBe('playing')
  expect(await page.evaluate(() => window.__inkfall!.lives())).toBe(3)

  await page.reload()
  await page.waitForFunction(() => window.__inkfall !== undefined)
  expect(await page.evaluate(() => window.__inkfall!.assist())).toBe(true)
  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
})

/**
 * The world map, in a real browser: it renders, it remembers, and it is the
 * way back into a cleared level.
 *
 * The remembering is the part worth a browser test. Progress had been written
 * to the save since Phase 2 and never read back, so every session began at the
 * tide pools however far anyone had got — a bug that only exists across a
 * reload, which is exactly what a unit test cannot see.
 */
test('the world map remembers how far you got, across a reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await page.waitForFunction(() => window.__inkfall !== undefined)
  await confirmUntil(page, 'playing')
  await page.evaluate(() => window.__inkfall!.clear())
  await page.waitForFunction(() => window.__inkfall!.screen() === 'levelClear')
  await confirmUntil(page, 'playing')
  expect(await page.evaluate(() => window.__inkfall!.level())).toBe('w02-kelp')

  // Reload: the map must open on World 2, not send the player back to World 1.
  await page.reload()
  await page.waitForFunction(() => window.__inkfall !== undefined)
  await page.keyboard.press('Space')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'worldMap')
  await confirmUntil(page, 'playing')
  expect(await page.evaluate(() => window.__inkfall!.level())).toBe('w02-kelp')

  // And World 1 is still reachable, because five pearls depend on going back.
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'paused')
  await page.keyboard.press('ArrowDown')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'worldMap')
  await page.keyboard.press('ArrowUp')
  await confirmUntil(page, 'playing')
  expect(await page.evaluate(() => window.__inkfall!.level())).toBe('w01-tidepools')

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
})

/**
 * Assist Mode, changed from the pause screen, reaches the level already
 * running.
 *
 * The setting lives in two places: the session decides whether a death costs a
 * life, the world decides whether enemies are slowed. Options set only the
 * first, so a paused player who turned assist on got unlimited lives against
 * classic-speed enemies — a difficulty nobody chose, from a row that looked
 * like it had worked.
 */
test('assist mode changed from the pause screen reaches the running level', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/?level=greybox')
  await page.waitForFunction(() => window.__inkfall !== undefined)
  await confirmUntil(page, 'playing')
  await advance(page, 10)
  expect(await page.evaluate(() => window.__inkfall!.assist())).toBe(false)

  // Pause, up into Options, right on the first row — which is Assist Mode.
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'paused')
  await page.keyboard.press('ArrowUp')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'options')
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() => window.__inkfall!.assist())
  expect(await page.evaluate(() => window.__inkfall!.worldAssist()), 'the world was left behind').toBe(true)

  // Back into the same level — not a fresh one. The frame counter is the proof.
  const frame = await page.evaluate(() => window.__inkfall!.frame())
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'paused')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'playing')
  expect(await page.evaluate(() => window.__inkfall!.frame())).toBeGreaterThanOrEqual(frame)

  // And turning it back off puts both halves back.
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'paused')
  await page.keyboard.press('ArrowUp')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'options')
  await page.keyboard.press('ArrowLeft')
  await page.waitForFunction(() => !window.__inkfall!.assist())
  expect(await page.evaluate(() => window.__inkfall!.worldAssist())).toBe(false)

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
})

/**
 * The debug route lands in a level that can actually be finished.
 *
 * `?level=w02-kelp` on a fresh save started with an empty loadout, and World
 * 2's first room is a kelp knot only the Ink Shot opens — a level with no exit,
 * reachable by the URL the README tells people to use. Only a browser sees it:
 * the loadout is composed at boot, out of the query string and the save.
 */
test('a level entered by URL starts with what the campaign would have given', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/?level=w02-kelp')
  await page.waitForFunction(() => window.__inkfall !== undefined)
  expect(await page.evaluate(() => window.__inkfall!.upgrades())).toContain('inkShot')

  // World 1 is the start of the campaign and is owed nothing.
  await page.goto('/?level=w01-tidepools')
  await page.waitForFunction(() => window.__inkfall !== undefined)
  expect(await page.evaluate(() => window.__inkfall!.upgrades())).toEqual([])

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
})

/**
 * Options, driven from the keyboard: change a setting, rebind a key, and check
 * both survive a reload.
 *
 * Rebinding is the one setting that can only be verified in a real browser —
 * it changes what the browser's own key events mean, and a unit test with a
 * fake window proves the table is right without proving it is *installed*.
 */
test('options change settings and rebind keys, and both persist', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/?level=greybox')
  await page.waitForFunction(() => window.__inkfall !== undefined)

  // Up from the title opens Options; the first row is Assist Mode.
  await page.keyboard.press('ArrowUp')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'options')
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() => window.__inkfall!.assist())

  // Walk down to INK DASH and put it on Q.
  const dashRow = await page.evaluate(() => window.__inkfall!.optionRows().indexOf('bind.dash'))
  expect(dashRow).toBeGreaterThan(0)
  for (let i = 0; i < dashRow; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await page.waitForFunction(() => window.__inkfall!.listening() === 'bind.dash')
  await page.keyboard.press('KeyQ')
  await page.waitForFunction(() => window.__inkfall!.listening() === null)

  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__inkfall!.screen() === 'title')

  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('inkfall.save.v1')!))
  expect(stored.settings.assistMode).toBe(true)
  expect(stored.settings.keybinds.dash).toEqual(['KeyQ'])

  // And the new key actually dashes, while the old one no longer does.
  await page.reload()
  await page.waitForFunction(() => window.__inkfall !== undefined)
  await confirmUntil(page, 'playing')
  await page.waitForFunction(() => (window.__inkfall?.frame() ?? 0) > 10)

  const before = await page.evaluate(() => window.__inkfall!.ink())
  await page.keyboard.press('KeyX')
  await advance(page, 15)
  expect(await page.evaluate(() => window.__inkfall!.ink()), 'X still dashed after rebinding').toBe(before)

  await page.keyboard.press('KeyQ')
  await advance(page, 15)
  expect(await page.evaluate(() => window.__inkfall!.ink())).toBeLessThan(before)

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([])
})

test('the sprite editor loads', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/tools/sprite-editor/index.html')
  await expect(page.locator('canvas#grid')).toBeVisible()
  await expect(page.locator('#source')).toHaveValue(/SpriteDef/)
  expect(errors).toEqual([])
})
