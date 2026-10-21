/**
 * 草稿的持久化层：IndexedDB 分片存储。
 *
 * 为什么不用 localStorage：它是同步 API、容量约 5MB，长文档（尤其含 base64 图片）
 * 一旦超限就会写入失败且阻塞主线程。IndexedDB 异步、容量按磁盘配额，
 * 并且这里按顶层块切片，保存时只重写内容变化的分片。
 */
export type StoredDraft = {
  html: string
  title: string
  updatedAt: number
}

const DB_NAME = 'hj-editor'
const DB_VERSION = 1
const META_STORE = 'draft-meta'
const CHUNK_STORE = 'draft-chunks'
const DRAFT_ID = 'current'
/** 每片包含的顶层块数量：片太小会放大事务开销，太大则每次编辑都要重写整片 */
const CHUNK_SIZE = 40

type ChunkMeta = {
  id: string
  title: string
  updatedAt: number
  chunkIds: string[]
  hashes: number[]
}

type ChunkRow = {
  id: string
  index: number
  html: string
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      let request: IDBOpenDBRequest
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION)
      } catch {
        resolve(null)
        return
      }
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(CHUNK_STORE)) {
          db.createObjectStore(CHUNK_STORE, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    })
  }
  return dbPromise
}

/** FNV-1a：只用来判断分片是否变化，不追求密码学强度 */
function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function nodeToHtml(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  return (node as Element).outerHTML
}

/** 按顶层块切片，保证每片都是完整的 HTML 片段（不会切断表格 / 列表） */
function splitChunks(html: string): string[] {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const nodes = Array.from(parsed.body.childNodes)
  if (!nodes.length) return [html]

  const chunks: string[] = []
  for (let index = 0; index < nodes.length; index += CHUNK_SIZE) {
    chunks.push(nodes.slice(index, index + CHUNK_SIZE).map(nodeToHtml).join(''))
  }
  return chunks
}

function readMeta(db: IDBDatabase): Promise<ChunkMeta | null> {
  return new Promise((resolve) => {
    const request = db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(DRAFT_ID)
    request.onsuccess = () => resolve((request.result as ChunkMeta | undefined) ?? null)
    request.onerror = () => resolve(null)
  })
}

export async function loadDraftFromDb(): Promise<StoredDraft | null> {
  const db = await openDb()
  if (!db) return null

  const meta = await readMeta(db)
  if (!meta) return null

  const rows = await new Promise<ChunkRow[]>((resolve) => {
    const store = db.transaction(CHUNK_STORE, 'readonly').objectStore(CHUNK_STORE)
    const found: ChunkRow[] = []
    for (const id of meta.chunkIds) {
      const request = store.get(id)
      request.onsuccess = () => {
        if (request.result) found.push(request.result as ChunkRow)
      }
    }
    // 事务结束（全部请求完成）再返回
    const tx = store.transaction
    tx.oncomplete = () => resolve(found)
    tx.onerror = () => resolve(found)
    tx.onabort = () => resolve(found)
  })

  if (!rows.length) return null
  rows.sort((left, right) => left.index - right.index)

  return {
    html: rows.map((row) => row.html).join(''),
    title: meta.title,
    updatedAt: meta.updatedAt,
  }
}

export async function saveDraftToDb(draft: StoredDraft): Promise<void> {
  const db = await openDb()
  if (!db) return

  const chunks = splitChunks(draft.html)
  const hashes = chunks.map(hashString)
  const previous = await readMeta(db)

  await new Promise<void>((resolve) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction([META_STORE, CHUNK_STORE], 'readwrite')
    } catch {
      resolve()
      return
    }

    const metaStore = tx.objectStore(META_STORE)
    const chunkStore = tx.objectStore(CHUNK_STORE)
    const chunkIds: string[] = []

    chunks.forEach((html, index) => {
      const id = `${DRAFT_ID}:${index}`
      chunkIds.push(id)
      // 内容没变的片不重写：长文档里改一段不会触发全量落盘
      if (previous?.hashes[index] === hashes[index]) return
      chunkStore.put({ id, index, html } satisfies ChunkRow & { id: string })
    })

    if (previous) {
      for (let index = chunks.length; index < previous.chunkIds.length; index += 1) {
        chunkStore.delete(previous.chunkIds[index])
      }
    }

    metaStore.put({
      id: DRAFT_ID,
      title: draft.title,
      updatedAt: draft.updatedAt,
      chunkIds,
      hashes,
    } satisfies ChunkMeta)

    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}

export async function clearDraftFromDb(): Promise<void> {
  const db = await openDb()
  if (!db) return

  const meta = await readMeta(db)

  await new Promise<void>((resolve) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction([META_STORE, CHUNK_STORE], 'readwrite')
    } catch {
      resolve()
      return
    }

    const chunkStore = tx.objectStore(CHUNK_STORE)
    meta?.chunkIds.forEach((id) => chunkStore.delete(id))
    tx.objectStore(META_STORE).delete(DRAFT_ID)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}
