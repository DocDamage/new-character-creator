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
  assert.deepEqual(intent.directions, [])
  assert.deepEqual(intent.layers, ['torso'])
  assert.equal(intent.reviewRequired, true)
})

test('AI intent parser extracts requested generation directions', () => {
  const intent = parseAiRequestIntent('Make the other directions for this sprite: north, east, and west for the idle animation')
  assert.ok(intent.actions.includes('generate'))
  assert.deepEqual(intent.animations, ['idle'])
  assert.deepEqual(intent.directions, ['north', 'east', 'west'])
})

test('AI intent parser treats new animation requests as generation work', () => {
  const intent = parseAiRequestIntent('make a slide animation for all directions')
  assert.ok(intent.actions.includes('generate'))
  assert.deepEqual(intent.animations, ['slide'])
  assert.deepEqual(intent.directions, ['south', 'east', 'north', 'west'])
})

test('AI intent parser recognizes human animation language', () => {
  const cases = [
    ['make a cast spell cycle facing east', ['spellcast'], ['east']],
    ['draw dodge roll frames north and south', ['roll'], ['north', 'south']],
    ['add a take damage flinch pose', ['hurt'], []],
    ['create a death animation for every direction', ['death'], ['south', 'east', 'north', 'west']],
    ['build stab and sword swing attacks', ['slash', 'thrust', 'attack'], []],
    ['finish running keyframes and a wave emote', ['run', 'emotes'], []],
    ['produce blocking and parry motions', ['block'], []],
  ]

  for (const [request, expectedAnimations, expectedDirections] of cases) {
    const intent = parseAiRequestIntent(request)
    assert.ok(intent.actions.includes('generate'), request)
    assert.deepEqual(intent.animations, expectedAnimations, request)
    assert.deepEqual(intent.directions, expectedDirections, request)
  }
})

test('AI provider selection respects explicit provider hints', () => {
  const providers = [
    makeProvider('ollama', 'ollama', 'ollama', false),
    makeProvider('openai', 'openai', 'openai', true),
    makeProvider('kimi', 'Kimi', 'kimi', true),
  ]
  assert.equal(chooseAiProvider(providers, 'openai').provider_id, 'openai')
  assert.equal(chooseAiProvider(providers, 'kimi').provider_id, 'kimi')
  assert.equal(chooseAiProvider(providers, 'local').provider_id, 'ollama')
})

