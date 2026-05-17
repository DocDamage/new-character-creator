import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

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

  const spriteFramesText = await readTextDownload(page, async () => {
    await page.getByRole('button', { name: 'Download SpriteFrames resource' }).click()
  })
  expect(spriteFramesText).toContain('[gd_resource type="SpriteFrames"')
  expect(spriteFramesText).toContain('[ext_resource type="Texture2D"')
  expect(spriteFramesText).toContain('rendered/frames')
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

test('workstation APES mode does not create fake rectangular APES parts', async ({ page }) => {
  await page.getByTestId('nav-workstation').click()
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.getByTestId('extract-current-region').click()
  await expect(page.getByText(/Create an APES job/i)).toBeVisible()

  await page.getByTestId('nav-library').click()
  await page.getByTestId('part-library-method-filter').selectOption('apes')
  await expect(page.getByText('No parts in the library yet. Extract a region or connected cluster from the Art Workstation.')).toBeVisible()
})

test('APES harness generation, reload, and pasted import stay usable', async ({ page }) => {
  await page.getByTestId('nav-apes').click()
  await page.getByTestId('generate-apes-qa-harness').click()
  await expect(page.getByTestId('apes-bridge-status')).toContainText(/Generated and imported the local APES QA harness/i, { timeout: 120_000 })

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

test('APES prep actions surface fine-tune artifacts and queue Duelyst jobs', async ({ page }) => {
  const fixtureJob = {
    job_id: 'apes_duelyst_fixture_001',
    character_id: 'duelyst_fixture_unit',
    animations: ['idle'],
    directions: ['south'],
    frame_range: [0, 1],
    output_labels: ['head', 'torso', 'front_arm', 'back_arm', 'front_leg', 'back_leg'],
    status: 'prepared',
    created_at: '2026-05-17T00:00:00.000Z',
    input_frames: [
      { animation: 'idle', direction: 'south', frame_index: 0, path: '/data/qa/apes_harness_job/source.png' },
      { animation: 'idle', direction: 'south', frame_index: 1, path: '/data/qa/apes_harness_job/source.png' },
    ],
    output_root: 'data/apes/output/apes_duelyst_fixture_001',
    logs: ['Prepared from private Duelyst staged atlas frames.'],
  }

  await page.route('**/__local/apes-tools', async (route) => {
    const payload = route.request().postDataJSON() as { action?: string }
    if (payload.action === 'prepare-finetune') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          action: 'prepare-finetune',
          pythonPath: 'python',
          statusCode: 0,
          stdout: 'Wrote APES fine-tune manifest',
          stderr: '',
          finetuneManifest: {
            format: 'pixel_creator_apes_finetune_manifest',
            output_root: 'data/training/apes_finetune',
            datasets: {
              okay_samurai_supervised: {},
              duelyst_private_runtime: {},
            },
            commands: {
              corrnet: 'python train_corrnet.py',
            },
            warnings: ['fixture warning'],
          },
        }),
      })
      return
    }
    if (payload.action === 'prepare-duelyst-jobs') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          action: 'prepare-duelyst-jobs',
          pythonPath: 'python',
          statusCode: 0,
          stdout: 'Wrote 1 Duelyst APES job(s)',
          stderr: '',
          duelystJobBatch: {
            format: 'pixel_creator_duelyst_apes_job_batch',
            input_root: 'data/apes/input',
            job_count: 1,
            success_count: 0,
            failure_count: 0,
            filters: { role: 'apes', body_class: 'all', limit: null },
            jobs: [
              {
                job_id: fixtureJob.job_id,
                character_id: fixtureJob.character_id,
                job_path: 'data/apes/input/apes_duelyst_fixture_001/job.json',
                output_root: fixtureJob.output_root,
                training_role: 'apes_unit',
                body_class: 'humanoid',
              },
            ],
            job_configs: [fixtureJob],
            warnings: ['Review generated masks before using them in generated character parts.'],
          },
        }),
      })
      return
    }
    await route.continue()
  })

  await page.getByTestId('nav-apes').click()
  await page.getByTestId('prepare-apes-finetune').click()
  await expect(page.getByTestId('apes-bridge-status')).toContainText(/Prepared APES fine-tune manifest with 2 dataset section/i)
  await expect(page.getByTestId('apes-prep-artifacts')).toContainText(/Fine-tune manifest: 2 dataset section/i)

  await page.getByTestId('prepare-duelyst-apes-jobs').click()
  await expect(page.getByTestId('apes-bridge-status')).toContainText(/Prepared 1 Duelyst APES job/i)
  await expect(page.getByTestId('apes-prep-artifacts')).toContainText(/Duelyst job batch: 1 job/i)
  await expect(page.getByTestId('run-prepared-duelyst-apes-jobs')).toContainText('Run Duelyst queue (1)')
  await expect(page.getByText('apes_duelyst_fixture_001')).toBeVisible()
})

