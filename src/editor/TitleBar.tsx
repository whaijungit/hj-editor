import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  Download,
  Eye,
  FileText,
  Menu as MenuIcon,
  Moon,
  Palette,
  PenLine,
  Pilcrow,
  Sun,
  Type,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useIsMobile } from './useIsMobile'

type MenuEntry = {
  label: string
  shortcut?: string
  checked?: boolean
  disabled?: boolean
  run: () => void
}

type MenuItem = MenuEntry | 'separator'

type ViewMode = 'light' | 'dark'

export type TitleBarProps = {
  editor: Editor
  title: string
  onTitleChange: (title: string) => void
  sourceOpen: boolean
  onToggleSource: () => void
  focusMode: boolean
  typewriterMode: boolean
  laserActive: boolean
  titleBarHidden: boolean
  statusBarHidden: boolean
  onToggleFocus: () => void
  onToggleTypewriter: () => void
  onToggleLaser: () => void
  onToggleTitleBar: () => void
  onToggleStatusBar: () => void
  onToggleChrome: () => void
  theme: ViewMode
  onToggleTheme: () => void
  onOpenTheme: () => void
  onNew: () => void
  onImport: () => void
  onSave: () => void
  onExportMarkdown: () => void
  onExportHtml: () => void
  onCopyMarkdown: () => void
  onShowHelp: (tab: 'syntax' | 'shortcuts') => void
}

type MenuGroup = { label: string; icon: LucideIcon; items: MenuItem[] }

