import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const cliArgs = process.argv.slice(2)

function argValue(name) {
  const index = cliArgs.indexOf(name)
  return index >= 0 ? cliArgs[index + 1] : undefined
}

function usage() {
  console.log('Usage: node tools/build-lpc-local-inventory.js [--asset-root <path>] [--reference-root <path>] [--out <path>]')
  console.log('Environment overrides: PIXEL_CREATOR_LPC_ROOT=<path>, PIXEL_CREATOR_LPC_REFERENCE_ROOT=<path>')
}

function normalize(filePath) {
  return filePath.replaceAll(path.sep, '/')
}

function relativePath(filePath, rootPath) {
  return normalize(path.relative(rootPath, filePath))
}

function listFiles(rootPath) {
  const output = []
  const stack = [rootPath]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '__MACOSX' || entry.name === '.git') continue
      if (entry.name === '.DS_Store' || entry.name.startsWith('._')) continue
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile()) {
        output.push(fullPath)
      }
    }
  }
  return output.sort((left, right) => left.localeCompare(right))
}

function readPngDimensions(filePath) {
  const header = Buffer.alloc(24)
  const fd = fs.openSync(filePath, 'r')
  try {
    fs.readSync(fd, header, 0, header.length, 0)
  } finally {
    fs.closeSync(fd)
  }

  if (header[0] !== 0x89 || header.toString('ascii', 1, 4) !== 'PNG') {
    return null
  }

  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  }
}

function classifySheet(filePath, rootPath) {
  const dimensions = readPngDimensions(filePath)
  if (!dimensions) return null
  const relative = relativePath(filePath, rootPath)
  const parts = relative.split('/')
  const frameWidth = 64
  const frameHeight = 64
  const frameColumns = Number.isInteger(dimensions.width / frameWidth) ? dimensions.width / frameWidth : null
  const frameRows = Number.isInteger(dimensions.height / frameHeight) ? dimensions.height / frameHeight : null
  const lpcGrid = frameColumns !== null && frameRows !== null
  const fileName = path.basename(filePath, '.png')
  const tags = new Set(parts.slice(0, -1).map((part) => slug(part)).filter(Boolean))
  for (const token of fileName.split(/[\s,_-]+/)) {
    const tag = slug(token)
    if (tag) tags.add(tag)
  }

  return {
    path: relative,
    category: parts[0] ?? 'root',
    file_name: path.basename(filePath),
    width: dimensions.width,
    height: dimensions.height,
    frame_width: frameWidth,
    frame_height: frameHeight,
    frame_columns: frameColumns,
    frame_rows: frameRows,
    lpc_grid: lpcGrid,
    tags: Array.from(tags).sort(),
  }
}

function slug(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function countBy(items, getKey) {
  const counts = {}
  for (const item of items) {
    const key = getKey(item)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])))
}

function readCreditFiles(rootPath) {
  return listFiles(rootPath)
    .filter((filePath) => /credits?|license/i.test(path.basename(filePath)) && /\.(txt|md|csv)$/i.test(filePath))
    .map((filePath) => {
      let text = ''
      try {
        text = fs.readFileSync(filePath, 'utf8').trim()
      } catch {
        text = ''
      }
      return {
        path: relativePath(filePath, rootPath),
        excerpt: text.slice(0, 1200),
      }
    })
}

function summarizeLocalLicenses(creditFiles) {
  const cc0Files = creditFiles.filter((file) => /CC0\s+1\.0|Public Domain Dedication/i.test(file.excerpt))
  if (cc0Files.length === 0) return {
    license: null,
    attribution_required: true,
    basis: 'unknown_or_mixed',
    files: [],
    notes: 'No local CC0 license file was detected. Treat credits as unresolved until source files are reviewed.',
  }

  return {
    license: 'CC0 1.0',
    attribution_required: false,
    basis: 'local_license_files',
    files: cc0Files.map((file) => file.path).sort(),
    notes: 'Local license files state CC0 1.0 public domain dedication; attribution is optional, not required.',
  }
}

function inspectReferenceRepo(referenceRoot) {
  if (!fs.existsSync(referenceRoot)) {
    return {
      available: false,
      root: normalize(referenceRoot),
    }
  }

  let commit = null
  try {
    commit = execFileSync('git', ['-C', referenceRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    commit = null
  }

  const sheetDefinitionsRoot = path.join(referenceRoot, 'sheet_definitions')
  const spritesheetsRoot = path.join(referenceRoot, 'spritesheets')
  const creditsPath = path.join(referenceRoot, 'CREDITS.csv')
  return {
    available: true,
    root: normalize(referenceRoot),
    commit,
    sheet_definition_count: fs.existsSync(sheetDefinitionsRoot)
      ? listFiles(sheetDefinitionsRoot).filter((filePath) => filePath.endsWith('.json')).length
      : 0,
    spritesheet_png_count: fs.existsSync(spritesheetsRoot)
      ? listFiles(spritesheetsRoot).filter((filePath) => filePath.toLowerCase().endsWith('.png')).length
      : 0,
    credits_csv_available: fs.existsSync(creditsPath),
  }
}

function main() {
  if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
    usage()
    return
  }

  const assetRoot = path.resolve(argValue('--asset-root') || process.env.PIXEL_CREATOR_LPC_ROOT || path.join(appRoot, 'assets', 'lpc sprite generator stuff'))
  const referenceRoot = path.resolve(argValue('--reference-root') || process.env.PIXEL_CREATOR_LPC_REFERENCE_ROOT || path.join(appRoot, 'data', 'cache', 'universal-lpc-generator'))
  const outPath = path.resolve(argValue('--out') || path.join(appRoot, 'data', 'lpc', 'lpc_asset_inventory.json'))

  if (!fs.existsSync(assetRoot)) {
    throw new Error(`LPC asset root not found: ${assetRoot}`)
  }

  const sheets = listFiles(assetRoot)
    .filter((filePath) => filePath.toLowerCase().endsWith('.png'))
    .map((filePath) => classifySheet(filePath, assetRoot))
    .filter(Boolean)

  const gridSheets = sheets.filter((sheet) => sheet.lpc_grid)
  const creditFiles = readCreditFiles(assetRoot)
  const inventory = {
    format: 'pixel_creator_lpc_asset_inventory',
    generated_at: new Date().toISOString(),
    source: {
      kind: 'local_lpc_asset_dump',
      asset_root: normalize(assetRoot),
      upstream_repo: 'https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator',
      upstream_reference: inspectReferenceRepo(referenceRoot),
      local_license: null,
    },
    summary: {
      png_count: sheets.length,
      lpc_grid_count: gridSheets.length,
      non_lpc_grid_count: sheets.length - gridSheets.length,
      categories: countBy(sheets, (sheet) => sheet.category),
      frame_grids: countBy(gridSheets, (sheet) => `${sheet.frame_columns}x${sheet.frame_rows}`),
      credit_file_count: 0,
    },
    credit_files: creditFiles,
    sheets,
  }
  inventory.source.local_license = summarizeLocalLicenses(creditFiles)
  inventory.summary.credit_file_count = inventory.credit_files.length

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8')
  console.log(`Wrote LPC inventory: ${outPath}`)
  console.log(`Indexed ${sheets.length} PNG sheet(s), ${gridSheets.length} using a 64x64 LPC grid, ${inventory.credit_files.length} credit/license file(s).`)
}

main()
