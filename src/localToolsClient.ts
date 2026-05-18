const localToolsToken = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_LOCAL_TOOLS_TOKEN
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
