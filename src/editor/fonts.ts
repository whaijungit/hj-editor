import {
  customFontFamily,
  customFontId,
  getCustomFontMetas,
  loadCustomFont,
  toCustomFontKey,
  type CustomFontMeta,
} from './customFonts'

/** 内置字体 id，或用户导入字体的 'custom:<id>' */
export type BodyFontId = string

export type FontLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export type BodyFont = {
  id: BodyFontId
  name: string
  /** 副标题：字体来源 */
  note: string
  /** 写进 --body-font 的字体栈 */
  stack: string
  /** 需要额外加载的家族名；本机字体为 null */
  family: string | null
  /** 样式表候选地址，按顺序尝试 */
  sources: string[]
  /** 用户从本地导入的字体 */
  custom?: boolean
}

/** Google Fonts 与国内镜像，主源失败时尝试镜像 */
const remote = (family: string) => [
  `https://fonts.googleapis.com/css2?family=${family}&display=swap`,
  `https://fonts.loli.net/css2?family=${family}&display=swap`,
]

export const BODY_FONTS: BodyFont[] = [
  {
    id: 'system-sans',
    name: '系统无衬线',
    note: '本机字体',
    stack: 'var(--font-sans)',
    family: null,
    sources: [],
  },
  {
    id: 'system-serif',
    name: '系统衬线',
    note: '本机字体',
    stack: 'var(--font-serif)',
    family: null,
    sources: [],
  },
  {
    id: 'noto-serif',
    name: '思源宋体',
    note: 'Noto Serif SC · 在线',
    stack: '"Noto Serif SC", var(--font-serif)',
    family: 'Noto Serif SC',
    sources: remote('Noto+Serif+SC:wght@400;700'),
  },
  {
    id: 'noto-sans',
    name: '思源黑体',
    note: 'Noto Sans SC · 在线',
    stack: '"Noto Sans SC", var(--font-sans)',
    family: 'Noto Sans SC',
    sources: remote('Noto+Sans+SC:wght@300;400;700'),
  },
  {
    id: 'lxgw-wenkai',
    name: '霞鹜文楷',
    note: 'LXGW WenKai TC · 在线',
    stack: '"LXGW WenKai TC", var(--font-serif)',
    family: 'LXGW WenKai TC',
    sources: remote('LXGW+WenKai+TC'),
  },
  {
    id: 'zcool-xiaowei',
    name: '站酷小薇',
    note: 'ZCOOL XiaoWei · 在线',
    stack: '"ZCOOL XiaoWei", var(--font-serif)',
    family: 'ZCOOL XiaoWei',
    sources: remote('ZCOOL+XiaoWei'),
  },
]

export const DEFAULT_BODY_FONT: BodyFontId = 'system-sans'

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

const customBodyFont = (meta: CustomFontMeta): BodyFont => {
  const family = customFontFamily(meta.id)
  return {
    id: customFontId(meta.id),
    name: meta.name,
    note: `${formatSize(meta.size)} · 本地导入`,
    stack: `"${family}", var(--font-sans)`,
    family,
    sources: [],
    custom: true,
  }
}

/** 内置字体 + 用户导入的字体 */
export function getAllBodyFonts(): BodyFont[] {
  return [...BODY_FONTS, ...getCustomFontMetas().map(customBodyFont)]
}

export function isBodyFontId(value: unknown): value is BodyFontId {
  if (typeof value !== 'string' || !value) return false
  const customKey = toCustomFontKey(value)
  if (customKey) {
    return getCustomFontMetas().some((meta) => meta.id === customKey)
  }
  return BODY_FONTS.some((font) => font.id === value)
}

/** 兼容旧版只存 sans/serif 的配置；未知字体在渲染时回退到默认 */
export function normalizeBodyFontId(value: unknown): BodyFontId {
  if (value === 'sans') return 'system-sans'
  if (value === 'serif') return 'system-serif'
  return typeof value === 'string' && value ? value : DEFAULT_BODY_FONT
}

export function getBodyFont(id: BodyFontId): BodyFont {
  const builtin = BODY_FONTS.find((font) => font.id === id)
  if (builtin) return builtin

  const customKey = toCustomFontKey(id)
  const meta = customKey
    ? getCustomFontMetas().find((item) => item.id === customKey)
    : undefined

  return meta ? customBodyFont(meta) : BODY_FONTS[0]
}

const STYLE_TIMEOUT = 8000
const FACE_TIMEOUT = 10000

const withTimeout = <T>(task: Promise<T>, fallback: T): Promise<T> =>
  Promise.race([
    task,
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), FACE_TIMEOUT)),
  ])

const probeFaces = async (family: string): Promise<boolean> => {
  const probes = [`400 16px "${family}"`, `700 16px "${family}"`]

  for (const probe of probes) {
    try {
      const faces = await document.fonts.load(probe, '汉字排版 Aa 123')
      if (faces.some((face) => face.status === 'loaded')) return true
    } catch {
      // 继续尝试下一个字重
    }
  }

  return false
}

const pending = new Map<BodyFontId, Promise<boolean>>()

const injectStylesheet = (href: string, id: BodyFontId) =>
  new Promise<boolean>((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.fontLoader = id

    const timer = window.setTimeout(() => {
      link.remove()
      resolve(false)
    }, STYLE_TIMEOUT)

    link.onload = () => {
      window.clearTimeout(timer)
      resolve(true)
    }
    link.onerror = () => {
      window.clearTimeout(timer)
      link.remove()
      resolve(false)
    }

    document.head.appendChild(link)
  })

async function loadFont(font: BodyFont): Promise<boolean> {
  const family = font.family
  if (!family) return true

  if (font.custom) {
    const key = toCustomFontKey(font.id)
    if (!key) return false

    try {
      return await loadCustomFont(key)
    } catch {
      return false
    }
  }

  // 已经注入过样式表（重试或另一个组件先加载时）
  const existing = document.querySelector<HTMLLinkElement>(
    `link[data-font-loader="${font.id}"]`,
  )
  if (existing) {
    const ok = await withTimeout(probeFaces(family), false)
    if (ok) return true
    existing.remove()
  }

  for (const href of font.sources) {
    const ready = await injectStylesheet(href, font.id)
    if (!ready) continue

    const loaded = await withTimeout(probeFaces(family), false)
    if (loaded) return true

    // 这个源拿不到字体文件，清掉再试镜像
    document
      .querySelectorAll<HTMLLinkElement>(
        `link[data-font-loader="${font.id}"][href="${href}"]`,
      )
      .forEach((node) => node.remove())
  }

  return false
}

/**
 * 按需加载字体样式表，成功返回 true。
 * 结果会缓存，force 为 true 时重新尝试（用于失败后重试）。
 */
export function ensureBodyFont(id: BodyFontId, force = false): Promise<boolean> {
  const font = getBodyFont(id)
  if (!font.family) return Promise.resolve(true)

  if (!force) {
    const cached = pending.get(id)
    if (cached) return cached
  }

  const task = loadFont(font).then((ok) => {
    if (!ok) pending.delete(id)
    return ok
  })

  pending.set(id, task)
  return task
}
