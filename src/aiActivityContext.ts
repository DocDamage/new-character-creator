import type { RecipeModeId } from './lpcCatalog'
import type { RagIndex } from './ragTypes'
import type { CharacterManifest, Direction, KitbashRecipe, PartLabel, Rect } from './types'
import type { RecipeReadiness } from './creatorCockpit'
import type { MissingAnimationQueue } from './missingAnimationQueue'

export type AiToolConnectionStatus = 'connected' | 'export_package' | 'not_connected'

export type AiActivitySnapshot = {
  location: {
    screen: string
    screen_label: string
    source_pack_filter: string
    recipe_mode: RecipeModeId | string
  }
  source: {
    selected_character_id: string
    selected_character_name: string
    animation_source_id: string
    animation_source_name: string
    borrowed_animation_source: boolean
  }
  frame: {
    animation: string
    direction: Direction | string
    frame_index: number
    frame_number: number
    frame_count: number
    playing: boolean
  }
  render_evidence: {
    source_rect: Rect | null
    canvas_size: { width: number; height: number } | null
    frame_geometry: 'standard_64' | 'oversize' | 'unknown'
  }
  layer: {
    selected_layer: PartLabel | string
    selected_part_id: string | null
    selected_source_part_id: string | null
    option_count: number
  }
  recipe: null | {
    present: true
    character_id: string
    recipe_mode: RecipeModeId | string
    source_family: string
    layer_count: number
    selected_library_part_count: number
    selected_source_part_count: number
    selected_layers: string[]
    animation_coverage: string[]
    export_targets: string[]
    readiness_state: RecipeReadiness['state'] | 'unknown'
    readiness_summary: string
  }
  queues: {
    generation_job_count: number
    release_blocking_generation_job_count: number
    missing_animation: MissingAnimationQueue['summary'] | null
  }
  knowledge: {
    rag_loaded: boolean
    rag_status: string
    rag_document_count: number
    rag_chunk_count: number
    source_mode: 'not_loaded' | 'hosted_public' | 'local_full'
    local_tools_available: boolean
    local_tool_capabilities: string[]
    lpc_published: boolean
  }
  tools: {
    aseprite: AiToolConnectionStatus
    pixellab: AiToolConnectionStatus
    local_llm: AiToolConnectionStatus
  }
  release: {
    blocker_count: number
    blocker_summary: string
  }
  statuses: Record<string, string>
  warnings: string[]
  recent_actions: string[]
  tool_history: Array<{
    tool_id: string
    status: string
    result: string
  }>
}

export type BuildAiActivitySnapshotInput = {
  screen: string
  screenLabel: string
  sourcePackFilter: string
  recipeMode: RecipeModeId | string
  selectedCharacter: CharacterManifest
  animationSourceCharacter?: CharacterManifest
  currentAnimation: string
  currentDirection: Direction | string
  currentFrameIndex: number
  currentFrameCount: number
  currentFrameSourceRect?: Rect | null
  currentFrameCanvasSize?: { width: number; height: number } | null
  playing: boolean
  selectedLayer: PartLabel | string
  selectedPartId?: string | null
  selectedSourcePartId?: string | null
  selectedPartOptionCount: number
  recipe: KitbashRecipe | null
  recipeReadiness: RecipeReadiness | null
  missingAnimationQueueSummary: MissingAnimationQueue['summary'] | null
  generationJobCount: number
  releaseBlockerCount: number
  ragStatus: string
  ragDocumentCount?: number
  ragChunkCount?: number
  ragIndex?: RagIndex | null
  ragSourceMode?: AiActivitySnapshot['knowledge']['source_mode']
  localToolsAvailable: boolean
  localToolCapabilities?: string[]
  lpcPublished: boolean
  toolStatus: AiActivitySnapshot['tools']
  visibleStatuses: Record<string, string | undefined | null>
  recentActions: string[]
  toolHistory?: AiActivitySnapshot['tool_history']
}

const maxSelectedLayers = 12
const maxWarnings = 12
const maxStatuses = 10
const maxRecentActions = 8
const maxTextLength = 260

