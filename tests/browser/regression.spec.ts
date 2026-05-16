import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { expect, test } from '@playwright/test'

type RenderedFrameSetDownload = {
  format: string
  frames: unknown[]
  spritesheets: unknown[]
  gif_previews: unknown[]
}

type FullPackageManifestDownload = {
  format: string
  rendered_outputs: {
    frame_count: number
  }
  reusable_part_folders: unknown[]
  extraction_provenance: unknown[]
  engine_exports: {
    godot_4: {
      scene_text: string
    }
  }
}

test.beforeEach(async ({ page }) => {
  const startupConsoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      startupConsoleErrors.push(message.text())
    }
  })

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('#character').waitFor()
  expect(startupConsoleErrors, 'startup should not emit console errors').toEqual([])
})

test('manual cleanup save persists after reload', async ({ page }) => {
  await page.getByTestId('nav-workstation').click()
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByText('New manual part will be created from the current region mask.')).toBeVisible()
  await page.getByTestId('save-mask-part').click()
  await expect(page.getByText(/saved as a reviewed manual part/i)).toBeVisible()
  const manualPartId = await page.getByTestId('mask-editor-part-select').inputValue()
  expect(manualPartId.endsWith('_manual')).toBeTruthy()

  await page.getByTestId('nav-library').click()
  await page.getByTestId('part-library-method-filter').selectOption('manual')
  await expect(page.getByText(manualPartId)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark unreviewed' }).first()).toBeVisible()

  await page.reload()
  await page.locator('#character').waitFor()
  await page.getByTestId('nav-library').click()
  await page.getByTestId('part-library-method-filter').selectOption('manual')
  await expect(page.getByText(manualPartId)).toBeVisible()
})

test('rendered export and package downloads stay structurally valid', async ({ page }) => {
  await page.getByTestId('nav-exports').click()

  const renderedFrameSet = await readJsonDownload<RenderedFrameSetDownload>(page, async () => {
    await page.getByTestId('export-rendered-frame-set').click()
  })
  expect(renderedFrameSet.format).toBe('pixel_creator_rendered_frame_set')
  expect(renderedFrameSet.frames.length).toBeGreaterThan(0)
  expect(renderedFrameSet.spritesheets.length).toBeGreaterThan(0)
  expect(renderedFrameSet.gif_previews.length).toBeGreaterThan(0)

  const fullPackageManifest = await readJsonDownload<FullPackageManifestDownload>(page, async () => {
    await page.getByTestId('export-full-package-manifest').click()
  })
  expect(fullPackageManifest.format).toBe('pixel_creator_full_package')
  expect(fullPackageManifest.rendered_outputs.frame_count).toBeGreaterThan(0)
  expect(Array.isArray(fullPackageManifest.reusable_part_folders)).toBeTruthy()
  expect(Array.isArray(fullPackageManifest.extraction_provenance)).toBeTruthy()
  expect(fullPackageManifest.engine_exports.godot_4.scene_text).toContain('[gd_scene')

  const fullPackageEntries = await readZipEntries(page, async () => {
    await page.getByTestId('export-full-package-zip').click()
  })
  expect(fullPackageEntries.some((entry) => entry.endsWith('/package_manifest.json'))).toBeTruthy()
  expect(fullPackageEntries.some((entry) => entry.includes('/exports/godot/') && entry.endsWith('.tscn'))).toBeTruthy()
  expect(fullPackageEntries.some((entry) => entry.includes('/exports/unity/') && entry.endsWith('.json'))).toBeTruthy()
  expect(fullPackageEntries.some((entry) => entry.includes('/exports/rpg_maker/') && entry.endsWith('.json'))).toBeTruthy()
  expect(fullPackageEntries.some((entry) => entry.includes('/exports/aseprite/') && entry.endsWith('.json'))).toBeTruthy()
  expect(fullPackageEntries.some((entry) => entry.includes('/rendered/frames/') && entry.endsWith('.png'))).toBeTruthy()
  expect(fullPackageEntries.some((entry) => entry.includes('/rendered/sheets/') && entry.endsWith('.png'))).toBeTruthy()
})

test('recipe save-load and bulk review actions stay usable', async ({ page }) => {
  await page.getByTestId('nav-fast').click()
  await page.getByTestId('recipe-name-input').fill('Playwright Recipe')
  await page.getByTestId('save-recipe-button').click()
  await page.getByTestId('new-recipe-button').click()
  await expect(page.getByTestId('recipe-name-input')).toHaveValue('Draft kitbash')
  const savedRecipeValue = await page.getByTestId('load-saved-recipe-select').locator('option').nth(1).getAttribute('value')
  expect(savedRecipeValue).toBeTruthy()
  await page.getByTestId('load-saved-recipe-select').selectOption(savedRecipeValue ?? undefined)
  await expect(page.getByTestId('recipe-name-input')).toHaveValue('Playwright Recipe')

  await page.getByTestId('nav-workstation').click()
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.getByRole('button', { name: /Preset regions/i }).click()
  await page.getByTestId('extract-current-region').click()

  await page.getByTestId('nav-library').click()
  await page.getByTestId('part-library-method-filter').selectOption('preset_region')
  await expect(page.getByRole('button', { name: 'Mark reviewed' }).first()).toBeVisible()
  await page.getByTestId('mark-visible-reviewed').click()
  await expect(page.getByRole('button', { name: 'Mark unreviewed' }).first()).toBeVisible()
  await page.getByTestId('mark-visible-unreviewed').click()
  await expect(page.getByRole('button', { name: 'Mark reviewed' }).first()).toBeVisible()
})

