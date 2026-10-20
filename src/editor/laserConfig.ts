import {
  ArrowUpRight,
  Circle,
  Minus,
  Move,
  Pencil,
  Square,
  Type,
} from 'lucide-react'

export type Point = { x: number; y: number }
export type ShapeKind = 'pen' | 'line' | 'rect' | 'ellipse' | 'arrow' | 'text'
/** 工具种类：绘制类工具 + 拖拽移动工具 */
export type LaserTool = ShapeKind | 'move'

export type Stroke = {
  shape: ShapeKind
  color: string
  width: number
  points: Point[]
  createdAt: number
  text?: string
  fontSize?: number
}

export const TEXT_FONT_FAMILY =
  "'PingFang SC', 'Microsoft YaHei', 'Segoe UI', system-ui, sans-serif"
export const TEXT_LINE_HEIGHT = 1.34

/** 文字标注的字号跟随线条粗细档位，保持工具条语义一致 */
export function textFontSize(width: number) {
  return Math.round(16 + width * 2.8)
}

/** 文字标注的最大行宽，超出后自动换行 */
export const TEXT_MAX_WIDTH = 460
export const TEXT_MIN_WIDTH = 96

/** 文字标注实际可用行宽：不超过最大行宽，也不越过屏幕右边缘 */
export function textWrapWidth(x: number) {
  const edge =
    typeof window === 'undefined'
      ? TEXT_MAX_WIDTH
      : window.innerWidth - x - 16
  return Math.max(TEXT_MIN_WIDTH, Math.min(TEXT_MAX_WIDTH, edge))
}

/**
 * 自动折行：中文按字、英文按单词断行，单行超长时再按字强断。
 * measure 由调用方提供（画布与输入框共用同一套字体度量，保证换行位置一致）。
 */
const WRAP_TOKEN =
  /[\u2e80-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]|[A-Za-z0-9]+|\s+|./gu

export function wrapText(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
) {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (!paragraph) {
      lines.push('')
      continue
    }
    let line = ''
    for (const token of paragraph.match(WRAP_TOKEN) ?? []) {
      // 续行不保留行首空格
      if (!line && /^\s+$/.test(token)) continue
      if (!line || measure((line + token).trimEnd()) <= maxWidth) {
        line += token
        continue
      }
      lines.push(line.trimEnd())
      line = /^\s+$/.test(token) ? '' : token
    }
    // 单个 token 本身超宽（如超长英文串）时按字强断
    while (measure(line) > maxWidth && line.length > 1) {
      const chars = Array.from(line)
      let cut = chars.length - 1
      while (cut > 1 && measure(chars.slice(0, cut).join('')) > maxWidth) cut -= 1
      lines.push(chars.slice(0, cut).join(''))
      line = chars.slice(cut).join('')
    }
    lines.push(line.trimEnd())
  }
  return lines.length ? lines : ['']
}

/** 落笔后静止多久开始擦除 */
export const FADE_DELAY = 1500
/** 擦除动画本身的时长，短一些看着更利落 */
export const FADE_DURATION = 900

/** 墨迹本体透明度：略透一点，叠在画面上更像激光而不是实心笔 */
export const STROKE_ALPHA = 0.86
/** 光晕的基准模糊半径与随线宽的增长系数，只用来发光，不做投影 */
export const GLOW_BLUR = 3
export const GLOW_SPREAD = 1.1
/** 光晕颜色的透明度，越低越清爽 */
export const GLOW_ALPHA = 0.42

export const COLORS = [
  { value: '#ff2d55', label: '红' },
  { value: '#ff9f0a', label: '橙' },
  { value: '#ffd60a', label: '黄' },
  { value: '#30d158', label: '绿' },
  { value: '#0a84ff', label: '蓝' },
  { value: '#bf5af2', label: '紫' },
]

export const WIDTHS = [
  { value: 2, label: '细' },
  { value: 3.6, label: '中' },
  { value: 6.5, label: '粗' },
]

export const TOOLS: {
  value: LaserTool
  label: string
  icon: typeof Pencil
}[] = [
  { value: 'pen', label: '自由笔 (1)', icon: Pencil },
  { value: 'line', label: '直线 (2)', icon: Minus },
  { value: 'rect', label: '矩形 (3)', icon: Square },
  { value: 'ellipse', label: '椭圆 (4)', icon: Circle },
  { value: 'arrow', label: '箭头 (5)', icon: ArrowUpRight },
  { value: 'text', label: '文字 (6)', icon: Type },
  { value: 'move', label: '移动 / 选择 (7)', icon: Move },
]

export function withAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * 渐隐进度：0 = 完整可见，1 = 完全消失。
 * 绘制端按这个进度沿书写方向逐段擦除（从头到尾），不再整条一起变透明。
 */
export function strokeProgress(stroke: Stroke, now: number, fade: boolean) {
  if (!fade) return 0
  const age = now - stroke.createdAt
  if (age <= FADE_DELAY) return 0
  return Math.min(1, (age - FADE_DELAY) / FADE_DURATION)
}