export function buildAiActivitySnapshot(input: BuildAiActivitySnapshotInput): AiActivitySnapshot {
  const animationSource = input.animationSourceCharacter ?? input.selectedCharacter
  const selectedLayers = input.recipe?.layers.map((layer) => layer.label).filter(Boolean).slice(0, maxSelectedLayers) ?? []
  const selectedLibraryPartCount = input.recipe
    ? input.recipe.layers.filter((layer) => Boolean(layer.source_part_id)).length
    : 0
  const selectedSourcePartCount = input.recipe
    ? input.recipe.layers.filter((layer) => !layer.source_part_id && layer.source_character !== input.recipe?.base_character).length +
      Object.values(input.recipe.lpc_selections ?? {}).filter((selection) => selection.enabled).length
    : 0
  const ragDocumentCount = input.ragDocumentCount ?? input.ragIndex?.document_count ?? 0
  const ragChunkCount = input.ragChunkCount ?? input.ragIndex?.chunk_count ?? 0
  const ragStatus = sanitizeText(input.ragStatus)
  const visibleStatuses = Object.fromEntries(
    Object.entries(input.visibleStatuses)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
      .map(([key, value]) => [key, sanitizeText(value)]),
  )
  const recentActions = input.recentActions.map(sanitizeText).filter(Boolean).slice(0, maxRecentActions)
  const toolHistory = (input.toolHistory ?? []).map((item) => ({
    tool_id: sanitizeText(item.tool_id),
    status: sanitizeText(item.status),
    result: sanitizeText(item.result),
  })).slice(0, 8)
  const warnings = unique([
    ...input.selectedCharacter.source_quality_warnings.map(sanitizeText),
    input.recipeReadiness && input.recipeReadiness.state !== 'ready' ? `Recipe readiness is ${input.recipeReadiness.state}.` : '',
    input.releaseBlockerCount > 0 ? `${input.releaseBlockerCount} generation job(s) block release.` : '',
    input.missingAnimationQueueSummary && input.missingAnimationQueueSummary.issue_count > 0
      ? `${input.missingAnimationQueueSummary.issue_count} missing/unsupported animation issue(s).`
      : '',
    ...Object.values(visibleStatuses).filter((status) => /blocked|failed|warning|missing|not |could not|error/i.test(status)),
  ]).slice(0, maxWarnings)

  return {
    location: {
      screen: input.screen,
      screen_label: input.screenLabel,
      source_pack_filter: input.sourcePackFilter,
      recipe_mode: input.recipeMode,
    },
    source: {
      selected_character_id: input.selectedCharacter.character_id,
      selected_character_name: input.selectedCharacter.display_name,
      animation_source_id: animationSource.character_id,
      animation_source_name: animationSource.display_name,
      borrowed_animation_source: animationSource.character_id !== input.selectedCharacter.character_id,
    },
    frame: {
      animation: input.currentAnimation,
      direction: input.currentDirection,
      frame_index: Math.max(0, input.currentFrameIndex),
      frame_number: Math.max(0, input.currentFrameIndex) + 1,
      frame_count: Math.max(0, input.currentFrameCount),
      playing: input.playing,
    },
    render_evidence: {
      source_rect: input.currentFrameSourceRect ?? null,
      canvas_size: input.currentFrameCanvasSize ?? null,
      frame_geometry: inferFrameGeometry(input.currentFrameSourceRect, input.currentFrameCanvasSize),
    },
    layer: {
      selected_layer: input.selectedLayer,
      selected_part_id: input.selectedPartId ?? null,
      selected_source_part_id: input.selectedSourcePartId ?? null,
      option_count: Math.max(0, input.selectedPartOptionCount),
    },
    recipe: input.recipe
      ? {
          present: true,
          character_id: input.recipe.character_id,
          recipe_mode: input.recipe.recipe_mode ?? 'unknown',
          source_family: input.recipe.source_family ?? 'unknown',
          layer_count: input.recipe.layers.length,
          selected_library_part_count: selectedLibraryPartCount,
          selected_source_part_count: selectedSourcePartCount,
          selected_layers: selectedLayers,
          animation_coverage: input.recipe.animation_coverage,
          export_targets: input.recipe.export_targets,
          readiness_state: input.recipeReadiness?.state ?? 'unknown',
          readiness_summary: summarizeReadiness(input.recipeReadiness),
        }
      : null,
    queues: {
      generation_job_count: input.generationJobCount,
      release_blocking_generation_job_count: input.releaseBlockerCount,
      missing_animation: input.missingAnimationQueueSummary,
    },
    knowledge: {
      rag_loaded: ragChunkCount > 0,
      rag_status: ragStatus,
      rag_document_count: ragDocumentCount,
      rag_chunk_count: ragChunkCount,
      source_mode: input.ragSourceMode ?? (ragChunkCount > 0 ? (input.localToolsAvailable ? 'local_full' : 'hosted_public') : 'not_loaded'),
      local_tools_available: input.localToolsAvailable,
      local_tool_capabilities: input.localToolsAvailable ? (input.localToolCapabilities ?? defaultLocalToolCapabilities) : [],
      lpc_published: input.lpcPublished,
    },
    tools: input.toolStatus,
    release: {
      blocker_count: input.releaseBlockerCount,
      blocker_summary: input.releaseBlockerCount > 0
        ? `${input.releaseBlockerCount} generation job(s) block release.`
        : input.recipeReadiness?.state === 'ready' ? 'No current release blockers detected.' : `Recipe readiness is ${input.recipeReadiness?.state ?? 'unknown'}.`,
    },
    statuses: Object.fromEntries(
      Object.entries(visibleStatuses)
        .slice(0, maxStatuses),
    ),
    warnings,
    recent_actions: recentActions,
    tool_history: toolHistory,
  }
}

