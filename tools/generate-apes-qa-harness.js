import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const publicRoot = path.resolve(appRoot, 'public')
const jobId = 'apes_harness_job'
const harnessRoot = path.resolve(publicRoot, 'data', 'qa', jobId)
const masksRoot = path.resolve(harnessRoot, 'masks')
const partsRoot = path.resolve(harnessRoot, 'parts')
const reportPath = path.resolve(publicRoot, 'data', 'qa', 'apes_report_harness.json')

const masks = [
  {
    label: 'head',
    rect: { x: 18, y: 6, w: 28, h: 22 },
    confidence: 0.94,
    warnings: ['Hair edge overlaps the hood region on some north-facing frames.'],
  },
  {
    label: 'torso',
    rect: { x: 20, y: 22, w: 24, h: 18 },
    confidence: 0.88,
    warnings: [],
  },
  {
    label: 'front_arm',
    rect: { x: 12, y: 22, w: 12, h: 24 },
    confidence: 0.63,
    warnings: ['Low-confidence limb edge near the weapon silhouette.'],
  },
  {
    label: 'back_arm',
    rect: { x: 40, y: 22, w: 12, h: 24 },
    confidence: 0.67,
    warnings: [],
  },
  {
    label: 'front_leg',
    rect: { x: 20, y: 38, w: 12, h: 22 },
    confidence: 0.72,
    warnings: [],
  },
  {
    label: 'back_leg',
    rect: { x: 32, y: 38, w: 12, h: 22 },
    confidence: 0.7,
    warnings: [],
  },
]

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true })
}

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath))
}

function writePng(filePath, png) {
  fs.writeFileSync(filePath, PNG.sync.write(png))
}

function createBlank(width, height) {
  return new PNG({ width, height })
}

function createGeneratedHarnessSource() {
  const png = createBlank(64, 64)
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (png.width * y + x) << 2
      png.data[index] = 22
      png.data[index + 1] = 28
      png.data[index + 2] = 36
      png.data[index + 3] = 0
    }
  }

  const fills = [
    { rect: { x: 18, y: 6, w: 28, h: 22 }, color: [232, 193, 128, 255] },
    { rect: { x: 20, y: 22, w: 24, h: 18 }, color: [86, 132, 192, 255] },
    { rect: { x: 12, y: 22, w: 12, h: 24 }, color: [78, 105, 156, 255] },
    { rect: { x: 40, y: 22, w: 12, h: 24 }, color: [63, 86, 130, 255] },
    { rect: { x: 20, y: 38, w: 12, h: 22 }, color: [74, 78, 96, 255] },
    { rect: { x: 32, y: 38, w: 12, h: 22 }, color: [58, 63, 82, 255] },
  ]

  for (const fill of fills) {
    forEachRectPixel(fill.rect, (x, y) => {
      const index = (png.width * y + x) << 2
      png.data[index] = fill.color[0]
      png.data[index + 1] = fill.color[1]
      png.data[index + 2] = fill.color[2]
      png.data[index + 3] = fill.color[3]
    })
  }

  return png
}

function forEachRectPixel(rect, callback) {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      callback(x, y)
    }
  }
}

function copyPixel(from, to, x, y) {
  const index = (from.width * y + x) << 2
  to.data[index] = from.data[index]
  to.data[index + 1] = from.data[index + 1]
  to.data[index + 2] = from.data[index + 2]
  to.data[index + 3] = from.data[index + 3]
}

function writeMask(rect, targetPath, width, height) {
  const png = createBlank(width, height)
  forEachRectPixel(rect, (x, y) => {
    const index = (png.width * y + x) << 2
    png.data[index] = 255
    png.data[index + 1] = 255
    png.data[index + 2] = 255
    png.data[index + 3] = 255
  })
  writePng(targetPath, png)
}

function writePart(source, rect, targetPath) {
  const png = createBlank(source.width, source.height)
  forEachRectPixel(rect, (x, y) => copyPixel(source, png, x, y))
  writePng(targetPath, png)
}

function getActiveManifestPath() {
  const localManifestPath = path.resolve(publicRoot, 'data', 'manifests', 'characters.local.json')
  if (fs.existsSync(localManifestPath)) {
    return localManifestPath
  }
  return path.resolve(publicRoot, 'data', 'manifests', 'characters.json')
}

function resolveManifestFramePath(framePath) {
  if (!framePath) {
    throw new Error('APES QA harness manifest did not include a source frame path.')
  }

  if (framePath.startsWith('/@fs/')) {
    return framePath.slice('/@fs/'.length)
  }

  if (framePath.startsWith('/')) {
    return path.resolve(appRoot, framePath.slice(1))
  }

  if (path.isAbsolute(framePath)) {
    return framePath
  }

  return path.resolve(appRoot, framePath)
}

function resolveHarnessSourceFrame() {
  if (process.env.PIXEL_CREATOR_QA_HARNESS_FORCE_GENERATED === '1') {
    return null
  }

  const manifestPath = getActiveManifestPath()
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const harnessCharacter = manifest.characters.find((character) => character.character_id === '1-warrior-woman') ?? manifest.characters[0]
  if (!harnessCharacter) {
    return null
  }

  const idleSouthFrames = harnessCharacter.animations.find((animation) => animation.name === 'idle')?.directions?.south
  const sourceFrame = idleSouthFrames?.[0]?.path ?? harnessCharacter.representative_frame
  if (!sourceFrame) {
    return null
  }
  const resolvedSourceFrame = resolveManifestFramePath(sourceFrame)
  if (!fs.existsSync(resolvedSourceFrame)) {
    return null
  }

  return resolvedSourceFrame
}

function main() {
  ensureDir(masksRoot)
  ensureDir(partsRoot)
  const sourceFrame = resolveHarnessSourceFrame()
  const source = sourceFrame ? readPng(sourceFrame) : createGeneratedHarnessSource()

  const report = {
    job_id: jobId,
    status: 'complete',
    masks: masks.map((mask) => {
      const maskPath = path.resolve(masksRoot, `${mask.label}_mask.png`)
      const partPath = path.resolve(partsRoot, `${mask.label}.png`)
      writeMask(mask.rect, maskPath, source.width, source.height)
      writePart(source, mask.rect, partPath)
      return {
        label: mask.label,
        path: `data/qa/${jobId}/masks/${mask.label}_mask.png`,
        image_path: `data/qa/${jobId}/parts/${mask.label}.png`,
        bounds: mask.rect,
        confidence: mask.confidence,
        reviewed: false,
        warnings: mask.warnings,
      }
    }),
    semantic_mapping: {
      head: 'head',
      torso: 'torso',
      front_arm: 'front_arm',
      back_arm: 'back_arm',
      front_leg: 'front_leg',
      back_leg: 'back_leg',
    },
    warnings: [
      'QA harness report. Import into APES Lab and verify that bounds, confidence tags, warnings, and preview paths survive into Part Library entries.',
      'This harness is static and does not require CUDA or the APES Python runtime.',
      ...(!sourceFrame ? ['Source asset pack was not present; generated a deterministic CI-safe harness frame.'] : []),
    ],
  }

  ensureDir(path.dirname(reportPath))
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`Wrote APES QA harness to ${reportPath}`)
}

main()
