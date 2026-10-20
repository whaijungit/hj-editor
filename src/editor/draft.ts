export type Draft = {
  html: string
  title: string
  updatedAt: number
}

const DRAFT_KEY = 'hj-editor:draft:v2'
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

export function saveDraft(draft: Draft) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // 忽略容量或隐私模式导致的写入失败
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    // 忽略
  }
}

export type ChromeVisibility = {
  titleBar: boolean
  statusBar: boolean
}

/** 默认沉浸排版：标题栏收起，状态栏保留 */
const DEFAULT_CHROME: ChromeVisibility = { titleBar: false, statusBar: true }

export function loadChromeVisibility(): ChromeVisibility {
  try {
    const raw = window.localStorage.getItem(CHROME_KEY)
    if (!raw) return DEFAULT_CHROME
    const parsed = JSON.parse(raw) as Partial<ChromeVisibility>
    return {
      titleBar: parsed.titleBar === true,
      statusBar: parsed.statusBar !== false,
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
