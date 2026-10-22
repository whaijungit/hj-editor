import {
  clearDraftFromDb,
  loadDraftFromDb,
  saveDraftToDb,
} from './draftStore'

export type Draft = {
  html: string
  title: string
  updatedAt: number
}

const DRAFT_KEY = 'hj-editor:draft:v2'
/** 超过这个体量只写 IndexedDB：localStorage 同步写入会卡住输入，且很快触到 5MB 上限 */
const SNAPSHOT_LIMIT = 800_000
const DOC_WIDTH_KEY = 'hj-editor:doc-width:v1'
// v2：标题栏默认隐藏，旧版本存下的可见性不再沿用
const CHROME_KEY = 'hj-editor:chrome:v2'

export const DOC_MIN_WIDTH = 560

export function loadDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Draft>
    if (typeof parsed.html !== 'string') return null
    return {
      html: parsed.html,
      title: typeof parsed.title === 'string' ? parsed.title : '未命名文稿',
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return null
  }
}

/** 打开文档时先拿 IndexedDB 里的正式草稿；没有就把旧版 localStorage 草稿迁过去 */
export async function loadDraftAsync(): Promise<Draft | null> {
  const stored = await loadDraftFromDb()
  if (stored) return stored

  const snapshot = loadDraft()
  if (snapshot) void saveDraftToDb(snapshot)
  return null
}

export function saveDraft(draft: Draft) {
  // localStorage 只留一份小快照，保证下次打开首屏能同步拿到内容
  if (draft.html.length <= SNAPSHOT_LIMIT) {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // 忽略容量或隐私模式导致的写入失败
    }
  } else {
    try {
      window.localStorage.removeItem(DRAFT_KEY)
    } catch {
      // 忽略
    }
  }
  // 正式数据写 IndexedDB：异步、大容量、只重写变化的分片
  void saveDraftToDb(draft)
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    // 忽略
  }
  void clearDraftFromDb()
}

export type ChromeVisibility = {
  /** 侧边栏是否展开；false 时只留一列图标 */
  sidebar: boolean
  /** 写作模式：侧栏和大纲整块让出，页面上只剩正文 */
  writing: boolean
}

/** 默认展开侧边栏，菜单是唯一入口，先让用户看得见 */
const DEFAULT_CHROME: ChromeVisibility = { sidebar: true, writing: false }

export function loadChromeVisibility(): ChromeVisibility {
  try {
    const raw = window.localStorage.getItem(CHROME_KEY)
    if (!raw) return DEFAULT_CHROME
    const parsed = JSON.parse(raw) as Partial<ChromeVisibility>
    return {
      sidebar: parsed.sidebar !== false,
      writing: parsed.writing === true,
    }
  } catch {
    return DEFAULT_CHROME
  }
}

export function saveChromeVisibility(value: ChromeVisibility) {
  try {
    window.localStorage.setItem(CHROME_KEY, JSON.stringify(value))
  } catch {
    // 忽略容量或隐私模式导致的写入失败
  }
}

/** null 表示跟随窗口自适应（不限宽） */
export function loadDocWidth(): number | null {
  try {
    const raw = window.localStorage.getItem(DOC_WIDTH_KEY)
    if (!raw) return null
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) return null
    return Math.max(DOC_MIN_WIDTH, Math.round(value))
  } catch {
    return null
  }
}

export function saveDocWidth(width: number | null) {
  try {
    if (width === null) window.localStorage.removeItem(DOC_WIDTH_KEY)
    else window.localStorage.setItem(DOC_WIDTH_KEY, String(Math.round(width)))
  } catch {
    // 忽略
  }
}
