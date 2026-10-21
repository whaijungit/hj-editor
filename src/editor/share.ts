/**
 * 分享文稿的客户端封装：把当前 HTML 传到 Netlify Function，换回一个短链接。
 *
 * 链接形态是 `/?doc=<id>`，打开后由前端再请求 `/api/doc?id=<id>` 取回内容。
 * 这样刷新、转发都不依赖接收方本地草稿，也不会把文稿写进部署产物。
 */
export const SHARE_QUERY = 'doc'

const API_PATH = '/api/doc'
const ID_PATTERN = /^[a-z0-9]{6,32}$/i

const OFFLINE_MESSAGE =
  '分享服务不可用：本地请用 netlify dev 启动，线上需要部署 Netlify Functions。'

export type SharedDocument = {
  title: string
  html: string
  createdAt: number
}

export class ShareError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShareError'
  }
}

function parseId(raw: string | null): string | null {
  if (!raw) return null
  const id = raw.trim()
  return ID_PATTERN.test(id) ? id : null
}

/** 从当前地址栏取分享 id；没有或格式不对都返回 null */
export function sharedDocIdFromUrl(): string | null {
  return parseId(new URLSearchParams(window.location.search).get(SHARE_QUERY))
}

export function buildShareUrl(id: string): string {
  const url = new URL(window.location.href)
  url.hash = ''
  url.search = ''
  url.searchParams.set(SHARE_QUERY, id)
  return url.toString()
}

/** 部署的分享函数返回 JSON；返回 HTML 说明请求被回落到了单页入口（函数没部署） */
async function readPayload(
  response: Response,
): Promise<Record<string, unknown> | null> {
  const type = response.headers.get('content-type') ?? ''
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
  if (status === 413) return '文稿超过 5MB，无法分享。请先压缩图片，或改用导出文件。'
  if (status === 404) return '分享链接已失效，或文稿已被删除。'
  if (status === 400) return '文稿内容为空，暂时无法分享。'
  if (!payload) return OFFLINE_MESSAGE
  return '分享服务返回异常，请稍后再试。'
}

export async function publishDocument(
  title: string,
  html: string,
): Promise<string> {
  let response: Response
  try {
    response = await fetch(API_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, html }),
    })
  } catch {
    throw new ShareError(OFFLINE_MESSAGE)
  }

  const payload = await readPayload(response)
  if (!response.ok) throw new ShareError(errorMessage(response.status, payload))

  const id = typeof payload?.id === 'string' ? payload.id : ''
  if (!parseId(id)) {
    throw new ShareError('分享服务没有返回有效链接，请稍后再试。')
  }
  return buildShareUrl(id)
}

export async function fetchSharedDocument(id: string): Promise<SharedDocument> {
  let response: Response
  try {
    response = await fetch(`${API_PATH}?id=${encodeURIComponent(id)}`, {
      headers: { accept: 'application/json' },
    })
  } catch {
    throw new ShareError(OFFLINE_MESSAGE)
  }

  const payload = await readPayload(response)
  if (!response.ok) throw new ShareError(errorMessage(response.status, payload))

  const html = typeof payload?.html === 'string' ? payload.html : ''
  if (!html) throw new ShareError('分享文稿内容为空。')

  return {
    html,
    title: typeof payload?.title === 'string' ? payload.title : '分享文稿',
    createdAt:
      typeof payload?.createdAt === 'number' ? payload.createdAt : 0,
  }
}
