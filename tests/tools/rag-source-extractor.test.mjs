import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import JSZip from 'jszip'
import { extractRagSource, getRagSupportedExtensions } from '../../tools/rag-source-extractor.js'

test('RAG source extractor advertises Office and visual formats', () => {
  assert.deepEqual(
    getRagSupportedExtensions().filter((extension) => ['.docx', '.doc', '.png', '.jpg', '.jpeg', '.bmp', '.gif'].includes(extension)),
    ['.docx', '.doc', '.png', '.jpg', '.jpeg', '.bmp', '.gif'],
  )
})

test('RAG source extractor reads DOCX text with JSZip Word XML extraction', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-docx-test-'))
  try {
    const repoRoot = tempDir
    const docsDir = path.join(repoRoot, 'docs', 'rag-sources', 'office')
    fs.mkdirSync(docsDir, { recursive: true })
    const docxPath = path.join(docsDir, 'sprite-spec.docx')

    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Sprite Creator RAG DOCX extraction works.</w:t></w:r></w:p></w:body></w:document>')
    fs.writeFileSync(docxPath, await zip.generateAsync({ type: 'nodebuffer' }))

    const document = await extractRagSource({
      repoRoot,
      spec: {
        source_type: 'office_doc',
        path: 'docs/rag-sources/office/sprite-spec.docx',
        title: 'Sprite Spec',
      },
    })

    assert.equal(document.source_id, 'docs/rag-sources/office/sprite-spec.docx')
    assert.equal(document.source_type, 'office_doc')
    assert.equal(document.metadata.source_format, 'docx')
    assert.equal(document.metadata.extractor, 'jszip-docx-wordxml')
    assert.match(document.text, /Sprite Creator RAG DOCX extraction works/)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('RAG source extractor records PNG dimensions and visual source metadata', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-png-test-'))
  try {
    const repoRoot = tempDir
    const visualDir = path.join(repoRoot, 'docs', 'rag-sources', 'visual')
    fs.mkdirSync(visualDir, { recursive: true })
    const pngPath = path.join(visualDir, 'ui-reference.png')

    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const ihdrLength = Buffer.from([0x00, 0x00, 0x00, 0x0d])
    const ihdrType = Buffer.from('IHDR')
    const ihdrData = Buffer.alloc(13)
    ihdrData.writeUInt32BE(16, 0)
    ihdrData.writeUInt32BE(32, 4)
    ihdrData[8] = 8
    ihdrData[9] = 6
    const fakeCrc = Buffer.alloc(4)
    fs.writeFileSync(pngPath, Buffer.concat([pngSignature, ihdrLength, ihdrType, ihdrData, fakeCrc]))

    const document = await extractRagSource({
      repoRoot,
      spec: {
        source_type: 'visual_reference',
        path: 'docs/rag-sources/visual/ui-reference.png',
        title: 'UI Reference',
      },
    })

    assert.equal(document.source_type, 'visual_reference')
    assert.equal(document.metadata.source_format, 'png')
    assert.equal(document.metadata.width, 16)
    assert.equal(document.metadata.height, 32)
    assert.match(document.text, /Visual format: png/)
    assert.match(document.text, /Visual dimensions: 16x32/)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
