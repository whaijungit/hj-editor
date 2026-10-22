import { getStore } from '@netlify/blobs'

/**
 * 文稿的读写接口。
 *
 * 文稿存在 Netlify Blobs 里，而不是部署产物 dist 中：dist 是构建后上传到 CDN 的
 * 只读快照，运行时写不进去；Blobs 独立于部署，重新部署也不会丢数据。
 *
 * - POST          新建一篇，返回新的 id
 * - PUT  ?id=…    覆盖已存在的那篇（「保存到云端」反复保存沿用同一个链接）
 * - GET  ?id=…    取回内容（分享页读的就是它）
 */
const STORE_NAME = 'shared-docs'
/** 单篇上限 5MB：base64 图片多的长文档也够用，同时挡住误传的大文件 */
const MAX_DOC_BYTES = 5 * 1024 * 1024
const MAX_TITLE_LENGTH = 200
const ID_PATTERN = /^[a-z0-9]{6,32}$/

type StoredDocument = {
  title: string
  html: string
  createdAt: number
  updatedAt: number
}

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/** 8 字节随机数转 base36，取 12 位：约 62 bit，链接短且基本不可能碰撞 */
function createId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 12)
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

type BodyResult =
  | { ok: true; title: string; html: string }
  | { ok: false; response: Response }

/** 校验并裁剪请求体：新建与覆盖共用同一套规则 */
async function readBody(req: Request): Promise<BodyResult> {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return { ok: false, response: respond({ error: 'invalid json' }, 400) }
  }

  const body = payload as { title?: unknown; html?: unknown } | null
  const html = typeof body?.html === 'string' ? body.html : ''
  if (!html.trim()) {
    return { ok: false, response: respond({ error: 'empty document' }, 400) }
  }
  if (byteLength(html) > MAX_DOC_BYTES) {
    return {
      ok: false,
      response: respond({ error: 'document too large', limit: MAX_DOC_BYTES }, 413),
    }
  }

  const title =
    (typeof body?.title === 'string' ? body.title : '')
      .slice(0, MAX_TITLE_LENGTH)
      .trim() || '未命名文稿'

  return { ok: true, title, html }
}

export default async function handler(req: Request): Promise<Response> {
  const store = getStore(STORE_NAME)
  const idParam = new URL(req.url).searchParams.get('id')?.trim() ?? ''

  if (req.method === 'GET') {
    if (!ID_PATTERN.test(idParam)) return respond({ error: 'invalid id' }, 400)

    const doc = (await store.get(idParam, { type: 'json' })) as StoredDocument | null
    if (!doc) return respond({ error: 'not found' }, 404)
    return respond(doc)
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const body = await readBody(req)
    if (!body.ok) return body.response

    const now = Date.now()

    // 覆盖保存：id 必须存在，否则让客户端改走新建，免得覆盖别人的文稿
    if (req.method === 'PUT') {
      if (!ID_PATTERN.test(idParam)) return respond({ error: 'invalid id' }, 400)

      const existing = (await store.get(idParam, {
        type: 'json',
      })) as StoredDocument | null
      if (!existing) return respond({ error: 'not found' }, 404)

      const doc: StoredDocument = {
        title: body.title,
        html: body.html,
        createdAt: existing.createdAt ?? now,
        updatedAt: now,
      }
      await store.setJSON(idParam, doc)
      return respond({ id: idParam, updatedAt: now })
    }

    const id = createId()
    const doc: StoredDocument = {
      title: body.title,
      html: body.html,
      createdAt: now,
      updatedAt: now,
    }
    await store.setJSON(id, doc)

    return respond({ id, updatedAt: now }, 201)
  }

  return respond({ error: 'method not allowed' }, 405)
}

export const config = { path: '/api/doc' }
