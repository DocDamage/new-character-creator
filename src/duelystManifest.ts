import type { CharacterManifest, DuelystPackageAudit, FrameRef } from './types'

type AssetPathMapper = (path: string) => string

export function normalizeDuelystAudit(
  payload: DuelystPackageAudit,
  assetPath: AssetPathMapper = (value) => value,
): DuelystPackageAudit {
  const stagedCount = payload.staged_manifest?.character_count ?? payload.staged_manifest?.characters?.length ?? 0
  const candidateCount = payload.candidate_units?.length ?? 0
  return {
    ...payload,
    candidate_units: (payload.candidate_units ?? []).map((candidate) => ({
      ...candidate,
      preview_url: assetPath(candidate.preview_url),
      staged_frame_url: assetPath(candidate.staged_frame_url),
      staged_animations: Object.fromEntries(
        Object.entries(candidate.staged_animations ?? {}).map(([animationName, frames]) => [
          animationName,
          frames.map((frame) => normalizeFrameRef(frame, assetPath)),
        ]),
      ),
    })),
    findings: payload.findings ?? [],
    summary: payload.summary || `Loaded ${candidateCount} Duelyst candidate sheet(s) and ${stagedCount} staged review frame(s).`,
    staged_manifest: {
      ...payload.staged_manifest,
      character_count: stagedCount,
      characters: (payload.staged_manifest?.characters ?? []).map((character) => normalizeDuelystCharacter(character, assetPath)),
    },
  }
}

function normalizeDuelystCharacter(character: CharacterManifest, assetPath: AssetPathMapper): CharacterManifest {
  return {
    ...character,
    source_folder: assetPath(character.source_folder),
    representative_frame: assetPath(character.representative_frame),
    rotation_preview_paths: (character.rotation_preview_paths ?? []).map((preview) => ({
      ...preview,
      path: assetPath(preview.path),
    })),
    directions: Object.fromEntries(
      Object.entries(character.directions ?? {}).map(([directionName, animations]) => [
        directionName,
        Object.fromEntries(
          Object.entries(animations ?? {}).map(([animationName, record]) => [
            animationName,
            {
              ...record,
              frames: (record.frames ?? []).map((frame) => normalizeFrameRef(frame, assetPath)),
            },
          ]),
        ),
      ]),
    ) as CharacterManifest['directions'],
    animations: (character.animations ?? []).map((animation) => ({
      ...animation,
      directions: Object.fromEntries(
        Object.entries(animation.directions ?? {}).map(([directionName, frames]) => [
          directionName,
          (frames ?? []).map((frame) => normalizeFrameRef(frame, assetPath)),
        ]),
      ) as CharacterManifest['animations'][number]['directions'],
      preview_gifs: (animation.preview_gifs ?? []).map(assetPath),
    })),
  }
}

function normalizeFrameRef(frame: FrameRef, assetPath: AssetPathMapper): FrameRef {
  return {
    ...frame,
    path: assetPath(frame.path),
  }
}
