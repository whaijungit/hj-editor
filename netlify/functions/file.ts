import { getStore } from '@netlify/blobs'

/**
 * 文稿附件（文件组件）的存取接口。
 *
 * 文件和文稿一样放 Netlify Blobs，不放 dist：dist 是构建产物的只读快照，
 * 重新部署会把上传的文件一起冲掉。
 *
 *   POST   /api/file          表单上传（字段名 file），返回 { id, url, name, size, type }
 *   GET    /api/file?id=xxx   直接吐文件流，?download=1 走附件下载
 *   DELETE /api/file?id=xxx   删除文件与元信息
 */
const STORE_NAME = 'editor-files'
/** Netlify 同步函数请求体上限 6MB，留一点余量 */
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_NAME_LENGTH = 180
const ID_PATTERN = /^[a-z0-9]{6,32}$/

type FileMeta = {
  name: string
  type: string
  size: number
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

/** 8 字节随机数转 base36 取 12 位，与分享 id 同款，短且几乎不会撞 */
function createId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 12)
}

function fileUrl(id: string): string {
  return `/api/file?id=${id}`
}

export default async function handler(req: Request): Promise<Response> {
  const store = getStore(STORE_NAME)
  const url = new URL(req.url)
  const id = url.searchParams.get('id')?.trim() ?? ''

  if (req.method === 'GET') {
    if (!ID_PATTERN.test(id)) return respond({ error: 'invalid id' }, 400)

    const [meta, data] = await Promise.all([
      store.get(`meta/${id}`, { type: 'json' }) as Promise<FileMeta | null>,
      store.get(`file/${id}`, { type: 'arrayBuffer' }),
    ])
    if (!meta || !data) return respond({ error: 'not found' }, 404)

    const attachment = url.searchParams.get('download') === '1'
    return new Response(data, {
      headers: {
        'content-type': meta.type || 'application/octet-stream',
        'content-length': String(data.byteLength),
        'content-disposition': `${attachment ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
        // id 内容不可变，可以放心长缓存；预览器重复打开同一文件不再回源
        'cache-control': 'public, max-age=31536000, immutable',
        'access-control-allow-origin': '*',
        'x-content-type-options': 'nosniff',
      },
    })
  }

  if (req.method === 'POST') {
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return respond({ error: 'invalid form data' }, 400)
    }

    const file = form.get('file')
    // formData 里的文件是 Blob/File，纯文本字段是 string
    if (!file || typeof file === 'string') {
      return respond({ error: 'missing file' }, 400)
    }
    if (file.size === 0) return respond({ error: 'empty file' }, 400)
    if (file.size > MAX_FILE_BYTES) {
      return respond({ error: 'file too large', limit: MAX_FILE_BYTES }, 413)
    }

    const id = createId()
    const meta: FileMeta = {
      name: (file.name || '未命名文件').slice(0, MAX_NAME_LENGTH),
      type: file.type || 'application/octet-stream',
      size: file.size,
      createdAt: Date.now(),
    }

    try {
      await store.set(`file/${id}`, await file.arrayBuffer())
      await store.setJSON(`meta/${id}`, meta)
    } catch {
      return respond({ error: 'storage unavailable' }, 503)
    }

    return respond({ id, url: fileUrl(id), ...meta }, 201)
  }

  if (req.method === 'DELETE') {
    if (!ID_PATTERN.test(id)) return respond({ error: 'invalid id' }, 400)
    await Promise.all([store.delete(`file/${id}`), store.delete(`meta/${id}`)])
    return respond({ id, deleted: true })
  }

  return respond({ error: 'method not allowed' }, 405)
}

export const config = { path: '/api/file' }