test('APES harness generation, reload, and pasted import stay usable', async ({ page }) => {
  await page.getByTestId('nav-apes').click()
  await page.getByTestId('generate-apes-qa-harness').click()
  await expect(page.getByTestId('apes-bridge-status')).toContainText(/Generated and imported the local APES QA harness/i, { timeout: 30_000 })

  await page.getByTestId('nav-library').click()
  await page.getByTestId('part-library-method-filter').selectOption('apes')
  await expect(page.getByText(/qa harness/i).first()).toBeVisible()
  await expect(page.getByText(/confidence/i).first()).toBeVisible()

  await page.getByTestId('nav-apes').click()
  await page.getByTestId('load-apes-qa-report').click()
  await expect(page.getByTestId('apes-bridge-status')).toContainText(/Loaded and replaced the APES QA sample report/i)

  const harnessText = await page.evaluate(async () => {
    const response = await fetch('/data/qa/apes_report_harness.json')
    if (!response.ok) {
      throw new Error(`Harness request failed with status ${response.status}`)
    }
    return response.text()
  })
  await page.getByTestId('apes-report-json-input').fill(harnessText)
  await page.getByTestId('import-apes-report-json').click()
  await expect(page.getByTestId('apes-bridge-status')).toContainText(/Imported APES report from pasted JSON/i)
})

test('Duelyst audit stays usable with or without the local package', async ({ page }) => {
  await page.getByTestId('nav-audit').click()
  await page.getByTestId('run-duelyst-audit').click()
  await expect(page.getByTestId('duelyst-status')).not.toContainText(/Analyzing Duelyst package/i, { timeout: 120_000 })

  const duelystStatus = await page.getByTestId('duelyst-status').innerText()
  if (/package not found/i.test(duelystStatus)) {
    await expect(page.getByTestId('duelyst-status')).toContainText(/Package not found at/i)
    return
  }

  const stagedButtons = page.locator('[data-testid^="open-duelyst-stage-"]')
  await expect(stagedButtons.first()).toBeVisible({ timeout: 120_000 })
  await stagedButtons.first().click()
  await expect(page.locator('#character')).toHaveValue(/duelyst_/, { timeout: 30_000 })
})

test('settings can export a portable local setup bundle', async ({ page }) => {
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('settings-asset-root-input').fill('D:\\sprite-packs\\Animated-Pixel-Pack-Characters-V1')
  await page.getByTestId('settings-apes-python-input').fill('C:\\APES\\python.exe')

  const bundleText = await readTextDownload(page, async () => {
    await page.getByTestId('download-local-setup-bundle').click()
  })
  expect(bundleText).toContain('# Pixel Creator local setup bundle')
  expect(bundleText).toContain('D:\\sprite-packs\\Animated-Pixel-Pack-Characters-V1')
  expect(bundleText).toContain('C:\\APES\\python.exe')
  expect(bundleText).toContain('npm run test:browser')
  expect(bundleText).toContain('.\\tools\\apes_bridge\\setup_home_pc.ps1')
})

async function readJsonDownload<T>(page: Parameters<typeof test>[0]['page'], trigger: () => Promise<void>) {
  const downloadPromise = page.waitForEvent('download')
  await trigger()
  const download = await downloadPromise
  const filePath = await download.path()
  if (!filePath) {
    throw new Error(`Download path unavailable for ${download.suggestedFilename()}`)
  }

  const fileText = await readFile(filePath, 'utf8')
  return JSON.parse(fileText) as T
}

async function readZipEntries(page: Parameters<typeof test>[0]['page'], trigger: () => Promise<void>) {
  const downloadPromise = page.waitForEvent('download')
  await trigger()
  const download = await downloadPromise
  const filePath = await download.path()
  if (!filePath) {
    throw new Error(`Zip download path unavailable for ${download.suggestedFilename()}`)
  }

  const buffer = await readFile(filePath)
  const zip = await JSZip.loadAsync(buffer)
  return Object.keys(zip.files)
}

async function readTextDownload(page: Parameters<typeof test>[0]['page'], trigger: () => Promise<void>) {
  const downloadPromise = page.waitForEvent('download')
  await trigger()
  const download = await downloadPromise
  const filePath = await download.path()
  if (!filePath) {
    throw new Error(`Download path unavailable for ${download.suggestedFilename()}`)
  }

  return readFile(filePath, 'utf8')
}
