import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('RAG web fetcher crawls allowed pages, deduplicates content, and writes citations', async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'rag-web-fetch-test-'))
  const outputPath = path.join(tempDir, 'web-sources.md')
  const manifestPath = path.join(tempDir, 'web-manifest.json')
  const configPath = path.join(tempDir, 'sources.json')

  const server = createServer((request, response) => {
    const pages = {
      '/start': '<html><head><title>Start Doc</title></head><body><main><h1>Start Doc</h1><p>Aseprite command line exports sprite sheets.</p><a href="/allowed">Allowed</a><a href="/blocked">Blocked</a></main></body></html>',
      '/allowed': '<html><head><title>Allowed Doc</title></head><body><main><h1>Allowed Doc</h1><p>PixelLab sprite generation requires review before release.</p><a href="/duplicate">Duplicate</a></main></body></html>',
      '/duplicate': '<html><head><title>Duplicate Doc</title></head><body><main><h1>Allowed Doc</h1><p>PixelLab sprite generation requires review before release.</p></main></body></html>',
      '/blocked': '<html><head><title>Blocked Doc</title></head><body><main><p>This page should not be fetched.</p></main></body></html>',
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(pages[request.url] ?? '<html><body>missing</body></html>')
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  writeFileSync(configPath, JSON.stringify({
    sources: [{
      id: 'local-docs',
      title: 'Local Docs',
      url: `http://127.0.0.1:${port}/start`,
      crawl: true,
      max_pages: 4,
      allow_patterns: ['/start', '/allowed', '/duplicate'],
      license: 'test-fixture',
    }],
  }), 'utf8')

  try {
    const result = await runNode([
      'tools/fetch-rag-web-sources.js',
      '--config', configPath,
      '--out', outputPath,
      '--manifest-out', manifestPath,
    ])

    assert.equal(result.status, 0, result.stderr)
    const markdown = readFileSync(outputPath, 'utf8')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

    assert.match(markdown, /Source: http:\/\/127\.0\.0\.1:\d+\/start/)
    assert.match(markdown, /Aseprite command line exports sprite sheets/)
    assert.match(markdown, /PixelLab sprite generation requires review before release/)
    assert.doesNotMatch(markdown, /This page should not be fetched/)
    assert.equal(manifest.pages.length, 2)
    assert.equal(manifest.duplicates.length, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(tempDir, { recursive: true, force: true })
  }
})

function runNode(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: repoRoot })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}