test('imported APES parts include image and mask files in full package exports', async ({ page }) => {
  const localReport = await writeLocalApesAssetReport()
  try {
    await page.getByTestId('nav-apes').click()
    await page.getByTestId('apes-report-json-input').fill(JSON.stringify(localReport))
    await page.getByTestId('import-apes-report-json').click()
    await expect(page.getByTestId('apes-bridge-status')).toContainText(/Imported APES report from pasted JSON/i)

    await page.getByTestId('nav-library').click()
    await page.getByTestId('part-library-method-filter').selectOption('apes')
    await page.getByTestId('mark-visible-reviewed').click()

    await page.getByTestId('nav-fast').click()
    const headLayer = page.locator('.composer-layer').filter({ hasText: 'head source' })
    await headLayer.locator('select').nth(1).selectOption({ index: 1 })

    await page.getByTestId('nav-exports').click()
    const fullPackageEntries = await readZipEntries(page, async () => {
      await page.getByTestId('export-full-package-zip').click()
    })

    expect(fullPackageEntries.some((entry) => /\/parts\/head\/.*\/head\.png$/.test(entry))).toBeTruthy()
    expect(fullPackageEntries.some((entry) => /\/parts\/head\/.*\/head_mask\.png$/.test(entry))).toBeTruthy()
  } finally {
    await rm(path.join(repoRoot, 'data', 'apes', 'output', localReport.job_id), { recursive: true, force: true })
  }
})

test('Duelyst audit stays usable with or without the local package', async ({ page }) => {
  const privatePackageAvailable = existsSync(path.join(repoRoot, 'assets', 'Duelyst-Unit-Animations.unitypackage'))
  const runPrivateAssetPath = process.env.PIXEL_CREATOR_PRIVATE_ASSETS === '1'
  if (runPrivateAssetPath) {
    test.setTimeout(360_000)
  }

  if (privatePackageAvailable && !runPrivateAssetPath) {
    const payload = await page.evaluate(async () => {
      const response = await fetch('/__local/asset-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'duelyst-audit', packagePath: 'assets/definitely-missing-duelyst.unitypackage' }),
      })
      return response.json()
    })
    expect(JSON.stringify(payload)).toContain('Package not found at')
    return
  }

  await page.getByTestId('nav-audit').click()
  await page.getByTestId('run-duelyst-audit').click()
  await expect(page.getByTestId('run-duelyst-audit')).toBeEnabled({ timeout: runPrivateAssetPath ? 300_000 : 120_000 })

  const duelystStatus = await page.getByTestId('duelyst-status').innerText()
  if (/package not found/i.test(duelystStatus)) {
    await expect(page.getByTestId('duelyst-status')).toContainText(/Package not found at/i)
    return
  }

  await page.getByLabel('Training').selectOption('all')
  await page.getByLabel('Stage').selectOption('staged')
  const stagedButtons = page.locator('[data-testid^="open-duelyst-stage-"]')
  await expect(stagedButtons.first()).toBeVisible({ timeout: 30_000 })
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
  expect(bundleText).toContain('npm run validate:release-package')
  expect(bundleText).toContain('npm run test:browser')
  expect(bundleText).toContain('npm run release:check')
  expect(bundleText).toContain('.\\tools\\apes_bridge\\setup_home_pc.ps1')
})

