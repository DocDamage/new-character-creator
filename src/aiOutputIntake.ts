import type { GenerationJob } from './types'

export function markGenerationOutputImportedForReview(
  job: GenerationJob,
  options: { outputId: string; uri: string; importedAt: string },
): GenerationJob {
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
    logs: [...job.logs, `Output ${options.outputId} imported for review at ${options.importedAt}.`],
  }
}
