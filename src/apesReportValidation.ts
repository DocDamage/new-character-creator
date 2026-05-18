import { layerOrder } from './presets'
import { localFsPathPrefix, localToolPath } from './localToolsClient.ts'
import type { ApesReport, PartLabel, Rect } from './types'

export type ApesReportValidationResult =
  | { ok: true; report: ApesReport }
  | { ok: false; errors: string[] }

const validLabels = new Set<PartLabel>(layerOrder)

export function validateApesReport(value: unknown): ApesReportValidationResult {
  const errors: string[] = []
  if (!value || typeof value !== 'object') {
    return { ok: false, errors: ['Report must be a JSON object.'] }
  }

  const report = value as Partial<ApesReport>
  if (!isNonEmptyString(report.job_id)) errors.push('job_id must be a non-empty string.')
  if (!Array.isArray(report.masks)) errors.push('masks must be an array.')
  if (report.semantic_mapping !== undefined && (!report.semantic_mapping || typeof report.semantic_mapping !== 'object' || Array.isArray(report.semantic_mapping))) {
    errors.push('semantic_mapping must be an object when present.')
  }
  if (report.warnings !== undefined && !isStringArray(report.warnings)) errors.push('warnings must be an array of strings when present.')

  for (const [index, mask] of Array.isArray(report.masks) ? report.masks.entries() : []) {
    const prefix = `masks[${index}]`
    if (!mask || typeof mask !== 'object') {
      errors.push(`${prefix} must be an object.`)
      continue
    }
    const item = mask as Partial<ApesReport['masks'][number]>
    if (!isPartLabel(item.label)) errors.push(`${prefix}.label must be a supported part label.`)
    if (!isRelativeAssetPath(item.path)) errors.push(`${prefix}.path must be a relative report asset path.`)
    if (item.image_path !== undefined && !isRelativeAssetPath(item.image_path)) errors.push(`${prefix}.image_path must be a relative report asset path when present.`)
    if (item.bounds !== undefined && !isRect(item.bounds)) errors.push(`${prefix}.bounds must contain finite x, y, w, and h numbers.`)
    if (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) {
      errors.push(`${prefix}.confidence must be a number from 0 to 1.`)
    }
    if (typeof item.reviewed !== 'boolean') errors.push(`${prefix}.reviewed must be boolean.`)
    if (item.warnings !== undefined && !isStringArray(item.warnings)) errors.push(`${prefix}.warnings must be an array of strings when present.`)
  }

  return errors.length > 0
    ? { ok: false, errors }
    : {
        ok: true,
        report: {
          job_id: report.job_id!,
          status: report.status,
          masks: report.masks!,
          semantic_mapping: report.semantic_mapping ?? {},
          warnings: report.warnings ?? [],
        },
      }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isPartLabel(value: unknown): value is PartLabel {
  return typeof value === 'string' && validLabels.has(value as PartLabel)
}

function isRect(value: unknown): value is Rect {
  if (!value || typeof value !== 'object') return false
  const rect = value as Partial<Rect>
  return [rect.x, rect.y, rect.w, rect.h].every((item) => typeof item === 'number' && Number.isFinite(item)) && (rect.w ?? 0) > 0 && (rect.h ?? 0) > 0
}

function isRelativeAssetPath(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false
  if (value.startsWith('data:')) return true
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith(localFsPathPrefix()) || value.startsWith(localToolPath(''))) return false
  if (/^[A-Z]:[\\/]/i.test(value)) return false
  return !value.includes('..')
}
