import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultConfigPath = path.join(repoRoot, 'docs', 'rag-web-sources.json')
const defaultOutputPath = path.join(repoRoot, 'docs', 'rag-sources', 'private', 'web-sources.md')
const defaultManifestPath = path.join(repoRoot, 'data', 'rag', 'web-source-manifest.json')

const configPath = getArg('--config', defaultConfigPath)
const outputPath = getArg('--out', defaultOutputPath)
const manifestPath = getArg('--manifest-out', defaultManifestPath)
const defaultMaxPages = getNumberArg('--max-pages', 40)
const defaultTimeoutMs = getNumberArg('--timeout-ms', 20000)

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const pages = []
const duplicates = []
const failures = []
const seenContentHashes = new Set()

for (const source of config.sources ?? []) {
  await fetchSource(source)
}

const payload = {
  generated_at: new Date().toISOString(),
  config_path: toRepoRelative(configPath),
  page_count: pages.length,
  duplicate_count: duplicates.length,
  failure_count: failures.length,
  pages,
  duplicates,
  failures,
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
fs.writeFileSync(outputPath, buildMarkdown(payload), 'utf8')
fs.writeFileSync(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(`Fetched ${pages.length} unique web page(s), skipped ${duplicates.length} duplicate(s), recorded ${failures.length} failure(s).`)
console.log(`RAG source: ${toRepoRelative(outputPath)}`)

async function fetchSource(source) {
  const queue = [source.url]
  const visited = new Set()
  const maxPages = Math.min(Number(source.max_pages) || defaultMaxPages, defaultMaxPages)
  while (queue.length > 0 && visited.size < maxPages) {
    const url = normalizeUrl(queue.shift())
    if (!url || visited.has(url)) continue
    visited.add(url)
    if (!isAllowedUrl(url, source)) continue

    try {
      const fetched = await fetchPage(url, source)
      if (!fetched.text.trim()) continue
      const contentHash = sha256(fetched.text.replace(/\s+/g, ' ').trim().toLowerCase())
      if (seenContentHashes.has(contentHash)) {
        duplicates.push({ source_id: source.id, url, content_hash: contentHash })
        continue
      }
      seenContentHashes.add(contentHash)
      pages.push({
        source_id: source.id,
        source_title: source.title,
        url,
        title: fetched.title || source.title,
        license: source.license ?? 'unknown',
        notes: source.notes ?? '',
        content_hash: contentHash,
        fetched_at: new Date().toISOString(),
        text: fetched.text,
      })
      if (source.crawl) {
        for (const link of fetched.links) {
          const normalized = normalizeUrl(link, url)
          if (normalized && !visited.has(normalized) && isAllowedUrl(normalized, source)) queue.push(normalized)
        }
      }
    } catch (error) {
      failures.push({ source_id: source.id, url, error: error.message })
    }
  }
}

async function fetchPage(url, source) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number(source.timeout_ms) || defaultTimeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'sprite-character-creator-rag-fetcher/1.0 (+local private RAG ingestion)',
        Accept: 'text/html,text/markdown,text/plain,application/json;q=0.9,*/*;q=0.5',
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const contentType = response.headers.get('content-type') ?? ''
    const raw = await response.text()
    if (contentType.includes('application/json') || url.endsWith('.json')) {
      return { title: titleFromUrl(url), text: normalizeWhitespace(raw), links: [] }
    }
    if (contentType.includes('text/plain') || contentType.includes('markdown') || /\.(md|txt)$/i.test(new URL(url).pathname)) {
      return { title: titleFromUrl(url), text: normalizeWhitespace(raw), links: [] }
    }
    return extractHtml(raw, url)
  } finally {
    clearTimeout(timer)
  }
}

function extractHtml(html, baseUrl) {
  const title = decodeHtml(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || titleFromUrl(baseUrl))
  const main = matchFirst(html, /<main[^>]*>([\s\S]*?)<\/main>/i)
    || matchFirst(html, /<article[^>]*>([\s\S]*?)<\/article>/i)
    || matchFirst(html, /<body[^>]*>([\s\S]*?)<\/body>/i)
    || html
  const withoutNoise = main
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<a\b[\s\S]*?<\/a>/gi, ' ')
  const links = Array.from(html.matchAll(/<a\b[^>]*href=(["'])(.*?)\1/gi))
    .map((match) => normalizeUrl(match[2], baseUrl))
    .filter(Boolean)
  const text = normalizeWhitespace(decodeHtml(withoutNoise.replace(/<[^>]+>/g, ' ')))
  return { title: normalizeWhitespace(title), text, links }
}

function isAllowedUrl(url, source) {
  let parsed
  let seed
  try {
    parsed = new URL(url)
    seed = new URL(source.url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') return false
  if (parsed.origin !== seed.origin) return false
  if (!Array.isArray(source.allow_patterns) || source.allow_patterns.length === 0) return true
  const target = `${parsed.pathname}${parsed.search}`
  return source.allow_patterns.some((pattern) => target.includes(pattern))
}

function buildMarkdown(payload) {
  const lines = [
    '# Web RAG Sources',
    '',
    `Generated: ${payload.generated_at}`,
    `Unique pages: ${payload.page_count}`,
    `Duplicates skipped: ${payload.duplicate_count}`,
    `Failures: ${payload.failure_count}`,
    '',
    'This private RAG source was generated from the curated web allowlist. Review license and attribution metadata before promoting anything into public docs.',
    '',
  ]

  for (const page of payload.pages) {
    lines.push(
      `## ${page.title}`,
      '',
      `Source: ${page.url}`,
      `Source set: ${page.source_title} (${page.source_id})`,
      `License note: ${page.license}`,
      `Fetched: ${page.fetched_at}`,
      `Content hash: ${page.content_hash.slice(0, 16)}`,
      page.notes ? `Notes: ${page.notes}` : '',
      '',
      page.text,
      '',
    )
  }

  if (payload.failures.length > 0) {
    lines.push('## Fetch Failures', '')
    for (const failure of payload.failures) {
      lines.push(`- ${failure.source_id}: ${failure.url} (${failure.error})`)
    }
    lines.push('')
  }

  return `${lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n')}\n`
}

function normalizeUrl(value, baseUrl) {
  try {
    const parsed = baseUrl ? new URL(value, baseUrl) : new URL(value)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return null
  }
}

function normalizeWhitespace(value) {
  return value.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').replace(/\s*\n{3,}\s*/g, '\n\n').trim()
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function matchFirst(value, regex) {
  return value.match(regex)?.[1] ?? ''
}

function titleFromUrl(url) {
  const parsed = new URL(url)
  const segment = parsed.pathname.split('/').filter(Boolean).at(-1) || parsed.hostname
  return segment.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function getArg(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index >= 0 && process.argv[index + 1]) return path.resolve(process.argv[index + 1])
  const equalArg = process.argv.find((arg) => arg.startsWith(`${name}=`))
  return equalArg ? path.resolve(equalArg.slice(name.length + 1)) : fallback
}

function getNumberArg(name, fallback) {
  const index = process.argv.indexOf(name)
  const raw = index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
  const value = Number(raw ?? fallback)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function toRepoRelative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll('\\', '/')
}
