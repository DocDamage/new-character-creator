import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createGenerationJobsFromMissingAnimationQueue,
  generationJobBlocksRelease,
} from '../../src/generationJobs.ts'

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