test('AI intent parser recognizes Kimi and Moonshot provider hints', () => {
  assert.equal(parseAiRequestIntent('use kimi to plan the sprite animation').providerHint, 'kimi')
  assert.equal(parseAiRequestIntent('route this through moonshot').providerHint, 'kimi')
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

test('AI agent proposes static-safe analysis tools before local execution tools', () => {
  const reply = buildAiAgentReply({
    request: 'Check LPC layer alignment, inspect the current recipe, cite RAG, and run a render matrix audit',
    selectedCharacter: character,
    recipe: {
      recipe_id: 'fixture-recipe',
      recipe_mode: 'lpc_kitbash',
      base_character_id: 'fixture',
      layers: [],
      animation_coverage: ['walk'],
      missing_animations: ['slash'],
      review_status: 'draft',
      generated_jobs: [],
      export_targets: [],
    },
    ragIndex: null,
    providers: [],
    tools: {
      aseprite: { enabled: false, executable_path: '', bridge_url: '', script_folder: '' },
      pixellab: { enabled: false, endpoint_url: '', mcp_server_url: '', preferred_model: '' },
      local_llm: { enabled: false, endpoint_url: '', provider: 'ollama', model: '' },
    },
    lpcPublished: true,
    localToolsAvailable: true,
  })

  const toolIds = reply.tool_proposals.map((proposal) => proposal.tool_id)
  for (const expected of ['rag_search', 'inspect_current_recipe', 'check_lpc_compatibility', 'run_lpc_render_matrix_audit']) {
    assert.ok(toolIds.includes(expected), `${expected} should be proposed`)
  }
  assert.ok(reply.content.includes('static-safe'))
  assert.ok(reply.content.includes('local-only'))
})

test('AI agent proposes bridge setup and source ingestion tools from setup requests', () => {
  const reply = buildAiAgentReply({
    request: 'Make hooking up PixelLab and Aseprite easier, scan PC assets, and fetch web RAG sources',
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

  const toolIds = reply.tool_proposals.map((proposal) => proposal.tool_id)
  assert.ok(toolIds.includes('configure_pixellab_bridge'))
  assert.ok(toolIds.includes('configure_aseprite_bridge'))
  assert.ok(toolIds.includes('scan_pc_rag_assets'))
  assert.ok(toolIds.includes('fetch_web_rag_sources'))
})

test('AI agent keeps PixelLab requests actionable in static handoff mode', () => {
  const reply = buildAiAgentReply({
    request: 'I want to use PixelLab for this character',
    selectedCharacter: character,
    recipe: null,
    ragIndex: null,
    providers: [makeProvider('google', 'Google Gemini', 'google', true)],
    tools: {
      aseprite: { enabled: false, executable_path: '', bridge_url: '', script_folder: '' },
      pixellab: { enabled: false, endpoint_url: '', mcp_server_url: '', preferred_model: '' },
      local_llm: { enabled: false, endpoint_url: '', provider: 'ollama', model: '' },
    },
    lpcPublished: true,
    localToolsAvailable: false,
  })

  const toolIds = reply.tool_proposals.map((proposal) => proposal.tool_id)
  assert.ok(toolIds.includes('prepare_generation_prompt'))
  assert.ok(toolIds.includes('queue_pixellab_generation'))
  assert.ok(toolIds.includes('configure_pixellab_bridge'))
  assert.match(reply.content, /Pending approvals:/)
})

test('AI agent preserves explicit animation and direction requests for PixelLab handoffs', () => {
  const reply = buildAiAgentReply({
    request: 'make the other directions for this sprite. north, east and west, for the idle animation',
    selectedCharacter: { ...character, character_id: 'duelyst_f6_general', display_name: 'Duelyst General', class_type: 'duelyst_staged', canvas_size: { width: 80, height: 80 } },
    recipe: {
      character_id: 'duelyst_f6_general',
      recipe_mode: 'duelyst_review',
      source_family: 'duelyst',
      base_canvas: [80, 80],
      base_character: 'duelyst_f6_general',
      layers: [{ label: 'head', source_character: 'duelyst_f6_general', offset: [0, 0], visible: true, locked: false, extraction_method: 'source' }],
      palette: { ramps: {} },
      animation_coverage: ['idle', 'death'],
      export_targets: [],
    },
    ragIndex: null,
    providers: [],
    tools: {
      aseprite: { enabled: false, executable_path: '', bridge_url: '', script_folder: '' },
      pixellab: { enabled: false, endpoint_url: '', mcp_server_url: '', preferred_model: '' },
      local_llm: { enabled: false, endpoint_url: '', provider: 'ollama', model: '' },
    },
    lpcPublished: true,
    localToolsAvailable: false,
    activitySnapshot: {
      ...makeActivitySnapshot(),
      source: { selected_character_id: 'duelyst_f6_general', selected_character_name: 'Duelyst General', animation_source_id: 'duelyst_f6_general', animation_source_name: 'Duelyst General', borrowed_animation_source: false },
      frame: { animation: 'death', direction: 'south', frame_index: 5, frame_number: 6, frame_count: 10, playing: false },
      render_evidence: { source_rect: null, canvas_size: { width: 80, height: 80 }, frame_geometry: 'oversize' },
      layer: { selected_layer: 'head', selected_part_id: null, selected_source_part_id: null, option_count: 0 },
      recipe: { present: true, character_id: 'duelyst_f6_general', recipe_mode: 'duelyst_review', source_family: 'duelyst', layer_count: 16, selected_library_part_count: 0, selected_source_part_count: 16, selected_layers: ['head'], animation_coverage: ['idle', 'death'], export_targets: [], readiness_state: 'incomplete', readiness_summary: 'Recipe readiness is incomplete.' },
      queues: { generation_job_count: 0, release_blocking_generation_job_count: 0, missing_animation: null },
    },
  })

  const queueProposal = reply.tool_proposals.find((proposal) => proposal.tool_id === 'queue_pixellab_generation')
  assert.ok(queueProposal)
  assert.equal(queueProposal.input.animation, 'idle')
  assert.deepEqual(queueProposal.input.directions, ['north', 'east', 'west'])
  assert.equal(reply.tool_proposals.some((proposal) => proposal.tool_id === 'check_lpc_compatibility'), false)
  assert.match(reply.content, /directions=north,east,west/)
})

test('AI agent understands more natural app function phrasing', () => {
  const cases = [
    ['cut out the cloak and make a mask for it', ['create_apes_job']],
    ['make art in pixel lab for the missing frames', ['prepare_generation_prompt', 'queue_pixellab_generation']],
    ['download a zip bundle for aseprite', ['export_handoff']],
    ['why can’t I export this yet', ['explain_export_blockers']],
    ['what am I looking at right now', ['inspect_live_context']],
    ['the feet are floating and not lined up', ['diagnose_sprite_alignment']],
    ['what should I do next to finish this', ['suggest_next_action']],
    ['find helmet sprites on my pc', ['search_assets']],
    ['jump to the settings screen', ['open_relevant_panel']],
    ['compare this frame against the base body', ['compare_current_frame_to_base']],
    ['is this recipe ready to export', ['validate_current_recipe']],
    ['write a prompt for aseprite cleanup', ['prepare_generation_prompt']],
    ['what docs can you cite for this', ['rag_search', 'inspect_rag_sources']],
    ['run a production check', ['run_project_check']],
    ['wire up the pixel lab endpoint', ['configure_pixellab_bridge']],
    ['scan my computer and index assets for knowledge', ['scan_pc_rag_assets']],
    ['deep scan every combo in the render matrix', ['run_lpc_render_matrix_audit']],
  ]

  for (const [request, expectedTools] of cases) {
    const reply = buildAiAgentReply({
      request,
      selectedCharacter: character,
      recipe: {
        character_id: 'fixture',
        recipe_mode: 'lpc_character',
        source_family: 'lpc',
        base_canvas: [64, 64],
        base_character: 'fixture',
        layers: [{ label: 'cloak_back', source_character: 'fixture', offset: [0, 0], visible: true, locked: false, extraction_method: 'manual' }],
        palette: { ramps: {} },
        animation_coverage: ['walk'],
        export_targets: ['aseprite'],
      },
      ragIndex: null,
      providers: [],
      tools: {
        aseprite: { enabled: false, executable_path: '', bridge_url: '', script_folder: '' },
        pixellab: { enabled: false, endpoint_url: '', mcp_server_url: '', preferred_model: '' },
        local_llm: { enabled: false, endpoint_url: '', provider: 'ollama', model: '' },
      },
      lpcPublished: true,
      localToolsAvailable: true,
      activitySnapshot: makeActivitySnapshot(),
    })
    const toolIds = reply.tool_proposals.map((proposal) => proposal.tool_id)
    for (const expected of expectedTools) {
      assert.ok(toolIds.includes(expected), `${request} should propose ${expected}; got ${toolIds.join(', ')}`)
    }
  }
})

test('AI agent includes live activity context when answering current-work questions', () => {
  const reply = buildAiAgentReply({
    request: 'What am I doing right now and why is export blocked?',
    selectedCharacter: character,
    recipe: null,
    ragIndex: null,
    providers: [],
    tools: {
      aseprite: { enabled: false, executable_path: '', bridge_url: '', script_folder: '' },
      pixellab: { enabled: false, endpoint_url: '', mcp_server_url: '', preferred_model: '' },
      local_llm: { enabled: false, endpoint_url: '', provider: 'ollama', model: '' },
    },
    lpcPublished: true,
    localToolsAvailable: false,
    activitySnapshot: {
      location: { screen: 'exports', screen_label: 'Exports', source_pack_filter: 'lpc', recipe_mode: 'lpc_character' },
      source: { selected_character_id: 'fixture', selected_character_name: 'Fixture Hero', animation_source_id: 'fixture', animation_source_name: 'Fixture Hero', borrowed_animation_source: false },
      frame: { animation: 'walk', direction: 'south', frame_index: 2, frame_number: 3, frame_count: 8, playing: false },
      layer: { selected_layer: 'front_leg', selected_part_id: 'pants-01', selected_source_part_id: null, option_count: 179 },
      recipe: { present: true, character_id: 'fixture', recipe_mode: 'lpc_character', source_family: 'lpc', layer_count: 6, selected_library_part_count: 3, selected_source_part_count: 2, selected_layers: ['front_leg'], animation_coverage: ['walk'], export_targets: ['aseprite'], readiness_state: 'needs_review', readiness_summary: '3 selected, 1 unreviewed, 2 warnings' },
      queues: { generation_job_count: 2, release_blocking_generation_job_count: 1, missing_animation: { issue_count: 4, missing_count: 1, unsupported_count: 3, affected_frame_count: 24 } },
      knowledge: { rag_loaded: true, rag_status: 'Hosted RAG ready', rag_document_count: 5, rag_chunk_count: 22, local_tools_available: false, lpc_published: true },
      tools: { aseprite: 'export_package', pixellab: 'not_connected', local_llm: 'not_connected' },
      release: { blocker_count: 1, blocker_summary: '1 generation job blocks release' },
      statuses: { export: 'Blocked until review.' },
      warnings: ['1 generation job blocks release'],
      recent_actions: ['opened exports'],
    },
  })

  assert.match(reply.content, /Live activity:/)
  assert.match(reply.content, /Exports/)
  assert.match(reply.content, /front_leg/)
  assert.match(reply.content, /1 generation job blocks release/)
  assert.ok(reply.tool_proposals.some((proposal) => proposal.tool_id === 'inspect_live_context'))
})

test('AI agent proposes the expanded production assistant tool batch', () => {
  const reply = buildAiAgentReply({
    request: [
      'Explain export blockers, inspect layer stack, diagnose sprite alignment, suggest next action,',
      'search assets for helmets, open APES Lab, compare current frame to base,',
      'validate current recipe, prepare generation prompt, inspect RAG sources, and run lint project check.',
    ].join(' '),
    selectedCharacter: character,
    recipe: {
      character_id: 'fixture',
      recipe_mode: 'lpc_character',
      source_family: 'lpc',
      base_canvas: [64, 64],
      base_character: 'fixture',
      layers: [{ label: 'head', source_character: 'fixture', offset: [0, 0], visible: true, locked: false, extraction_method: 'manual' }],
      palette: { ramps: {} },
      animation_coverage: ['walk'],
      export_targets: ['aseprite'],
    },
    ragIndex: null,
    providers: [],
    tools: {
      aseprite: { enabled: false, executable_path: '', bridge_url: '', script_folder: '' },
      pixellab: { enabled: false, endpoint_url: '', mcp_server_url: '', preferred_model: '' },
      local_llm: { enabled: false, endpoint_url: '', provider: 'ollama', model: '' },
    },
    lpcPublished: true,
    localToolsAvailable: true,
    activitySnapshot: {
      location: { screen: 'ai', screen_label: 'AI Studio', source_pack_filter: 'lpc', recipe_mode: 'lpc_character' },
      source: { selected_character_id: 'fixture', selected_character_name: 'Fixture Hero', animation_source_id: 'fixture', animation_source_name: 'Fixture Hero', borrowed_animation_source: false },
      frame: { animation: 'walk', direction: 'south', frame_index: 0, frame_number: 1, frame_count: 8, playing: false },
      layer: { selected_layer: 'head', selected_part_id: null, selected_source_part_id: null, option_count: 3 },
      recipe: { present: true, character_id: 'fixture', recipe_mode: 'lpc_character', source_family: 'lpc', layer_count: 1, selected_library_part_count: 0, selected_source_part_count: 0, selected_layers: ['head'], animation_coverage: ['walk'], export_targets: ['aseprite'], readiness_state: 'needs_review', readiness_summary: '1 selected, 0 reviewed' },
      queues: { generation_job_count: 0, release_blocking_generation_job_count: 0, missing_animation: null },
      knowledge: { rag_loaded: true, rag_status: 'ready', rag_document_count: 5, rag_chunk_count: 22, local_tools_available: true, lpc_published: true },
      tools: { aseprite: 'export_package', pixellab: 'not_connected', local_llm: 'not_connected' },
      release: { blocker_count: 1, blocker_summary: 'Recipe readiness is needs_review.' },
      statuses: {},
      warnings: ['Recipe readiness is needs_review.'],
      recent_actions: [],
    },
  })

  const toolIds = reply.tool_proposals.map((proposal) => proposal.tool_id)
  for (const expected of [
    'explain_export_blockers',
    'inspect_layer_stack',
    'diagnose_sprite_alignment',
    'suggest_next_action',
    'search_assets',
    'open_relevant_panel',
    'compare_current_frame_to_base',
    'validate_current_recipe',
    'prepare_generation_prompt',
    'inspect_rag_sources',
    'run_project_check',
  ]) {
    assert.ok(toolIds.includes(expected), `${expected} should be proposed`)
  }
})

test('AI agent avoids noisy local/download tools for diagnostic wording', () => {
  const reply = buildAiAgentReply({
    request: 'Explain export blockers and diagnose sprite alignment',
    selectedCharacter: character,
    recipe: null,
    ragIndex: null,
    providers: [],
    tools: {
      aseprite: { enabled: false, executable_path: '', bridge_url: '', script_folder: '' },
      pixellab: { enabled: false, endpoint_url: '', mcp_server_url: '', preferred_model: '' },
      local_llm: { enabled: false, endpoint_url: '', provider: 'ollama', model: '' },
    },
    lpcPublished: true,
    localToolsAvailable: true,
    activitySnapshot: {
      location: { screen: 'ai', screen_label: 'AI Studio', source_pack_filter: 'lpc', recipe_mode: 'lpc_character' },
      source: { selected_character_id: 'fixture', selected_character_name: 'Fixture Hero', animation_source_id: 'fixture', animation_source_name: 'Fixture Hero', borrowed_animation_source: false },
      frame: { animation: 'walk', direction: 'south', frame_index: 0, frame_number: 1, frame_count: 8, playing: false },
      layer: { selected_layer: 'head', selected_part_id: null, selected_source_part_id: null, option_count: 3 },
      recipe: null,
      queues: { generation_job_count: 0, release_blocking_generation_job_count: 0, missing_animation: null },
      knowledge: { rag_loaded: true, rag_status: 'ready', rag_document_count: 5, rag_chunk_count: 22, local_tools_available: true, lpc_published: true },
      tools: { aseprite: 'export_package', pixellab: 'not_connected', local_llm: 'not_connected' },
      release: { blocker_count: 1, blocker_summary: 'Recipe readiness is incomplete.' },
      statuses: {},
      warnings: ['Recipe readiness is incomplete.'],
      recent_actions: [],
    },
  })

  const toolIds = reply.tool_proposals.map((proposal) => proposal.tool_id)
  assert.ok(toolIds.includes('explain_export_blockers'))
  assert.ok(toolIds.includes('diagnose_sprite_alignment'))
  assert.equal(toolIds.includes('search_assets'), false)
  assert.equal(toolIds.includes('export_handoff'), false)
})

test('AI agent can route to all major app panels', () => {
  const requests = [
    ['Open Fast Creator', 'fast'],
    ['Open the workstation', 'workstation'],
    ['Take me to Part Library', 'library'],
    ['Show me batch generator', 'batch'],
    ['Open Asset Audit', 'audit'],
    ['Go to APES Lab', 'apes'],
    ['Open Exports', 'exports'],
    ['Open Settings', 'settings'],
  ]

  for (const [request, panel] of requests) {
    const reply = buildAiAgentReply({
      request,
      selectedCharacter: character,
      recipe: null,
      ragIndex: null,
      providers: [],
      tools: {
        aseprite: { enabled: false, executable_path: '', bridge_url: '', script_folder: '' },
        pixellab: { enabled: false, endpoint_url: '', mcp_server_url: '', preferred_model: '' },
        local_llm: { enabled: false, endpoint_url: '', provider: 'ollama', model: '' },
      },
      lpcPublished: true,
      localToolsAvailable: false,
    })
    assert.ok(reply.tool_proposals.some((proposal) => proposal.tool_id === 'open_relevant_panel' && proposal.input.panel === panel), `${request} should route to ${panel}`)
  }
})

function makeActivitySnapshot() {
  return {
    location: { screen: 'ai', screen_label: 'AI Studio', source_pack_filter: 'lpc', recipe_mode: 'lpc_character' },
    source: { selected_character_id: 'fixture', selected_character_name: 'Fixture Hero', animation_source_id: 'fixture', animation_source_name: 'Fixture Hero', borrowed_animation_source: false },
    frame: { animation: 'walk', direction: 'south', frame_index: 0, frame_number: 1, frame_count: 8, playing: false },
    render_evidence: { source_rect: { x: 0, y: 0, w: 64, h: 64 }, canvas_size: { width: 64, height: 64 }, frame_geometry: 'standard_64' },
    layer: { selected_layer: 'cloak_back', selected_part_id: null, selected_source_part_id: null, option_count: 3 },
    recipe: { present: true, character_id: 'fixture', recipe_mode: 'lpc_character', source_family: 'lpc', layer_count: 1, selected_library_part_count: 0, selected_source_part_count: 0, selected_layers: ['cloak_back'], animation_coverage: ['walk'], export_targets: ['aseprite'], readiness_state: 'needs_review', readiness_summary: '1 selected, 0 reviewed' },
    queues: { generation_job_count: 0, release_blocking_generation_job_count: 0, missing_animation: { issue_count: 2, missing_count: 1, unsupported_count: 1, affected_frame_count: 8 } },
    knowledge: { rag_loaded: true, rag_status: 'ready', rag_document_count: 5, rag_chunk_count: 22, source_mode: 'local_full', local_tools_available: true, local_tool_capabilities: [], lpc_published: true },
    tools: { aseprite: 'export_package', pixellab: 'not_connected', local_llm: 'not_connected' },
    release: { blocker_count: 1, blocker_summary: 'Recipe readiness is needs_review.' },
    statuses: {},
    warnings: ['Recipe readiness is needs_review.'],
    recent_actions: [],
    tool_history: [],
  }
}

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
