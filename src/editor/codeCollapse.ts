/**
 * 代码块折叠。
 * 折叠只改显示、不动文档，所以 Markdown 源码和导出的 HTML 里永远是完整代码。
 * 实现方式：被折叠的块加 `is-code-collapsed` 类（CSS 限高 + 底部渐隐），
 * 并在块后挂一个常驻的「展开代码」按钮；折叠状态按块位置保存，编辑时随位置映射一起移动。
 */
import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'

/** 不到这么多行就不给折叠按钮：折三行没有意义 */
export const COLLAPSE_MIN_LINES = 8

type CollapseMeta = { pos: number; collapsed: boolean }
type CollapseState = { collapsed: Set<number>; decorations: DecorationSet }

const pluginKey = new PluginKey<CollapseState>('codeCollapse')

function lineCount(node: ProseMirrorNode): number {
  return node.textContent.split('\n').length
}

/** 由代码块结束位置反推起点：widget 的 getPos() 会随编辑变化，现算才不会错位 */
function blockStartAt(state: EditorState, pos: number): number | null {
  const before = state.doc.resolve(pos).nodeBefore
  if (!before || before.type.name !== 'codeBlock') return null
  return pos - before.nodeSize
}

function setCollapsed(view: EditorView, pos: number, collapsed: boolean) {
  const meta: CollapseMeta = { pos, collapsed }
  view.dispatch(view.state.tr.setMeta(pluginKey, meta))
}

export function isCodeCollapsed(state: EditorState, pos: number): boolean {
  return pluginKey.getState(state)?.collapsed.has(pos) ?? false
}

export function toggleCodeCollapse(view: EditorView, pos: number): void {
  setCollapsed(view, pos, !isCodeCollapsed(view.state, pos))
}

/** 折叠后常驻在代码块下方的展开按钮（不依赖光标，滚到别处也能点开） */
function buildToggle(end: number, lines: number): Decoration {
  return Decoration.widget(
    end,
    (view, getPos) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'code-collapse-toggle'
      button.contentEditable = 'false'
      button.title = `展开代码块（共 ${lines} 行）`
      button.textContent = '展开代码'
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', (event) => {
        event.preventDefault()
        const at = getPos()
        if (at === undefined) return
        const start = blockStartAt(view.state, at)
        if (start !== null) setCollapsed(view, start, false)
      })
      return button
    },
    { side: 1, key: 'code-collapse-toggle' },
  )
}

function buildDecorations(doc: ProseMirrorNode, collapsed: Set<number>): DecorationSet {
  if (collapsed.size === 0) return DecorationSet.empty

  const decorations: Decoration[] = []
  for (const pos of collapsed) {
    const node = doc.nodeAt(pos)
    if (!node || node.type.name !== 'codeBlock') continue

    const end = pos + node.nodeSize
    decorations.push(Decoration.node(pos, end, { class: 'is-code-collapsed' }))
    decorations.push(buildToggle(end, lineCount(node)))
  }

  return DecorationSet.create(doc, decorations)
}

export const CodeCollapse = Extension.create({
  name: 'codeCollapse',

  addProseMirrorPlugins() {
    return [
      new Plugin<CollapseState>({
        key: pluginKey,
        state: {
          init: () => ({ collapsed: new Set<number>(), decorations: DecorationSet.empty }),
          apply: (tr, value) => {
            const meta = tr.getMeta(pluginKey) as CollapseMeta | undefined
            if (!tr.docChanged && !meta) return value

            // 位置先跟着文档变化映射一遍，脏数据（块被删掉）在这里自动丢掉
            const collapsed = new Set<number>()
            for (const pos of value.collapsed) {
              const mapped = tr.mapping.mapResult(pos)
              if (!mapped.deleted) collapsed.add(mapped.pos)
            }

            if (meta) {
              const target = tr.mapping.map(meta.pos)
              if (meta.collapsed) collapsed.add(target)
              else collapsed.delete(target)
            }

            return { collapsed, decorations: buildDecorations(tr.doc, collapsed) }
          },
        },
        props: {
          decorations: (state) => pluginKey.getState(state)?.decorations ?? DecorationSet.empty,
          handleDOMEvents: {
            // 点折叠块多半是要改代码：先展开。折叠只裁底部，上方布局不变，落光标不会错行
            mousedown: (view, event) => {
              const target = event.target
              if (!(target instanceof HTMLElement)) return false
              const pre = target.closest('pre.is-code-collapsed')
              if (!(pre instanceof HTMLElement)) return false
              // posAtDOM(pre, 0) 给的是块内容起点（块起点 + 1），要退回到块本身
              const $inside = view.state.doc.resolve(view.posAtDOM(pre, 0))
              const start =
                $inside.parent.type.name === 'codeBlock'
                  ? $inside.before($inside.depth)
                  : $inside.pos
              setCollapsed(view, start, false)
              return false
            },
          },
        },
      }),
    ]
  },
})
