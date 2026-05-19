import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAiAgentReply } from '../../src/aiAgent.ts'

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
})
