import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createGenerationJobsFromMissingAnimationQueue,
  generationJobBlocksRelease,
} from '../../src/generationJobs.ts'
import { buildAiGenerationContextQuery } from '../../src/aiContext.ts'
import { markGenerationOutputImportedForReview, validateGenerationOutputImport } from '../../src/aiOutputIntake.ts'

test('generation jobs created from missing-animation queue do not auto-select outputs', () => {
  const [job] = createGenerationJobsFromMissingAnimationQueue(makeQueue(), {
    recipeId: 'recipe_1',
    characterId: 'lpc-body',
    targetProfile: 'standard_64',
    provider: {
      provider_id: 'manual_handoff',
      name: 'Manual handoff',
      type: 'manual_handoff',
      configured: false,
      manual_handoff: {
        enabled: true,
        status: 'required',
      },
      settings: {},
    },
    now: '2026-05-18T12:00:00.000Z',
  })

  assert.equal(job.source_queue_item_ids.length, 1)
  assert.equal(job.outputs.length, 1)
  assert.equal(job.outputs[0].selected_part_id, null)
  assert.equal(job.outputs[0].auto_selected, false)
  assert.equal(job.outputs[0].reviewed, false)
  assert.equal(job.review_gate.outputs_auto_selected, false)
  assert.equal(job.input_artifacts.target_layer, 'layer_1')
  assert.equal(job.input_artifacts.affected_frames.length, 2)
  assert.match(job.prompt, /Validation:/)

  const [contextJob] = createGenerationJobsFromMissingAnimationQueue(makeQueue(), {
    recipeId: 'recipe_1',
    characterId: 'lpc-body',
    targetProfile: 'standard_64',
    now: '2026-05-18T12:00:00.000Z',
    contextForItem: () => ({
      purpose: 'generation_prompt',
      query: 'Long hair run',
      context_text: 'Generated output must be reviewed before release.',
      chunks: [],
      citations: [{ source_id: 'docs/pixellab-mcp.md', title: 'PixelLab MCP animation bridge', uri: 'docs/pixellab-mcp.md' }],
    }),
  })

  assert.match(contextJob.rag_context.context_text, /reviewed/)
})

test('generation jobs stay blocked from release until review is approved', () => {
  const [job] = createGenerationJobsFromMissingAnimationQueue(makeQueue(), {
    recipeId: 'recipe_1',
    characterId: 'lpc-body',
    targetProfile: 'standard_64',
    now: '2026-05-18T12:00:00.000Z',
  })

  assert.equal(job.review_gate.required, true)
  assert.equal(job.review_gate.release_blocked, true)
  assert.equal(job.review_gate.status, 'blocked')
  assert.equal(generationJobBlocksRelease(job), true)

  const reviewedJob = {
    ...job,
    review_gate: {
      ...job.review_gate,
      status: 'approved',
      release_blocked: false,
      reviewed_at: '2026-05-18T12:15:00.000Z',
    },
    outputs: job.outputs.map((output) => ({ ...output, reviewed: true })),
  }

  assert.equal(generationJobBlocksRelease(reviewedJob), false)
})

test('AI generation context query includes queue item and target details', () => {
  const queue = makeQueue()
  const query = buildAiGenerationContextQuery(queue.items[0], {
    characterId: 'lpc-body',
    targetProfile: 'standard_64',
  })

  assert.match(query, /Long hair/)
  assert.match(query, /run/)
  assert.match(query, /standard_64/)
})

test('default provider is explicit manual handoff without direct API', () => {
  const [job] = createGenerationJobsFromMissingAnimationQueue(makeQueue(), {
    recipeId: 'recipe_1',
    characterId: 'lpc-body',
    targetProfile: 'standard_64',
    now: '2026-05-18T12:00:00.000Z',
  })

  assert.equal(job.provider.type, 'manual_handoff')
  assert.equal(job.provider.capabilities.direct_api, false)
  assert.equal(job.provider.manual_handoff.enabled, true)
})

test('imported AI output moves job to review required without release approval', () => {
  const [job] = createGenerationJobsFromMissingAnimationQueue(makeQueue(), {
    recipeId: 'recipe_1',
    characterId: 'lpc-body',
    targetProfile: 'standard_64',
    now: '2026-05-18T12:00:00.000Z',
  })

  const updated = markGenerationOutputImportedForReview(job, {
    outputId: job.outputs[0].output_id,
    uri: 'data/generated/job/output.png',
    importedAt: '2026-05-18T12:10:00.000Z',
  })

  assert.equal(updated.status, 'review_required')
  assert.equal(updated.outputs[0].uri, 'data/generated/job/output.png')
  assert.equal(updated.outputs[0].reviewed, false)
  assert.equal(updated.review_gate.release_blocked, true)
  assert.match(updated.logs.at(-1), /Validation passed/)
})

test('AI output validation rejects unknown ids and unsupported file types', () => {
  const [job] = createGenerationJobsFromMissingAnimationQueue(makeQueue(), {
    recipeId: 'recipe_1',
    characterId: 'lpc-body',
    targetProfile: 'standard_64',
    now: '2026-05-18T12:00:00.000Z',
  })

  const validation = validateGenerationOutputImport(job, {
    outputId: 'missing',
    uri: 'data/generated/job/output.txt',
  })

  assert.equal(validation.ok, false)
  assert.match(validation.findings.join(' '), /Unknown output id/)
  assert.match(validation.findings.join(' '), /PNG\/WebP/)
})

function makeQueue() {
  return {
    format: 'pixel_creator_missing_animation_queue',
    version: 1,
    recipe_id: 'recipe_1',
    summary: {
      issue_count: 1,
      missing_count: 1,
      unsupported_count: 0,
      affected_frame_count: 2,
    },
    items: [
      {
        id: 'hair|layer_1|brown|missing|run||male',
        item_id: 'hair:long',
        item_name: 'Long hair',
        type_name: 'hair',
        layer_id: 'layer_1',
        variant: 'brown',
        status: 'missing',
        requested_animation: 'run',
        resolved_animation: null,
        body_type: 'male',
        warnings: ['run animation is missing'],
        affected_frames: [
          { animation: 'run', direction: 'south', frame_index: 0 },
          { animation: 'run', direction: 'south', frame_index: 1 },
        ],
      },
    ],
  }
}
