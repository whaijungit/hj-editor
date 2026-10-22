/**
 * 分享文稿的客户端封装：把当前 HTML 传到 Netlify Function，换回一个短链接。
 *
 * 链接形态是 `/share/<id>`，打开后由前端再请求 `/api/doc?id=<id>` 取回内容。
 * 这样刷新、转发都不依赖接收方本地草稿，也不会把文稿写进部署产物。
 */
export const SHARE_PATH = '/share'

/** 旧链接用的是 `/?doc=<id>`，保留常量以便跳转到新路由 */
export const SHARE_QUERY = 'doc'

const API_PATH = '/api/doc'
const ID_PATTERN = /^[a-z0-9]{6,32}$/i

const OFFLINE_MESSAGE =
  '云端服务不可用：本地请用 netlify dev 启动，线上需要部署 Netlify Functions。'

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

/** 路由里的 id 是否合法：`/share/:id` 的 param 先过这一关再请求接口 */
export function isValidShareId(raw: unknown): raw is string {
  return typeof raw === 'string' && parseId(raw) !== null
}

/** 旧链接 `/?doc=<id>`：返回路径形式的新地址，没有旧参数则返回 null */
export function legacySharePath(search: string): string | null {
  const id = parseId(new URLSearchParams(search).get(SHARE_QUERY))
  return id ? `${SHARE_PATH}/${id}` : null
}

export function buildShareUrl(id: string): string {
  const url = new URL(window.location.href)
  url.hash = ''
  url.search = ''
  url.pathname = `${SHARE_PATH}/${id}`
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
  if (status === 413) return '文稿超过 5MB，无法上传。请先压缩图片，或改用导出文件。'
  if (status === 404) return '云端文稿不存在，可能已被删除。'
  if (status === 400) return '文稿内容为空，暂时无法上传。'
  if (!payload) return OFFLINE_MESSAGE
  return '云端服务返回异常，请稍后再试。'
}

const CLOUD_STORAGE_KEY = 'hj-editor:cloud-doc'

export type CloudDocRef = {
  id: string
  savedAt: number
}

export type SavedDocument = {
  id: string
  /** 打开就是这篇文稿的地址，也是「保存到云端」之后的固定链接 */
  url: string
  updatedAt: number
}

/** 当前文稿对应哪篇云端文稿：存在本地，刷新后继续覆盖同一篇而不是越存越多 */
export function loadCloudDocRef(): CloudDocRef | null {
  try {
    const raw = window.localStorage.getItem(CLOUD_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CloudDocRef>
    if (typeof parsed.id !== 'string' || !parseId(parsed.id)) return null
    return {
      id: parsed.id,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    }
  } catch {
    return null
  }
}

export function saveCloudDocRef(ref: CloudDocRef) {
  try {
    window.localStorage.setItem(CLOUD_STORAGE_KEY, JSON.stringify(ref))
  } catch {
    // 隐私模式下写不进去，不影响这次保存
  }
}

/** 换成另一篇文稿时断开云端指向，免得把旧文稿覆盖掉 */
export function clearCloudDocRef() {
  try {
    window.localStorage.removeItem(CLOUD_STORAGE_KEY)
  } catch {
    // 同上，忽略
  }
}

function postDocument(
  id: string | null,
  title: string,
  html: string,
): Promise<Response> {
  const target = id ? `${API_PATH}?id=${encodeURIComponent(id)}` : API_PATH
  return fetch(target, {
    method: id ? 'PUT' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, html }),
  }).catch(() => {
    throw new ShareError(OFFLINE_MESSAGE)
  })
}

/**
 * 保存到服务器（Netlify Blobs）：
 * - 已经有云端 id 时覆盖那一篇，链接保持不变；
 * - 云端那篇被删了（404）就退回新建，换一个新 id。
 */
export async function saveDocumentToServer(
  id: string | null,
  title: string,
  html: string,
): Promise<SavedDocument> {
  let response = await postDocument(id, title, html)
  if (id && response.status === 404) response = await postDocument(null, title, html)

  const payload = await readPayload(response)
  if (!response.ok) throw new ShareError(errorMessage(response.status, payload))

  const nextId = typeof payload?.id === 'string' ? payload.id : ''
  if (!parseId(nextId)) {
    throw new ShareError('服务端没有返回有效链接，请稍后再试。')
  }

  return {
    id: nextId,
    url: buildShareUrl(nextId),
    updatedAt:
      typeof payload?.updatedAt === 'number' ? payload.updatedAt : Date.now(),
  }
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
