import type { MissingAnimationQueue, MissingAnimationQueueItem } from './missingAnimationQueue.ts'
import type { RagContextBundle } from './ragTypes.ts'
import type { AiProviderConfig, AnimationName, GenerationJob, GenerationJobStatus } from './types.ts'

export const defaultAiProviderConfig: AiProviderConfig = {
  provider_id: 'pixellab_manual_handoff',
  name: 'PixelLab manual handoff',
  type: 'manual_handoff',
  configured: false,
  capabilities: {
    text_to_sprite: false,
    image_to_animation: false,
    animation_cleanup: false,
    direct_api: false,
    mcp_available: false,
  },
  manual_handoff: {
    enabled: true,
    status: 'required',
    notes: 'Export generation job JSON, run it through PixelLab or another image model, then import reviewed outputs manually.',
  },
  settings: {},
}

type CreateGenerationJobsOptions = {
  recipeId?: string
  characterId: string
  targetProfile: string
  provider?: AiProviderConfig
  promptPrefix?: string
  settings?: Record<string, string | number | boolean | null>
  contextForItem?: (item: MissingAnimationQueueItem) => RagContextBundle | undefined
  now?: string
}

export function createGenerationJobsFromMissingAnimationQueue(
  queue: MissingAnimationQueue,
  options: CreateGenerationJobsOptions,
): GenerationJob[] {
  const createdAt = options.now ?? new Date().toISOString()
  const provider = options.provider ?? defaultAiProviderConfig

  return queue.items.map((item, index) => {
    const targetAnimation = item.requested_animation as AnimationName
    const label = queueItemLabel(item)
    const jobId = makeGenerationJobId(options.characterId, item, createdAt, index)
    return {
      job_id: jobId,
      created_at: createdAt,
      updated_at: createdAt,
      source_queue_item_ids: [item.id],
      source_queue_item_labels: [label],
      recipe_id: options.recipeId ?? queue.recipe_id,
      character_id: options.characterId,
      target_animation: targetAnimation,
      target_profile: options.targetProfile,
      prompt: buildPrompt(item, options.promptPrefix),
      settings: options.settings ?? {},
      provider,
      rag_context: options.contextForItem?.(item),
      input_artifacts: buildInputArtifacts(item),
      status: provider.configured ? 'draft' : 'handoff_ready',
      logs: [
        `Created from missing-animation queue item ${item.id}.`,
        provider.configured
          ? `Ready for ${provider.name} generation.`
          : 'No configured provider is available; use manual export/import handoff.',
        'Generated outputs are blocked from release until reviewed and are not selected automatically.',
      ],
      outputs: [
        {
          output_id: `${jobId}_output_1`,
          queue_item_id: item.id,
          label,
          animation: targetAnimation,
          profile: options.targetProfile,
          uri: null,
          reviewed: false,
          auto_selected: false,
          selected_part_id: null,
          release_blocked: true,
        },
      ],
      provenance: {
        source: 'missing_animation_queue',
        queue_recipe_id: queue.recipe_id,
        queue_item_count: 1,
        affected_frame_count: item.affected_frames.length,
        warnings: [...item.warnings],
      },
      review_gate: {
        required: true,
        status: 'blocked',
        release_blocked: true,
        outputs_auto_selected: false,
      },
    }
  })
}

export function generationJobBlocksRelease(job: GenerationJob) {
  return job.review_gate.required && (job.review_gate.release_blocked || job.review_gate.status !== 'approved')
}

export function buildGenerationJobsHandoffPayload(jobs: GenerationJob[]) {
  const exportedAt = new Date().toISOString()
  const exportedManualStatus: AiProviderConfig['manual_handoff']['status'] = 'exported'
  const exportedJobStatus: GenerationJobStatus = 'exported'
  const exportedJobs: GenerationJob[] = jobs.map((job) => ({
    ...job,
    provider: {
      ...job.provider,
      manual_handoff: {
        ...job.provider.manual_handoff,
        status: exportedManualStatus,
        exported_at: exportedAt,
      },
    },
    status: job.status === 'handoff_ready' ? exportedJobStatus : job.status,
    logs: [...job.logs, `Handoff JSON exported at ${exportedAt}.`],
    updated_at: exportedAt,
  }))

  return {
    format: 'pixel_creator_generation_jobs_handoff',
    version: 1,
    exported_at: exportedAt,
    job_count: jobs.length,
    jobs: exportedJobs,
  }
}

function queueItemLabel(item: MissingAnimationQueueItem) {
  return `${item.item_name} / ${item.layer_id} / ${item.requested_animation}`
}

function buildPrompt(item: MissingAnimationQueueItem, prefix = 'Generate pixel-art animation layer frames') {
  const artifacts = buildInputArtifacts(item)
  const affected = item.affected_frames
    .slice(0, 6)
    .map((frame) => `${frame.animation}/${frame.direction}/${frame.frame_index}`)
    .join(', ')
  return [
    prefix,
    `Item: ${item.item_name} (${item.item_id})`,
    `Layer: ${item.layer_id}; variant: ${item.variant}; body: ${item.body_type}`,
    `Target animation: ${item.requested_animation}; status: ${item.status}`,
    affected ? `Affected frames: ${affected}${item.affected_frames.length > 6 ? ', ...' : ''}` : '',
    item.warnings.length > 0 ? `Warnings: ${item.warnings.join('; ')}` : '',
    `Validation: ${artifacts.validation_checks.join('; ')}`,
    `Constraints: ${artifacts.constraints.join('; ')}`,
  ].filter(Boolean).join('\n')
}

function buildInputArtifacts(item: MissingAnimationQueueItem): NonNullable<GenerationJob['input_artifacts']> {
  return {
    target_layer: item.layer_id,
    body_type: item.body_type,
    affected_frames: item.affected_frames.map((frame) => ({ ...frame })),
    constraints: [
      'transparent background',
      'crisp unscaled pixel edges',
      '64x64 standard LPC frame alignment unless target profile says otherwise',
      'preserve reusable layer boundaries without baking in the base body',
      `match ${item.body_type} body proportions`,
    ],
    validation_checks: [
      'output URI is present',
      'output is an image or PNG data URL',
      'review gate remains blocked until manual approval',
      'affected frame count matches the handoff request',
    ],
  }
}

function makeGenerationJobId(characterId: string, item: MissingAnimationQueueItem, createdAt: string, index: number) {
  const stamp = createdAt.replace(/\D/g, '').slice(0, 14)
  const slug = `${item.item_id}_${item.layer_id}_${item.requested_animation}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72)
  return `gen_${characterId}_${stamp}_${String(index + 1).padStart(2, '0')}_${slug}`
}
