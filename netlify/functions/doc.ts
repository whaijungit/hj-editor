import { getStore } from '@netlify/blobs'

/**
 * 分享文稿的读写接口。
 *
 * 文稿存在 Netlify Blobs 里，而不是部署产物 dist 中：dist 是构建后上传到 CDN 的
 * 只读快照，运行时写不进去；Blobs 独立于部署，重新部署也不会丢数据。
 */
const STORE_NAME = 'shared-docs'
/** 单篇上限 5MB：base64 图片多的长文档也够用，同时挡住误传的大文件 */
const MAX_DOC_BYTES = 5 * 1024 * 1024
const MAX_TITLE_LENGTH = 200
const ID_PATTERN = /^[a-z0-9]{6,32}$/

type SharedDocument = {
  title: string
  html: string
  createdAt: number
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

export default async function handler(req: Request): Promise<Response> {
  const store = getStore(STORE_NAME)

  if (req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('id')?.trim() ?? ''
    if (!ID_PATTERN.test(id)) return respond({ error: 'invalid id' }, 400)

    const doc = (await store.get(id, { type: 'json' })) as SharedDocument | null
    if (!doc) return respond({ error: 'not found' }, 404)
    return respond(doc)
  }

  if (req.method === 'POST') {
    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return respond({ error: 'invalid json' }, 400)
    }

    const body = payload as Partial<SharedDocument> | null
    const html = typeof body?.html === 'string' ? body.html : ''
    if (!html.trim()) return respond({ error: 'empty document' }, 400)
    if (byteLength(html) > MAX_DOC_BYTES) {
      return respond({ error: 'document too large', limit: MAX_DOC_BYTES }, 413)
    }

    const title =
      (typeof body?.title === 'string' ? body.title : '')
        .slice(0, MAX_TITLE_LENGTH)
        .trim() || '未命名文稿'

    const id = createId()
    const doc: SharedDocument = { title, html, createdAt: Date.now() }
    await store.setJSON(id, doc)

    return respond({ id }, 201)
  }

  return respond({ error: 'method not allowed' }, 405)
}

export const config = { path: '/api/doc' }
