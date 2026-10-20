import { Camera, Keyboard, Trash2, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  COLORS,
  GLOW_ALPHA,
  GLOW_BLUR,
  GLOW_SPREAD,
  STROKE_ALPHA,
  TEXT_FONT_FAMILY,
  TEXT_LINE_HEIGHT,
  TEXT_MIN_WIDTH,
  TOOLS,
  WIDTHS,
  strokeProgress,
  textFontSize,
  textWrapWidth,
  withAlpha,
  wrapText,
  type LaserTool,
  type Point,
  type Stroke,
} from './laserConfig'
import {
  captureErrorMessage,
  captureFileName,
  captureScreen,
  downloadBlob,
} from './laserCapture'
import { LaserColorPicker } from './LaserColorPicker'
import { LaserShortcutPanel } from './LaserShortcutPanel'
import {
  eventToKey,
  formatKey,
  loadLaserKeys,
  resolveLaserAction,
  saveLaserKeys,
  type LaserKeyMap,
} from './laserShortcuts'
import './laser.css'

const FONT_LABELS: Record<number, string> = { 2: '小', 3.6: '中', 6.5: '大' }

export function LaserPointer({
  active,
  onExit,
}: {
  active: boolean
  onExit: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const undoRef = useRef<() => void>(() => {})
  const clearRef = useRef<() => void>(() => {})
  const redrawRef = useRef<() => void>(() => {})
  const addTextRef = useRef<(x: number, y: number, text: string) => void>(() => {})
  const shotActionRef = useRef<() => void>(() => {})
  const onExitRef = useRef(onExit)

  const [tool, setTool] = useState<LaserTool>('pen')
  const [color, setColor] = useState(COLORS[0].value)
  const [width, setWidth] = useState(WIDTHS[1].value)
  const [fade, setFade] = useState(false)
  const [keys, setKeys] = useState<LaserKeyMap>(loadLaserKeys)
  const [panelOpen, setPanelOpen] = useState(false)
  const [editing, setEditing] = useState<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null)

  const configRef = useRef({ tool, color, width, fade })
  const keysRef = useRef(keys)
  const panelRef = useRef(panelOpen)
  const editingRef = useRef(editing)
  const draftRef = useRef(draft)
  const capturingRef = useRef(capturing)
  const shotBusyRef = useRef(false)
  const toastTimerRef = useRef(0)

  const notify = (text: string, error = false) => {
    window.clearTimeout(toastTimerRef.current)
    setToast({ text, error })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800)
  }

  const updateKeys = (next: LaserKeyMap) => {
    setKeys(next)
    saveLaserKeys(next)
  }

  const commitText = () => {
    const position = editingRef.current
    const value = draftRef.current.replace(/\s+$/, '')
    if (position && value.trim()) addTextRef.current(position.x, position.y, value)
    editingRef.current = null
    draftRef.current = ''
    setEditing(null)
    setDraft('')
  }

  const cancelText = () => {
    editingRef.current = null
    draftRef.current = ''
    setEditing(null)
    setDraft('')
  }

  const startText = (x: number, y: number) => {
    commitText()
    const position = {
      // 留出最小行宽，贴右边点击时文字仍然完整可读（自动换行依赖这个宽度）
      x: Math.max(
        6,
        Math.min(x, window.innerWidth - TEXT_MIN_WIDTH - 20),
      ),
      y: Math.max(6, Math.min(y, window.innerHeight - 34)),
    }
    editingRef.current = position
    setEditing(position)
    setDraft('')
  }
  const startTextRef = useRef(startText)

  const takeShot = async () => {
    if (shotBusyRef.current) return
    shotBusyRef.current = true
    commitText()
    try {
      const blob = await captureScreen({
        onBeforeGrab: async () => {
          setCapturing(true)
          await new Promise<void>((resolve) =>
            window.requestAnimationFrame(() =>
              window.requestAnimationFrame(() => resolve()),
            ),
          )
          await new Promise((resolve) => window.setTimeout(resolve, 180))
        },
      })
      downloadBlob(captureFileName(), blob)
      notify('截图已保存为 PNG')
    } catch (error) {
      notify(captureErrorMessage(error), true)
    } finally {
      shotBusyRef.current = false
      setCapturing(false)
    }
  }

  useEffect(() => {
    onExitRef.current = onExit
    configRef.current = { tool, color, width, fade }
    keysRef.current = keys
    panelRef.current = panelOpen
    editingRef.current = editing
    draftRef.current = draft
    capturingRef.current = capturing
    startTextRef.current = startText
    shotActionRef.current = takeShot
  })

  useEffect(() => {
    if (!active) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const marks: Stroke[] = []
    let drawing: Stroke | null = null
    /** 正在拖拽移动的墨迹及其起点，用于整体平移 */
    let dragging: {
      stroke: Stroke
      origin: Point[]
      startX: number
      startY: number
    } | null = null
    let frame = 0
    let dpr = 1
    /** 自动换行结果缓存：同一墨迹同一行宽只测量一次 */
    const textCache = new WeakMap<Stroke, { width: number; lines: string[] }>()

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(redraw)
    }

    /** 取自动换行后的行（调用前需先设置好 ctx.font） */
    function textLines(mark: Stroke, text: string, x: number) {
      const width = textWrapWidth(x)
      const cached = textCache.get(mark)
      if (cached && cached.width === width) return cached.lines
      const lines = wrapText(text, width, (value) => ctx!.measureText(value).width)
      textCache.set(mark, { width, lines })
      return lines
    }

    function polylineLength(points: Point[]) {
      let total = 0
      for (let i = 1; i < points.length; i += 1) {
        total += Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].y - points[i - 1].y,
        )
      }
      return total
    }

    /** 沿书写方向裁掉折线前 cut 比例，返回剩下的尾段（首点落在切分处） */
    function trimPolyline(points: Point[], cut: number): Point[] {
      if (cut <= 0) return points
      const total = polylineLength(points)
      if (total <= 0) return points
      let rest = total * cut
      if (rest >= total) return []
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1]
        const b = points[i]
        const segment = Math.hypot(b.x - a.x, b.y - a.y)
        if (rest <= segment) {
          const t = segment === 0 ? 0 : rest / segment
          return [
            { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
            ...points.slice(i),
          ]
        }
        rest -= segment
      }
      return []
    }

    /**
     * 绘制墨迹。cut 是擦除进度（0 完整、1 消失）：
     * 沿书写方向从头擦到尾，落笔的尾部最后消失。
     */
    function paintStroke(stroke: Stroke, cut: number) {
      const points = stroke.points
      if (!points.length) return
      const progress = Math.max(0, Math.min(1, cut))
      if (progress >= 1) return
      const start = points[0]
      const end = points[points.length - 1]

      ctx!.save()
      ctx!.strokeStyle = withAlpha(stroke.color, STROKE_ALPHA)
      // 只留一圈柔和光晕，不做投影
      ctx!.shadowColor = withAlpha(stroke.color, GLOW_ALPHA)
      ctx!.shadowBlur = GLOW_BLUR + stroke.width * GLOW_SPREAD
      ctx!.shadowOffsetX = 0
      ctx!.shadowOffsetY = 0
      ctx!.lineWidth = stroke.width
      ctx!.lineCap = 'round'
      ctx!.lineJoin = 'round'
      ctx!.beginPath()

      if (stroke.shape === 'pen') {
        if (points.length === 1) {
          const radius = (stroke.width / 2) * (1 - progress)
          if (radius <= 0.2) {
            ctx!.restore()
            return
          }
          ctx!.arc(start.x, start.y, radius, 0, Math.PI * 2)
          ctx!.fillStyle = withAlpha(stroke.color, STROKE_ALPHA)
          ctx!.fill()
          ctx!.restore()
          return
        }
        const rest = trimPolyline(points, progress)
        if (rest.length < 2) {
          ctx!.restore()
          return
        }
        ctx!.moveTo(rest[0].x, rest[0].y)
        for (let i = 1; i < rest.length - 1; i += 1) {
          const current = rest[i]
          const next = rest[i + 1]
          ctx!.quadraticCurveTo(
            current.x,
            current.y,
            (current.x + next.x) / 2,
            (current.y + next.y) / 2,
          )
        }
        const tail = rest[rest.length - 1]
        ctx!.lineTo(tail.x, tail.y)
      } else if (stroke.shape === 'line' || stroke.shape === 'arrow') {
        const length = Math.hypot(end.x - start.x, end.y - start.y)
        if (length <= 0) {
          ctx!.restore()
          return
        }
        const from = {
          x: start.x + (end.x - start.x) * progress,
          y: start.y + (end.y - start.y) * progress,
        }
        ctx!.moveTo(from.x, from.y)
        ctx!.lineTo(end.x, end.y)
        if (stroke.shape === 'arrow') {
          const angle = Math.atan2(end.y - start.y, end.x - start.x)
          const spread = Math.PI / 7
          // 箭头头部跟着剩余长度收缩，最后平滑收成一点
          const head = Math.min(
            Math.max(10, stroke.width * 3.4),
            length * (1 - progress),
          )
          if (head > 0.5) {
            ctx!.moveTo(
              end.x - head * Math.cos(angle - spread),
              end.y - head * Math.sin(angle - spread),
            )
            ctx!.lineTo(end.x, end.y)
            ctx!.lineTo(
              end.x - head * Math.cos(angle + spread),
              end.y - head * Math.sin(angle + spread),
            )
          }
        }
      } else if (stroke.shape === 'rect') {
        const left = Math.min(start.x, end.x)
        const top = Math.min(start.y, end.y)
        const right = Math.max(start.x, end.x)
        const bottom = Math.max(start.y, end.y)
        // 沿左上 → 右上 → 右下 → 左下 → 左上的书写顺序逐段擦除
        const rest = trimPolyline(
          [
            { x: left, y: top },
            { x: right, y: top },
            { x: right, y: bottom },
            { x: left, y: bottom },
            { x: left, y: top },
          ],
          progress,
        )
        if (rest.length < 2) {
          ctx!.restore()
          return
        }
        ctx!.moveTo(rest[0].x, rest[0].y)
        for (let i = 1; i < rest.length; i += 1) {
          ctx!.lineTo(rest[i].x, rest[i].y)
        }
      } else {
        const rx = Math.abs(end.x - start.x) / 2
        const ry = Math.abs(end.y - start.y) / 2
        if (rx <= 0 || ry <= 0) {
          ctx!.restore()
          return
        }
        // 椭圆从 3 点钟方向的起点顺时针擦除
        ctx!.ellipse(
          (start.x + end.x) / 2,
          (start.y + end.y) / 2,
          rx,
          ry,
          0,
          Math.PI * 2 * progress,
          Math.PI * 2,
        )
      }

      ctx!.stroke()
      ctx!.restore()
    }

    function paintText(mark: Stroke, cut: number) {
      const point = mark.points[0]
      const text = mark.text ?? ''
      if (!point || !text) return
      const progress = Math.max(0, Math.min(1, cut))
      if (progress >= 1) return
      const fontSize = mark.fontSize ?? textFontSize(mark.width)
      const lineHeight = fontSize * TEXT_LINE_HEIGHT
      // 与输入框的行高对齐，提交后文字不跳动
      const halfLeading = (lineHeight - fontSize) / 2

      ctx!.save()
      ctx!.fillStyle = withAlpha(mark.color, STROKE_ALPHA)
      ctx!.shadowColor = withAlpha(mark.color, GLOW_ALPHA)
      ctx!.shadowBlur = GLOW_BLUR + 2
      ctx!.shadowOffsetX = 0
      ctx!.shadowOffsetY = 0
      ctx!.font = `600 ${fontSize}px ${TEXT_FONT_FAMILY}`
      ctx!.textBaseline = 'top'

      // 先按行宽自动换行，再逐字定位；擦除时按整字消失 → 打字机（退格）式的效果
      const laid = textLines(mark, text, point.x).map((line) => {
        const chars = Array.from(line)
        const offsets = chars.map(
          (_, index) => ctx!.measureText(chars.slice(0, index).join('')).width,
        )
        return { chars, offsets }
      })
      const totalChars = laid.reduce((sum, item) => sum + item.chars.length, 0)
      // 已消失的字数：行内从左往右，逐行往下
      let erased = totalChars * progress

      laid.forEach(({ chars, offsets }, index) => {
        if (!chars.length) return
        const lineTop = point.y + halfLeading + index * lineHeight
        const gone = Math.min(chars.length, Math.max(0, erased))
        erased -= chars.length
        const cut = Math.floor(gone)
        const boundary = gone - cut
        // 剩下的字留在原位，像还没被敲出来一样
        if (cut < chars.length) {
          ctx!.fillText(
            chars.slice(cut).join(''),
            point.x + offsets[cut],
            lineTop,
          )
        }
        // 正在消失的那一个字淡出，避免整字硬跳
        if (boundary > 0 && cut > 0) {
          ctx!.save()
          ctx!.globalAlpha = 1 - boundary
          ctx!.fillText(chars[cut - 1], point.x + offsets[cut - 1], lineTop)
          ctx!.restore()
        }
      })

      ctx!.restore()
    }

    function distanceToSegment(x: number, y: number, a: Point, b: Point) {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const lengthSquared = dx * dx + dy * dy
      if (lengthSquared === 0) return Math.hypot(x - a.x, y - a.y)
      const t = Math.max(
        0,
        Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared),
      )
      return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy))
    }

    /** 命中测试：点是否落在某条墨迹的可拖拽范围内 */
    function hitTest(stroke: Stroke, x: number, y: number) {
      const points = stroke.points
      const start = points[0]
      if (!start) return false
      const threshold = Math.max(10, stroke.width * 2.6)

      if (stroke.shape === 'text') {
        const text = stroke.text ?? ''
        if (!text) return false
        const fontSize = stroke.fontSize ?? textFontSize(stroke.width)
        const lineHeight = fontSize * TEXT_LINE_HEIGHT
        ctx!.font = `600 ${fontSize}px ${TEXT_FONT_FAMILY}`
        const lines = textLines(stroke, text, start.x)
        const width = Math.max(
          ...lines.map((line) => ctx!.measureText(line).width),
        )
        return (
          x >= start.x - 8 &&
          x <= start.x + width + 8 &&
          y >= start.y - 8 &&
          y <= start.y + lines.length * lineHeight + 8
        )
      }

      const end = points[points.length - 1]
      if (stroke.shape === 'pen') {
        if (points.length === 1) {
          return Math.hypot(x - start.x, y - start.y) <= threshold
        }
        for (let i = 1; i < points.length; i += 1) {
          if (distanceToSegment(x, y, points[i - 1], points[i]) <= threshold) {
            return true
          }
        }
        return false
      }

      if (stroke.shape === 'line' || stroke.shape === 'arrow') {
        return distanceToSegment(x, y, start, end) <= threshold
      }

      if (stroke.shape === 'rect') {
        return (
          x >= Math.min(start.x, end.x) - threshold &&
          x <= Math.max(start.x, end.x) + threshold &&
          y >= Math.min(start.y, end.y) - threshold &&
          y <= Math.max(start.y, end.y) + threshold
        )
      }

      const rx = Math.abs(end.x - start.x) / 2 + threshold
      const ry = Math.abs(end.y - start.y) / 2 + threshold
      const ratio =
        ((x - (start.x + end.x) / 2) / rx) ** 2 +
        ((y - (start.y + end.y) / 2) / ry) ** 2
      return ratio <= 1
    }

    function redraw() {
      frame = 0
      const now = performance.now()
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx!.clearRect(0, 0, canvas!.width / dpr, canvas!.height / dpr)

      for (let i = marks.length - 1; i >= 0; i -= 1) {
        // 正在绘制的墨迹不参与擦除计时，避免慢画时画到一半就被擦掉
        if (marks[i] === drawing) continue
        if (strokeProgress(marks[i], now, configRef.current.fade) >= 1) {
          marks.splice(i, 1)
        }
      }
      marks.forEach((mark) => {
        const progress =
          mark === drawing
            ? 0
            : strokeProgress(mark, now, configRef.current.fade)
        if (mark.shape === 'text') paintText(mark, progress)
        else paintStroke(mark, progress)
      })

      if (configRef.current.fade && marks.length) schedule()
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const viewWidth = window.innerWidth
      const viewHeight = window.innerHeight
      canvas!.width = Math.round(viewWidth * dpr)
      canvas!.height = Math.round(viewHeight * dpr)
      canvas!.style.width = `${viewWidth}px`
      canvas!.style.height = `${viewHeight}px`
      redraw()
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      event.preventDefault()
      const config = configRef.current

      if (config.tool === 'text') {
        startTextRef.current(event.clientX, event.clientY)
        return
      }

      if (config.tool === 'move') {
        const x = event.clientX
        const y = event.clientY
        // 从最上层（最后画的）开始找可拖拽的墨迹
        for (let i = marks.length - 1; i >= 0; i -= 1) {
          const mark = marks[i]
          if (!hitTest(mark, x, y)) continue
          dragging = {
            stroke: mark,
            origin: mark.points.map((point) => ({ ...point })),
            startX: x,
            startY: y,
          }
          canvas!.setPointerCapture(event.pointerId)
          break
        }
        return
      }

      const stroke: Stroke = {
        shape: config.tool,
        color: config.color,
        width: config.width,
        points: [{ x: event.clientX, y: event.clientY }],
        createdAt: performance.now(),
      }
      marks.push(stroke)
      drawing = stroke
      canvas!.setPointerCapture(event.pointerId)
      schedule()
    }

    function handlePointerMove(event: PointerEvent) {
      if (dragging) {
        const moving = dragging
        const dx = event.clientX - moving.startX
        const dy = event.clientY - moving.startY
        moving.stroke.points.forEach((point, index) => {
          const origin = moving.origin[index]
          point.x = origin.x + dx
          point.y = origin.y + dy
        })
        schedule()
        return
      }

      if (!drawing) return
      const points = drawing.points
      const point: Point = { x: event.clientX, y: event.clientY }

      if (drawing.shape === 'pen') {
        const last = points[points.length - 1]
        const dx = point.x - last.x
        const dy = point.y - last.y
        if (dx * dx + dy * dy < 4) return
        points.push(point)
      } else {
        points[1] = point
      }
      schedule()
    }

    function handlePointerUp(event: PointerEvent) {
      if (dragging) {
        // 拖拽结束后重新计时，避免拖动过程中被擦掉
        dragging.stroke.createdAt = performance.now()
        dragging = null
        if (canvas!.hasPointerCapture(event.pointerId)) {
          canvas!.releasePointerCapture(event.pointerId)
        }
        schedule()
        return
      }

      if (!drawing) return
      if (drawing.shape !== 'pen') {
        const points = drawing.points
        const distance =
          points.length > 1
            ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
            : 0
        if (distance < 3) marks.pop()
      }
      // 擦除倒计时从落笔结束开始算，画了多久都不影响停留时长
      drawing.createdAt = performance.now()
      drawing = null
      if (canvas!.hasPointerCapture(event.pointerId)) {
        canvas!.releasePointerCapture(event.pointerId)
      }
      schedule()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (panelRef.current || editingRef.current || capturingRef.current) return

      const combo = eventToKey(event)
      if (!combo) return

      const action = resolveLaserAction(keysRef.current, combo)
      if (!action) return
      event.preventDefault()

      if (action === 'exit') {
        onExitRef.current()
        return
      }
      if (action === 'undo') {
        undoRef.current()
        return
      }
      if (action === 'clear') {
        marks.length = 0
        schedule()
        return
      }
      if (action === 'shot') {
        shotActionRef.current()
        return
      }
      if (action === 'fade') {
        setFade((value) => !value)
        return
      }
      if (action === 'text') {
        setTool('text')
        return
      }
      setTool(action)
    }

    undoRef.current = () => {
      dragging = null
      marks.pop()
      schedule()
    }
    clearRef.current = () => {
      dragging = null
      marks.length = 0
      schedule()
    }
    redrawRef.current = redraw
    addTextRef.current = (x, y, text) => {
      const { color: strokeColor, width: strokeWidth } = configRef.current
      marks.push({
        shape: 'text',
        color: strokeColor,
        width: strokeWidth,
        points: [{ x, y }],
        createdAt: performance.now(),
        text,
        fontSize: textFontSize(strokeWidth),
      })
      schedule()
    }

    resize()
    window.addEventListener('resize', resize)
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointercancel', handlePointerUp)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointercancel', handlePointerUp)
      window.removeEventListener('keydown', handleKeyDown)
      if (frame) window.cancelAnimationFrame(frame)
      undoRef.current = () => {}
      clearRef.current = () => {}
      redrawRef.current = () => {}
      addTextRef.current = () => {}
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    redrawRef.current()
  }, [active, fade])

  useEffect(() => {
    if (active) return
    setEditing(null)
    setDraft('')
    setCapturing(false)
    setPanelOpen(false)
  }, [active])

  useEffect(() => {
    if (!editing) return
    const node = textInputRef.current
    if (!node) return
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }, [editing])

  useEffect(() => {
    const node = textInputRef.current
    if (!node || !editing) return
    const fontSize = textFontSize(width)
    const wrapWidth = textWrapWidth(editing.x)
    const ctx = canvasRef.current?.getContext('2d')
    let contentWidth = TEXT_MIN_WIDTH - 8
    if (ctx) {
      // 与画布用同一套字体度量换行，提交后文字不会跳动
      ctx.font = `600 ${fontSize}px ${TEXT_FONT_FAMILY}`
      const measure = (value: string) => ctx.measureText(value).width
      const lines = draft ? wrapText(draft, wrapWidth, measure) : ['输入文字…']
      contentWidth = Math.max(...lines.map(measure))
    }
    node.style.width = `${Math.min(
      wrapWidth,
      Math.max(TEXT_MIN_WIDTH, contentWidth + 8),
    )}px`
    node.style.height = '0px'
    node.style.height = `${node.scrollHeight}px`
  }, [draft, editing, width])

  useEffect(() => {
    return () => window.clearTimeout(toastTimerRef.current)
  }, [])

  const cursor = useMemo(() => {
    if (tool === 'text') return 'text'
    if (tool === 'move') return 'move'
    const size = Math.round(18 + width * 1.5)
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24' fill='none'>` +
      `<path d='M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' fill='${color}' stroke='#fff' stroke-width='1.4' stroke-linejoin='round'/>` +
      `<path d='M14.4 5.6l4 4' stroke='#fff' stroke-opacity='.8' stroke-width='1.3' stroke-linecap='round'/>` +
      `</svg>`
    const scale = size / 24
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${Math.round(2 * scale)} ${Math.round(22 * scale)}, crosshair`
  }, [color, width, tool])

  if (!active) return null

  return (
    <div className="laser-layer" data-capturing={capturing}>
      <canvas className="laser-canvas" ref={canvasRef} style={{ cursor }} />

      {editing && (
        <textarea
          ref={textInputRef}
          className="laser-text-input"
          value={draft}
          rows={1}
          spellCheck={false}
          placeholder="输入文字…"
          aria-label="激光笔文字标注"
          style={{
            left: editing.x,
            top: editing.y,
            color,
            fontFamily: TEXT_FONT_FAMILY,
            fontSize: textFontSize(width),
            lineHeight: TEXT_LINE_HEIGHT,
            fontWeight: 600,
            textShadow: `0 0 6px ${color}`,
          }}
          onChange={(event) => {
            draftRef.current = event.target.value
            setDraft(event.target.value)
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelText()
              return
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              commitText()
            }
          }}
          onBlur={commitText}
        />
      )}

      <div className="laser-hint">
        <span className="laser-hint-dot" style={{ background: color }} />
        拖动书写 · 文字工具点按输入 · 移动工具拖动批注 ·{' '}
        {formatKey(keys.shot)} 截屏 ·{' '}
        {formatKey(keys.fade)} 渐隐/保留 · {formatKey(keys.exit)} 退出
      </div>

      <div className="laser-toolbar" role="toolbar" aria-label="激光笔工具">
        <div className="laser-group">
          {TOOLS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.value}
                type="button"
                className="laser-tool"
                title={item.label}
                aria-label={item.label}
                aria-pressed={tool === item.value}
                data-active={tool === item.value}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  commitText()
                  setTool(item.value)
                }}
              >
                <Icon size={16} />
              </button>
            )
          })}
        </div>

        <span className="laser-divider" />

        <LaserColorPicker color={color} onChange={setColor} />

        <span className="laser-divider" />

        <div className="laser-group" role="group" aria-label="线条粗细 / 字号">
          {WIDTHS.map((item) => (
            <button
              key={item.value}
              type="button"
              className="laser-width"
              title={
                tool === 'text'
                  ? `字号：${FONT_LABELS[item.value]}`
                  : `线条粗细：${item.label}`
              }
              aria-label={
                tool === 'text'
                  ? `字号：${FONT_LABELS[item.value]}`
                  : `线条粗细：${item.label}`
              }
              aria-pressed={width === item.value}
              data-active={width === item.value}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => setWidth(item.value)}
            >
              <span
                style={{
                  width: item.value + 3,
                  height: item.value + 3,
                  backgroundColor: color,
                }}
              />
            </button>
          ))}
        </div>

        <span className="laser-divider" />

        <span className="laser-break" aria-hidden="true" />

        <div className="laser-mode" role="group" aria-label="笔迹模式">
          <button
            type="button"
            data-active={!fade}
            aria-pressed={!fade}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setFade(false)}
          >
            保留
          </button>
          <button
            type="button"
            data-active={fade}
            aria-pressed={fade}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setFade(true)}
          >
            渐隐
          </button>
        </div>

        <span className="laser-divider" />

        <div className="laser-group">
          <button
            type="button"
            className="laser-action"
            data-active={capturing}
            title={`截屏保存 (${formatKey(keys.shot)})`}
            aria-label="截屏保存"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => void takeShot()}
          >
            <Camera size={16} />
          </button>
          <button
            type="button"
            className="laser-action"
            title={`撤销一步 (${formatKey(keys.undo)})`}
            aria-label="撤销一步"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              commitText()
              undoRef.current()
            }}
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="laser-action"
            title={`清空批注 (${formatKey(keys.clear)})`}
            aria-label="清空批注"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              cancelText()
              clearRef.current()
            }}
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            className="laser-action"
            data-active={panelOpen}
            title="自定义快捷键"
            aria-label="自定义快捷键"
            aria-expanded={panelOpen}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              commitText()
              setPanelOpen((value) => !value)
            }}
          >
            <Keyboard size={16} />
          </button>
          <button
            type="button"
            className="laser-action"
            data-variant="danger"
            title={`退出 (${formatKey(keys.exit)})`}
            aria-label="退出激光笔"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onExitRef.current()}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {toast && (
        <div
          className="laser-toast"
          data-variant={toast.error ? 'error' : 'info'}
          role="status"
        >
          {toast.text}
        </div>
      )}

      {panelOpen && (
        <LaserShortcutPanel
          keys={keys}
          onChange={updateKeys}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  )
}