export function summarizeAiActivitySnapshot(snapshot: AiActivitySnapshot): string {
  const mode = snapshot.knowledge.local_tools_available ? 'local tools available' : 'GitHub Pages-safe/static tools only'
  const recipe = snapshot.recipe
    ? `${snapshot.recipe.recipe_mode} recipe with ${snapshot.recipe.layer_count} layer(s), readiness ${snapshot.recipe.readiness_state}`
    : 'no active recipe'
  const blockers = snapshot.release.blocker_count > 0 ? `; ${snapshot.release.blocker_summary}` : ''
  const queue = snapshot.queues.missing_animation && snapshot.queues.missing_animation.issue_count > 0
    ? `; missing animation queue has ${snapshot.queues.missing_animation.issue_count} issue(s)`
    : ''
  return [
    `${snapshot.location.screen_label}: ${snapshot.source.selected_character_name} (${snapshot.source.selected_character_id})`,
    `${snapshot.frame.animation}/${snapshot.frame.direction} frame ${snapshot.frame.frame_number} of ${snapshot.frame.frame_count || 'unknown'}`,
    `selected layer ${snapshot.layer.selected_layer} with ${snapshot.layer.option_count} option(s)`,
    recipe,
    `${snapshot.knowledge.rag_loaded ? `${snapshot.knowledge.rag_chunk_count} RAG chunk(s) loaded from ${snapshot.knowledge.source_mode}` : 'RAG not loaded'}, ${mode}${blockers}${queue}`,
  ].join('; ')
}

const defaultLocalToolCapabilities = ['scan_pc_rag_assets', 'fetch_web_rag_sources', 'search_assets', 'lint', 'source_hygiene', 'rag_hosted_check', 'ai_tools_tests', 'release_build', 'lpc_render_matrix_audit']

function summarizeReadiness(readiness: RecipeReadiness | null) {
  if (!readiness) return 'unknown'
  return [
    `${readiness.selectedPartCount} selected`,
    `${readiness.reviewedSelectedPartCount} reviewed`,
    `${readiness.unreviewedSelectedPartCount} unreviewed`,
    `${readiness.missingReviewedLayerCount} missing reviewed layer(s)`,
    `${readiness.warningCount} warning(s)`,
  ].join(', ')
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function sanitizeText(value: string) {
  return value
    .replace(/[A-Z]:[\\/](?:[^\\/\s]+[\\/])*[^\\/\s]*/g, 'local-path')
    .replace(/\/(?:Users|home)\/[^\s]+/g, 'local-path')
    .replace(/\b(?:sk|pk|api|token|secret)[-_][A-Za-z0-9_-]{6,}\b/gi, 'redacted-secret')
    .replace(/\s+/g, ' ')
    .slice(0, maxTextLength)
}

function inferFrameGeometry(sourceRect?: Rect | null, canvasSize?: { width: number; height: number } | null): AiActivitySnapshot['render_evidence']['frame_geometry'] {
  const width = sourceRect?.w ?? canvasSize?.width
  const height = sourceRect?.h ?? canvasSize?.height
  if (!width || !height) return 'unknown'
  return width === 64 && height === 64 ? 'standard_64' : 'oversize'
}
