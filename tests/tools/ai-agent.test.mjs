import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAiAgentReply, chooseAiProvider } from '../../src/aiAgent.ts'
import { parseAiRequestIntent } from '../../src/aiIntent.ts'

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

test('AI agent proposes approval-gated tools from user intent', () => {
  const reply = buildAiAgentReply({
    request: 'Use PixelLab for missing animation and export an Aseprite handoff',
    selectedCharacter: character,
    recipe: null,
    ragIndex: null,
    providers: [],
    tools: {
      aseprite: { enabled: true, executable_path: '', bridge_url: '', script_folder: '' },
      pixellab: { enabled: true, endpoint_url: '', mcp_server_url: '', preferred_model: '' },
      local_llm: { enabled: false, endpoint_url: '', provider: 'ollama', model: '' },
    },
    lpcPublished: true,
    localToolsAvailable: true,
  })

  assert.equal(reply.role, 'assistant')
  assert.ok(reply.tool_proposals.some((proposal) => proposal.tool_id === 'queue_pixellab_generation'))
  assert.ok(reply.tool_proposals.some((proposal) => proposal.tool_id === 'export_handoff'))
  assert.match(reply.content, /Intent:/)
})

test('AI intent parser extracts provider, action, layer, animation, and export format', () => {
  const intent = parseAiRequestIntent('Use OpenAI to generate missing slash torso frames and export an Aseprite handoff')
  assert.deepEqual(intent.actions, ['generate', 'export'])
  assert.equal(intent.providerHint, 'openai')
  assert.equal(intent.outputFormat, 'aseprite_reference')
  assert.deepEqual(intent.animations, ['slash'])
  assert.deepEqual(intent.layers, ['torso'])
  assert.equal(intent.reviewRequired, true)
})

test('AI provider selection respects explicit provider hints', () => {
  const providers = [
    makeProvider('ollama', 'ollama', 'ollama', false),
    makeProvider('openai', 'openai', 'openai', true),
  ]
  assert.equal(chooseAiProvider(providers, 'openai').provider_id, 'openai')
  assert.equal(chooseAiProvider(providers, 'local').provider_id, 'ollama')
})

test('AI agent proposes RAG activation when project context is requested', () => {
  const reply = buildAiAgentReply({
    request: 'Activate RAG and cite docs for APES cleanup',
    selectedCharacter: character,
    recipe: null,
    ragIndex: null,
    providers: [],
    tools: {
      aseprite: { enabled: false, executable_path: '', bridge_url: '', script_folder: '' },
      pixellab: { enabled: false, endpoint_url: '', mcp_server_url: '', preferred_model: '' },
      local_llm: { enabled: false, endpoint_url: '', provider: 'ollama', model: '' },
    },
    lpcPublished: false,
    localToolsAvailable: true,
  })

  assert.ok(reply.tool_proposals.some((proposal) => proposal.tool_id === 'activate_rag'))
  assert.match(reply.content, /Available tools:/)
})

function makeProvider(provider_id, name, type, secret_session_set) {
  return {
    provider_id,
    name,
    type,
    enabled: true,
    model: 'fixture',
    base_url: 'http://127.0.0.1:11434',
    secret_session_set,
    secret_storage: secret_session_set ? 'session_only' : 'none',
    direct_browser_calls: false,
    local_proxy_required: true,
    notes: '',
  }
}