test('placeholder mode provenance and accessible release controls stay visible', async ({ page }) => {
  await expect(page.getByRole('navigation', { name: 'Creator screens' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Source character' })).toBeVisible()
  await page.getByRole('button', { name: 'Exports' }).click()
  await expect(page.getByRole('button', { name: 'Download generic manifest' })).toBeVisible()

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel(/Allow placeholder APES fallback/i).check()
  await expect(page.getByTestId('apes-placeholder-warning')).toContainText(/not production segmentation/i)

  await page.getByRole('button', { name: 'Exports' }).click()
  const genericManifest = await readJsonDownload<{ apes: { placeholder_mode_enabled: boolean } }>(page, async () => {
    await page.getByRole('button', { name: 'Download generic manifest' }).click()
  })
  expect(genericManifest.apes.placeholder_mode_enabled).toBe(true)
})

test('harvest workflows are exposed and produce usable app artifacts', async ({ page }, testInfo) => {
  await page.getByTestId('nav-library').click()
  const bundlePath = path.join(testInfo.outputDir, 'sample-layer-bundle.json')
  await mkdir(testInfo.outputDir, { recursive: true })
  await writeFile(bundlePath, JSON.stringify({
    format: 'pixel_creator_layer_bundle',
    version: 1,
    bundle_id: 'playwright_bundle',
    parts: [
      {
        id: 'playwright_bundle_head',
        label: 'head',
        source_character: 'bundle_source',
        image: {
          path: '/data/qa/apes_harness_job/parts/head.png',
          bounds: { x: 18, y: 6, w: 28, h: 22 },
        },
        mask: {
          path: '/data/qa/apes_harness_job/masks/head_mask.png',
        },
      },
    ],
  }, null, 2), 'utf8')
  await page.getByTestId('import-layer-bundle-input').setInputFiles(bundlePath)
  await expect(page.getByText(/Imported 1 part.*sample-layer-bundle/i)).toBeVisible()
  await expect(page.getByText('playwright_bundle_head')).toBeVisible()

  await page.getByTestId('nav-batch').click()
  await page.getByTestId('save-variation-preset').click()
  await expect(page.getByTestId('variation-preset-select')).not.toHaveValue('')

  await page.getByTestId('nav-exports').click()
  await page.getByTestId('filename-template-input').fill('{character}_{animation}_{direction}_{frame}_{label}')
  await expect(page.getByText(/Preview: .*_head\.png/i)).toBeVisible()

  await page.getByTestId('nav-apes').click()
  await page.getByTestId('generation-style-notes').fill('Playwright generation pass')
  const generationManifest = await readJsonDownload<Record<string, unknown>>(page, async () => {
    await page.getByTestId('download-generation-manifest').click()
  })
  expect(generationManifest.format).toBe('pixel_creator_generation_manifest')
  expect(generationManifest.style_notes).toBe('Playwright generation pass')

  await page.getByTestId('nav-audit').click()
  await expect(page.getByText('Source alpha analysis')).toBeVisible()
  await expect(page.getByText(/alpha bounds/i)).toBeVisible({ timeout: 30_000 })
})

test('LPC inventory browser can filter, select, label, and import sheets', async ({ page }) => {
  const qaPng = await readFile(path.join(repoRoot, 'public', 'data', 'qa', 'apes_harness_job', 'parts', 'head.png'))
  const lpcInventory = {
    format: 'pixel_creator_lpc_asset_inventory',
    generated_at: '2026-05-17T00:00:00.000Z',
    source: {
      kind: 'local_lpc_asset_dump',
      asset_root: 'C:/repo/assets/lpc sprite generator stuff',
      upstream_repo: 'https://example.test/lpc',
      upstream_reference: {
        available: true,
        root: 'C:/repo/data/cache/universal-lpc-generator',
        commit: 'fixture',
        sheet_definition_count: 2,
        spritesheet_png_count: 2,
        credits_csv_available: true,
      },
    },
    summary: {
      png_count: 2,
      lpc_grid_count: 2,
      non_lpc_grid_count: 0,
      categories: { hair: 1, weapon: 1 },
      frame_grids: { '1x1': 2 },
      credit_file_count: 1,
    },
    credit_files: [{ path: 'CREDITS.txt', excerpt: 'fixture credit' }],
    sheets: [
      {
        path: 'hair/long.png',
        category: 'hair',
        file_name: 'long.png',
        width: 64,
        height: 64,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 1,
        frame_rows: 1,
        lpc_grid: true,
        tags: ['hair', 'long'],
      },
      {
        path: 'weapon/sword.png',
        category: 'weapon',
        file_name: 'sword.png',
        width: 64,
        height: 64,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 1,
        frame_rows: 1,
        lpc_grid: true,
        tags: ['weapon', 'sword'],
      },
    ],
  }

  await page.route('**/__local/asset-tools', async (route) => {
    const payload = route.request().postDataJSON() as { action?: string }
    if (payload.action === 'lpc-inventory') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, statusCode: 0, stdout: 'Indexed fixture LPC sheets', stderr: '', lpcInventory }),
      })
      return
    }
    await route.continue()
  })
  await page.route('**/assets/lpc%20sprite%20generator%20stuff/**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: qaPng })
  })

  await page.getByTestId('nav-audit').click()
  await page.getByTestId('run-lpc-inventory').click()
  await expect(page.getByTestId('lpc-browser')).toBeVisible()
  await page.getByTestId('lpc-search').fill('hair')
  await expect(page.getByText(/1 shown \/ 1 matching/i)).toBeVisible()
  await page.getByTestId('select-visible-lpc-sheets').click()
  await page.getByTestId('lpc-label-override').selectOption('hair_hat_hood')
  await page.getByTestId('lpc-reviewed-on-import').check()
  await page.getByTestId('import-selected-lpc-sheets').click()

  await expect(page.getByText(/Imported 1 LPC sheet part/i)).toBeVisible()
  await page.getByTestId('part-library-method-filter').selectOption('manual')
  const importedPart = page.locator('.part-library-list article').filter({ hasText: 'lpc_hair_long_png_001' })
  await expect(importedPart).toBeVisible()
  await expect(importedPart.getByText('hair hat hood')).toBeVisible()
  await expect(importedPart.getByRole('button', { name: 'Mark unreviewed' })).toBeVisible()
})

