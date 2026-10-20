import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { DOC_MIN_WIDTH } from './draft'

/**
 * 正文区左侧的拖拽手柄：拖动调节正文排版宽度（居中收窄），
 * 拉到可用宽度时回退为跟随窗口自适应。
 */
export function DocResizer({
  onResize,
  onCommit,
}: {
  onResize: (width: number | null) => void
  onCommit: (width: number | null) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const pageEl = () => ref.current?.parentElement ?? null
  const hostEl = () => ref.current?.closest<HTMLElement>('.typora-body') ?? null

  const maxWidth = () => {
    const writer = pageEl()?.parentElement
    if (!writer) return DOC_MIN_WIDTH
    const styles = window.getComputedStyle(writer)
    const padding =
      (Number.parseFloat(styles.paddingLeft) || 0) +
      (Number.parseFloat(styles.paddingRight) || 0)
    return Math.max(DOC_MIN_WIDTH, writer.clientWidth - padding)
  }

  const clamp = (value: number) =>
    Math.min(maxWidth(), Math.max(DOC_MIN_WIDTH, value))

  /** 拉到可用宽度时视为不限宽，窗口缩放后仍自适应 */
  const normalize = (width: number): number | null => {
    const rounded = Math.round(width)
    return rounded >= maxWidth() - 1 ? null : rounded
  }

  const apply = (width: number | null) => {
    const host = hostEl()
    if (!host) return
    if (width === null) host.style.removeProperty('--doc-width')
    else host.style.setProperty('--doc-width', `${width}px`)
  }

  const commit = (width: number | null) => {
    apply(width)
    onResize(width)
    onCommit(width)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()

    const handle = event.currentTarget
    const startX = event.clientX
    const startWidth = pageEl()?.getBoundingClientRect().width ?? maxWidth()

    handle.setPointerCapture(event.pointerId)
    setDragging(true)
    document.body.dataset.resizing = 'true'

    const handleMove = (moveEvent: PointerEvent) => {
      // 正文居中排版：左边界每移动 1px 宽度反向变化 2px，手柄才能跟手
      const next = clamp(startWidth - (moveEvent.clientX - startX) * 2)
      apply(Math.round(next))
    }

    const finish = () => {
      handle.removeEventListener('pointermove', handleMove)
      handle.removeEventListener('pointerup', finish)
      handle.removeEventListener('pointercancel', finish)
      delete document.body.dataset.resizing
      setDragging(false)
      commit(normalize(pageEl()?.getBoundingClientRect().width ?? startWidth))
    }

    handle.addEventListener('pointermove', handleMove)
    handle.addEventListener('pointerup', finish)
    handle.addEventListener('pointercancel', finish)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const current = pageEl()?.getBoundingClientRect().width ?? maxWidth()
    const step = event.shiftKey ? 64 : 16
    // 手柄在左侧：方向键左移加宽、右移收窄
    const next = clamp(current + (event.key === 'ArrowLeft' ? step : -step))
    commit(normalize(next))
  }

  return (
    <div
      ref={ref}
      className="doc-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整正文宽度"
      aria-valuetext="拖动调整正文宽度，双击恢复自适应"
      tabIndex={0}
      data-dragging={dragging}
      title="拖动调整正文宽度，双击恢复自适应"
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => commit(null)}
    >
      <span className="doc-resizer-grip" aria-hidden="true" />
    </div>
  )
}
