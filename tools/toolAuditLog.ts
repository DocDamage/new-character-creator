import fs from 'node:fs'
import path from 'node:path'

const secretPattern = /(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9_./+=-]{12,}|(?:api[_-]?key|token|secret)\s*[:=]\s*["']?[A-Za-z0-9_-]{8,})/gi

export function redactAuditPayload(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(secretPattern, '[redacted]')
  if (Array.isArray(value)) return value.map(redactAuditPayload)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    /secret|token|key|authorization/i.test(key) ? '[redacted]' : redactAuditPayload(child),
  ]))
}

export async function appendToolAuditRecord(auditPath: string, record: Record<string, unknown>) {
  await fs.promises.mkdir(path.dirname(auditPath), { recursive: true })
  const safeRecord = {
    ...redactAuditPayload(record) as Record<string, unknown>,
    created_at: new Date().toISOString(),
  }
  await fs.promises.appendFile(auditPath, `${JSON.stringify(safeRecord)}\n`, 'utf8')
}
