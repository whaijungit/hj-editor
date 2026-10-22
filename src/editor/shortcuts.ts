import type { Editor } from '@tiptap/core'
import { formatKey } from './keys'
import {
  insertCodeBlock,
  insertMath,
  insertRule,
  insertTable,
  toggleHighlight,
} from './insertCommands'

/**
 * 正文快捷键的唯一清单一：默认键位、设置面板、侧栏提示和输入「/」的菜单都读这里。
 * 用户改过的键位存在 localStorage，编辑器只按这张表分派，不再散落 if (key === 'b')。
 */

const STORAGE_KEY = 'hj-editor:shortcuts'

const chain = (editor: Editor) => editor.chain().focus()

export type ShortcutContext = {
  editor: Editor
  save: () => void
  saveCloud: () => void
  importFile: () => void
  toggleSource: () => void
  openHelp: () => void
  toggleSidebar: () => void
  toggleWriting: () => void
  toggleLaser: () => void
}

export type ShortcutGroup = '文档' | '文本格式' | '段落' | '插入' | '视图'

export type ShortcutId =
  | 'save'
  | 'saveCloud'
  | 'import'
  | 'source'
  | 'help'
  | 'undo'
  | 'redo'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'highlight'
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'blockquote'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'codeBlock'
  | 'table'
  | 'rule'
  | 'mermaid'
  | 'echarts'
  | 'math'
  | 'mathBlock'
  | 'toggleSidebar'
  | 'toggleWriting'
  | 'toggleLaser'

export type ShortcutDef = {
  id: ShortcutId
  label: string
  group: ShortcutGroup
  defaultKey: string
  /** 只读分享里仍可用的动作（查看类） */
  readonlySafe?: boolean
  /**
   * 在哪儿生效：editor 只在正文编辑器内响应，
   * global 走窗口监听，激光笔、侧栏这类离开编辑器也要能用。
   */
  scope?: 'editor' | 'global'
  run: (ctx: ShortcutContext) => void
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  '文档',
  '文本格式',
  '段落',
  '插入',
  '视图',
]

export const SHORTCUTS: ShortcutDef[] = [
  {
    id: 'save',
    label: '保存草稿',
    group: '文档',
    defaultKey: 'mod+s',
    run: (ctx) => ctx.save(),
  },
  {
    id: 'saveCloud',
    label: '保存到云端',
    group: '文档',
    defaultKey: 'mod+shift+s',
    run: (ctx) => ctx.saveCloud(),
  },
  {
    id: 'import',
    label: '导入文件',
    group: '文档',
    defaultKey: 'mod+o',
    run: (ctx) => ctx.importFile(),
  },
  {
    id: 'source',
    label: 'Markdown 源码',
    group: '文档',
    defaultKey: 'mod+/',
    run: (ctx) => ctx.toggleSource(),
  },
  {
    id: 'help',
    label: '快捷键与语法帮助',
    group: '文档',
    defaultKey: 'mod+shift+/',
    readonlySafe: true,
    run: (ctx) => ctx.openHelp(),
  },
  {
    id: 'undo',
    label: '撤销',
    group: '文档',
    defaultKey: 'mod+z',
    run: (ctx) => ctx.editor.chain().focus().undo().run(),
  },
  {
    id: 'redo',
    label: '重做',
    group: '文档',
    defaultKey: 'mod+shift+z',
    run: (ctx) => ctx.editor.chain().focus().redo().run(),
  },
  {
    id: 'bold',
    label: '加粗',
    group: '文本格式',
    defaultKey: 'mod+b',
    run: (ctx) => chain(ctx.editor).toggleBold().run(),
  },
  {
    id: 'italic',
    label: '斜体',
    group: '文本格式',
    defaultKey: 'mod+i',
    run: (ctx) => chain(ctx.editor).toggleItalic().run(),
  },
  {
    id: 'strike',
    label: '删除线',
    group: '文本格式',
    defaultKey: 'mod+shift+s',
    run: (ctx) => chain(ctx.editor).toggleStrike().run(),
  },
  {
    id: 'code',
    label: '行内代码',
    group: '文本格式',
    defaultKey: 'mod+e',
    run: (ctx) => chain(ctx.editor).toggleCode().run(),
  },
  {
    id: 'highlight',
    label: '高亮',
    group: '文本格式',
    defaultKey: 'mod+alt+h',
    run: (ctx) => toggleHighlight(ctx.editor),
  },
  {
    id: 'paragraph',
    label: '正文',
    group: '段落',
    defaultKey: 'mod+alt+0',
    run: (ctx) => chain(ctx.editor).setParagraph().run(),
  },
  {
    id: 'heading1',
    label: '标题 1',
    group: '段落',
    defaultKey: 'mod+alt+1',
    run: (ctx) => chain(ctx.editor).setHeading({ level: 1 }).run(),
  },
  {
    id: 'heading2',
    label: '标题 2',
    group: '段落',
    defaultKey: 'mod+alt+2',
    run: (ctx) => chain(ctx.editor).setHeading({ level: 2 }).run(),
  },
  {
    id: 'heading3',
    label: '标题 3',
    group: '段落',
    defaultKey: 'mod+alt+3',
    run: (ctx) => chain(ctx.editor).setHeading({ level: 3 }).run(),
  },
  {
    id: 'heading4',
    label: '标题 4',
    group: '段落',
    defaultKey: 'mod+alt+4',
    run: (ctx) => chain(ctx.editor).setHeading({ level: 4 }).run(),
  },
  {
    id: 'blockquote',
    label: '引用',
    group: '段落',
    defaultKey: 'mod+shift+b',
    run: (ctx) => chain(ctx.editor).toggleBlockquote().run(),
  },
  {
    id: 'bulletList',
    label: '无序列表',
    group: '段落',
    defaultKey: 'mod+shift+8',
    run: (ctx) => chain(ctx.editor).toggleBulletList().run(),
  },
  {
    id: 'orderedList',
    label: '有序列表',
    group: '段落',
    defaultKey: 'mod+shift+7',
    run: (ctx) => chain(ctx.editor).toggleOrderedList().run(),
  },
  {
    id: 'taskList',
    label: '任务列表',
    group: '段落',
    defaultKey: 'mod+shift+9',
    run: (ctx) => chain(ctx.editor).toggleTaskList().run(),
  },
  {
    id: 'codeBlock',
    label: '代码块',
    group: '插入',
    defaultKey: 'mod+alt+c',
    run: (ctx) => insertCodeBlock(ctx.editor),
  },
  {
    id: 'table',
    label: '表格 3 × 3',
    group: '插入',
    defaultKey: 'mod+alt+t',
    run: (ctx) => insertTable(ctx.editor),
  },
  {
    id: 'rule',
    label: '分割线',
    group: '插入',
    defaultKey: 'mod+alt+d',
    run: (ctx) => insertRule(ctx.editor),
  },
  {
    id: 'mermaid',
    label: '流程图',
    group: '插入',
    defaultKey: 'mod+alt+g',
    run: (ctx) => insertCodeBlock(ctx.editor, 'mermaid'),
  },
  {
    id: 'echarts',
    label: '数据图表',
    group: '插入',
    defaultKey: 'mod+alt+e',
    run: (ctx) => insertCodeBlock(ctx.editor, 'echarts'),
  },
  {
    id: 'math',
    label: '行内公式',
    group: '插入',
    defaultKey: 'mod+alt+m',
    run: (ctx) => insertMath(ctx.editor, 'inline'),
  },
  {
    id: 'mathBlock',
    label: '块级公式',
    group: '插入',
    defaultKey: 'mod+alt+shift+m',
    run: (ctx) => insertMath(ctx.editor, 'block'),
  },
  {
    id: 'toggleSidebar',
    label: '收起 / 展开侧栏',
    group: '视图',
    defaultKey: 'mod+shift+h',
    scope: 'global',
    run: (ctx) => ctx.toggleSidebar(),
  },
  {
    id: 'toggleWriting',
    label: '写作模式（隐藏侧栏）',
    group: '视图',
    defaultKey: 'mod+shift+.',
    scope: 'global',
    run: (ctx) => ctx.toggleWriting(),
  },
  {
    id: 'toggleLaser',
    label: '激光笔 / 页面批注',
    group: '视图',
    defaultKey: 'mod+shift+l',
    scope: 'global',
    run: (ctx) => ctx.toggleLaser(),
  },
]

