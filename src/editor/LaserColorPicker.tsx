import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const RECENT_KEY = 'hj-editor:laser-colors'

const HUES = [0, 22, 45, 60, 92, 140, 168, 190, 210, 235, 265, 300, 330]
const LEVELS = [
  { s: 88, l: 76 },
  { s: 88, l: 63 },
  { s: 84, l: 50 },
  { s: 78, l: 38 },
  { s: 72, l: 27 },
]
const GRAYS = [
  '#f5f6f8',
  '#dfe2e7',
  '#c2c7cf',
  '#9aa1ac',
  '#6f7783',
  '#4a515c',
  '#31363f',
  '#1b1f26',
]

function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100
  const l = lightness / 100
  const k = (n: number) => (n + hue / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (value: number) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

const PALETTE = LEVELS.flatMap((level) =>
  HUES.map((hue) => hslToHex(hue, level.s, level.l)),
)

function loadRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string').slice(0, 8)
      : []
  } catch {
    return []
  }
}

function saveRecent(colors: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(colors))
  } catch {
    // 忽略隐私模式下的写入失败
  }
}

export function LaserColorPicker({
  color,
  onChange,
}: {
  color: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState<string[]>(loadRecent)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [open])

  const select = (value: string) => {
    onChange(value)
    const next = [value, ...recent.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(
      0,
      8,
    )
    setRecent(next)
    saveRecent(next)
    setOpen(false)
  }

  const cell = (value: string) => (
    <button
      key={value}
      type="button"
      className="laser-color-cell"
      style={{ background: value }}
      title={value.toUpperCase()}
      aria-label={`颜色 ${value.toUpperCase()}`}
      aria-pressed={color.toLowerCase() === value.toLowerCase()}
      data-active={color.toLowerCase() === value.toLowerCase()}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => select(value)}
    />
  )

  return (
    <div className="laser-color" ref={rootRef}>
      <button
        type="button"
        className="laser-color-trigger"
        title="选择颜色"
        aria-label="选择颜色"
        aria-expanded={open}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="laser-color-chip" style={{ background: color }} />
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="laser-palette" role="dialog" aria-label="调色盘">
          {recent.length > 0 && (
            <div className="laser-palette-block">
              <span className="laser-palette-label">最近使用</span>
              <div className="laser-palette-row">{recent.map(cell)}</div>
            </div>
          )}

          <div className="laser-palette-block">
            <span className="laser-palette-label">色板</span>
            <div className="laser-palette-grid">{PALETTE.map(cell)}</div>
          </div>

          <div className="laser-palette-block">
            <span className="laser-palette-label">灰阶</span>
            <div className="laser-palette-row">{GRAYS.map(cell)}</div>
          </div>

          <label className="laser-palette-custom">
            <input
              type="color"
              value={color}
              aria-label="自定义颜色"
              onChange={(event) => select(event.target.value)}
            />
            自定义颜色
            <span className="laser-palette-value">{color.toUpperCase()}</span>
          </label>
        </div>
      )}
    </div>
  )
}
