export type JsonSchema = {
  type: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  enum?: string[]
  items?: JsonSchema
  additionalProperties?: boolean
}

export const aiToolSchemas = {
  create_apes_job: {
    type: 'object',
    properties: {
      animation: { type: 'string' },
      directions: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
  export_handoff: {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['generation_manifest', 'aseprite_reference', 'full_package'] },
    },
    required: ['format'],
    additionalProperties: false,
  },
  queue_pixellab_generation: {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      animation: { type: 'string' },
    },
    required: ['prompt'],
    additionalProperties: false,
  },
} satisfies Record<string, JsonSchema>
