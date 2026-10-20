import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  Bold,
  Check,
  ChevronDown,
  Code,
  CodeXml,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Palette,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  TableCellsMerge,
  TableCellsSplit,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
  Trash,
  Type,
  Underline,
  Undo2,
  Upload,
} from 'lucide-react'

const TEXT_COLORS = [
  '#1f2430',
  '#6b7280',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
  '#2563eb',
  '#7c3aed',
  '#db2777',
]

const HIGHLIGHT_COLORS = [
  '#fef08a',
  '#fde68a',
  '#fdba74',
  '#fecaca',
  '#fbcfe8',
  '#e9d5ff',
  '#bfdbfe',
  '#bbf7d0',
  '#e5e7eb',
]

const BLOCK_OPTIONS = [
  { level: null, label: '正文', icon: <Type size={15} /> },
  { level: 1, label: '标题 1', icon: <Heading1 size={15} /> },
  { level: 2, label: '标题 2', icon: <Heading2 size={15} /> },
  { level: 3, label: '标题 3', icon: <Heading3 size={15} /> },
  { level: 4, label: '标题 4', icon: <Heading4 size={15} /> },
] as const

const ALIGN_OPTIONS = [
  { value: 'left', label: '左对齐', icon: <TextAlignStart size={16} /> },
  { value: 'center', label: '居中对齐', icon: <TextAlignCenter size={16} /> },
  { value: 'right', label: '右对齐', icon: <TextAlignEnd size={16} /> },
  { value: 'justify', label: '两端对齐', icon: <TextAlignJustify size={16} /> },
] as const

type SelectorContext = { editor: Editor }

function selectToolbarState({ editor }: SelectorContext) {
  return {
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
    headingLevel:
      ([1, 2, 3, 4] as const).find((level) =>
        editor.isActive('heading', { level }),
      ) ?? null,
    isBold: editor.isActive('bold'),
    isItalic: editor.isActive('italic'),
    isUnderline: editor.isActive('underline'),
    isStrike: editor.isActive('strike'),
    isCode: editor.isActive('code'),
    isBulletList: editor.isActive('bulletList'),
    isOrderedList: editor.isActive('orderedList'),
    isTaskList: editor.isActive('taskList'),
    isBlockquote: editor.isActive('blockquote'),
    isCodeBlock: editor.isActive('codeBlock'),
    align:
      (['left', 'center', 'right', 'justify'] as const).find((value) =>
        editor.isActive({ textAlign: value }),
      ) ?? null,
    color: (editor.getAttributes('textStyle').color as string | undefined) ?? null,
    highlight:
      (editor.getAttributes('highlight').color as string | undefined) ?? null,
    isLink: editor.isActive('link'),
    isInTable: editor.isActive('table'),
    canMergeCells: editor.can().mergeCells(),
    canSplitCell: editor.can().splitCell(),
  }
}

type MenuProps = {
  trigger: (context: { open: boolean; toggle: () => void }) => ReactNode
  children: (context: { close: () => void }) => ReactNode
  panelClassName?: string
}

function Menu({ trigger, children, panelClassName }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false })
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const updatePosition = () => {
      const triggerRect = rootRef.current?.getBoundingClientRect()
      const panel = panelRef.current
      if (!triggerRect || !panel) return

      const margin = 10
      const width = panel.offsetWidth
      const height = panel.offsetHeight
      const left = Math.max(
        margin,
        Math.min(triggerRect.left, window.innerWidth - width - margin),
      )
      let top = triggerRect.bottom + 8
      if (top + height > window.innerHeight - margin) {
        top = Math.max(margin, triggerRect.top - height - 8)
      }

      setPosition({ left, top, ready: true })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  return (
    <div className="tb-menu" ref={rootRef}>
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className={['tb-panel', panelClassName ?? ''].filter(Boolean).join(' ')}
            style={{
              left: position.left,
              top: position.top,
              visibility: position.ready ? 'visible' : 'hidden',
            }}
          >
            {children({ close: () => setOpen(false) })}
          </div>,
          document.body,
        )}
    </div>
  )
}

type ToolButtonProps = {
  icon: ReactNode
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}

function ToolButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      className="tb-btn"
      title={label}
      aria-label={label}
      aria-pressed={active}
      data-active={active}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

function Swatch({
  color,
  active,
  onSelect,
}: {
  color: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className="tb-swatch"
      style={{ background: color }}
      data-active={active}
      title={color}
      aria-label={color}
      onClick={onSelect}
    >
      {active && <Check size={12} strokeWidth={3} />}
    </button>
  )
}

