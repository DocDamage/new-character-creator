import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const publicRoot = path.resolve(appRoot, 'public')
const jobId = 'apes_harness_job'
const sourceFrame = path.resolve(appRoot, 'data', 'exports', '1-warrior-woman', 'rendered', 'frames', 'idle', 'south', 'frame_000.png')
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

function main() {
  if (!fs.existsSync(sourceFrame)) {
    throw new Error(`Missing source frame for APES QA harness: ${sourceFrame}`)
  }

  ensureDir(masksRoot)
  ensureDir(partsRoot)
  const source = readPng(sourceFrame)

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
    ],
  }

  ensureDir(path.dirname(reportPath))
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`Wrote APES QA harness to ${reportPath}`)
}

main()