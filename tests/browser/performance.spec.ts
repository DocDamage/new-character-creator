import { expect, test } from '@playwright/test'
import { performanceBudget } from '../../src/performanceBudget'

test('large catalog browsing keeps image cache bounded', async ({ page }) => {
  await page.goto('/')
  await page.locator('#character').waitFor()
  await page.getByTestId('nav-library').click()
  for (let index = 0; index < 20; index += 1) {
    await page.mouse.wheel(0, 900)
  }
  const cacheSize = await page.evaluate(() => window.__spriteCreatorDiagnostics?.imageCacheSize ?? 0)
  expect(cacheSize).toBeLessThanOrEqual(performanceBudget.imageCacheMaxEntries)
})
