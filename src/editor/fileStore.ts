/**
 * 文件组件的客户端封装：把文件传到 Netlify Function，换回一个可长期引用的地址。
 *
 * 文稿只保存文件地址（`/api/file?id=xxx`），不把内容塞进 HTML：
 * 草稿存在 IndexedDB/localStorage 里，内联大文件会直接把存储撑爆。
 */
const API_PATH = '/api/file'
const ID_PATTERN = /^[a-z0-9]{6,32}$/i
/** 与服务端保持一致：Netlify 同步函数请求体上限 6MB */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const OFFLINE_MESSAGE =
  '文件服务不可用：请重启本地开发服务器（vite dev 自带 /api/file），线上需要部署 Netlify Functions。'

export type StoredFile = {
  /** 服务端 id；手填外链时为空串 */
  id: string
  name: string
  size: number
  type: string
  /** 可直接给 viewer / <a> 用的地址 */
  url: string
  createdAt: number
}

export class FileServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileServiceError'
  }
}

export function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '未知大小'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

/** 从文件名里取扩展名（大写），没有就返回空串 */
export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim())
  return match ? match[1].toUpperCase() : ''
}

/** 下载地址：同一个文件接口加 download=1 走附件 */
export function downloadHref(url: string): string {
  if (!url) return url
  return `${url}${url.includes('?') ? '&' : '?'}download=1`
}

/** 部署后的分享页可能是别的域名，图片/预览器需要绝对地址 */
export function absoluteUrl(url: string): string {
  if (!url || /^(https?:|data:|blob:)/i.test(url)) return url
  try {
    return new URL(url, window.location.href).toString()
  } catch {
    return url
  }
}

async function readPayload(
  response: Response,
): Promise<Record<string, unknown> | null> {
  const type = response.headers.get('content-type') ?? ''
  // 函数没部署时请求会被回落到单页入口，返回的是 HTML
  if (!type.includes('application/json')) return null
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

function errorMessage(
  status: number,
  payload: Record<string, unknown> | null,
): string {
  if (status === 413) return '文件超过 5MB，请压缩后再上传。'
  if (status === 400) return '文件为空或格式不正确，换个文件试试。'
  if (status === 503) return '文件存储暂时不可用，请稍后再试。'
  if (!payload) return OFFLINE_MESSAGE
  return '文件服务返回异常，请稍后再试。'
}

export async function uploadFile(file: File): Promise<StoredFile> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new FileServiceError(`${file.name} 超过 5MB，请压缩后再上传。`)
  }

  const form = new FormData()
  form.append('file', file, file.name)

  let response: Response
  try {
    response = await fetch(API_PATH, { method: 'POST', body: form })
  } catch {
    throw new FileServiceError(OFFLINE_MESSAGE)
  }

  const payload = await readPayload(response)
  if (!response.ok) {
    throw new FileServiceError(errorMessage(response.status, payload))
  }

  const id = typeof payload?.id === 'string' ? payload.id : ''
  if (!ID_PATTERN.test(id)) {
    throw new FileServiceError('文件服务没有返回有效地址，请稍后再试。')
  }

  return {
    id,
    name: typeof payload?.name === 'string' ? payload.name : file.name,
    size: typeof payload?.size === 'number' ? payload.size : file.size,
    type: typeof payload?.type === 'string' ? payload.type : file.type,
    url: typeof payload?.url === 'string' ? payload.url : `${API_PATH}?id=${id}`,
    createdAt:
      typeof payload?.createdAt === 'number' ? payload.createdAt : Date.now(),
  }
}

/** 删除只影响服务端，正文里已插入的卡片会变成失效引用 */
export async function deleteStoredFile(file: StoredFile): Promise<void> {
  if (!ID_PATTERN.test(file.id)) return
  try {
    await fetch(`${API_PATH}?id=${encodeURIComponent(file.id)}`, {
      method: 'DELETE',
    })
  } catch {
    // 删除失败不必打断用户，最多是留个孤儿文件
  }
}