/** 移动端没有标题栏，只留一个悬浮按钮唤出侧边菜单 */
function MobileMenu({
  menus,
  hidden = false,
}: {
  menus: MenuGroup[]
  hidden?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [openSection, setOpenSection] = useState<string | null>('文件')

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // 激光笔会占满整屏，此时让悬浮按钮退场，避免压住工具条
  if (hidden) return null

  return (
    <>
      <button
        type="button"
        className="mobile-menu-fab"
        aria-label="打开菜单"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MenuIcon size={20} strokeWidth={1.9} aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div className="mobile-menu">
            <button
              type="button"
              className="mobile-menu-scrim"
              aria-label="关闭菜单"
              tabIndex={-1}
              onClick={() => setOpen(false)}
            />

            <div
              className="mobile-menu-panel"
              role="dialog"
              aria-modal="true"
              aria-label="文档菜单"
            >
              <div className="mobile-menu-head">
                <span className="mobile-menu-title">菜单</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="关闭菜单"
                  onClick={() => setOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mobile-menu-body">
                {menus.map((menu) => {
                  const expanded = openSection === menu.label

                  return (
                    <section className="mobile-menu-section" key={menu.label}>
                      <button
                        type="button"
                        className="mobile-menu-section-head"
                        data-open={expanded}
                        aria-expanded={expanded}
                        onClick={() =>
                          setOpenSection(expanded ? null : menu.label)
                        }
                      >
                        <menu.icon
                          size={16}
                          strokeWidth={1.7}
                          aria-hidden="true"
                        />
                        <span className="mobile-menu-section-label">
                          {menu.label}
                        </span>
                        <ChevronDown
                          className="mobile-menu-chevron"
                          size={16}
                          aria-hidden="true"
                        />
                      </button>

                      {expanded && (
                        <div className="mobile-menu-entries">
                          {menu.items.map((item, index) =>
                            item === 'separator' ? (
                              <div
                                className="menubar-sep"
                                key={`sep-${index}`}
                              />
                            ) : (
                              <button
                                type="button"
                                className="menubar-entry mobile-menu-entry"
                                key={item.label}
                                disabled={item.disabled}
                                onClick={() => {
                                  setOpen(false)
                                  item.run()
                                }}
                              >
                                <span className="menubar-check">
                                  {item.checked ? <Check size={13} /> : null}
                                </span>
                                <span className="menubar-label">
                                  {item.label}
                                </span>
                                {item.shortcut && (
                                  <kbd className="menubar-kbd">
                                    {item.shortcut}
                                  </kbd>
                                )}
                              </button>
                            ),
                          )}
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

export function TitleBar({
  editor,
  title,
  onTitleChange,
  sourceOpen,
  onToggleSource,
  focusMode,
  typewriterMode,
  laserActive,
  titleBarHidden,
  statusBarHidden,
  onToggleFocus,
  onToggleTypewriter,
  onToggleLaser,
  onToggleTitleBar,
  onToggleStatusBar,
  onToggleChrome,
  theme,
  onToggleTheme,
  onOpenTheme,
  onNew,
  onImport,
  onSave,
  onExportMarkdown,
  onExportHtml,
  onCopyMarkdown,
  onShowHelp,
}: TitleBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const isMobile = useIsMobile()
  const barRef = useRef<HTMLDivElement>(null)

  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
      isBold: editor.isActive('bold'),
      isItalic: editor.isActive('italic'),
      isUnderline: editor.isActive('underline'),
      isStrike: editor.isActive('strike'),
      isCode: editor.isActive('code'),
      isHighlight: editor.isActive('highlight'),
      heading:
        ([1, 2, 3, 4] as const).find((level) =>
          editor.isActive('heading', { level }),
        ) ?? null,
      isBlockquote: editor.isActive('blockquote'),
      isCodeBlock: editor.isActive('codeBlock'),
      isBulletList: editor.isActive('bulletList'),
      isOrderedList: editor.isActive('orderedList'),
      isTaskList: editor.isActive('taskList'),
    }),
  })

  useEffect(() => {
    if (!openMenu) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenMenu(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpenMenu(null)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenu])

  const chain = () => editor.chain().focus()

  const menus: { label: string; icon: LucideIcon; items: MenuItem[] }[] = [
    {
      label: '文件',
      icon: FileText,
      items: [
        { label: '新建文稿', shortcut: 'Ctrl N', run: onNew },
        { label: '导入文件…', shortcut: 'Ctrl O', run: onImport },
        { label: '立即保存草稿', shortcut: 'Ctrl S', run: onSave },
        'separator',
        { label: '导出 Markdown (.md)', run: onExportMarkdown },
        { label: '导出 HTML (.html)', run: onExportHtml },
        { label: '复制 Markdown', run: onCopyMarkdown },
      ],
    },
    {
      label: '编辑',
      icon: PenLine,
      items: [
        {
          label: '撤销',
          shortcut: 'Ctrl Z',
          disabled: !state.canUndo,
          run: () => chain().undo().run(),
        },
        {
          label: '重做',
          shortcut: 'Ctrl Shift Z',
          disabled: !state.canRedo,
          run: () => chain().redo().run(),
        },
        'separator',
        {
          label: '全选',
          shortcut: 'Ctrl A',
          run: () => {
            editor.chain().focus().selectAll().run()
          },
        },
        {
          label: '清除格式',
          run: () => chain().unsetAllMarks().clearNodes().run(),
        },
      ],
    },
    {
      label: '段落',
      icon: Pilcrow,
      items: [
        {
          label: '正文',
          shortcut: 'Ctrl Alt 0',
          checked: state.heading === null,
          run: () => chain().setParagraph().run(),
        },
        ...[1, 2, 3, 4].map<MenuEntry>((level) => ({
          label: `标题 ${level}`,
          shortcut: `Ctrl Alt ${level}`,
          checked: state.heading === level,
          run: () =>
            chain()
              .setHeading({ level: level as 1 | 2 | 3 | 4 })
              .run(),
        })),
        'separator',
        {
          label: '引用',
          shortcut: 'Ctrl Shift B',
          checked: state.isBlockquote,
          run: () => chain().toggleBlockquote().run(),
        },
        {
          label: '代码块',
          shortcut: 'Ctrl Alt C',
          checked: state.isCodeBlock,
          run: () => chain().toggleCodeBlock().run(),
        },
        {
          label: '分割线',
          run: () => chain().setHorizontalRule().run(),
        },
        'separator',
        {
          label: '无序列表',
          shortcut: 'Ctrl Shift 8',
          checked: state.isBulletList,
          run: () => chain().toggleBulletList().run(),
        },
        {
          label: '有序列表',
          shortcut: 'Ctrl Shift 7',
          checked: state.isOrderedList,
          run: () => chain().toggleOrderedList().run(),
        },
        {
          label: '任务列表',
          shortcut: 'Ctrl Shift 9',
          checked: state.isTaskList,
          run: () => chain().toggleTaskList().run(),
        },
        'separator',
        {
          label: '插入表格 3 × 3',
          run: () =>
            chain()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run(),
        },
      ],
    },
    {
      label: '格式',
      icon: Type,
      items: [
        {
          label: '加粗',
          shortcut: 'Ctrl B',
          checked: state.isBold,
          run: () => chain().toggleBold().run(),
        },
        {
          label: '斜体',
          shortcut: 'Ctrl I',
          checked: state.isItalic,
          run: () => chain().toggleItalic().run(),
        },
        {
          label: '下划线',
          shortcut: 'Ctrl U',
          checked: state.isUnderline,
          run: () => chain().toggleUnderline().run(),
        },
        {
          label: '删除线',
          shortcut: 'Ctrl Shift S',
          checked: state.isStrike,
          run: () => chain().toggleStrike().run(),
        },
        {
          label: '行内代码',
          shortcut: 'Ctrl E',
          checked: state.isCode,
          run: () => chain().toggleCode().run(),
        },
        {
          label: '高亮',
          checked: state.isHighlight,
          run: () =>
            state.isHighlight
              ? chain().unsetHighlight().run()
              : chain().setHighlight({ color: '#fef08a' }).run(),
        },
        'separator',
        {
          label: '清除格式',
          run: () => chain().unsetAllMarks().run(),
        },
      ],
    },
    {
      label: '视图',
      icon: Eye,
      items: [
        {
          label: 'Markdown 源码',
          shortcut: 'Ctrl /',
          checked: sourceOpen,
          run: onToggleSource,
        },
        'separator',
        {
          label: '专注模式',
          checked: focusMode,
          run: onToggleFocus,
        },
        {
          label: '打字机模式',
          checked: typewriterMode,
          run: onToggleTypewriter,
        },
        {
          label: '激光笔',
          shortcut: 'Ctrl Shift L',
          checked: laserActive,
          run: onToggleLaser,
        },
        'separator',
        {
          label: '隐藏标题栏',
          checked: titleBarHidden,
          run: onToggleTitleBar,
        },
        {
          label: '隐藏状态栏',
          checked: statusBarHidden,
          run: onToggleStatusBar,
        },
        {
          label: '隐藏标题栏和状态栏',
          shortcut: 'Ctrl Shift H',
          checked: titleBarHidden && statusBarHidden,
          run: onToggleChrome,
        },
        'separator',
        {
          label: '主题与排版…',
          run: onOpenTheme,
        },
        {
          label: '深色外观',
          checked: theme === 'dark',
          run: onToggleTheme,
        },
      ],
    },
    {
      label: '帮助',
      icon: CircleHelp,
      items: [
        {
          label: 'Markdown 语法',
          run: () => onShowHelp('syntax'),
        },
        {
          label: '快捷键',
          run: () => onShowHelp('shortcuts'),
        },
      ],
    },
  ]

  // 移动端不渲染标题栏，只保留打开侧边菜单的悬浮按钮
  if (isMobile) return <MobileMenu menus={menus} hidden={laserActive} />

  return (
    <header className="titlebar">
      <div className="titlebar-start" ref={barRef}>
        <nav className="menubar" aria-label="文档菜单">
          {menus.map((menu) => (
            <div className="menubar-item" key={menu.label}>
              <button
                type="button"
                className="menubar-trigger"
                data-open={openMenu === menu.label}
                aria-label={menu.label}
                aria-haspopup="menu"
                aria-expanded={openMenu === menu.label}
                title={menu.label}
                onClick={() =>
                  setOpenMenu(openMenu === menu.label ? null : menu.label)
                }
                onMouseEnter={() => {
                  if (openMenu) setOpenMenu(menu.label)
                }}
              >
                <menu.icon size={16} strokeWidth={1.7} aria-hidden="true" />
              </button>

              {openMenu === menu.label && (
                <div className="menubar-panel" role="menu">
                  {menu.items.map((item, index) =>
                    item === 'separator' ? (
                      <div className="menubar-sep" key={`sep-${index}`} />
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        className="menubar-entry"
                        key={item.label}
                        disabled={item.disabled}
                        onClick={() => {
                          setOpenMenu(null)
                          item.run()
                        }}
                      >
                        <span className="menubar-check">
                          {item.checked ? <Check size={13} /> : null}
                        </span>
                        <span className="menubar-label">{item.label}</span>
                        {item.shortcut && (
                          <kbd className="menubar-kbd">{item.shortcut}</kbd>
                        )}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      <div className="titlebar-center">
        <input
          className="doc-title"
          value={title}
          aria-label="文档标题"
          spellCheck={false}
          onChange={(event) => onTitleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
      </div>

      <div className="titlebar-end">
        <span className="save-hint">自动保存</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="激光笔"
          aria-pressed={laserActive}
          onClick={onToggleLaser}
        >
          <Zap size={17} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Markdown 源码"
          aria-pressed={sourceOpen}
          onClick={onToggleSource}
        >
          <Code2 size={17} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="主题与排版设置"
          title="主题与排版"
          onClick={onOpenTheme}
        >
          <Palette size={17} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
          title={theme === 'dark' ? '切换到浅色' : '切换到深色'}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="导出 Markdown"
          onClick={onExportMarkdown}
        >
          <Download size={17} />
        </button>
      </div>
    </header>
  )
}
