import type { PartLabel, Rect } from './types'

export const layerOrder: PartLabel[] = [
  'shadow',
  'back_item',
  'cloak_back',
  'back_arm',
  'back_leg',
  'torso',
  'front_leg',
  'front_arm',
  'neck',
  'head',
  'face',
  'hair_hat_hood',
  'weapon',
  'shield',
  'accessory',
  'aura_effect',
]

export const partLabels: PartLabel[] = [
  'head',
  'hair_hat_hood',
  'face',
  'neck',
  'torso',
  'front_arm',
  'back_arm',
  'front_hand',
  'back_hand',
  'legs',
  'front_leg',
  'back_leg',
  'feet',
  'weapon',
  'shield',
  'cloak_back',
  'back_item',
  'accessory',
  'aura_effect',
  'shadow',
]

export const humanoid64Preset: Record<PartLabel, Rect> = {
  shadow: { x: 18, y: 50, w: 28, h: 8 },
  back_item: { x: 12, y: 10, w: 40, h: 42 },
  cloak_back: { x: 14, y: 18, w: 36, h: 42 },
  back_arm: { x: 40, y: 22, w: 12, h: 24 },
  back_leg: { x: 32, y: 38, w: 12, h: 22 },
  torso: { x: 20, y: 22, w: 24, h: 18 },
  front_leg: { x: 20, y: 38, w: 12, h: 22 },
  front_arm: { x: 12, y: 22, w: 12, h: 24 },
  neck: { x: 27, y: 19, w: 10, h: 6 },
  head: { x: 20, y: 4, w: 24, h: 18 },
  face: { x: 24, y: 10, w: 16, h: 10 },
  hair_hat_hood: { x: 16, y: 0, w: 32, h: 20 },
  weapon: { x: 0, y: 12, w: 18, h: 48 },
  shield: { x: 44, y: 20, w: 18, h: 30 },
  accessory: { x: 0, y: 0, w: 64, h: 64 },
  aura_effect: { x: 0, y: 0, w: 64, h: 64 },
  front_hand: { x: 13, y: 36, w: 10, h: 10 },
  back_hand: { x: 41, y: 36, w: 10, h: 10 },
  legs: { x: 20, y: 38, w: 24, h: 22 },
  feet: { x: 18, y: 48, w: 28, h: 10 },
}

export const extractionModes = [
  {
    id: 'apes',
    name: 'APES',
    description: 'Pose-aware articulated masks for head, torso, arms, and legs. First-class, reviewable output.',
  },
  {
    id: 'preset_region',
    name: 'Preset regions',
    description: 'Predictable 64x64 rectangular regions for repeatable extraction and fast cleanup.',
  },
  {
    id: 'connected_pixel',
    name: 'Connected pixels',
    description: 'Magic-wand style cluster selection for weapons, cloaks, separated accessories, and effects.',
  },
  {
    id: 'manual',
    name: 'Manual cleanup',
    description: 'Pixel brush, eraser, lasso, copy-to-frame, onion skin, and anchor adjustment.',
  },
] as const

export const palettePresets = [
  'charcoal',
  'ash_black',
  'dried_blood',
  'indigo',
  'sickly_gold',
  'rusted_iron',
  'moon_blue',
  'plague_green',
  'bone_white',
  'ember_orange',
]
