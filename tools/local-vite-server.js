import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildViteLaunchCommand } from './localViteLauncher.js'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [mode = 'dev', ...viteArgs] = process.argv.slice(2)

try {
  const launch = buildViteLaunchCommand(appRoot, mode, viteArgs)
  const child = spawn(launch.command, launch.args, launch.options)
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exitCode = code ?? 0
  })
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
