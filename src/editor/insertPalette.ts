import type { Editor } from '@tiptap/core'
import {
  insertCodeBlock,
  insertMath,
  insertRule,
  insertTable,
  toggleHighlight,
} from './insertCommands'
import {
  defaultShortcutKeys,
  shortcutHint,
  type ShortcutId,
  type ShortcutMap,
} from './shortcuts'

/**
 * Markdown 插入语法的唯一清单：侧栏速查表和输入「/」弹出的菜单共用这一份，
 * 改一处两边同步，不会出现菜单写了但按不出来、或者反过来。
 *
 * 每项带上对应的快捷键 id，键位提示从用户的快捷键配置里读，
 * 用户把加粗改成 Ctrl Shift B，这里跟着变。
 */

export type PaletteItem = {
  label: string
  /** 对应 shortcuts.ts 里的动作；设置改过键位后提示自动更新 */
  shortcutId?: ShortcutId
  /** 已翻译好的键位文案，没设置就不显示 */
  hint?: string
  /** 搜索别名：英文、拼音首字母都行 */
  keywords?: string[]
  /** 光标处是否已处于该格式，侧栏用来打勾 */
  active?: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

export type PaletteGroup = { label: string; items: PaletteItem[] }

export type PaletteEntry = { group: string; item: PaletteItem }

const chain = (editor: Editor) => editor.chain().focus()

const DEFAULT_KEYS = defaultShortcutKeys()

export function buildInsertPalette(
  keys: ShortcutMap = DEFAULT_KEYS,
): PaletteGroup[] {
  const hint = (id: ShortcutId) => shortcutHint(keys, id)

  return [
    {
      label: '文本格式',
      items: [
        {
          label: '加粗',
          shortcutId: 'bold',
          hint: hint('bold'),
          keywords: ['bold', 'jc'],
          active: (editor) => editor.isActive('bold'),
          run: (editor) => chain(editor).toggleBold().run(),
        },
        {
          label: '斜体',
          shortcutId: 'italic',
          hint: hint('italic'),
          keywords: ['italic', 'xt'],
          active: (editor) => editor.isActive('italic'),
          run: (editor) => chain(editor).toggleItalic().run(),
        },
        {
          label: '删除线',
          shortcutId: 'strike',
          hint: hint('strike'),
          keywords: ['strike', 'scx'],
          active: (editor) => editor.isActive('strike'),
          run: (editor) => chain(editor).toggleStrike().run(),
        },
        {
          label: '行内代码',
          shortcutId: 'code',
          hint: hint('code'),
          keywords: ['code', 'hn dm'],
          active: (editor) => editor.isActive('code'),
          run: (editor) => chain(editor).toggleCode().run(),
        },
        {
          label: '高亮',
          shortcutId: 'highlight',
          hint: hint('highlight'),
          keywords: ['highlight', 'mark', 'gl'],
          active: (editor) => editor.isActive('highlight'),
          run: (editor) => toggleHighlight(editor),
        },
      ],
    },
    {
      label: '段落',
      items: [
        {
          label: '正文',
          shortcutId: 'paragraph',
          hint: hint('paragraph'),
          keywords: ['paragraph', 'text', 'zw'],
          active: (editor) => editor.isActive('paragraph'),
          run: (editor) => chain(editor).setParagraph().run(),
        },
        ...[1, 2, 3, 4].map<PaletteItem>((level) => {
          const id = `heading${level}` as ShortcutId
          return {
            label: `标题 ${level}`,
            shortcutId: id,
            hint: hint(id),
            keywords: [`h${level}`, `bt${level}`],
            active: (editor) => editor.isActive('heading', { level }),
            run: (editor) =>
              chain(editor)
                .setHeading({ level: level as 1 | 2 | 3 | 4 })
                .run(),
          }
        }),
        {
          label: '引用',
          shortcutId: 'blockquote',
          hint: hint('blockquote'),
          keywords: ['quote', 'yy'],
          active: (editor) => editor.isActive('blockquote'),
          run: (editor) => chain(editor).toggleBlockquote().run(),
        },
        {
          label: '无序列表',
          shortcutId: 'bulletList',
          hint: hint('bulletList'),
          keywords: ['bullet', 'ul', 'wxlb'],
          active: (editor) => editor.isActive('bulletList'),
          run: (editor) => chain(editor).toggleBulletList().run(),
        },
        {
          label: '有序列表',
          shortcutId: 'orderedList',
          hint: hint('orderedList'),
          keywords: ['ordered', 'ol', 'yxlb'],
          active: (editor) => editor.isActive('orderedList'),
          run: (editor) => chain(editor).toggleOrderedList().run(),
        },
        {
          label: '任务列表',
          shortcutId: 'taskList',
          hint: hint('taskList'),
          keywords: ['task', 'todo', 'rwlb'],
          active: (editor) => editor.isActive('taskList'),
          run: (editor) => chain(editor).toggleTaskList().run(),
        },
      ],
    },
    {
      label: '插入',
      items: [
        {
          label: '代码块',
          shortcutId: 'codeBlock',
          hint: hint('codeBlock'),
          keywords: ['code block', 'dmk'],
          active: (editor) => editor.isActive('codeBlock'),
          run: (editor) => insertCodeBlock(editor),
        },
        {
          label: '表格 3 × 3',
          shortcutId: 'table',
          hint: hint('table'),
          keywords: ['table', 'bg'],
          active: (editor) => editor.isActive('table'),
          run: (editor) => insertTable(editor),
        },
        {
          label: '分割线',
          shortcutId: 'rule',
          hint: hint('rule'),
          keywords: ['hr', 'divider', 'fgx'],
          run: (editor) => insertRule(editor),
        },
        {
          label: '流程图',
          shortcutId: 'mermaid',
          hint: hint('mermaid'),
          keywords: ['mermaid', 'diagram', 'lct'],
          run: (editor) => insertCodeBlock(editor, 'mermaid'),
        },
        {
          label: '数据图表',
          shortcutId: 'echarts',
          hint: hint('echarts'),
          keywords: ['echarts', 'chart', 'sj tb'],
          run: (editor) => insertCodeBlock(editor, 'echarts'),
        },
        {
          label: '行内公式',
          shortcutId: 'math',
          hint: hint('math'),
          keywords: ['math', 'latex', 'hngs'],
          run: (editor) => insertMath(editor, 'inline'),
        },
        {
          label: '块级公式',
          shortcutId: 'mathBlock',
          hint: hint('mathBlock'),
          keywords: ['math block', 'latex', 'kjgs'],
          run: (editor) => insertMath(editor, 'block'),
        },
      ],
    },
  ]
}

/** 拍平成「分组 + 项」，方阵里好算键盘上下移动 */
export function flattenPalette(groups: PaletteGroup[]): PaletteEntry[] {
  return groups.flatMap((group) =>
    group.items.map((item) => ({ group: group.label, item })),
  )
}

/** 输入「/」后按输入内容过滤；空查询返回全部 */
export function filterPalette(
  groups: PaletteGroup[],
  query: string,
): PaletteGroup[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return groups

  return groups
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) =>
        [item.label, item.hint ?? '', ...(item.keywords ?? [])].some((text) =>
          text.toLowerCase().includes(keyword),
        ),
      ),
    }))
    .filter((group) => group.items.length > 0)
}
