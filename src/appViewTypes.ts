import type { KitbashRecipe, PartLabel, Rect } from './types'

export type BatchPart = {
  label: PartLabel
  source_character: string
  method: string
  source_part_id?: string
  reviewed?: boolean
}

export type BatchVariant = {
  id: string
  base: string
  palette: string
  parts: BatchPart[]
  recipe: KitbashRecipe
}

export type ManualMaskSaveRequest = {
  sourcePartId?: string
  maskDataUrl: string
  bounds: Rect
}