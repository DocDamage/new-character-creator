const localToolsToken = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_LOCAL_TOOLS_TOKEN
const baseUrl = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
const localPrefix = ['', '__local'].join('/')

export function localToolFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (localToolsToken) {
    headers.set('X-Pixel-Creator-Local-Token', localToolsToken)
  }
  return fetch(input, {
    ...init,
    headers,
  })
}

export function localToolPath(path: string) {
  return `${localPrefix}/${path.replace(/^\/+/, '')}`
}

export function localFsPathPrefix() {
  return ['', '@fs', ''].join('/')
}

export function publicAssetPath(path: string) {
  if (!path || path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) return path
  if (path.startsWith(localToolPath('')) || path.startsWith(localFsPathPrefix())) return path
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const normalized = path.replaceAll('\\', '/').replace(/^\.?\//, '')
  return `${base}${normalized}`
}
