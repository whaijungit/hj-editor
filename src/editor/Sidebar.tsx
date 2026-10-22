import { Fragment, useMemo } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  Check,
  CircleHelp,
  CloudUpload,
  Code2,
  Download,
  FilePlus2,
  Focus,
  Link2,
  Loader2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Save,
  TextCursorInput,
  Zap,
} from 'lucide-react'
import { buildInsertPalette, flattenPalette } from './insertPalette'
import {
  shortcutHint,
  type ShortcutId,
  type ShortcutMap,
} from './shortcuts'

export type SidebarProps = {
  editor: Editor
  title: string
  onTitleChange: (title: string) => void
  /** 收起后只留一列图标，所有屏幕尺寸共用同一套布局 */
  collapsed: boolean
  onToggleCollapsed: () => void
  sourceOpen: boolean
  onToggleSource: () => void
  focusMode: boolean
  typewriterMode: boolean
  laserActive: boolean
  onToggleFocus: () => void
  onToggleWriting: () => void
  onToggleTypewriter: () => void
  onToggleLaser: () => void
  onOpenTheme: () => void
  onNew: () => void
  onSave: () => void
  /** 保存到服务器（Netlify Blobs）：首次新建，之后覆盖同一篇 */
  onSaveCloud: () => void
  cloudSaving: boolean
  /** 最近一次存到云端的时间戳；0 表示还没存过 */
  cloudSavedAt: number
  onExportMarkdown: () => void
  onShare: () => void
  onShowHelp: (tab: 'syntax' | 'shortcuts') => void
  /** 只读分享：写入类入口全部置灰 */
  readOnly?: boolean
  /** 用户当前的键位表：清单右侧的快捷键提示要跟着它变 */
  shortcutKeys: ShortcutMap
}

/** 云端保存时间只到分钟，够用户确认是不是刚存过 */
function formatClock(time: number): string {
  return new Date(time).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 左侧栏只承担两件事：
 * 1. 列出 Markdown 插入语法，每一项都标着对应的快捷键，熟手直接按键即可；
 * 2. 底部一排文件 / 视图 / 帮助图标，避免这些动作再占用一列菜单。
 *
 * 真正下手写的时候，光标处输入「/」会更顺手，这里留作速查。
 */
export function Sidebar({
  editor,
  title,
  onTitleChange,
  collapsed,
  onToggleCollapsed,
  sourceOpen,
  onToggleSource,
  focusMode,
  typewriterMode,
  laserActive,
  onToggleFocus,
  onToggleWriting,
  onToggleTypewriter,
  onToggleLaser,
  onOpenTheme,
  onNew,
  onSave,
  onSaveCloud,
  cloudSaving,
  cloudSavedAt,
  onExportMarkdown,
  onShare,
  onShowHelp,
  readOnly = false,
  shortcutKeys,
}: SidebarProps) {
  const palette = useMemo(
    () => flattenPalette(buildInsertPalette(shortcutKeys)),
    [shortcutKeys],
  )

  /** 图标按钮的 title 里带上当前键位，用户改过就跟着变 */
  const keyHint = (id: ShortcutId) => {
    const text = shortcutHint(shortcutKeys, id)
    return text ? ` (${text})` : ''
  }

  const activeFlags = useEditorState({
    editor,
    selector: ({ editor }) =>
      palette.map((entry) => entry.item.active?.(editor) ?? false),
  })

  return (
    <aside className="sidebar" data-collapsed={collapsed} aria-label="文档侧栏">
      <div className="sidebar-head">
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          aria-expanded={!collapsed}
          title={`${collapsed ? '展开' : '收起'}侧边栏${keyHint('toggleSidebar')}`}
          onClick={onToggleCollapsed}
        >
          {collapsed ? (
            <PanelLeftOpen size={17} strokeWidth={1.7} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={17} strokeWidth={1.7} aria-hidden="true" />
          )}
        </button>
        {!collapsed && (
          <span className="save-hint">
            {readOnly
              ? '只读分享'
              : cloudSavedAt
                ? `云端已存 ${formatClock(cloudSavedAt)}`
                : '自动保存'}
          </span>
        )}
      </div>

      {!collapsed && (
        <div className="sidebar-title">
          <input
            className="doc-title"
            value={title}
            readOnly={readOnly}
            aria-label="文档标题"
            title={readOnly ? '分享文稿，标题不可修改' : '点击修改文档标题'}
            spellCheck={false}
            onChange={(event) => onTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
        </div>
      )}

      <nav className="sidebar-nav" aria-label="Markdown 插入语法">
        {palette.map((entry, index) => (
          <Fragment key={`${entry.group}-${entry.item.label}`}>
            {index === 0 || palette[index - 1].group !== entry.group ? (
              <p className="sidebar-group-label">{entry.group}</p>
            ) : null}
            <button
              type="button"
              className="sidebar-entry"
              disabled={readOnly}
              title={
                entry.item.hint
                  ? `${entry.item.label} (${entry.item.hint})`
                  : entry.item.label
              }
              onClick={() => entry.item.run(editor)}
            >
              <span className="sidebar-check">
                {activeFlags[index] ? <Check size={13} /> : null}
              </span>
              <span className="sidebar-entry-label">{entry.item.label}</span>
              {entry.item.hint ? (
                <kbd className="sidebar-kbd">{entry.item.hint}</kbd>
              ) : null}
            </button>
          </Fragment>
        ))}
      </nav>

      <div className="sidebar-foot">
        {!readOnly && (
          <>
            <button
              type="button"
              className="icon-btn"
              aria-label="新建文稿"
              title="新建文稿"
              onClick={onNew}
            >
              <FilePlus2 size={17} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="保存草稿"
              title={`保存草稿${keyHint('save')}`}
              onClick={onSave}
            >
              <Save size={17} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="保存到云端"
              aria-busy={cloudSaving}
              title={
                cloudSavedAt
                  ? `保存到云端：已同步 ${formatClock(cloudSavedAt)}，再次保存会覆盖这一篇${keyHint('saveCloud')}`
                  : `保存到云端${keyHint('saveCloud')}`
              }
              onClick={onSaveCloud}
            >
              {cloudSaving ? (
                <Loader2 className="share-spin" size={17} />
              ) : (
                <CloudUpload size={17} />
              )}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="导出 Markdown"
              title="导出 Markdown"
              onClick={onExportMarkdown}
            >
              <Download size={17} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="分享文稿"
              title="分享文稿"
              onClick={onShare}
            >
              <Link2 size={17} />
            </button>
          </>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label="Markdown 源码"
          aria-pressed={sourceOpen}
          title={`Markdown 源码${keyHint('source')}`}
          onClick={onToggleSource}
        >
          <Code2 size={17} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="写作模式"
          title={`写作模式：隐藏侧栏与大纲${keyHint('toggleWriting')}`}
          onClick={onToggleWriting}
        >
          <PenLine size={17} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="专注模式"
          aria-pressed={focusMode}
          title="专注模式"
          onClick={onToggleFocus}
        >
          <Focus size={17} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="打字机模式"
          aria-pressed={typewriterMode}
          title="打字机模式"
          onClick={onToggleTypewriter}
        >
          <TextCursorInput size={17} />
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
          aria-label="快捷键与语法帮助"
          title="快捷键与语法帮助"
          onClick={() => onShowHelp('shortcuts')}
        >
          <CircleHelp size={17} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="激光笔"
          aria-pressed={laserActive}
          title={`激光笔${keyHint('toggleLaser')}`}
          onClick={onToggleLaser}
        >
          <Zap size={17} />
        </button>
      </div>
    </aside>
  )
}
