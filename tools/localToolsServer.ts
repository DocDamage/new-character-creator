import type { Connect, PreviewServer, ViteDevServer } from 'vite'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

type LocalAssetToolsOptions = {
  sessionToken: string
}

export function createLocalAssetToolsPlugin(appRoot: string, options: LocalAssetToolsOptions) {
  const allowedFsRoots = [
    path.resolve(appRoot, 'assets'),
    path.resolve(appRoot, 'data', 'apes', 'output'),
    path.resolve(appRoot, 'data', 'cache'),
    path.resolve(appRoot, 'data', 'lpc'),
    path.resolve(appRoot, 'public', 'data', 'qa'),
  ]

  return {
    name: 'local-asset-tools',
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        if (!validateLoopbackRequest(req, res)) return
        if (serveLocalAssetRequest(req, res, next, appRoot) || serveLocalDataRequest(req, res, next, appRoot) || serveLocalFsRequest(req, res, next, allowedFsRoots) || serveApesOutputRequest(req, res, next, appRoot)) {
          return
        }
        if (await serveLocalToolRequest(req, res, appRoot, options.sessionToken)) {
          return
        }
        next()
      })
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        if (!validateLoopbackRequest(req, res)) return
        if (serveLocalAssetRequest(req, res, next, appRoot) || serveLocalDataRequest(req, res, next, appRoot) || serveLocalFsRequest(req, res, next, allowedFsRoots) || serveApesOutputRequest(req, res, next, appRoot)) {
          return
        }

        if (await serveLocalToolRequest(req, res, appRoot, options.sessionToken)) {
          return
        }

        next()
      })
    },
  }
}

function serveLocalAssetRequest(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction, appRoot: string) {
  const requestPath = getRequestPath(req.url)
  if (!requestPath?.startsWith('/assets/')) {
    return false
  }
  if (!validateFileReadMethod(req, res)) return true

  const assetsRoot = path.resolve(appRoot, 'assets')
  const localPath = path.resolve(appRoot, `.${requestPath}`)
  if (!isPathInside(localPath, assetsRoot)) {
    res.statusCode = 403
    res.end('Forbidden')
    return true
  }

  serveFile(localPath, res, next)
  return true
}

function serveLocalDataRequest(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction, appRoot: string) {
  const requestPath = getRequestPath(req.url)
  if (!requestPath?.startsWith('/data/lpc/')) {
    return false
  }
  if (!validateFileReadMethod(req, res)) return true

  const lpcRoot = path.resolve(appRoot, 'data', 'lpc')
  const localPath = path.resolve(appRoot, `.${requestPath}`)
  if (!isPathInside(localPath, lpcRoot)) {
    res.statusCode = 403
    res.end('Forbidden')
    return true
  }

  serveFile(localPath, res, next)
  return true
}

function serveLocalFsRequest(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction, allowedRoots: string[]) {
  const requestPath = getRequestPath(req.url)
  if (!requestPath?.startsWith('/@fs/')) {
    return false
  }
  if (!validateFileReadMethod(req, res)) return true

  const localPath = path.resolve(requestPath.slice('/@fs/'.length))
  if (!allowedRoots.some((root) => isPathInside(localPath, root))) {
    res.statusCode = 403
    res.end('Forbidden')
    return true
  }

  serveFile(localPath, res, next)
  return true
}

function serveApesOutputRequest(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction, appRoot: string) {
  const requestPath = getRequestPath(req.url)
  if (!requestPath?.startsWith('/__local/apes-output/')) {
    return false
  }
  if (!validateFileReadMethod(req, res)) return true

  const outputRoot = path.resolve(appRoot, 'data', 'apes', 'output')
  const localPath = path.resolve(outputRoot, requestPath.slice('/__local/apes-output/'.length))
  if (!isPathInside(localPath, outputRoot)) {
    res.statusCode = 403
    res.end('Forbidden')
    return true
  }

  serveFile(localPath, res, next)
  return true
}

function serveFile(localPath: string, res: ServerResponse, next: Connect.NextFunction) {
  if (isBlockedLocalFile(localPath)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }
  fs.promises.stat(localPath).then((stats) => {
    if (!stats.isFile()) {
      next()
      return
    }

    const contentType = getAssetContentType(localPath)
    if (contentType) {
      res.setHeader('Content-Type', contentType)
    }
    res.setHeader('Cache-Control', 'no-cache')
    fs.createReadStream(localPath).pipe(res)
  }).catch(() => {
    next()
  })
}

