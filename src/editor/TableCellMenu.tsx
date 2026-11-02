import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Table2,
  TableCellsMerge,
  TableCellsSplit,
  Trash,
} from 'lucide-react'
import {
  addHeaderColumn,
  addHeaderRow,
  getTableContext,
  toggleFirstRowHeader,
} from './tableActions'

type Point = { x: number; y: number }

const MENU_WIDTH = 212
/** 菜单最多这么高，再多就在面板里滚动 */
const MENU_MAX_HEIGHT = 460

function MenuItem({
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
    <button
      type="button"
      role="menuitem"
      className="tt-item"
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {icon ? <span className="tt-item__icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  )
}

/**
 * 单元格右键菜单：命中表格才拦截浏览器菜单，并把光标挪到被右击的那一格，
 * 「加行」「加表头」这些命令才作用在用户以为的那一行上。
 */
export function TableCellMenu({
  editor,
  hidden = false,
}: {
  editor: Editor
  hidden?: boolean
}) {
  const [point, setPoint] = useState<Point | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dom = editor.view.dom

    const handleContextMenu = (event: MouseEvent) => {
      if (hidden || !editor.isEditable) {
        setPoint(null)
        return
      }

      const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (!hit) {
        setPoint(null)
        return
      }

      const $pos = editor.state.doc.resolve(hit.pos)
      let depth = $pos.depth
      while (depth > 0 && $pos.node(depth).type.name !== 'table') depth -= 1
      // 表格外保持浏览器原生菜单
      if (depth === 0) {
        setPoint(null)
        return
      }

      event.preventDefault()
      // 右键不会改变选区，这里手动落到被点的单元格里
      const selection = TextSelection.near($pos, 1)
      editor.view.dispatch(editor.state.tr.setSelection(selection))
      setPoint({ x: event.clientX, y: event.clientY })
    }

    dom.addEventListener('contextmenu', handleContextMenu)
    return () => dom.removeEventListener('contextmenu', handleContextMenu)
  }, [editor, hidden])

  useEffect(() => {
    if (!point) return

    const close = () => setPoint(null)
    const handlePointerDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return
      setPoint(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPoint(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [point])

  if (!point || hidden) return null

  const ctx = getTableContext(editor.state)
  const inTable = ctx !== null

  const run = (command: () => unknown) => {
    command()
    setPoint(null)
  }

  // 靠近视口底部时向上展开，并用 maxHeight 兜住，保证整块菜单留在屏幕内
  const spaceBelow = window.innerHeight - point.y - 10
  const openUpward = spaceBelow < 300 && point.y > 320
  const left = Math.max(8, Math.min(point.x, window.innerWidth - MENU_WIDTH - 8))
  const style: CSSProperties = openUpward
    ? {
        left,
        top: point.y,
        width: MENU_WIDTH,
        maxHeight: Math.max(180, point.y - 10),
        transform: 'translateY(-100%)',
      }
    : {
        left,
        top: point.y,
        width: MENU_WIDTH,
        maxHeight: Math.max(180, Math.min(MENU_MAX_HEIGHT, spaceBelow)),
      }

  return createPortal(
    <div
      ref={panelRef}
      className="cell-menu"
      style={style}
      role="menu"
      aria-label="表格操作"
    >
      <div className="tt-group">行</div>
      <MenuItem
        icon={<ArrowUp size={14} />}
        disabled={!inTable}
        onClick={() => run(() => editor.chain().focus().addRowBefore().run())}
      >
        在上方插入行
      </MenuItem>
      <MenuItem
        icon={<ArrowDown size={14} />}
        disabled={!inTable}
        onClick={() => run(() => editor.chain().focus().addRowAfter().run())}
      >
        在下方插入行
      </MenuItem>
      <MenuItem
        disabled={!inTable || !editor.can().deleteRow()}
        onClick={() => run(() => editor.chain().focus().deleteRow().run())}
      >
        删除当前行
      </MenuItem>

      <div className="tt-group">列</div>
      <MenuItem
        icon={<ArrowLeft size={14} />}
        disabled={!inTable}
        onClick={() => run(() => editor.chain().focus().addColumnBefore().run())}
      >
        在左侧插入列
      </MenuItem>
      <MenuItem
        icon={<ArrowRight size={14} />}
        disabled={!inTable}
        onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}
      >
        在右侧插入列
      </MenuItem>
      <MenuItem
        disabled={!inTable || !editor.can().deleteColumn()}
        onClick={() => run(() => editor.chain().focus().deleteColumn().run())}
      >
        删除当前列
      </MenuItem>

      <div className="tt-group">表头</div>
      <MenuItem
        icon={<Table2 size={14} />}
        disabled={!inTable}
        onClick={() => run(() => addHeaderRow(editor))}
      >
        顶部添加表头行
      </MenuItem>
      <MenuItem
        icon={<Table2 size={14} />}
        disabled={!inTable}
        onClick={() => run(() => addHeaderColumn(editor))}
      >
        左侧添加表头列
      </MenuItem>
      <MenuItem
        icon={<Table2 size={14} />}
        disabled={!inTable}
        onClick={() => run(() => toggleFirstRowHeader(editor))}
      >
        {ctx?.firstRowIsHeader ? '取消首行表头' : '首行设为表头'}
      </MenuItem>

      <div className="tt-group">单元格</div>
      <MenuItem
        icon={<TableCellsMerge size={14} />}
        disabled={!inTable || !editor.can().mergeCells()}
        onClick={() => run(() => editor.chain().focus().mergeCells().run())}
      >
        合并单元格
      </MenuItem>
      <MenuItem
        icon={<TableCellsSplit size={14} />}
        disabled={!inTable || !editor.can().splitCell()}
        onClick={() => run(() => editor.chain().focus().splitCell().run())}
      >
        拆分单元格
      </MenuItem>

      <div className="tt-divider" />
      <MenuItem
        icon={<Trash size={14} />}
        disabled={!inTable}
        onClick={() => run(() => editor.chain().focus().deleteTable().run())}
      >
        删除表格
      </MenuItem>
    </div>,
    document.body,
  )
}
