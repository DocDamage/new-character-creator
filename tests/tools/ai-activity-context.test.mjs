import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAiActivitySnapshot,
  summarizeAiActivitySnapshot,
} from '../../src/aiActivityContext.ts'

const character = {
  character_id: 'lpc-female-thin',
  display_name: 'LPC Female Thin',
  class_type: 'lpc_character',
  source_folder: 'assets/lpc',
  canvas_size: { width: 64, height: 64 },
  directions: {},
  animations: [],
  animation_names: ['idle', 'walk'],
  source_quality_warnings: ['missing north hurt frames'],
  rotation_preview_paths: [],
  representative_frame: '',
  extraction_status: {
    frame_chopped: true,
    preset_regions_available: true,
    connected_pixel_pass_available: true,
    apes_pass_available: false,
    manual_cleanup_complete: false,
  },
}

test('activity snapshot captures the current editing surface and blockers', () => {
  const snapshot = buildAiActivitySnapshot({
    screen: 'fast',
    screenLabel: 'Fast Creator',
    sourcePackFilter: 'lpc',
    recipeMode: 'lpc_character',
    selectedCharacter: character,
    animationSourceCharacter: { ...character, character_id: 'lpc-motion-source', display_name: 'Walk Motion Source' },
    currentAnimation: 'walk',
    currentDirection: 'south',
    currentFrameIndex: 3,
    currentFrameCount: 9,
    playing: false,
    selectedLayer: 'front_leg',
    selectedPartId: 'lpc-pants-01',
    selectedSourcePartId: 'lpc-pants-source',
    selectedPartOptionCount: 179,
    recipe: {
      character_id: 'lpc-female-thin',
      recipe_mode: 'lpc_character',
      source_family: 'lpc',
      base_canvas: [64, 64],
      base_character: 'lpc-female-thin',
      layers: [{ label: 'front_leg' }, { label: 'torso' }],
      palette: { ramps: {} },
      animation_coverage: ['idle', 'walk'],
      export_targets: ['aseprite'],
    },
    recipeReadiness: {
      selectedPartCount: 2,
      reviewedSelectedPartCount: 1,
      unreviewedSelectedPartCount: 1,
      missingReviewedLayerCount: 3,
      warningCount: 2,
      missingPartCount: 0,
      state: 'needs_review',
    },
    missingAnimationQueueSummary: {
      issue_count: 4,
      missing_count: 1,
      unsupported_count: 3,
      affected_frame_count: 24,
    },
    generationJobCount: 2,
    releaseBlockerCount: 1,
    ragStatus: 'Hosted RAG index is ready.',
    ragDocumentCount: 5,
    ragChunkCount: 22,
    localToolsAvailable: true,
    lpcPublished: true,
    toolStatus: {
      aseprite: 'export_package',
      pixellab: 'not_connected',
      local_llm: 'not_connected',
    },
    visibleStatuses: {
      part_library: 'Two imported parts need review.',
      apes: 'APES preflight ready.',
      export: 'Blocked until review.',
      lpc: 'Loaded LPC catalog.',
    },
    recentActions: ['selected front leg', 'changed animation to walk'],
  })

  assert.equal(snapshot.location.screen_label, 'Fast Creator')
  assert.equal(snapshot.frame.animation, 'walk')
  assert.equal(snapshot.frame.frame_index, 3)
  assert.equal(snapshot.layer.selected_layer, 'front_leg')
  assert.equal(snapshot.recipe?.readiness_state, 'needs_review')
  assert.equal(snapshot.queues.missing_animation?.unsupported_count, 3)
  assert.equal(snapshot.release.blocker_count, 1)
  assert.ok(snapshot.warnings.some((warning) => warning.includes('missing north hurt frames')))
})