function serveLocalHealthRequest(req: IncomingMessage, res: ServerResponse) {
  if (getRequestPath(req.url) !== '/__local/health') return false
  sendJson(res, 200, { ok: true, server: 'vite-local-tools' })
  return true
}

function validateLoopbackRequest(req: IncomingMessage, res: ServerResponse) {
  const requestPath = getRequestPath(req.url)
  if (!isLocalToolRoute(requestPath)) return true
  const host = parseHostName(req.headers.host)
  if (!host || !['127.0.0.1', 'localhost', '::1'].includes(host)) {
    sendJson(res, 403, { error: 'Local tool routes only accept loopback Host headers.' })
    return false
  }
  if (!validateSameOriginHeader(req.headers.origin, req.headers.host) || !validateSameOriginHeader(req.headers.referer, req.headers.host)) {
    sendJson(res, 403, { error: 'Local tool routes only accept same-origin requests.' })
    return false
  }
  return true
}

function isBlockedLocalFile(localPath: string) {
  const normalized = localPath.replaceAll('\\', '/')
  const base = path.basename(localPath).toLowerCase()
  return base === '.ds_store' ||
    base.endsWith('.exe') ||
    normalized.includes('/.git/') ||
    normalized.includes('/__MACOSX/')
}

function isLocalToolRoute(requestPath: string | null) {
  return Boolean(
    requestPath?.startsWith('/__local/') ||
    requestPath?.startsWith('/@fs/') ||
    requestPath?.startsWith('/data/lpc/') ||
    requestPath?.startsWith('/assets/lpc sprite generator stuff/'),
  )
}

function parseHostName(value: string | string[] | undefined) {
  const headerValue = Array.isArray(value) ? value[0] : value
  if (!headerValue) return ''
  if (headerValue.startsWith('[')) {
    const end = headerValue.indexOf(']')
    return end > 0 ? headerValue.slice(1, end).toLowerCase() : ''
  }
  return headerValue.split(':')[0]?.toLowerCase() ?? ''
}

function validateFileReadMethod(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET' || req.method === 'HEAD') return true
  sendJson(res, 405, { error: 'Method not allowed.' })
  return false
}

function validateLocalToolMutation(req: IncomingMessage, res: ServerResponse, sessionToken: string) {
  if (req.method !== 'POST') return true
  if (!sessionToken || req.headers['x-pixel-creator-local-token'] !== sessionToken) {
    sendJson(res, 403, { error: 'Missing or invalid local tool session token.' })
    return false
  }
  return true
}

function validateSameOriginHeader(value: string | string[] | undefined, requestHost: string | undefined) {
  const headerValue = Array.isArray(value) ? value[0] : value
  if (!headerValue) return true
  try {
    const parsed = new URL(headerValue)
    return parsed.host === requestHost
  } catch {
    return false
  }
}

async function serveLocalToolRequest(req: IncomingMessage, res: ServerResponse, appRoot: string, sessionToken: string) {
  if (serveLocalHealthRequest(req, res)) return true
  const requestPath = getRequestPath(req.url)
  if (requestPath === '/__local/apes-tools') {
    if (!validateLocalToolMutation(req, res, sessionToken)) return true
    await handleApesToolRequest(req, res, appRoot)
    return true
  }
  if (requestPath === '/__local/asset-tools') {
    if (!validateLocalToolMutation(req, res, sessionToken)) return true
    await handleAssetToolRequest(req, res, appRoot)
    return true
  }
  return false
}

