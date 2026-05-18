import type { AnimationName, Direction, Rect } from './types.ts'
import type { LpcCatalogItem, LpcCatalogLayer, LpcDrawRecord } from './lpcCatalog.ts'

export type LpcExportProfile = 'standard_64' | 'oversize'

export type LpcResolveOptions = {
  item: LpcCatalogItem
  layer: LpcCatalogLayer
  variant: string
  bodyType: string
  animation: AnimationName
  direction: Direction
  frameIndex: number
  availablePaths?: ReadonlySet<string>
  exportProfile?: LpcExportProfile
}

export type LpcFrameGeometry = {
  frame_width: number
  frame_height: number
  frame_count: number
  direction_rows: Direction[]
  canvas_offset: [number, number]
  oversize: boolean
}

const standardDirections: Direction[] = ['south', 'west', 'east', 'north']

export const lpcFrameGeometry: Record<string, LpcFrameGeometry> = {
  idle: { frame_width: 64, frame_height: 64, frame_count: 2, direction_rows: standardDirections, canvas_offset: [0, 0], oversize: false },
  walk: { frame_width: 64, frame_height: 64, frame_count: 9, direction_rows: standardDirections, canvas_offset: [0, 0], oversize: false },
  spellcast: { frame_width: 64, frame_height: 64, frame_count: 7, direction_rows: standardDirections, canvas_offset: [0, 0], oversize: false },
  thrust: { frame_width: 64, frame_height: 64, frame_count: 8, direction_rows: standardDirections, canvas_offset: [0, 0], oversize: false },
  slash: { frame_width: 64, frame_height: 64, frame_count: 6, direction_rows: standardDirections, canvas_offset: [0, 0], oversize: false },
  shoot: { frame_width: 64, frame_height: 64, frame_count: 13, direction_rows: standardDirections, canvas_offset: [0, 0], oversize: false },
  hurt: { frame_width: 64, frame_height: 64, frame_count: 6, direction_rows: ['south'], canvas_offset: [0, 0], oversize: false },
  run: { frame_width: 64, frame_height: 64, frame_count: 8, direction_rows: standardDirections, canvas_offset: [0, 0], oversize: false },
  jump: { frame_width: 64, frame_height: 64, frame_count: 5, direction_rows: standardDirections, canvas_offset: [0, 0], oversize: false },
  sit: { frame_width: 64, frame_height: 64, frame_count: 3, direction_rows: standardDirections, canvas_offset: [0, 0], oversize: false },
  emote: { frame_width: 64, frame_height: 64, frame_count: 3, direction_rows: standardDirections, canvas_offset: [0, 0], oversize: false },
  combat: { frame_width: 64, frame_height: 64, frame_count: 6, direction_rows: standardDirections, canvas_offset: [0, 0], oversize: false },
  climb: { frame_width: 64, frame_height: 64, frame_count: 6, direction_rows: ['north'], canvas_offset: [0, 0], oversize: false },
  slash_oversize: { frame_width: 192, frame_height: 192, frame_count: 6, direction_rows: standardDirections, canvas_offset: [-64, -64], oversize: true },
  slash_reverse_oversize: { frame_width: 192, frame_height: 192, frame_count: 6, direction_rows: standardDirections, canvas_offset: [-64, -64], oversize: true },
  thrust_oversize: { frame_width: 192, frame_height: 192, frame_count: 8, direction_rows: standardDirections, canvas_offset: [-64, -64], oversize: true },
}

export function resolveLpcLayerAsset(options: LpcResolveOptions): Pick<LpcDrawRecord, 'source_path' | 'source_rect' | 'dest_rect' | 'animation_status' | 'resolved_animation' | 'body_type' | 'warnings'> {
  const exportProfile = options.exportProfile ?? 'standard_64'
  const bodyPath = options.layer.paths_by_body_type[options.bodyType]
  const fallbackBodyType = bodyPath ? options.bodyType : Object.keys(options.layer.paths_by_body_type)[0] ?? options.bodyType
  const resolvedBodyPath = bodyPath ?? options.layer.paths_by_body_type[fallbackBodyType]
  const warnings: string[] = []

  if (!resolvedBodyPath) {
    return missingRecord(options, fallbackBodyType, null, ['No body-type path is available for this layer.'])
  }
  if (fallbackBodyType !== options.bodyType) {
    warnings.push(`Body type fell back from ${options.bodyType} to ${fallbackBodyType}.`)
  }

  const requestedAnimation = options.layer.custom_animation ?? options.animation
  const geometry = lpcFrameGeometry[requestedAnimation]
  if (geometry?.oversize && exportProfile === 'standard_64') {
    return missingRecord(options, fallbackBodyType, requestedAnimation, [`${requestedAnimation} requires an oversize export profile.`], 'unsupported')
  }

  const candidateAnimations = animationCandidates(requestedAnimation, options.item.animations)
  for (const candidate of candidateAnimations) {
    const sourcePath = normalizePath(`spritesheets/${resolvedBodyPath}/${candidate}/${options.variant}.png`)
    if (!options.availablePaths || options.availablePaths.has(sourcePath)) {
      return {
        source_path: sourcePath,
        source_rect: sourceRectFor(candidate, options.direction, options.frameIndex),
        dest_rect: destRectFor(candidate),
        animation_status: candidate === requestedAnimation ? 'exact' : 'fallback',
        resolved_animation: candidate,
        body_type: fallbackBodyType,
        warnings,
      }
    }
  }

  return missingRecord(options, fallbackBodyType, requestedAnimation, [`No spritesheet found for ${requestedAnimation}/${options.variant}.`])
}

function animationCandidates(requestedAnimation: string, itemAnimations: string[]) {
  const candidates = [requestedAnimation]
  if (requestedAnimation === 'idle') candidates.push('walk')
  for (const animation of itemAnimations) {
    if (!candidates.includes(animation) && !lpcFrameGeometry[animation]?.oversize) {
      candidates.push(animation)
    }
  }
  return candidates
}

function sourceRectFor(animation: string, direction: Direction, frameIndex: number): Rect {
  const geometry = lpcFrameGeometry[animation] ?? lpcFrameGeometry.walk
  const row = Math.max(0, geometry.direction_rows.indexOf(direction))
  const frame = Math.max(0, Math.min(frameIndex, geometry.frame_count - 1))
  return {
    x: frame * geometry.frame_width,
    y: row * geometry.frame_height,
    w: geometry.frame_width,
    h: geometry.frame_height,
  }
}

function destRectFor(animation: string): Rect {
  const geometry = lpcFrameGeometry[animation] ?? lpcFrameGeometry.walk
  return {
    x: geometry.canvas_offset[0],
    y: geometry.canvas_offset[1],
    w: geometry.frame_width,
    h: geometry.frame_height,
  }
}

function missingRecord(
  _options: LpcResolveOptions,
  bodyType: string,
  resolvedAnimation: string | null,
  warnings: string[],
  status: 'missing' | 'unsupported' = 'missing',
) {
  return {
    source_path: null,
    source_rect: null,
    dest_rect: { x: 0, y: 0, w: 64, h: 64 },
    animation_status: status,
    resolved_animation: resolvedAnimation,
    body_type: bodyType,
    warnings,
  }
}

function normalizePath(value: string) {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/')
}
