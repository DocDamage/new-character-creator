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
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    window.localStorage.clear()
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('#character').waitFor()
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