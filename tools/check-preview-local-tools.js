import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  const distIndex = path.resolve(appRoot, 'dist', 'index.html')
  if (!existsSync(distIndex)) {
    throw new Error('dist/index.html is missing. Run npm run build before preview local-tool smoke checks.')
  }

  const port = await getAvailablePort()
  const localToolsToken = readFileSync(path.resolve(appRoot, '.local-tools-token'), 'utf8').trim()
  const viteCli = path.resolve(appRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  const preview = spawn(process.execPath, [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: appRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let requestedShutdown = false

  const logs = []
  preview.stdout.on('data', (chunk) => logs.push(String(chunk)))
  preview.stderr.on('data', (chunk) => logs.push(String(chunk)))

  try {
    const health = await waitForJson(`http://127.0.0.1:${port}/__local/health`, 30_000)
    assert(health.ok === true, 'preview health payload should report ok=true')

    const assetTools = await fetch(`http://127.0.0.1:${port}/__local/asset-tools`)
    assert(assetTools.status === 405, `asset-tools GET should return 405, received ${assetTools.status}`)

    const apesTools = await fetch(`http://127.0.0.1:${port}/__local/apes-tools`)
    assert(apesTools.status === 405, `apes-tools GET should return 405, received ${apesTools.status}`)

    const unauthorized = await fetch(`http://127.0.0.1:${port}/__local/apes-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:65535' },
      body: JSON.stringify({ action: 'preflight', pythonPath: 'python' }),
    })
    assert(unauthorized.status === 403, `tokenless/cross-origin POST should return 403, received ${unauthorized.status}`)

    const authorized = await fetch(`http://127.0.0.1:${port}/__local/apes-tools`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pixel-Creator-Local-Token': localToolsToken,
      },
      body: JSON.stringify({ action: 'preflight', pythonPath: 'definitely-not-python.exe' }),
    })
    assert(authorized.status === 400, `authorized POST should reach APES validation, received ${authorized.status}`)

    const fixturePath = path.resolve(appRoot, 'public', 'data', 'qa', 'apes_report_harness.json').replaceAll(path.sep, '/')
    const fsFixture = await waitForJson(`http://127.0.0.1:${port}/@fs/${fixturePath}`, 10_000)
    assert(fsFixture.job_id === 'apes_harness_job', 'preview /@fs route should serve app-root fixture files')

    console.log(`Preview local tools smoke passed on http://127.0.0.1:${port}`)
  } finally {
    requestedShutdown = true
    preview.kill()
    await waitForExit(preview, 5_000).catch(() => {
      preview.kill('SIGKILL')
    })
  }

  const expectedShutdown = requestedShutdown && (preview.signalCode === 'SIGTERM' || preview.exitCode === 143)
  if (!expectedShutdown && preview.exitCode !== null && preview.exitCode !== 0 && preview.exitCode !== 1) {
    throw new Error(`Preview server exited unexpectedly with code ${preview.exitCode}.\n${logs.join('')}`)
  }
}

async function getAvailablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  await new Promise((resolve) => server.close(resolve))
  if (!address || typeof address === 'string') {
    throw new Error('Could not allocate an available local port.')
  }
  return address.port
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return response.json()
      }
      lastError = new Error(`Request failed with status ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`)
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for preview server to exit.')), timeoutMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
