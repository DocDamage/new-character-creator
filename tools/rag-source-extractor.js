import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import JSZip from 'jszip'

const textExtensions = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.log'])
const jsonExtensions = new Set(['.json'])
const officeExtensions = new Set(['.docx', '.doc'])
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.gif'])

export function getRagSupportedExtensions() {
  return [
    '.txt',
    '.md',
    '.markdown',
    '.json',
    '.csv',
    '.tsv',
    '.log',
    '.pdf',
    '.docx',
    '.doc',
    '.png',
    '.jpg',
    '.jpeg',
    '.bmp',
    '.gif',
  ]
}

export async function extractRagSource({ repoRoot, spec, sanitizeText = (value) => value, normalizeJsonText }) {
  const relativePath = spec.path.replaceAll('\\', '/')
  const absolutePath = path.join(repoRoot, relativePath)
  const ext = path.extname(relativePath).toLowerCase()
  const baseMetadata = {
    path: relativePath,
    workflow: inferWorkflow(relativePath),
    extension: ext || 'none',
  }

  if (!fs.existsSync(absolutePath)) return null

  const extracted = await extractByExtension(absolutePath, ext, { relativePath, normalizeJsonText })
  const warnings = extracted.warnings ?? []
  const text = sanitizeText(extracted.text || makeDiagnosticText(relativePath, warnings))

  return {
    source_id: relativePath,
    source_type: spec.source_type,
    title: spec.title,
    uri: relativePath,
    text,
    metadata: {
      ...baseMetadata,
      ...extracted.metadata,
      extraction_warning_count: warnings.length,
      extraction_warnings: warnings.slice(0, 5).join(' | ') || null,
    },
  }
}

async function extractByExtension(absolutePath, ext, context) {
  if (textExtensions.has(ext)) return extractText(absolutePath, ext)
  if (jsonExtensions.has(ext)) return extractJson(absolutePath, context.normalizeJsonText)
  if (ext === '.pdf') return extractPdfPlaceholder(absolutePath)
  if (ext === '.docx') return extractDocx(absolutePath)
  if (ext === '.doc') return extractDoc(absolutePath)
  if (imageExtensions.has(ext)) return extractImageLike(absolutePath, ext)
  return extractText(absolutePath, ext, [`No dedicated extractor for ${ext}; read as UTF-8 text`])
}

function extractText(absolutePath, ext, warnings = []) {
  return {
    text: fs.readFileSync(absolutePath, 'utf8'),
    metadata: {
      extractor: 'text',
      source_format: ext.replace('.', '') || 'text',
    },
    warnings,
  }
}

function extractJson(absolutePath, normalizeJsonText) {
  const raw = fs.readFileSync(absolutePath, 'utf8')
  if (typeof normalizeJsonText === 'function') {
    return {
      text: normalizeJsonText(raw, absolutePath),
      metadata: {
        extractor: 'json-normalizer',
        source_format: 'json',
      },
      warnings: [],
    }
  }
  return {
    text: raw,
    metadata: {
      extractor: 'text-json',
      source_format: 'json',
    },
    warnings: [],
  }
}

function extractPdfPlaceholder(absolutePath) {
  return {
    text: makeDiagnosticText(absolutePath, [
      'PDF ingestion is registered but no PDF text extractor is bundled in this repo. Convert important PDFs to Markdown or add a local PDF extractor.',
    ]),
    metadata: {
      extractor: 'pdf-placeholder',
      source_format: 'pdf',
      file_size_bytes: fs.statSync(absolutePath).size,
    },
    warnings: ['PDF text extraction not bundled'],
  }
}

async function extractDocx(absolutePath) {
  try {
    const zip = await JSZip.loadAsync(fs.readFileSync(absolutePath))
    const xmlFiles = [
      'word/document.xml',
      ...Object.keys(zip.files).filter((file) => /^word\/(header|footer)\d+\.xml$/i.test(file)).sort(),
    ]
    const parts = []
    for (const xmlFile of xmlFiles) {
      const entry = zip.file(xmlFile)
      if (!entry) continue
      const xml = await entry.async('string')
      const text = extractWordXmlText(xml)
      if (text.trim()) parts.push(text)
    }
    return {
      text: parts.join('\n\n'),
      metadata: {
        extractor: 'jszip-docx-wordxml',
        source_format: 'docx',
        file_size_bytes: fs.statSync(absolutePath).size,
      },
      warnings: parts.length === 0 ? ['DOCX contained no extractable Word XML text'] : [],
    }
  } catch (error) {
    return {
      text: '',
      metadata: {
        extractor: 'jszip-docx-wordxml',
        source_format: 'docx',
        file_size_bytes: fs.existsSync(absolutePath) ? fs.statSync(absolutePath).size : 0,
      },
      warnings: [`DOCX extraction failed: ${error.message}`],
    }
  }
}

function extractWordXmlText(xml) {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .match(/<w:t[^>]*>(.*?)<\/w:t>/g)?.map((token) => decodeXmlEntities(token.replace(/<[^>]+>/g, ''))).join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim() ?? ''
}

function decodeXmlEntities(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
}