function ColorPanel({
  editor,
  current,
  close,
}: {
  editor: Editor
  current: string | null
  close: () => void
}) {
  const apply = (color: string) => {
    editor.chain().focus().setColor(color).run()
    close()
  }

  return (
    <>
      <div className="tb-swatches">
        {TEXT_COLORS.map((color) => (
          <Swatch
            key={color}
            color={color}
            active={current?.toLowerCase() === color}
            onSelect={() => apply(color)}
          />
        ))}
      </div>
      <label className="tb-custom-color">
        <span>自定义颜色</span>
        <input
          type="color"
          value={current ?? '#1f2430'}
          onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
        />
      </label>
      <div className="tb-divider" />
      <button
        type="button"
        className="tb-item"
        onClick={() => {
          editor.chain().focus().unsetColor().run()
          close()
        }}
      >
        <Eraser size={14} />
        清除文字颜色
      </button>
    </>
  )
}

function HighlightPanel({
  editor,
  current,
  close,
}: {
  editor: Editor
  current: string | null
  close: () => void
}) {
  const apply = (color: string) => {
    editor.chain().focus().setHighlight({ color }).run()
    close()
  }

  return (
    <>
      <div className="tb-swatches">
        {HIGHLIGHT_COLORS.map((color) => (
          <Swatch
            key={color}
            color={color}
            active={current?.toLowerCase() === color}
            onSelect={() => apply(color)}
          />
        ))}
      </div>
      <div className="tb-divider" />
      <button
        type="button"
        className="tb-item"
        onClick={() => {
          editor.chain().focus().unsetHighlight().run()
          close()
        }}
      >
        <Eraser size={14} />
        清除背景高亮
      </button>
    </>
  )
}

function LinkPanel({ editor, close }: { editor: Editor; close: () => void }) {
  const [url, setUrl] = useState(
    () => (editor.getAttributes('link').href as string | undefined) ?? '',
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const raw = url.trim()
    const { empty } = editor.state.selection

    if (!raw) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      close()
      return
    }

    const href = /^(https?:\/\/|mailto:|tel:|#|\/)/i.test(raw) ? raw : `https://${raw}`

    if (empty && !editor.isActive('link')) {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
        .run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }

    close()
  }

  return (
    <form className="tb-form" onSubmit={submit}>
      <input
        className="tb-input"
        value={url}
        autoFocus
        placeholder="https://example.com"
        onChange={(event) => setUrl(event.target.value)}
      />
      <div className="tb-form-actions">
        <button type="submit" className="tb-primary">
          {editor.isActive('link') ? '更新链接' : '插入链接'}
        </button>
        {editor.isActive('link') && (
          <button
            type="button"
            className="tb-ghost"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run()
              close()
            }}
          >
            <Link2Off size={13} />
            移除
          </button>
        )}
      </div>
    </form>
  )
}

function ImagePanel({ editor, close }: { editor: Editor; close: () => void }) {
  const [url, setUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const insert = (src: string, alt?: string) => {
    editor.chain().focus().setImage({ src, alt }).run()
    close()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const raw = url.trim()
    if (!raw) return
    insert(/^(https?:\/\/|data:)/i.test(raw) ? raw : `https://${raw}`)
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => insert(String(reader.result), file.name)
    reader.readAsDataURL(file)
  }

  return (
    <form className="tb-form" onSubmit={submit}>
      <input
        className="tb-input"
        value={url}
        autoFocus
        placeholder="粘贴图片链接"
        onChange={(event) => setUrl(event.target.value)}
      />
      <div className="tb-form-actions">
        <button type="submit" className="tb-primary">
          插入图片
        </button>
      </div>
      <div className="tb-divider" />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFile}
      />
      <button
        type="button"
        className="tb-item"
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={14} />
        从本地上传图片
      </button>
    </form>
  )
}