async function handleApesToolRequest(req: IncomingMessage, res: ServerResponse, appRoot: string) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  const body = await readJsonBodyOr400(req, res)
  if (!body) return
  const action =
    body.action === 'preflight'
      ? 'preflight'
      : body.action === 'run-job'
        ? 'run-job'
        : body.action === 'generate-harness'
          ? 'generate-harness'
          : body.action === 'summarize-outputs'
            ? 'summarize-outputs'
            : body.action === 'load-report'
              ? 'load-report'
              : body.action === 'prepare-finetune'
                ? 'prepare-finetune'
                : body.action === 'prepare-duelyst-jobs'
                  ? 'prepare-duelyst-jobs'
                  : null
  const pythonPath = typeof body.pythonPath === 'string' && body.pythonPath.trim() ? body.pythonPath.trim() : 'python'
  const allowPlaceholder = body.allowPlaceholder === true
  const job = body.job && typeof body.job === 'object' ? body.job : null
  const reportPath = typeof body.reportPath === 'string' ? body.reportPath.trim() : ''

  if (!action) {
    sendJson(res, 400, { error: 'Expected a valid APES action.' })
    return
  }
  if (!validatePythonPath(pythonPath)) {
    sendJson(res, 400, { error: 'APES pythonPath must be python, py, or an existing python executable path.' })
    return
  }
  if (action === 'run-job' && !job?.job_id) {
    sendJson(res, 400, { error: 'Expected a job with job_id for run-job.' })
    return
  }

  const bridgeRoot = path.resolve(appRoot, 'tools', 'apes_bridge')
  const outputRoot = path.resolve(appRoot, 'data', 'apes', 'output')
  const outputDir = action === 'run-job' && job?.job_id ? path.resolve(outputRoot, job.job_id) : outputRoot
  const tempJobPath = action === 'run-job' && job?.job_id ? path.resolve(outputRoot, `${job.job_id}.job.json`) : null

  if (action === 'load-report') {
    await loadApesReportFromDisk(res, action, pythonPath, reportPath, outputRoot, appRoot)
    return
  }

  if (tempJobPath && job) {
    await fs.promises.mkdir(path.dirname(tempJobPath), { recursive: true })
    await fs.promises.writeFile(tempJobPath, `${JSON.stringify(job, null, 2)}\n`, 'utf8')
  }

  const commandArgs =
    action === 'preflight'
      ? [path.resolve(bridgeRoot, 'check_apes_env.py'), '--json']
      : action === 'generate-harness'
        ? [path.resolve(appRoot, 'tools', 'generate-apes-qa-harness.js')]
        : action === 'summarize-outputs'
          ? [path.resolve(bridgeRoot, 'summarize_apes_outputs.py')]
          : action === 'prepare-finetune'
            ? [path.resolve(bridgeRoot, 'prepare_finetune_data.py')]
            : action === 'prepare-duelyst-jobs'
              ? [path.resolve(bridgeRoot, 'prepare_duelyst_apes_jobs.py')]
              : [
                  path.resolve(bridgeRoot, 'run_apes_extract.py'),
                  tempJobPath!,
                  '--output',
                  outputDir,
                  ...(allowPlaceholder ? ['--allow-placeholder'] : []),
                ]

  const command = spawnSync(action === 'generate-harness' ? process.execPath : pythonPath, commandArgs, {
    cwd: appRoot,
    encoding: 'utf8',
  })
  const payload = await collectApesToolPayload(action, pythonPath, command, outputDir, outputRoot, job, appRoot)
  sendJson(res, command.status === 0 ? 200 : 500, payload)
}

function validatePythonPath(pythonPath: string) {
  const normalized = pythonPath.trim()
  if (normalized === 'python' || normalized === 'python3' || normalized === 'py') return true
  if (!path.isAbsolute(normalized) || !fs.existsSync(normalized)) return false
  const base = path.basename(normalized).toLowerCase()
  return base === 'python.exe' || base === 'python3.exe' || base === 'py.exe' || base === 'python'
}