test('activity summary is compact but answers what the user is doing', () => {
  const snapshot = buildAiActivitySnapshot({
    screen: 'ai',
    screenLabel: 'AI Studio',
    sourcePackFilter: 'lpc',
    recipeMode: 'lpc_character',
    selectedCharacter: character,
    currentAnimation: 'walk',
    currentDirection: 'south',
    currentFrameIndex: 3,
    currentFrameCount: 9,
    playing: true,
    selectedLayer: 'front_leg',
    selectedPartOptionCount: 179,
    recipe: null,
    recipeReadiness: null,
    missingAnimationQueueSummary: null,
    generationJobCount: 0,
    releaseBlockerCount: 0,
    ragStatus: 'RAG active.',
    ragDocumentCount: 5,
    ragChunkCount: 22,
    localToolsAvailable: false,
    lpcPublished: true,
    toolStatus: {
      aseprite: 'export_package',
      pixellab: 'not_connected',
      local_llm: 'not_connected',
    },
    visibleStatuses: {},
    recentActions: [],
  })

  const summary = summarizeAiActivitySnapshot(snapshot)
  assert.match(summary, /AI Studio/)
  assert.match(summary, /LPC Female Thin/)
  assert.match(summary, /walk\/south frame 4 of 9/)
  assert.match(summary, /front_leg/)
  assert.match(summary, /GitHub Pages-safe/)
})

test('activity snapshot redacts local paths and caps noisy status text', () => {
  const snapshot = buildAiActivitySnapshot({
    screen: 'settings',
    screenLabel: 'Settings',
    sourcePackFilter: 'sprite',
    recipeMode: 'sprite_kitbash',
    selectedCharacter: character,
    currentAnimation: 'idle',
    currentDirection: 'south',
    currentFrameIndex: 0,
    currentFrameCount: 4,
    playing: false,
    selectedLayer: 'head',
    selectedPartOptionCount: 0,
    recipe: null,
    recipeReadiness: null,
    missingAnimationQueueSummary: null,
    generationJobCount: 0,
    releaseBlockerCount: 0,
    ragStatus: 'Loaded from C:\\Users\\dferr\\private\\knowledge_index.json with sk-secret-123456789',
    ragDocumentCount: 1,
    ragChunkCount: 1,
    localToolsAvailable: true,
    lpcPublished: false,
    toolStatus: {
      aseprite: 'export_package',
      pixellab: 'not_connected',
      local_llm: 'not_connected',
    },
    visibleStatuses: {
      settings: 'Using C:\\Users\\dferr\\dev\\sprite character creator\\tools\\setup.ps1 and token sk-test-secret',
    },
    recentActions: ['Opened C:\\Users\\dferr\\Downloads\\private.png'],
  })

  const serialized = JSON.stringify(snapshot)
  assert.doesNotMatch(serialized, /C:\\Users\\dferr/)
  assert.doesNotMatch(serialized, /sk-(secret|test)/)
  assert.match(serialized, /local-path/)
  assert.match(serialized, /redacted-secret/)
})

test('activity snapshot includes render evidence, capabilities, and tool history', () => {
  const snapshot = buildAiActivitySnapshot({
    screen: 'ai',
    screenLabel: 'AI Studio',
    sourcePackFilter: 'lpc',
    recipeMode: 'lpc_character',
    selectedCharacter: character,
    currentAnimation: 'walk',
    currentDirection: 'south',
    currentFrameIndex: 2,
    currentFrameCount: 8,
    currentFrameSourceRect: { x: 128, y: 64, w: 64, h: 64 },
    currentFrameCanvasSize: { width: 64, height: 64 },
    playing: false,
    selectedLayer: 'front_leg',
    selectedPartOptionCount: 3,
    recipe: null,
    recipeReadiness: null,
    missingAnimationQueueSummary: null,
    generationJobCount: 0,
    releaseBlockerCount: 0,
    ragStatus: 'Hosted RAG ready',
    ragDocumentCount: 5,
    ragChunkCount: 22,
    ragSourceMode: 'hosted_public',
    localToolsAvailable: true,
    localToolCapabilities: ['lint', 'search_assets'],
    lpcPublished: true,
    toolStatus: {
      aseprite: 'export_package',
      pixellab: 'not_connected',
      local_llm: 'not_connected',
    },
    visibleStatuses: {},
    recentActions: [],
    toolHistory: [
      { tool_id: 'explain_export_blockers', status: 'complete', result: 'No blockers.' },
      { tool_id: 'run_project_check', status: 'failed', result: 'Lint failed at local-path' },
    ],
  })

  assert.deepEqual(snapshot.render_evidence.source_rect, { x: 128, y: 64, w: 64, h: 64 })
  assert.equal(snapshot.knowledge.source_mode, 'hosted_public')
  assert.deepEqual(snapshot.knowledge.local_tool_capabilities, ['lint', 'search_assets'])
  assert.equal(snapshot.tool_history.length, 2)
  assert.equal(snapshot.tool_history[1].status, 'failed')
})