function TablePanel({ editor, close }: { editor: Editor; close: () => void }) {
  const inTable = editor.isActive('table')

  const run = (command: () => void) => {
    command()
    close()
  }

  return (
    <>
      <button
        type="button"
        className="tb-item"
        onClick={() =>
          run(() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run(),
          )
        }
      >
        <Table2 size={14} />
        插入 3 × 3 表格
      </button>
      <div className="tb-divider" />
      <button
        type="button"
        className="tb-item"
        disabled={!inTable || !editor.can().addRowAfter()}
        onClick={() => run(() => editor.chain().focus().addRowAfter().run())}
      >
        在下方插入行
      </button>
      <button
        type="button"
        className="tb-item"
        disabled={!inTable || !editor.can().deleteRow()}
        onClick={() => run(() => editor.chain().focus().deleteRow().run())}
      >
        删除当前行
      </button>
      <button
        type="button"
        className="tb-item"
        disabled={!inTable || !editor.can().addColumnAfter()}
        onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}
      >
        在右侧插入列
      </button>
      <button
        type="button"
        className="tb-item"
        disabled={!inTable || !editor.can().deleteColumn()}
        onClick={() => run(() => editor.chain().focus().deleteColumn().run())}
      >
        删除当前列
      </button>
      <div className="tb-divider" />
      <button
        type="button"
        className="tb-item"
        disabled={!inTable || !editor.can().mergeCells()}
        onClick={() => run(() => editor.chain().focus().mergeCells().run())}
      >
        <TableCellsMerge size={14} />
        合并单元格
      </button>
      <button
        type="button"
        className="tb-item"
        disabled={!inTable || !editor.can().splitCell()}
        onClick={() => run(() => editor.chain().focus().splitCell().run())}
      >
        <TableCellsSplit size={14} />
        拆分单元格
      </button>
      <div className="tb-divider" />
      <button
        type="button"
        className="tb-item tb-item--danger"
        disabled={!inTable}
        onClick={() => run(() => editor.chain().focus().deleteTable().run())}
      >
        <Trash size={14} />
        删除表格
      </button>
    </>
  )
}

