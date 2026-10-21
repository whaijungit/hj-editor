import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Table2,
  TableCellsMerge,
  TableCellsSplit,
  Trash,
} from 'lucide-react'
import {
  addHeaderColumn,
  addHeaderRow,
  canMoveColumn,
  getTableContext,
  moveColumn,
  moveRow,
  toggleFirstRowHeader,
} from './tableActions'

type Anchor = { left: number; top: number }

function TableItem({
  icon,
  children,
  disabled,
  onClick,
}: {
  icon?: ReactNode
  children: ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className="tt-item" disabled={disabled} onClick={onClick}>
      {icon ? <span className="tt-item__icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  )
}

export function TableToolbar({
  editor,
  hidden = false,
}: {
  editor: Editor
  hidden?: boolean
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const measure = useCallback(() => {
    const hide = () => {
      setAnchor(null)
      setOpen(false)
    }

    if (hidden || !editor.isEditable) {
      hide()
      return
    }
    const ctx = getTableContext(editor.state)
    if (!ctx) {
      hide()
      return
    }
    const node = editor.view.nodeDOM(ctx.tablePos) as HTMLElement | null
    const table =
      node && node.tagName === 'TABLE'
        ? node
        : (node?.querySelector('table') as HTMLTableElement | null)
    if (!table) {
      hide()
      return
    }
    const rect = table.getBoundingClientRect()
    const barWidth = 132
    const left = Math.min(
      Math.max(rect.left, 8),
      Math.max(window.innerWidth - barWidth - 8, 8),
    )
    const top = rect.top > 64 ? rect.top - 34 : 64
    setAnchor((current) => {
      if (current && Math.abs(current.left - left) < 0.5 && Math.abs(current.top - top) < 0.5) {
        return current
      }
      return { left, top }
    })
  }, [editor, hidden])

  useEffect(() => {
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }

    schedule()
    editor.on('transaction', schedule)
    editor.on('selectionUpdate', schedule)
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      editor.off('transaction', schedule)
      editor.off('selectionUpdate', schedule)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [editor, measure, hidden])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!anchor) return null

  const ctx = getTableContext(editor.state)
  const canMove = canMoveColumn(ctx)
  const inTable = ctx !== null

  const run = (action: () => boolean) => {
    action()
    setOpen(false)
    measure()
  }

  const bar = (
    <div ref={rootRef} className="table-tools" style={{ left: anchor.left, top: anchor.top }}>
      <button
        type="button"
        className="table-tools__main"
        title="在表格顶部添加表头行"
        onClick={() => run(() => addHeaderRow(editor))}
      >
        <Table2 size={14} />
        加表头
      </button>
      <button
        type="button"
        className="table-tools__more"
        data-open={open}
        title="更多表格操作"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown size={14} />
      </button>
    </div>
  )

  const panelHeight = 420
  const panelTop =
    anchor.top + 36 + panelHeight < window.innerHeight
      ? anchor.top + 36
      : Math.max(8, anchor.top - panelHeight - 8)

  const panel = open ? (
    <div
      ref={panelRef}
      className="table-tools__panel"
      style={{
        left: Math.min(anchor.left, Math.max(window.innerWidth - 216, 8)),
        top: panelTop,
      }}
    >
      <div className="tt-group">表头</div>
      <TableItem
        icon={<Table2 size={14} />}
        disabled={!inTable}
        onClick={() => run(() => addHeaderRow(editor))}
      >
        顶部添加表头行
      </TableItem>
      <TableItem
        icon={<Table2 size={14} />}
        disabled={!inTable}
        onClick={() => run(() => addHeaderColumn(editor))}
      >
        左侧添加表头列
      </TableItem>
      <TableItem
        icon={<Table2 size={14} />}
        disabled={!inTable}
        onClick={() => run(() => toggleFirstRowHeader(editor))}
      >
        {ctx?.firstRowIsHeader ? '取消首行表头' : '首行设为表头'}
      </TableItem>

      <div className="tt-group">调整顺序</div>
      <div className="tt-grid">
        <TableItem
          icon={<ArrowUp size={14} />}
          disabled={!inTable || !ctx || ctx.rowIndex === 0}
          onClick={() => run(() => moveRow(editor, -1))}
        >
          上移行
        </TableItem>
        <TableItem
          icon={<ArrowDown size={14} />}
          disabled={!inTable || !canMove || !ctx || ctx.rowIndex === ctx.rows.length - 1}
          onClick={() => run(() => moveRow(editor, 1))}
        >
          下移行
        </TableItem>
        <TableItem
          icon={<ArrowLeft size={14} />}
          disabled={!canMove || !ctx || ctx.colIndex === 0}
          onClick={() => run(() => moveColumn(editor, -1))}
        >
          左移列
        </TableItem>
        <TableItem
          icon={<ArrowRight size={14} />}
          disabled={!canMove || !ctx || ctx.colIndex >= (ctx.rows[0]?.childCount ?? 1) - 1}
          onClick={() => run(() => moveColumn(editor, 1))}
        >
          右移列
        </TableItem>
      </div>

      <div className="tt-group">行列</div>
      <TableItem disabled={!inTable} onClick={() => run(() => editor.chain().focus().addRowAfter().run())}>
        在下方插入行
      </TableItem>
      <TableItem disabled={!inTable} onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}>
        在右侧插入列
      </TableItem>
      <TableItem
        disabled={!inTable || !editor.can().deleteRow()}
        onClick={() => run(() => editor.chain().focus().deleteRow().run())}
      >
        删除当前行
      </TableItem>
      <TableItem
        disabled={!inTable || !editor.can().deleteColumn()}
        onClick={() => run(() => editor.chain().focus().deleteColumn().run())}
      >
        删除当前列
      </TableItem>

      <div className="tt-group">单元格</div>
      <TableItem
        icon={<TableCellsMerge size={14} />}
        disabled={!inTable || !editor.can().mergeCells()}
        onClick={() => run(() => editor.chain().focus().mergeCells().run())}
      >
        合并单元格
      </TableItem>
      <TableItem
        icon={<TableCellsSplit size={14} />}
        disabled={!inTable || !editor.can().splitCell()}
        onClick={() => run(() => editor.chain().focus().splitCell().run())}
      >
        拆分单元格
      </TableItem>

      <div className="tt-divider" />
      <TableItem
        icon={<Trash size={14} />}
        disabled={!inTable}
        onClick={() => run(() => editor.chain().focus().deleteTable().run())}
      >
        删除表格
      </TableItem>
    </div>
  ) : null

  return createPortal(
    <>
      {bar}
      {panel}
    </>,
    document.body,
  )
}
