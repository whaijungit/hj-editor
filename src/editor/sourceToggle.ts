import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection, type EditorState } from '@tiptap/pm/state'
import { Decoration, type EditorView } from '@tiptap/pm/view'

/**
 * echarts / mermaid 共用的「收起源码」逻辑。
 * 开关状态存在代码块节点的 `hideSource` 属性上（见 extensions.ts），
 * 这里只管视图层：隐藏用装饰加类，切换只改节点属性，代码内容一个字都不动。
 */

/** 切换显隐后要让各插件立刻重算装饰，不用等防抖重建 */
export const toggleSourceKey = 'diagram-toggle-source'
/** 被收起源码的块加这个类，正文里只剩图表 */
const HIDDEN_SOURCE_CLASS = 'is-code-source-hidden'

export type DiagramLanguageMatcher = (language: string | null | undefined) => boolean

export function isSourceHidden(node: ProseMirrorNode): boolean {
  return node.attrs.hideSource === true
}

/**
 * 光标停在被隐藏的图表块里时，把源码临时露出来——
 * 否则在看不见的地方打字，看着像「打不出字」。
 */
export function revealedSourceAt(
  state: EditorState,
  matches: DiagramLanguageMatcher,
): number | null {
  const $from = state.doc.resolve(state.selection.from)
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name !== 'codeBlock') continue
    if (!matches(node.attrs.language as string | null)) return null
    return isSourceHidden(node) ? $from.before(depth) : null
  }
  return null
}

/** 收起状态下给代码块套的装饰，`revealed` 的块不加，好让用户看见光标 */
export function hiddenSourceDecoration(pos: number, size: number): Decoration {
  return Decoration.node(pos, pos + size, { class: HIDDEN_SOURCE_CLASS })
}

/** 收起/展开源码。只改节点属性，代码内容本身不动 */
export function toggleSource(view: EditorView, end: number | undefined) {
  if (end === undefined) return
  const before = view.state.doc.resolve(end).nodeBefore
  if (!before || before.type.name !== 'codeBlock') return

  const start = end - before.nodeSize
  const hiding = !isSourceHidden(before)
  const transaction = view.state.tr.setNodeMarkup(start, undefined, {
    ...before.attrs,
    hideSource: hiding,
  })

  // 光标还在块里时先挪出去，否则「临时露出」会立刻把刚收起的源码又显回来
  const { from } = view.state.selection
  if (hiding && from > start && from < end) {
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(end), 1))
  }

  transaction.setMeta(toggleSourceKey, true)
  view.dispatch(transaction)
}

/** 图表右上角的「隐藏代码 / 显示代码」开关，平时淡着，指上去才清楚 */
export function buildSourceToggle(
  view: EditorView,
  getPos: () => number | undefined,
  hidden: boolean,
): HTMLElement {
  const toolbar = document.createElement('div')
  toolbar.className = 'code-source-toolbar'
  toolbar.contentEditable = 'false'

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'code-source-toggle'
  toggle.dataset.hidden = String(hidden)
  toggle.textContent = hidden ? '显示代码' : '隐藏代码'
  toggle.title = hidden
    ? '把这段图表源码放回正文'
    : '收起图表源码，只保留图表（导出的文档里代码照旧保留）'
  toggle.addEventListener('mousedown', (event) => event.preventDefault())
  toggle.addEventListener('click', (event) => {
    event.preventDefault()
    toggleSource(view, getPos())
  })

  toolbar.appendChild(toggle)
  return toolbar
}
