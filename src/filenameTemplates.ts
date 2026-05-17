export const defaultFilenameTemplate = '{character}_{animation}_{direction}_{frame}'

export function renderExportFilenameTemplate(template: string, values: Record<string, string | number | undefined>) {
  const source = template.trim() || defaultFilenameTemplate
  return source.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => sanitize(values[key] ?? key))
}

function sanitize(value: string | number) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'asset'
}