export function EditorToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({ editor, selector: selectToolbarState })
  const currentBlock =
    BLOCK_OPTIONS.find((option) => option.level === state.headingLevel) ??
    BLOCK_OPTIONS[0]

  return (
    <div className="toolbar" role="toolbar" aria-label="编辑器工具栏">
      <div className="tb-group">
        <ToolButton
          icon={<Undo2 size={16} />}
          label="撤销 (Ctrl+Z)"
          disabled={!state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolButton
          icon={<Redo2 size={16} />}
          label="重做 (Ctrl+Shift+Z)"
          disabled={!state.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        />
      </div>

      <span className="tb-sep" />

      <div className="tb-group">
        <Menu
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className="tb-btn tb-btn--label"
              data-open={open}
              aria-expanded={open}
              aria-haspopup="true"
              data-active={state.headingLevel !== null}
              onClick={toggle}
              title="段落格式"
            >
              {currentBlock.icon}
              <span>{currentBlock.label}</span>
              <ChevronDown size={13} />
            </button>
          )}
        >
          {({ close }) => (
            <>
              {BLOCK_OPTIONS.map((option) => {
                const active = option.level === state.headingLevel
                return (
                  <button
                    key={option.label}
                    type="button"
                    className="tb-item"
                    data-active={active}
                    onClick={() => {
                      if (option.level === null) {
                        editor.chain().focus().setParagraph().run()
                      } else {
                        editor
                          .chain()
                          .focus()
                          .toggleHeading({ level: option.level })
                          .run()
                      }
                      close()
                    }}
                  >
                    {option.icon}
                    {option.label}
                    {active && <Check size={13} className="tb-item-check" />}
                  </button>
                )
              })}
            </>
          )}
        </Menu>

        <ToolButton
          icon={<Bold size={16} />}
          label="加粗 (Ctrl+B)"
          active={state.isBold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolButton
          icon={<Italic size={16} />}
          label="斜体 (Ctrl+I)"
          active={state.isItalic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolButton
          icon={<Underline size={16} />}
          label="下划线 (Ctrl+U)"
          active={state.isUnderline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolButton
          icon={<Strikethrough size={16} />}
          label="删除线 (Ctrl+Shift+S)"
          active={state.isStrike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolButton
          icon={<Code size={16} />}
          label="行内代码 (Ctrl+E)"
          active={state.isCode}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
      </div>

      <span className="tb-sep" />

      <div className="tb-group">
        <Menu
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className="tb-btn tb-btn--swatch"
              data-open={open}
              aria-expanded={open}
              aria-haspopup="true"
              data-active={state.color !== null}
              onClick={toggle}
              title="文字颜色"
              aria-label="文字颜色"
            >
              <Palette size={16} />
              <span
                className="tb-swatch-bar"
                style={{ background: state.color ?? 'currentColor' }}
              />
            </button>
          )}
        >
          {({ close }) => (
            <ColorPanel editor={editor} current={state.color} close={close} />
          )}
        </Menu>

        <Menu
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className="tb-btn tb-btn--swatch"
              data-open={open}
              aria-expanded={open}
              aria-haspopup="true"
              data-active={state.highlight !== null}
              onClick={toggle}
              title="背景高亮"
              aria-label="背景高亮"
            >
              <Highlighter size={16} />
              <span
                className="tb-swatch-bar"
                style={{ background: state.highlight ?? 'currentColor' }}
              />
            </button>
          )}
        >
          {({ close }) => (
            <HighlightPanel
              editor={editor}
              current={state.highlight}
              close={close}
            />
          )}
        </Menu>
      </div>

      <span className="tb-sep" />

      <div className="tb-group">
        {ALIGN_OPTIONS.map((option) => (
          <ToolButton
            key={option.value}
            icon={option.icon}
            label={option.label}
            active={state.align === option.value}
            onClick={() => editor.chain().focus().setTextAlign(option.value).run()}
          />
        ))}
      </div>

      <span className="tb-sep" />

      <div className="tb-group">
        <ToolButton
          icon={<List size={16} />}
          label="无序列表"
          active={state.isBulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolButton
          icon={<ListOrdered size={16} />}
          label="有序列表"
          active={state.isOrderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolButton
          icon={<ListTodo size={16} />}
          label="任务列表"
          active={state.isTaskList}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        />
        <ToolButton
          icon={<Quote size={16} />}
          label="引用"
          active={state.isBlockquote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolButton
          icon={<CodeXml size={16} />}
          label="代码块"
          active={state.isCodeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <ToolButton
          icon={<Minus size={16} />}
          label="分割线"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        />
      </div>

      <span className="tb-sep" />

      <div className="tb-group">
        <Menu
          panelClassName="tb-panel--form"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className="tb-btn"
              data-open={open}
              aria-expanded={open}
              aria-haspopup="true"
              data-active={state.isLink}
              onClick={toggle}
              title="插入链接"
              aria-label="插入链接"
            >
              <Link2 size={16} />
            </button>
          )}
        >
          {({ close }) => <LinkPanel editor={editor} close={close} />}
        </Menu>

        <Menu
          panelClassName="tb-panel--form"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className="tb-btn"
              data-open={open}
              aria-expanded={open}
              aria-haspopup="true"
              onClick={toggle}
              title="插入图片"
              aria-label="插入图片"
            >
              <ImagePlus size={16} />
            </button>
          )}
        >
          {({ close }) => <ImagePanel editor={editor} close={close} />}
        </Menu>

        <Menu
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className="tb-btn"
              data-open={open}
              aria-expanded={open}
              aria-haspopup="true"
              data-active={state.isInTable}
              onClick={toggle}
              title="表格"
              aria-label="表格"
            >
              <Table2 size={16} />
            </button>
          )}
        >
          {({ close }) => <TablePanel editor={editor} close={close} />}
        </Menu>

        <ToolButton
          icon={<Eraser size={16} />}
          label="清除格式"
          onClick={() =>
            editor.chain().focus().unsetAllMarks().clearNodes().run()
          }
        />
      </div>
    </div>
  )
}

export function BubbleToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({ editor, selector: selectToolbarState })

  return (
    <div className="bubble-menu">
      <ToolButton
        icon={<Bold size={15} />}
        label="加粗"
        active={state.isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolButton
        icon={<Italic size={15} />}
        label="斜体"
        active={state.isItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolButton
        icon={<Underline size={15} />}
        label="下划线"
        active={state.isUnderline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolButton
        icon={<Strikethrough size={15} />}
        label="删除线"
        active={state.isStrike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <span className="bubble-sep" />
      <ToolButton
        icon={<Code size={15} />}
        label="行内代码"
        active={state.isCode}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
      <ToolButton
        icon={<Highlighter size={15} />}
        label="高亮"
        active={state.highlight !== null}
        onClick={() =>
          state.highlight
            ? editor.chain().focus().unsetHighlight().run()
            : editor.chain().focus().setHighlight({ color: '#fef08a' }).run()
        }
      />
      <ToolButton
        icon={<Eraser size={15} />}
        label="清除格式"
        onClick={() => editor.chain().focus().unsetAllMarks().run()}
      />
    </div>
  )
}
