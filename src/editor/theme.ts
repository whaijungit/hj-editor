import {
  DEFAULT_BODY_FONT,
  getBodyFont,
  normalizeBodyFontId,
  type BodyFontId,
} from './fonts'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ThemePresetId = 'classic' | 'paper' | 'moss' | 'mono'

export type ThemeConfig = {
  mode: ThemeMode
  preset: ThemePresetId
  /** null 表示跟随预设主题的强调色 */
  accent: string | null
  bodyFont: BodyFontId
  bodyFontSize: number
  bodyLineHeight: number
}

type ThemePreset = {
  id: ThemePresetId
  name: string
  hint: string
  /** [画布, 纸面, 强调色]，用于设置面板里的预览色块 */
  swatches: [string, string, string]
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'classic',
    name: '经典',
    hint: '清冷的靛蓝，默认外观',
    swatches: ['#f2f2ef', '#ffffff', '#4f46e5'],
  },
  {
    id: 'paper',
    name: '暖纸',
    hint: '米黄纸面，久读不刺眼',
    swatches: ['#eae2d2', '#fbf6ea', '#b45309'],
  },
  {
    id: 'moss',
    name: '森野',
    hint: '低饱和青绿，安静克制',
    swatches: ['#e7ece6', '#f8fbf6', '#0f766e'],
  },
  {
    id: 'mono',
    name: '素墨',
    hint: '黑白灰极简，突出文字',
    swatches: ['#ebebeb', '#ffffff', '#1f2328'],
  },
]

export const ACCENT_SWATCHES = [
  '#4f46e5',
  '#2563eb',
  '#0f766e',
  '#15803d',
  '#b45309',
  '#be185d',
  '#7c3aed',
  '#dc2626',
]

export const FONT_SIZE_MIN = 14
export const FONT_SIZE_MAX = 22
export const LINE_HEIGHT_MIN = 1.5
export const LINE_HEIGHT_MAX = 2.2

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  mode: 'light',
  preset: 'classic',
  accent: null,
  bodyFont: DEFAULT_BODY_FONT,
  bodyFontSize: 16.5,
  bodyLineHeight: 1.8,
}

const CONFIG_KEY = 'hj-editor:theme-config:v1'
const LEGACY_MODE_KEY = 'hj-editor:theme:v1'

const isPresetId = (value: unknown): value is ThemePresetId =>
  THEME_PRESETS.some((preset) => preset.id === value)

const clampNumber = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100))
}

const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

export function loadThemeConfig(): ThemeConfig {
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY)
    if (!raw) {
      // 兼容旧版本只记录明暗的存储
      const legacy = window.localStorage.getItem(LEGACY_MODE_KEY)
      return {
        ...DEFAULT_THEME_CONFIG,
        mode: legacy === 'dark' ? 'dark' : 'light',
      }
    }

    const parsed = JSON.parse(raw) as Partial<ThemeConfig>
    return {
      mode:
        parsed.mode === 'dark' || parsed.mode === 'system'
          ? parsed.mode
          : 'light',
      preset: isPresetId(parsed.preset) ? parsed.preset : 'classic',
      accent: isHexColor(parsed.accent) ? parsed.accent : null,
      bodyFont: normalizeBodyFontId(parsed.bodyFont),
      bodyFontSize: clampNumber(
        parsed.bodyFontSize,
        FONT_SIZE_MIN,
        FONT_SIZE_MAX,
        DEFAULT_THEME_CONFIG.bodyFontSize,
      ),
      bodyLineHeight: clampNumber(
        parsed.bodyLineHeight,
        LINE_HEIGHT_MIN,
        LINE_HEIGHT_MAX,
        DEFAULT_THEME_CONFIG.bodyLineHeight,
      ),
    }
  } catch {
    return DEFAULT_THEME_CONFIG
  }
}

export function saveThemeConfig(config: ThemeConfig) {
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch {
    // 忽略容量或隐私模式导致的写入失败
  }
}

/** 把「跟随系统」解析成实际的明暗主题 */
export function resolveThemeMode(
  config: ThemeConfig,
  systemDark: boolean,
): 'light' | 'dark' {
  if (config.mode === 'system') return systemDark ? 'dark' : 'light'
  return config.mode
}

/** 把配置落到 :root 的 data 属性与 CSS 变量上 */
export function applyTheme(
  config: ThemeConfig,
  resolved: 'light' | 'dark',
): void {
  const root = document.documentElement

  root.dataset.theme = resolved
  root.dataset.themePreset = config.preset

  if (config.accent) {
    root.dataset.themeAccent = 'custom'
    root.style.setProperty('--accent', config.accent)
  } else {
    delete root.dataset.themeAccent
    root.style.removeProperty('--accent')
  }

  root.style.setProperty('--body-font', getBodyFont(config.bodyFont).stack)
  root.style.setProperty('--body-font-size', `${config.bodyFontSize}px`)
  root.style.setProperty('--body-line-height', String(config.bodyLineHeight))
  root.style.colorScheme = resolved
}
