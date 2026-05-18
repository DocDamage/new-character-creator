import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const cliArgs = process.argv.slice(2)
const bodyTypeKeys = new Set(['male', 'female', 'muscular', 'pregnant', 'teen', 'child'])

function argValue(name) {
  const index = cliArgs.indexOf(name)
  return index >= 0 ? cliArgs[index + 1] : undefined
}

function normalize(filePath) {
  return filePath.replaceAll(path.sep, '/')
}

function relativePath(filePath, rootPath) {
  return normalize(path.relative(rootPath, filePath))
}

function slug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function listFiles(rootPath) {
  if (!fs.existsSync(rootPath)) return []
  const output = []
  const stack = [rootPath]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === '__MACOSX') continue
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(fullPath)
      if (entry.isFile()) output.push(fullPath)
    }
  }
  return output.sort((left, right) => left.localeCompare(right))
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function inspectCommit(referenceRoot) {
  try {
    return execFileSync('git', ['-C', referenceRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function parseLayerEntries(definition) {
  const layers = []
  for (let index = 1; ; index += 1) {
    const layer = definition[`layer_${index}`]
    if (!layer) break
    const pathsByBodyType = {}
    for (const [key, value] of Object.entries(layer)) {
      if (bodyTypeKeys.has(key) && typeof value === 'string') {
        pathsByBodyType[key] = value
      }
    }
    layers.push({
      layer_id: `layer_${index}`,
      z_pos: Number(layer.zPos ?? 0),
      ...(typeof layer.custom_animation === 'string' ? { custom_animation: layer.custom_animation } : {}),
      paths_by_body_type: Object.fromEntries(Object.entries(pathsByBodyType).sort(([left], [right]) => left.localeCompare(right))),
    })
  }
  return layers
}

function normalizeRecolors(recolors) {
  if (!recolors) return []
  const entries = Array.isArray(recolors) ? recolors : [recolors]
  return entries.map((entry) => ({
    material: typeof entry?.material === 'string' ? entry.material : '',
    palettes: Array.isArray(entry?.palettes) ? entry.palettes.filter((value) => typeof value === 'string') : [],
  }))
}

function normalizeCredits(credits) {
  if (!Array.isArray(credits)) return []
  return credits.map((credit) => ({
    file: typeof credit.file === 'string' ? credit.file : '',
    notes: typeof credit.notes === 'string' ? credit.notes : '',
    authors: Array.isArray(credit.authors) ? credit.authors.filter((value) => typeof value === 'string') : [],
    licenses: Array.isArray(credit.licenses) ? credit.licenses.filter((value) => typeof value === 'string') : [],
    urls: Array.isArray(credit.urls) ? credit.urls.filter((value) => typeof value === 'string') : [],
  }))
}

function inferAnimations(definition, layers) {
  const animations = new Set(Array.isArray(definition.animations) ? definition.animations.filter((value) => typeof value === 'string') : [])
  for (const layer of layers) {
    if (layer.custom_animation) animations.add(layer.custom_animation)
  }
  return Array.from(animations).sort()
}

function makeItemId(relativeDefinitionPath, definition) {
  const withoutExtension = relativeDefinitionPath.replace(/\.json$/i, '')
  const segments = withoutExtension.split('/').filter((segment) => !segment.startsWith('meta_')).map(slug).filter(Boolean)
  const typeName = slug(definition.type_name ?? segments.at(-2) ?? 'item')
  const stem = segments.at(-1) ?? slug(definition.name ?? 'item')
  return `${typeName}:${stem}`
}

function buildCategoryTree(items) {
  const root = { id: 'root', label: 'LPC Catalog', children: {}, item_ids: [] }
  for (const item of Object.values(items)) {
    let node = root
    for (const segment of item.path) {
      const key = slug(segment) || 'misc'
      node.children[key] ??= { id: key, label: segment, children: {}, item_ids: [] }
      node = node.children[key]
    }
    node.item_ids.push(item.item_id)
  }
  return finalizeCategoryNode(root)
}

function finalizeCategoryNode(node) {
  return {
    id: node.id,
    label: node.label,
    item_ids: node.item_ids.sort(),
    children: Object.values(node.children).map(finalizeCategoryNode).sort((left, right) => left.label.localeCompare(right.label)),
  }
}

function readPaletteMetadata(referenceRoot) {
  const paletteRoot = path.join(referenceRoot, 'palette_definitions')
  const files = listFiles(paletteRoot).filter((filePath) => filePath.endsWith('.json'))
  return {
    definition_count: files.length,
    names: files.map((filePath) => path.basename(filePath, '.json')).sort(),
  }
}

export function buildLpcCatalog({ referenceRoot, generatedAt = new Date().toISOString() }) {
  const sheetDefinitionsRoot = path.join(referenceRoot, 'sheet_definitions')
  const spritesheetsRoot = path.join(referenceRoot, 'spritesheets')
  const paletteDefinitionsRoot = path.join(referenceRoot, 'palette_definitions')
  const creditsPath = path.join(referenceRoot, 'CREDITS.csv')
  const definitionFiles = listFiles(sheetDefinitionsRoot).filter((filePath) => filePath.endsWith('.json'))
  const items = {}
  const aliases = {}

  for (const filePath of definitionFiles) {
    const relative = relativePath(filePath, sheetDefinitionsRoot)
    const fileName = path.basename(filePath)
    if (fileName.startsWith('meta_')) continue
    const definition = readJson(filePath)
    const layers = parseLayerEntries(definition)
    if (layers.length === 0) continue
    const itemId = makeItemId(relative, definition)
    const pathSegments = relative.replace(/\.json$/i, '').split('/').slice(0, -1)
    const tags = Array.isArray(definition.tags) ? definition.tags.filter((value) => typeof value === 'string') : []
    const requiredTags = Array.isArray(definition.required_tags) ? definition.required_tags.filter((value) => typeof value === 'string') : []
    const excludedTags = Array.isArray(definition.excluded_tags) ? definition.excluded_tags.filter((value) => typeof value === 'string') : []
    const variants = Array.isArray(definition.variants) ? definition.variants.filter((value) => typeof value === 'string') : ['']
    const bodyTypes = new Set(layers.flatMap((layer) => Object.keys(layer.paths_by_body_type)))

    items[itemId] = {
      item_id: itemId,
      name: typeof definition.name === 'string' ? definition.name : path.basename(filePath, '.json'),
      type_name: typeof definition.type_name === 'string' ? definition.type_name : pathSegments.at(-1) ?? 'item',
      path: pathSegments,
      tags,
      required_tags: requiredTags,
      excluded_tags: excludedTags,
      required_body_types: Array.from(bodyTypes).sort(),
      variants,
      animations: inferAnimations(definition, layers),
      preview: {
        row: Number(definition.preview?.row ?? 0),
        column: Number(definition.preview?.column ?? 0),
        x_offset: Number(definition.preview?.x_offset ?? 0),
        y_offset: Number(definition.preview?.y_offset ?? 0),
      },
      match_body_color: Boolean(definition.match_body_color),
      recolors: normalizeRecolors(definition.recolors),
      layers,
      credits: normalizeCredits(definition.credits),
    }

    aliases[slug(relative.replace(/\.json$/i, ''))] = { item_id: itemId, path: relative }
  }

  const itemList = Object.values(items)
  const typeCounts = {}
  for (const item of itemList) typeCounts[item.type_name] = (typeCounts[item.type_name] ?? 0) + 1

  return {
    format: 'pixel_creator_lpc_catalog',
    version: 1,
    generated_at: generatedAt,
    source: {
      repo: 'https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator',
      reference_root: normalize(referenceRoot),
      commit: inspectCommit(referenceRoot),
      has_upstream_sources: fs.existsSync(path.join(referenceRoot, 'sources')) || fs.existsSync(path.join(referenceRoot, 'scripts')),
      has_spritesheets: fs.existsSync(spritesheetsRoot),
      has_sheet_definitions: fs.existsSync(sheetDefinitionsRoot),
      has_palette_definitions: fs.existsSync(paletteDefinitionsRoot),
      has_credits_csv: fs.existsSync(creditsPath),
    },
    summary: {
      item_count: itemList.length,
      layer_count: itemList.reduce((count, item) => count + item.layers.length, 0),
      variant_count: itemList.reduce((count, item) => count + item.variants.length, 0),
      credit_count: itemList.reduce((count, item) => count + item.credits.length, 0),
      type_counts: Object.fromEntries(Object.entries(typeCounts).sort(([left], [right]) => left.localeCompare(right))),
    },
    items: Object.fromEntries(Object.entries(items).sort(([left], [right]) => left.localeCompare(right))),
    category_tree: buildCategoryTree(items),
    aliases: Object.fromEntries(Object.entries(aliases).sort(([left], [right]) => left.localeCompare(right))),
    palettes: readPaletteMetadata(referenceRoot),
  }
}

function main() {
  if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
    console.log('Usage: node tools/build-lpc-catalog.js [--reference-root <path>] [--out <path>]')
    return
  }

  const referenceRoot = path.resolve(argValue('--reference-root') || process.env.PIXEL_CREATOR_LPC_REFERENCE_ROOT || path.join(appRoot, 'data', 'cache', 'universal-lpc-generator'))
  const outPath = path.resolve(argValue('--out') || path.join(appRoot, 'data', 'lpc', 'lpc_catalog.json'))
  const catalog = buildLpcCatalog({ referenceRoot })
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  console.log(`Wrote LPC catalog: ${outPath}`)
  console.log(`Indexed ${catalog.summary.item_count} item(s), ${catalog.summary.layer_count} layer(s), ${catalog.summary.credit_count} credit record(s).`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
