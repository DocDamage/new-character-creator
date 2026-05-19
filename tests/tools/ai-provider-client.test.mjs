import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAiActivitySnapshot } from '../../src/aiActivityContext.ts'
import { parseProviderToolProposals, requestAiProviderReply } from '../../src/aiProviderClient.ts'

const character = {
  character_id: 'fixture',
  display_name: 'Fixture Hero',
  class_type: 'sprite',
  source_folder: '',
  canvas_size: { width: 64, height: 64 },
  directions: {},
  animations: [],
  animation_names: ['idle'],
  source_quality_warnings: [],
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

test('provider prompt receives redacted live activity snapshot', async () => {
  const originalFetch = globalThis.fetch
  let capturedBody = null
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body)
    return new Response(JSON.stringify({ ok: true, content: 'provider saw context' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  try {
    const activitySnapshot = buildAiActivitySnapshot({
      screen: 'ai',
      screenLabel: 'AI Studio',
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
      ragStatus: 'Loaded from C:\\Users\\dferr\\private\\knowledge_index.json',
      ragDocumentCount: 1,
      ragChunkCount: 2,
      localToolsAvailable: true,
      lpcPublished: false,
      toolStatus: {
        aseprite: 'export_package',
        pixellab: 'not_connected',
        local_llm: 'connected',
      },
      visibleStatuses: {},
      recentActions: [],
    })

    const result = await requestAiProviderReply({
      request: 'What am I doing?',
      selectedCharacter: character,
      recipe: null,
      ragIndex: null,
      providers: [{
        provider_id: 'ollama',
        name: 'Ollama',
        type: 'ollama',
        enabled: true,
        model: 'llama3.1',
        base_url: 'http://127.0.0.1:11434',
        secret_session_set: false,
        secret_storage: 'none',
        direct_browser_calls: false,
        local_proxy_required: true,
        notes: '',
      }],
      getSessionSecret: () => null,
      activitySnapshot,
    })

    assert.equal(result.content, 'provider saw context')
    const prompt = JSON.stringify(capturedBody.messages)
    assert.match(prompt, /Live activity snapshot/)
    assert.match(prompt, /AI Studio/)
    assert.match(prompt, /local-path/)
    assert.doesNotMatch(prompt, /C:\\Users\\dferr/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('provider tool proposals are parsed and schema validated', () => {
  const proposals = parseProviderToolProposals([
    { tool_id: 'inspect_live_context', input: { include_warnings: true } },
    { tool_id: 'run_project_check', input: { check: 'lint' } },
    { tool_id: 'run_project_check', input: { check: 'dangerous-shell' } },
    { tool_id: 'unknown_tool', input: {} },
  ])

  assert.deepEqual(proposals.map((proposal) => proposal.tool_id), ['inspect_live_context', 'run_project_check'])
  assert.equal(proposals[0].permission_scope, 'static_read')
  assert.equal(proposals[1].input.check, 'lint')
})