test('large Part Library imports are paged instead of fully rendered', async ({ page }, testInfo) => {
  await page.getByTestId('nav-library').click()
  const bundlePath = path.join(testInfo.outputDir, 'large-layer-bundle.json')
  await mkdir(testInfo.outputDir, { recursive: true })
  await writeFile(bundlePath, JSON.stringify({
    format: 'pixel_creator_layer_bundle',
    version: 1,
    bundle_id: 'large_playwright_bundle',
    parts: Array.from({ length: 125 }, (_item, index) => ({
      id: `large_bundle_head_${String(index).padStart(3, '0')}`,
      label: 'head',
      source_character: 'bundle_source',
      image: {
        path: '/data/qa/apes_harness_job/parts/head.png',
        bounds: { x: 18, y: 6, w: 28, h: 22 },
      },
    })),
  }, null, 2), 'utf8')
  await page.getByTestId('import-layer-bundle-input').setInputFiles(bundlePath)
  await expect(page.getByText(/Showing 100 of 125 filtered part/i)).toBeVisible()

  const visibleExport = await readJsonDownload<{ part_count: number; filtered_part_count: number; visible_part_count: number; parts: unknown[] }>(page, async () => {
    await page.getByRole('button', { name: 'Export visible JSON' }).click()
  })
  expect(visibleExport.filtered_part_count).toBe(125)
  expect(visibleExport.visible_part_count).toBe(100)
  expect(visibleExport.part_count).toBe(100)
  expect(visibleExport.parts).toHaveLength(100)

  await page.getByTestId('mark-visible-reviewed').click()
  await page.getByLabel('Review').selectOption('needs_review')
  await expect(page.getByText(/Showing 25 of 25 filtered part/i)).toBeVisible()

  await page.getByLabel('Review').selectOption('all')
  await page.getByTestId('show-more-parts').click()
  await expect(page.getByText(/Showing 125 of 125 filtered part/i)).toBeVisible()
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

async function writeLocalApesAssetReport() {
  const jobId = 'playwright_apes_asset_route'
  const outputRoot = path.join(repoRoot, 'data', 'apes', 'output', jobId)
  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(path.join(outputRoot, 'parts'), { recursive: true })
  await mkdir(path.join(outputRoot, 'masks'), { recursive: true })
  await copyFile(path.join(repoRoot, 'public', 'data', 'qa', 'apes_harness_job', 'parts', 'head.png'), path.join(outputRoot, 'parts', 'head.png'))
  await copyFile(path.join(repoRoot, 'public', 'data', 'qa', 'apes_harness_job', 'masks', 'head_mask.png'), path.join(outputRoot, 'masks', 'head_mask.png'))

  const report = {
    job_id: jobId,
    status: 'complete',
    masks: [
      {
        label: 'head',
        path: `data/apes/output/${jobId}/masks/head_mask.png`,
        image_path: `data/apes/output/${jobId}/parts/head.png`,
        bounds: {
          x: 18,
          y: 6,
          w: 28,
          h: 22,
        },
        confidence: 0.94,
        reviewed: false,
        warnings: [],
      },
    ],
    semantic_mapping: {
      head: 'head',
    },
    warnings: [],
  }
  await writeFile(path.join(outputRoot, 'apes_report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}
