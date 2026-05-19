import fs from 'node:fs'
import path from 'node:path'

const allowedCommands = new Set(['check', 'export-spritesheet', 'import-reference'])

export type AsepriteBridgeRequest = {
  action: string
  executablePath: string
  projectPath?: string
}

export function validateAsepriteBridgeRequest(body: unknown, appRoot: string): AsepriteBridgeRequest {
  if (!body || typeof body !== 'object') throw new Error('Expected JSON body.')
  const payload = body as Record<string, unknown>
  const action = typeof payload.action === 'string' ? payload.action : ''
  if (!allowedCommands.has(action)) throw new Error('Unsupported Aseprite bridge action.')
  const executablePath = typeof payload.executablePath === 'string' ? payload.executablePath.trim() : ''
  if (executablePath && (!path.isAbsolute(executablePath) || !fs.existsSync(executablePath) || !/aseprite/i.test(path.basename(executablePath)))) {
    throw new Error('Aseprite executable path must point to an existing Aseprite executable.')
  }
  const projectPath = typeof payload.projectPath === 'string' && payload.projectPath.trim()
    ? safeProjectRelativePath(payload.projectPath, appRoot)
    : undefined
  return { action, executablePath, projectPath }
}

export function safeProjectRelativePath(value: string, appRoot: string) {
  if (path.isAbsolute(value) || value.includes('..')) throw new Error('Path must be project-relative.')
  const resolved = path.resolve(appRoot, value)
  const relative = path.relative(appRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path escapes project root.')
  return relative.replaceAll(path.sep, '/')
}
