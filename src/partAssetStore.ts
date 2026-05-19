import type { ExtractedPart } from './types'

const dbName = 'pixel_creator_part_assets'
const storeName = 'assets'
const largeAssetThreshold = 16_384

export async function persistPartLibraryAssets(parts: ExtractedPart[]) {
  if (!canUseIndexedDb()) return parts
  try {
    const db = await openAssetDb()
    return Promise.all(parts.map((part) => persistPartAssets(db, part)))
  } catch {
    return parts
  }
}

export async function hydratePartLibraryAssets(parts: ExtractedPart[]) {
  if (!canUseIndexedDb()) return parts
  try {
    const db = await openAssetDb()
    return Promise.all(parts.map((part) => hydratePartAssets(db, part)))
  } catch {
    return parts
  }
}

export async function deletePartLibraryAssets(keys: Array<string | undefined>) {
  if (!canUseIndexedDb()) return
  const activeKeys = keys.filter((key): key is string => Boolean(key))
  if (activeKeys.length === 0) return
  try {
    const db = await openAssetDb()
    await deleteAssets(db, activeKeys)
  } catch {
    // Asset cleanup is best-effort; persisted JSON still remains the source of truth.
  }
}

export async function compactPartLibraryAssets(activeParts: ExtractedPart[]) {
  if (!canUseIndexedDb()) return
  const startedAt = performance.now()
  try {
    const db = await openAssetDb()
    const activeKeys = new Set(activeParts.flatMap((part) => [part.image_asset_key, part.mask_asset_key]).filter((key): key is string => Boolean(key)))
    const keys = await readAllKeys(db)
    const staleKeys = keys.filter((key) => !activeKeys.has(key))
    await deleteAssets(db, staleKeys)
    window.__spriteCreatorDiagnostics = {
      ...(window.__spriteCreatorDiagnostics ?? {}),
      indexedDbCompactionMs: Math.round(performance.now() - startedAt),
      indexedDbDeletedAssets: staleKeys.length,
    }
  } catch {
    // Compaction should never block UI state updates.
  }
}

async function persistPartAssets(db: IDBDatabase, part: ExtractedPart): Promise<ExtractedPart> {
  const imageAsset = await persistAssetIfLarge(db, part.image_asset_key ?? `${part.part_id}:image`, part.image_data_url)
  const maskAsset = await persistAssetIfLarge(db, part.mask_asset_key ?? `${part.part_id}:mask`, part.mask_data_url)
  return {
    ...part,
    image_asset_key: imageAsset.assetKey ?? part.image_asset_key,
    mask_asset_key: maskAsset.assetKey ?? part.mask_asset_key,
    image_data_url: imageAsset.stripInline ? undefined : part.image_data_url,
    mask_data_url: maskAsset.stripInline ? undefined : part.mask_data_url,
  }
}

async function hydratePartAssets(db: IDBDatabase, part: ExtractedPart): Promise<ExtractedPart> {
  const [imageDataUrl, maskDataUrl] = await Promise.all([
    part.image_data_url || !part.image_asset_key ? Promise.resolve(part.image_data_url) : readAsset(db, part.image_asset_key),
    part.mask_data_url || !part.mask_asset_key ? Promise.resolve(part.mask_data_url) : readAsset(db, part.mask_asset_key),
  ])
  return {
    ...part,
    image_data_url: imageDataUrl ?? part.image_data_url,
    mask_data_url: maskDataUrl ?? part.mask_data_url,
  }
}

async function persistAssetIfLarge(db: IDBDatabase, assetKey: string, dataUrl: string | undefined) {
  if (!dataUrl || !dataUrl.startsWith('data:') || dataUrl.length < largeAssetThreshold) {
    return { assetKey: undefined, stripInline: false }
  }
  await writeAsset(db, assetKey, dataUrl)
  return { assetKey, stripInline: true }
}

function canUseIndexedDb() {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

function openAssetDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function writeAsset(db: IDBDatabase, assetKey: string, dataUrl: string) {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(dataUrl, assetKey)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

function readAsset(db: IDBDatabase, assetKey: string) {
  return new Promise<string | undefined>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).get(assetKey)
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : undefined)
    request.onerror = () => reject(request.error)
  })
}

function readAllKeys(db: IDBDatabase) {
  return new Promise<string[]>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).getAllKeys()
    request.onsuccess = () => resolve(request.result.filter((key): key is string => typeof key === 'string'))
    request.onerror = () => reject(request.error)
  })
}

function deleteAssets(db: IDBDatabase, assetKeys: string[]) {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    for (const assetKey of assetKeys) {
      store.delete(assetKey)
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
