import { defineConfig } from 'vite'
import type { Connect, PreviewServer, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = __dirname

function localAssetToolsPlugin() {
  return {
    name: 'local-asset-tools',
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        if (!serveLocalAssetRequest(req, res, next)) {
          next()
        }
      })
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        if (serveLocalAssetRequest(req, res, next)) {
          return
        }

        if (req.url === '/__local/apes-tools') {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Method not allowed.' }))
            return
          }

          const body = await readJsonBody(req)
          const action =
            body.action === 'preflight'
              ? 'preflight'
              : body.action === 'run-job'
                ? 'run-job'
                : body.action === 'generate-harness'
                  ? 'generate-harness'
                  : body.action === 'summarize-outputs'
                    ? 'summarize-outputs'
                    : null
          const pythonPath = typeof body.pythonPath === 'string' && body.pythonPath.trim() ? body.pythonPath.trim() : process.execPath
          const allowPlaceholder = body.allowPlaceholder === true
          const job = body.job && typeof body.job === 'object' ? body.job : null

          if (!action) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Expected a valid APES action.' }))
            return
          }

          if (action === 'run-job' && !job?.job_id) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Expected a job with job_id for run-job.' }))
            return
          }

          const bridgeRoot = path.resolve(appRoot, 'tools', 'apes_bridge')
          const outputRoot = path.resolve(appRoot, 'data', 'apes', 'output')
          const outputDir = action === 'run-job' && job?.job_id ? path.resolve(outputRoot, job.job_id) : outputRoot
          const tempJobPath = action === 'run-job' && job?.job_id ? path.resolve(outputRoot, `${job.job_id}.job.json`) : null

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

          let preflight: unknown = null
          let status: unknown = null
          let report: unknown = null
          let inventory: unknown = null
          if (action === 'preflight' && command.stdout) {
            try {
              preflight = JSON.parse(command.stdout)
            } catch {
              preflight = null
            }
          }

          if (action === 'run-job' && job?.job_id) {
            const statusPath = path.resolve(outputDir, 'status.json')
            const preflightPath = path.resolve(outputDir, 'preflight.json')
            const reportPath = path.resolve(outputDir, 'apes_report.json')
            try {
              status = JSON.parse(await fs.promises.readFile(statusPath, 'utf8'))
            } catch (error) {
              void error
            }
            try {
              preflight = JSON.parse(await fs.promises.readFile(preflightPath, 'utf8'))
            } catch (error) {
              void error
            }
            try {
              report = JSON.parse(await fs.promises.readFile(reportPath, 'utf8'))
            } catch (error) {
              void error
            }
          }

          if (action === 'generate-harness') {
            const harnessReportPath = path.resolve(appRoot, 'public', 'data', 'qa', 'apes_report_harness.json')
            try {
              report = JSON.parse(await fs.promises.readFile(harnessReportPath, 'utf8'))
            } catch (error) {
              void error
            }
          }

          if (action === 'summarize-outputs') {
            const inventoryPath = path.resolve(outputRoot, 'apes_output_inventory.json')
            try {
              inventory = JSON.parse(await fs.promises.readFile(inventoryPath, 'utf8'))
            } catch (error) {
              void error
            }
          }

          const payload = {
            action,
            pythonPath,
            statusCode: command.status ?? 1,
            stdout: command.stdout ?? '',
            stderr: command.stderr ?? '',
            preflight,
            status,
            report,
            inventory,
            outputDir: action === 'run-job' ? outputDir : action === 'generate-harness' ? path.resolve(appRoot, 'public', 'data', 'qa') : action === 'summarize-outputs' ? outputRoot : null,
          }

          res.statusCode = command.status === 0 ? 200 : 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(payload))
          return
        }

        if (req.url !== '/__local/asset-tools') {
          next()
          return
        }

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed.' }))
          return
        }

        const body = await readJsonBody(req)
        const action = body.action === 'repair' ? 'repair' : body.action === 'reindex' ? 'reindex' : body.action === 'duelyst-audit' ? 'duelyst-audit' : null
        const assetRoot = typeof body.assetRoot === 'string' ? body.assetRoot.trim() : ''
        if (!action) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Expected a valid asset-tools action.' }))
          return
        }

        if (action === 'duelyst-audit') {
          try {
            const { inspectDuelystPackage } = await import('./tools/duelyst-package.js')
            const duelyst = await inspectDuelystPackage(appRoot, {
              packagePath: typeof body.packagePath === 'string' ? body.packagePath.trim() : undefined,
              stageTopCount: typeof body.stageTopCount === 'number' ? body.stageTopCount : 8,
              candidateLimit: body.candidateLimit === 'all' ? 'all' : undefined,
            })
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ action, duelyst }))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ action, error: error instanceof Error ? error.message : String(error) }))
          }
          return
        }

        if (!assetRoot) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Expected assetRoot for repair or reindex.' }))
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

        const payload = {
          action,
          assetRoot,
          status: command.status ?? 1,
          stdout: command.stdout ?? '',
          stderr: command.stderr ?? '',
        }

        res.statusCode = command.status === 0 ? 200 : 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(payload))
      })
    },
  }
}

function serveLocalAssetRequest(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) {
  const requestPath = getRequestPath(req.url)
  if (!requestPath?.startsWith('/assets/')) {
    return false
  }

  const assetsRoot = path.resolve(appRoot, 'assets')
  const localPath = path.resolve(appRoot, `.${requestPath}`)
  if (!localPath.startsWith(`${assetsRoot}${path.sep}`)) {
    res.statusCode = 403
    res.end('Forbidden')
    return true
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

  return true
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

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve())
    req.on('error', (error) => reject(error))
  })
  const body = Buffer.concat(chunks).toString('utf8')
  return body ? JSON.parse(body) : {}
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localAssetToolsPlugin()],
  server: {
    fs: {
      allow: [__dirname, path.resolve(__dirname, '..')],
    },
  },
})
