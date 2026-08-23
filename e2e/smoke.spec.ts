import { expect, test } from '@playwright/test'

/**
 * Browser smoke: does it load, run, respond to input, and survive a reload?
 *
 * Deliberately thin. Rendering internals are covered by human eyes, not by
 * pixel diffs — those fail for reasons nobody can act on. What this catches is
 * the class of bug unit tests structurally cannot: a broken module graph, a
 * canvas that never gets a context, a base path that 404s its own bundle.
 */
test('the grey box loads and runs', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page.locator('canvas#game')).toBeVisible()

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
  await page.goto('/')
  await page.waitForFunction(() => (window.__inkfall?.frame() ?? 0) > 10)

  const before = await page.evaluate(() => window.__inkfall!.frame())
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => window.__inkfall!.frame())
  expect(after).toBeGreaterThan(before)

  // Dashing must spend a pip — proof that input reaches the simulation.
  const inkBefore = await page.evaluate(() => window.__inkfall!.ink())
  await page.keyboard.press('KeyX')
  await page.waitForTimeout(120)
  const inkAfter = await page.evaluate(() => window.__inkfall!.ink())
  expect(inkAfter).toBeLessThan(inkBefore)
})

test('respawn restores Full — never Spent, never Charged', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window.__inkfall?.frame() ?? 0) > 10)
  await page.evaluate(() => window.__inkfall!.kill())
  expect(await page.evaluate(() => window.__inkfall!.tier())).toBe(1)
})

test('the sprite editor loads', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/tools/sprite-editor/index.html')
  await expect(page.locator('canvas#grid')).toBeVisible()
  await expect(page.locator('#source')).toHaveValue(/SpriteDef/)
  expect(errors).toEqual([])
})
