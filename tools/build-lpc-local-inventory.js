import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

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

function readPngChunks(filePath) {
  const buffer = fs.readFileSync(filePath)
  if (buffer[0] !== 0x89 || buffer.toString('ascii', 1, 4) !== 'PNG') return null
  const chunks = []
  let offset = 8
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > buffer.length) return null
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) })
    offset = dataEnd + 4
    if (type === 'IEND') break
  }
  return chunks
}

function readPngAlphaRows(filePath, dimensions) {
  const chunks = readPngChunks(filePath)
  if (!chunks) return null
  const header = chunks.find((chunk) => chunk.type === 'IHDR')?.data
  if (!header) return null
  const bitDepth = header[8]
  const colorType = header[9]
  const compressionMethod = header[10]
  const filterMethod = header[11]
  const interlaceMethod = header[12]
  if (bitDepth !== 8 || compressionMethod !== 0 || filterMethod !== 0 || interlaceMethod !== 0) return null

  const idatChunks = chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data)
  if (idatChunks.length === 0) return null
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks))
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 2 ? 3 : colorType === 0 ? 1 : null
  if (!bytesPerPixel) return null
  const stride = dimensions.width * bytesPerPixel
  const rows = []
  let sourceOffset = 0
  let previousRow = Buffer.alloc(stride)
  for (let y = 0; y < dimensions.height; y += 1) {
    const filter = inflated[sourceOffset]
    sourceOffset += 1
    const row = Buffer.from(inflated.subarray(sourceOffset, sourceOffset + stride))
    sourceOffset += stride
    unfilterPngRow(row, previousRow, bytesPerPixel, filter)
    rows.push(row)
    previousRow = row
  }
  return { rows, bytesPerPixel, colorType }
}

function unfilterPngRow(row, previousRow, bytesPerPixel, filter) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0
    const up = previousRow[index] ?? 0
    const upLeft = index >= bytesPerPixel ? previousRow[index - bytesPerPixel] : 0
    if (filter === 1) {
      row[index] = (row[index] + left) & 0xff
    } else if (filter === 2) {
      row[index] = (row[index] + up) & 0xff
    } else if (filter === 3) {
      row[index] = (row[index] + Math.floor((left + up) / 2)) & 0xff
    } else if (filter === 4) {
      row[index] = (row[index] + paethPredictor(left, up, upLeft)) & 0xff
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter ${filter}`)
    }
  }
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left
  if (upDistance <= upLeftDistance) return up
  return upLeft
}

function findEmptyCells(filePath, dimensions, frameWidth, frameHeight, frameColumns, frameRows) {
  if (!frameColumns || !frameRows) return undefined
  const alphaRows = readPngAlphaRows(filePath, dimensions)
  if (!alphaRows) return undefined
  if (alphaRows.colorType !== 6 && alphaRows.colorType !== 4) {
    return []
  }
  const alphaOffset = alphaRows.colorType === 6 ? 3 : 1
  const cells = []
  for (let row = 0; row < frameRows; row += 1) {
    for (let column = 0; column < frameColumns; column += 1) {
      if (!cellHasAlpha(alphaRows, column * frameWidth, row * frameHeight, frameWidth, frameHeight, alphaOffset)) {
        cells.push(`${row}:${column}`)
      }
    }
  }
  return cells
}

function cellHasAlpha(alphaRows, startX, startY, width, height, alphaOffset) {
  for (let y = startY; y < startY + height; y += 1) {
    const row = alphaRows.rows[y]
    for (let x = startX; x < startX + width; x += 1) {
      if (row[x * alphaRows.bytesPerPixel + alphaOffset] > 0) return true
    }
  }
  return false
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

  const emptyCells = lpcGrid ? findEmptyCells(filePath, dimensions, frameWidth, frameHeight, frameColumns, frameRows) : undefined
  return {
    path: relative,
    relative_path: relative,
    category: parts[0] ?? 'root',
    source_folder: parts[0] ?? '',
    file_name: path.basename(filePath),
    width: dimensions.width,
    height: dimensions.height,
    frame_width: frameWidth,
    frame_height: frameHeight,
    frame_columns: frameColumns,
    frame_rows: frameRows,
    lpc_grid: lpcGrid,
    ...(emptyCells && emptyCells.length > 0 ? { empty_cells: emptyCells.join(' ') } : {}),
    tags: Array.from(tags).sort(),
    ...findNearestLicense(filePath, rootPath),
  }
}

function findNearestLicense(assetAbsolutePath, rootAbsolutePath) {
  const root = path.resolve(rootAbsolutePath)
  let cursor = path.dirname(path.resolve(assetAbsolutePath))
  while (cursor === root || cursor.startsWith(`${root}${path.sep}`)) {
    const licensePath = path.join(cursor, 'license.txt')
    if (fs.existsSync(licensePath)) {
      const text = fs.readFileSync(licensePath, 'utf8')
      return {
        license_file: normalize(path.relative(appRoot, licensePath)),
        license_scope: cursor === path.dirname(path.resolve(assetAbsolutePath)) ? 'folder' : 'ancestor',
        license_text_hash: crypto.createHash('sha256').update(text).digest('hex'),
        license_status: 'covered',
      }
    }
    const next = path.dirname(cursor)
    if (next === cursor) break
    cursor = next
  }
  return {
    license_file: '',
    license_scope: 'none',
    license_text_hash: '',
    license_status: 'missing',
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
  const findings = sheets
    .filter((sheet) => sheet.license_status !== 'covered')
    .map((sheet) => ({
      kind: 'missing_license',
      severity: 'blocker',
      path: sheet.path,
      message: `No nearest license.txt was found for ${sheet.path}.`,
    }))
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
      license_covered_count: sheets.filter((sheet) => sheet.license_status === 'covered').length,
      missing_license_count: findings.length,
    },
    credit_files: creditFiles,
    findings,
    sheets,
    assets: sheets,
  }
  inventory.source.local_license = summarizeLocalLicenses(creditFiles)
  inventory.summary.credit_file_count = inventory.credit_files.length

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8')
  console.log(`Wrote LPC inventory: ${outPath}`)
  console.log(`Indexed ${sheets.length} PNG sheet(s), ${gridSheets.length} using a 64x64 LPC grid, ${inventory.credit_files.length} credit/license file(s).`)
}

main()
