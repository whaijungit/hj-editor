import { useEffect, useSyncExternalStore } from 'react'

/**
 * 用户导入的本地字体：字体文件存在 IndexedDB 里，
 * 元数据用 useSyncExternalStore 订阅，字体在选中时注册成 FontFace。
 */

export type CustomFontMeta = {
  id: string
  name: string
  size: number
  createdAt: number
}

export const CUSTOM_FONT_PREFIX = 'custom:'

export const customFontId = (id: string) => `${CUSTOM_FONT_PREFIX}${id}`

export const toCustomFontKey = (fontId: string): string | null =>
  fontId.startsWith(CUSTOM_FONT_PREFIX)
    ? fontId.slice(CUSTOM_FONT_PREFIX.length)
    : null

/** 用内部家族名避免和系统字体撞名 */
export const customFontFamily = (id: string) => `HJFont_${id}`

const DB_NAME = 'hj-editor-fonts'
const DB_VERSION = 1
const META_STORE = 'meta'
const FILE_STORE = 'file'
const MAX_SIZE = 40 * 1024 * 1024
const ACCEPTED = /\.(ttf|otf|woff2?|ttc)$/i

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })

  return dbPromise
}

const toPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('本地存储读写失败'))
  })

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('本地存储读写失败'))
    tx.onabort = () => reject(tx.error ?? new Error('本地存储读写中止'))
  })

async function readMetas(): Promise<CustomFontMeta[]> {
  const db = await openDb()
  if (!db) return []

  try {
    const tx = db.transaction(META_STORE, 'readonly')
    const list = await toPromise(
      tx.objectStore(META_STORE).getAll() as IDBRequest<CustomFontMeta[]>,
    )
    return list.sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    return []
  }
}

async function readData(id: string): Promise<ArrayBuffer | null> {
  const db = await openDb()
  if (!db) return null

  try {
    const tx = db.transaction(FILE_STORE, 'readonly')
    const data = await toPromise(
      tx.objectStore(FILE_STORE).get(id) as IDBRequest<ArrayBuffer | undefined>,
    )
    return data ?? null
  } catch {
    return null
  }
}

async function putRecord(meta: CustomFontMeta, data: ArrayBuffer) {
  const db = await openDb()
  if (!db) throw new Error('当前浏览器不支持本地字体存储')

  const tx = db.transaction([META_STORE, FILE_STORE], 'readwrite')
  tx.objectStore(META_STORE).put(meta)
  tx.objectStore(FILE_STORE).put(data, meta.id)
  await done(tx)
}

async function removeRecord(id: string) {
  const db = await openDb()
  if (!db) return

  const tx = db.transaction([META_STORE, FILE_STORE], 'readwrite')
  tx.objectStore(META_STORE).delete(id)
  tx.objectStore(FILE_STORE).delete(id)
  await done(tx)
}

const listeners = new Set<() => void>()
let metas: CustomFontMeta[] = []
let loaded = false
let loading: Promise<void> | null = null
const registered = new Set<string>()

const emit = () => {
  listeners.forEach((listener) => listener())
}

export const getCustomFontMetas = (): CustomFontMeta[] => metas

export function subscribeCustomFonts(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function ensureCustomFontsLoaded(): Promise<void> {
  if (loaded) return Promise.resolve()
  if (loading) return loading

  loading = readMetas().then((list) => {
    metas = list
    loaded = true
    loading = null
    emit()
  })

  return loading
}

/** 订阅导入字体列表，首次挂载时从 IndexedDB 读取 */
export function useCustomFonts(): CustomFontMeta[] {
  useEffect(() => {
    void ensureCustomFontsLoaded()
  }, [])

  return useSyncExternalStore(
    subscribeCustomFonts,
    getCustomFontMetas,
    getCustomFontMetas,
  )
}

/** 注册成页面的 FontFace，成功返回 true */
export async function loadCustomFont(id: string): Promise<boolean> {
  const family = customFontFamily(id)
  if (registered.has(family)) return true

  const data = await readData(id)
  if (!data) return false

  const face = new FontFace(family, data)
  await face.load()
  document.fonts.add(face)
  registered.add(family)
  return true
}

export async function importCustomFont(file: File): Promise<CustomFontMeta> {
  if (!ACCEPTED.test(file.name)) {
    throw new Error('只支持 ttf、otf、ttc、woff、woff2 字体文件')
  }
  if (file.size > MAX_SIZE) {
    throw new Error('字体文件不能超过 40MB')
  }

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const name =
    file.name.replace(/\.[^.]+$/, '').trim().slice(0, 40) || '未命名字体'
  const data = await file.arrayBuffer()

  // 先解析一遍，避免把损坏的文件存进去
  const family = customFontFamily(id)
  const face = new FontFace(family, data)
  await face.load()

  const meta: CustomFontMeta = { id, name, size: file.size, createdAt: Date.now() }

  try {
    await navigator.storage?.persist?.()
  } catch {
    // 申请持久化配额失败不影响保存
  }

  try {
    await putRecord(meta, data)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('浏览器存储空间不足，先移除一些字体再试')
    }
    throw new Error('字体保存失败，请换一个文件重试')
  }

  document.fonts.add(face)
  registered.add(family)

  metas = [...metas, meta]
  loaded = true
  emit()

  return meta
}

export async function deleteCustomFont(id: string) {
  await removeRecord(id)

  const family = customFontFamily(id)
  const faces: FontFace[] = []
  document.fonts.forEach((face) => {
    if (face.family.replace(/["']/g, '') === family) faces.push(face)
  })
  faces.forEach((face) => document.fonts.delete(face))
  registered.delete(family)

  metas = metas.filter((item) => item.id !== id)
  emit()
}