async function handleAssetToolRequest(req: IncomingMessage, res: ServerResponse, appRoot: string) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  const body = await readJsonBodyOr400(req, res)
  if (!body) return
  const action =
    body.action === 'repair'
      ? 'repair'
      : body.action === 'reindex'
        ? 'reindex'
        : body.action === 'duelyst-audit'
          ? 'duelyst-audit'
          : body.action === 'lpc-inventory'
            ? 'lpc-inventory'
            : body.action === 'lpc-catalog'
              ? 'lpc-catalog'
            : null
  const assetRoot = typeof body.assetRoot === 'string' ? body.assetRoot.trim() : ''
  if (!action) {
    sendJson(res, 400, { error: 'Expected a valid asset-tools action.' })
    return
  }

  if (action === 'duelyst-audit') {
    try {
      const { inspectDuelystPackage } = await import('./duelyst-package.js')
      const duelyst = await inspectDuelystPackage(appRoot, {
        packagePath: typeof body.packagePath === 'string' ? body.packagePath.trim() : undefined,
        stageTopCount: typeof body.stageTopCount === 'number' ? body.stageTopCount : 8,
        candidateLimit: body.candidateLimit === 'all' ? 'all' : undefined,
      })
      sendJson(res, 200, { action, duelyst })
    } catch (error) {
      sendJson(res, 500, { action, error: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  if (action === 'lpc-inventory') {
    const scriptPath = path.resolve(appRoot, 'tools', 'build-lpc-local-inventory.js')
    const lpcAssetRoot = typeof body.lpcAssetRoot === 'string' && body.lpcAssetRoot.trim() ? body.lpcAssetRoot.trim() : ''
    const command = spawnSync(process.execPath, [scriptPath, ...(lpcAssetRoot ? ['--asset-root', lpcAssetRoot] : [])], {
      cwd: appRoot,
      encoding: 'utf8',
    })
    const inventoryPath = path.resolve(appRoot, 'data', 'lpc', 'lpc_asset_inventory.json')
    const lpcInventory = await readJsonFileIfExists(inventoryPath)
    sendJson(res, command.status === 0 ? 200 : 500, {
      action,
      status: command.status ?? 1,
      stdout: command.stdout ?? '',
      stderr: command.stderr ?? '',
      lpcInventory,
    })
    return
  }

  if (action === 'lpc-catalog') {
    const scriptPath = path.resolve(appRoot, 'tools', 'build-lpc-catalog.js')
    const referenceRoot = typeof body.referenceRoot === 'string' && body.referenceRoot.trim() ? body.referenceRoot.trim() : ''
    const command = spawnSync(process.execPath, [scriptPath, ...(referenceRoot ? ['--reference-root', referenceRoot] : [])], {
      cwd: appRoot,
      encoding: 'utf8',
    })
    const catalogPath = path.resolve(appRoot, 'data', 'lpc', 'lpc_catalog.json')
    const lpcCatalog = await readJsonFileIfExists(catalogPath)
    sendJson(res, command.status === 0 ? 200 : 500, {
      action,
      status: command.status ?? 1,
      stdout: command.stdout ?? '',
      stderr: command.stderr ?? '',
      lpcCatalog,
    })
    return
  }

  if (!assetRoot) {
    sendJson(res, 400, { error: 'Expected assetRoot for repair or reindex.' })
    return
  }

  const scriptPath =
    action === 'repair'
      ? path.resolve(appRoot, 'tools', 'repair-manifest-paths.js')
      : path.resolve(appRoot, 'tools', 'index-assets.js')
  const command = spawnSync(process.execPath, [scriptPath, '--asset-root', assetRoot], {
    cwd: appRoot,
    encoding: 'utf8',
  })
  sendJson(res, command.status === 0 ? 200 : 500, {
    action,
    assetRoot,
    status: command.status ?? 1,
    stdout: command.stdout ?? '',
    stderr: command.stderr ?? '',
  })
}

async function loadApesReportFromDisk(res: ServerResponse, action: string, pythonPath: string, reportPath: string, outputRoot: string, appRoot: string) {
  const resolvedReportPath = path.resolve(appRoot, reportPath)
  if (!reportPath || !isPathInside(resolvedReportPath, outputRoot) || path.basename(resolvedReportPath) !== 'apes_report.json') {
    sendJson(res, 400, { error: 'Expected an APES report path inside data/apes/output.' })
    return
  }

  try {
    const loadedReport = JSON.parse(await fs.promises.readFile(resolvedReportPath, 'utf8'))
    sendJson(res, 200, {
      action,
      pythonPath,
      statusCode: 0,
      stdout: '',
      stderr: '',
      report: loadedReport,
      outputDir: path.dirname(resolvedReportPath),
    })
  } catch (error) {
    sendJson(res, 500, {
      action,
      pythonPath,
      statusCode: 1,
      stdout: '',
      stderr: '',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function collectApesToolPayload(
  action: string,
  pythonPath: string,
  command: { status: number | null; stdout?: string; stderr?: string },
  outputDir: string,
  outputRoot: string,
  job: Record<string, unknown> | null,
  appRoot: string,
) {
  let preflight: unknown = null
  let status: unknown = null
  let report: unknown = null
  let inventory: unknown = null
  let finetuneManifest: unknown = null
  let duelystJobBatch: unknown = null
  if (action === 'preflight' && command.stdout) {
    try {
      preflight = JSON.parse(command.stdout)
    } catch {
      preflight = null
    }
  }

  if (action === 'run-job' && job?.job_id) {
    status = await readJsonFileIfExists(path.resolve(outputDir, 'status.json'))
    preflight = await readJsonFileIfExists(path.resolve(outputDir, 'preflight.json'))
    report = await readJsonFileIfExists(path.resolve(outputDir, 'apes_report.json'))
  }

  if (action === 'generate-harness') {
    report = await readJsonFileIfExists(path.resolve(appRoot, 'public', 'data', 'qa', 'apes_report_harness.json'))
  }

  if (action === 'summarize-outputs') {
    inventory = await readJsonFileIfExists(path.resolve(outputRoot, 'apes_output_inventory.json'))
  }

  if (action === 'prepare-finetune') {
    finetuneManifest = await readJsonFileIfExists(path.resolve(appRoot, 'data', 'training', 'apes_finetune', 'finetune_manifest.json'))
  }

  if (action === 'prepare-duelyst-jobs') {
    const batch = await readJsonFileIfExists(path.resolve(appRoot, 'data', 'apes', 'input', 'duelyst_job_batch.json'))
    duelystJobBatch = await withDuelystJobConfigs(batch, appRoot)
  }

  return {
    action,
    pythonPath,
    statusCode: command.status ?? 1,
    stdout: command.stdout ?? '',
    stderr: command.stderr ?? '',
    preflight,
    status,
    report,
    inventory,
    finetuneManifest,
    duelystJobBatch,
    outputDir: action === 'run-job' ? outputDir : action === 'generate-harness' ? path.resolve(appRoot, 'public', 'data', 'qa') : action === 'summarize-outputs' ? outputRoot : null,
  }
}

async function withDuelystJobConfigs(batch: unknown, appRoot: string) {
  if (!batch || typeof batch !== 'object' || !Array.isArray((batch as { jobs?: unknown }).jobs)) {
    return batch
  }

  const jobConfigs = []
  for (const item of (batch as { jobs: Array<{ job_path?: unknown }> }).jobs) {
    if (!item || typeof item.job_path !== 'string') continue
    const jobPath = path.resolve(appRoot, item.job_path)
    if (!isPathInside(jobPath, appRoot) || path.basename(jobPath) !== 'job.json') continue
    const jobConfig = await readJsonFileIfExists(jobPath)
    if (jobConfig) {
      jobConfigs.push(jobConfig)
    }
  }

  return {
    ...batch,
    job_configs: jobConfigs,
  }
}

async function readJsonFileIfExists(filePath: string) {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, 'utf8'))
  } catch (error) {
    void error
    return null
  }
}

function getRequestPath(url: string | undefined) {
  if (!url) return null
  try {
    return decodeURIComponent(url.split('?')[0] ?? '')
  } catch {
    return null
  }
}

function getAssetContentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.png') return 'image/png'
  if (extension === '.json') return 'application/json'
  if (extension === '.svg') return 'image/svg+xml'
  if (extension === '.txt') return 'text/plain; charset=utf-8'
  return null
}

function isPathInside(childPath: string, parentPath: string) {
  const relative = path.relative(parentPath, childPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  let totalBytes = 0
  const maxBytes = 4 * 1024 * 1024
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      totalBytes += buffer.length
      if (totalBytes > maxBytes) {
        reject(new Error('Request body is too large.'))
        req.destroy()
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => resolve())
    req.on('error', (error) => reject(error))
  })
  const body = Buffer.concat(chunks).toString('utf8')
  return body ? JSON.parse(body) : {}
}

async function readJsonBodyOr400(req: IncomingMessage, res: ServerResponse) {
  try {
    return await readJsonBody(req)
  } catch (error) {
    sendJson(res, 400, { error: `Invalid JSON request body: ${error instanceof Error ? error.message : String(error)}` })
    return null
  }
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}