function extractDoc(absolutePath) {
  const sidecarPath = `${absolutePath}.txt`
  if (fs.existsSync(sidecarPath)) {
    return {
      text: fs.readFileSync(sidecarPath, 'utf8'),
      metadata: {
        extractor: 'doc-sidecar-text',
        source_format: 'doc',
        sidecar_path: path.basename(sidecarPath),
      },
      warnings: ['Used .doc.txt sidecar text file for legacy DOC ingestion'],
    }
  }

  return extractDocViaLibreOffice(absolutePath)
}

function extractDocViaLibreOffice(absolutePath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'character-creator-rag-doc-'))
  try {
    execFileSync('soffice', [
      '--headless',
      '--convert-to',
      'txt:Text',
      '--outdir',
      tempDir,
      absolutePath,
    ], { stdio: 'ignore', timeout: 30_000 })
    const convertedPath = path.join(tempDir, `${path.basename(absolutePath, path.extname(absolutePath))}.txt`)
    const text = fs.existsSync(convertedPath) ? fs.readFileSync(convertedPath, 'utf8') : ''
    return {
      text,
      metadata: {
        extractor: 'libreoffice-doc',
        source_format: 'doc',
        file_size_bytes: fs.statSync(absolutePath).size,
      },
      warnings: text.trim() ? [] : ['LibreOffice conversion produced no text'],
    }
  } catch (error) {
    return {
      text: '',
      metadata: {
        extractor: 'libreoffice-doc',
        source_format: 'doc',
        file_size_bytes: fs.statSync(absolutePath).size,
      },
      warnings: [`Legacy DOC conversion failed or LibreOffice is unavailable: ${error.message}`],
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

async function extractImageLike(absolutePath, ext) {
  const buffer = fs.readFileSync(absolutePath)
  const dimensions = readImageDimensions(buffer, ext)
  const ocr = await tryOptionalOcr(absolutePath)
  const lines = [
    `Visual source: ${absolutePath}`,
    `Visual format: ${ext.replace('.', '')}`,
    `Visual dimensions: ${dimensions.width ?? 'unknown'}x${dimensions.height ?? 'unknown'}`,
    dimensions.frame_count ? `Visual frame count: ${dimensions.frame_count}` : null,
    '',
    'OCR text:',
    ocr.text.trim() || '[no OCR text extracted]',
  ].filter((line) => line !== null)

  return {
    text: lines.join('\n'),
    metadata: {
      extractor: ocr.extractor,
      source_format: ext.replace('.', ''),
      width: dimensions.width ?? null,
      height: dimensions.height ?? null,
      frame_count: dimensions.frame_count ?? null,
      file_size_bytes: buffer.length,
      ocr_confidence: typeof ocr.confidence === 'number' ? Math.round(ocr.confidence) : null,
    },
    warnings: ocr.warnings,
  }
}

async function tryOptionalOcr(absolutePath) {
  try {
    const tesseract = await import('tesseract.js')
    const result = await tesseract.recognize(absolutePath, 'eng')
    return {
      text: result.data?.text ?? '',
      confidence: result.data?.confidence,
      extractor: 'tesseract.js',
      warnings: result.data?.text?.trim() ? [] : ['OCR produced no text'],
    }
  } catch (error) {
    return {
      text: '',
      confidence: null,
      extractor: 'image-metadata-only',
      warnings: [`Optional OCR unavailable: ${error.message}`],
    }
  }
}

function readImageDimensions(buffer, ext) {
  if (ext === '.png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  if (ext === '.gif' && buffer.length >= 10 && buffer.toString('ascii', 0, 3) === 'GIF') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8), frame_count: countGifFrames(buffer) }
  }
  if (ext === '.bmp' && buffer.length >= 26 && buffer.toString('ascii', 0, 2) === 'BM') {
    return { width: Math.abs(buffer.readInt32LE(18)), height: Math.abs(buffer.readInt32LE(22)) }
  }
  if ((ext === '.jpg' || ext === '.jpeg') && buffer.length >= 4) {
    return readJpegDimensions(buffer)
  }
  return { width: null, height: null }
}

function readJpegDimensions(buffer) {
  let offset = 2
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break
    const marker = buffer[offset + 1]
    const length = buffer.readUInt16BE(offset + 2)
    if (marker >= 0xc0 && marker <= 0xc3 && offset + 8 < buffer.length) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  return { width: null, height: null }
}

function countGifFrames(buffer) {
  let count = 0
  for (let index = 0; index < buffer.length - 1; index += 1) {
    if (buffer[index] === 0x2c) count += 1
  }
  return count || null
}

function makeDiagnosticText(sourcePath, warnings) {
  return [
    `RAG extraction diagnostic for ${sourcePath}`,
    ...warnings.map((warning) => `Warning: ${warning}`),
  ].join('\n')
}

function inferWorkflow(sourcePath) {
  const lower = sourcePath.toLowerCase()
  if (lower.includes('apes')) return 'apes'
  if (lower.includes('lpc')) return 'lpc'
  if (lower.includes('pixellab')) return 'ai_generation'
  if (lower.includes('release')) return 'release'
  if (lower.includes('sprite')) return 'sprite'
  return 'general'
}
