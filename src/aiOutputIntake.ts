import type { GenerationJob } from './types'

export type GenerationOutputValidation = {
  ok: boolean
  findings: string[]
}

export function markGenerationOutputImportedForReview(
  job: GenerationJob,
  options: { outputId: string; uri: string; importedAt: string },
): GenerationJob {
  const validation = validateGenerationOutputImport(job, options)
  return {
    ...job,
    updated_at: options.importedAt,
    status: 'review_required',
    outputs: job.outputs.map((output) => output.output_id === options.outputId
      ? {
          ...output,
          uri: options.uri,
          reviewed: false,
          release_blocked: true,
        }
      : output),
    review_gate: {
      ...job.review_gate,
      status: 'ready_for_review',
      release_blocked: true,
    },
    logs: [
      ...job.logs,
      `Output ${options.outputId} imported for review at ${options.importedAt}.`,
      `Validation ${validation.ok ? 'passed' : 'needs attention'}: ${validation.findings.join('; ')}`,
    ],
  }
}

export function validateGenerationOutputImport(
  job: GenerationJob,
  options: { outputId: string; uri: string },
): GenerationOutputValidation {
  const findings: string[] = []
  const output = job.outputs.find((candidate) => candidate.output_id === options.outputId)
  if (!output) findings.push(`Unknown output id: ${options.outputId}`)
  if (!options.uri.trim()) findings.push('Output URI is empty.')
  if (!isSupportedImageUri(options.uri)) findings.push('Output URI must be a PNG/WebP image path or image data URL.')
  if (!job.input_artifacts || job.input_artifacts.affected_frames.length === 0) findings.push('Generation job has no affected frame metadata.')
  if (!job.review_gate.release_blocked) findings.push('Review gate should remain blocked after import.')
  return {
    ok: findings.length === 0,
    findings: findings.length > 0 ? findings : ['output target exists', 'image URI is supported', 'frame metadata is present', 'review remains blocked'],
  }
}

function isSupportedImageUri(value: string) {
  const normalized = value.trim().toLowerCase()
  return normalized.startsWith('data:image/png') ||
    normalized.startsWith('data:image/webp') ||
    normalized.endsWith('.png') ||
    normalized.endsWith('.webp')
}