export type ShortcutMap = Record<ShortcutId, string>

export function defaultShortcutKeys(): ShortcutMap {
  const map = {} as ShortcutMap
  SHORTCUTS.forEach((item) => {
    map[item.id] = item.defaultKey
  })
  return map
}

export function loadShortcutKeys(): ShortcutMap {
  const map = defaultShortcutKeys()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return map
    const parsed = JSON.parse(raw) as Partial<ShortcutMap>
    SHORTCUTS.forEach((item) => {
      const value = parsed[item.id]
      if (typeof value === 'string') map[item.id] = value
    })
    // 写作模式的默认键调整过几次，存着旧默认值的用户跟着一起迁移
    const writingMigrations: Partial<Record<string, string>> = {
      'mod+alt+w': 'mod+shift+.',
      'mod+.': 'mod+shift+.',
    }
    map.toggleWriting = writingMigrations[map.toggleWriting] ?? map.toggleWriting
  } catch {
    // 损坏的配置直接回退默认值
  }
  return map
}

export function saveShortcutKeys(keys: ShortcutMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
  } catch {
    // 隐私模式下写不进去也不影响本次会话
  }
}

/** 按事件转换出的键位串找动作；空键位表示该项被用户清空 */
export function resolveShortcut(
  keys: ShortcutMap,
  combo: string,
  scope: 'editor' | 'global' = 'editor',
): ShortcutDef | null {
  if (!combo) return null
  return (
    SHORTCUTS.find(
      (item) => (item.scope ?? 'editor') === scope && keys[item.id] === combo,
    ) ?? null
  )
}

/** 这个组合是不是某个动作的旧默认键：用户改过键位后，内置键位不该继续生效 */
export function isRetiredDefault(keys: ShortcutMap, combo: string): boolean {
  return SHORTCUTS.some(
    (item) =>
      (item.scope ?? 'editor') === 'editor' &&
      item.defaultKey === combo &&
      keys[item.id] !== combo,
  )
}

export function findShortcutConflict(
  keys: ShortcutMap,
  id: ShortcutId,
  combo: string,
): ShortcutDef | null {
  if (!combo) return null
  return (
    SHORTCUTS.find((item) => item.id !== id && keys[item.id] === combo) ?? null
  )
}

/** 给侧栏、菜单用的提示文案：没设就返回 undefined，省得显示「未设置」 */
export function shortcutHint(
  keys: ShortcutMap,
  id: ShortcutId,
): string | undefined {
  const combo = keys[id]
  return combo ? formatKey(combo) : undefined
}
