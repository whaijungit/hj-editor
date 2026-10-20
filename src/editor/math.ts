import {
  InputRule,
  Node,
  mergeAttributes,
  type Editor,
  type NodeViewRenderer,
} from '@tiptap/core'
import { TextSelection, type EditorState } from '@tiptap/pm/state'
import katex from 'katex'
import 'katex/dist/katex.min.css'

const EMPTY_HINT = '点击或双击输入公式'

const KATEX_OPTIONS = {
  throwOnError: false,
  strict: false as const,
  trust: false,
}

function renderLatex(latex: string, displayMode: boolean): string {
  return katex.renderToString(latex, { ...KATEX_OPTIONS, displayMode })
}

/** 打开公式编辑：双击公式弹出 LaTeX 输入框，清空内容即删除 */
function editMathNode(editor: Editor, pos: number, latex: string) {
  const next = window.prompt('编辑 LaTeX 公式（留空删除）', latex)
  if (next === null) return

  const trimmed = next.trim()
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return

  if (!trimmed) {
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run()
    return
  }

  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { latex: trimmed }))
}

function createMathNodeView(kind: 'inline' | 'block'): NodeViewRenderer {
  return ({ node: initialNode, getPos, editor }) => {
    let node = initialNode
    const dom = document.createElement(kind === 'inline' ? 'span' : 'div')
    dom.className = `math-node math-node--${kind}`
    dom.setAttribute('data-type', `${kind}-math`)

    const paint = (latex: string) => {
      dom.setAttribute('data-latex', latex)
      if (!latex.trim()) {
        dom.classList.add('is-empty')
        dom.textContent = EMPTY_HINT
        return
      }
      dom.classList.remove('is-empty')
      dom.innerHTML = renderLatex(latex, kind === 'block')
    }

    paint(node.attrs.latex)

    const handleDoubleClick = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      const pos = getPos()
      if (pos == null) return
      const current = editor.state.doc.nodeAt(pos)
      if (!current) return
      editMathNode(editor, pos, current.attrs.latex as string)
    }

    const handleClick = (event: Event) => {
      if (!dom.classList.contains('is-empty')) return
      event.preventDefault()
      event.stopPropagation()
      const pos = getPos()
      if (pos == null) return
      editMathNode(editor, pos, '')
    }

    dom.addEventListener('dblclick', handleDoubleClick)
    dom.addEventListener('click', handleClick)

    return {
      dom,
      update: (updated) => {
        if (updated.type !== node.type) return false
        node = updated
        if (updated.attrs.latex !== dom.getAttribute('data-latex')) {
          paint(updated.attrs.latex as string)
        }
        return true
      },
      destroy: () => {
        dom.removeEventListener('dblclick', handleDoubleClick)
        dom.removeEventListener('click', handleClick)
      },
    }
  }
}

/** 代码块 / 行内代码里不触发公式转换 */
function isCodeContext(state: EditorState, pos: number) {
  const $pos = state.doc.resolve(pos)
  if ($pos.parent.type.spec.code) return true
  return $pos.marks().some((mark) => mark.type.spec.code)
}

/**
 * 行内公式：输入 $x^2$ 自动转换。
 * 前面的字符是 $ 时不匹配，避免把 $$...$$ 截成行内公式。
 */
function findInlineMath(text: string) {
  const pattern = /\$([^$\n]+?)\$(?!\$)/g
  let match = pattern.exec(text)

  while (match !== null) {
    const precededByDollar = match.index > 0 && text[match.index - 1] === '$'
    if (!precededByDollar) {
      return {
        index: match.index,
        text: match[0],
        data: { latex: match[1].trim() },
      }
    }
    pattern.lastIndex = match.index + 1
    match = pattern.exec(text)
  }

  return null
}

const mathAttributes = {
  latex: {
    default: '',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-latex') ?? '',
    renderHTML: (attributes: { latex?: string }) => ({
      'data-latex': attributes.latex ?? '',
    }),
  },
}

export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return mathAttributes
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-math"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-type': 'inline-math' }),
    ]
  },

  addNodeView() {
    return createMathNodeView('inline')
  },

  addInputRules() {
    return [
      new InputRule({
        find: findInlineMath,
        handler: ({ state, range, match }) => {
          const latex = (match.data as { latex?: string } | undefined)?.latex
          if (!latex || isCodeContext(state, range.from)) return null
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex }))
        },
      }),
    ]
  },
})

export const BlockMath = Node.create({
  name: 'blockMath',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return mathAttributes
  },

  parseHTML() {
    return [{ tag: 'div[data-type="block-math"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'block-math' }),
    ]
  },

  addNodeView() {
    return createMathNodeView('block')
  },

  addKeyboardShortcuts() {
    return {
      // 空行输入 $$ 后回车，进入块级公式
      Enter: () => {
        const { state } = this.editor
        const { $from, empty } = state.selection
        if (!empty) return false
        if (!$from.parent.isTextblock) return false
        if ($from.parent.textContent.trim() !== '$$') return false

        const from = $from.before()
        const to = $from.after()
        const tr = state.tr.replaceWith(from, to, this.type.create({ latex: '' }))
        const after = tr.mapping.map(to)
        tr.insert(after, state.schema.nodes.paragraph.create())
        tr.setSelection(TextSelection.create(tr.doc, after + 1))
        this.editor.view.dispatch(tr.scrollIntoView())

        const pos = after - 1
        editMathNode(this.editor, pos, '')
        return true
      },
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$([^$]+)\$\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1]?.trim()
          if (!latex || isCodeContext(state, range.from)) return null

          const { tr } = state
          const $from = state.doc.resolve(range.from)
          const node = this.type.create({ latex })
          const isWholeBlock =
            $from.parent.isTextblock &&
            range.from === $from.start() &&
            range.to === $from.end() &&
            $from.node(-1).canReplaceWith(
              $from.index(-1),
              $from.indexAfter(-1),
              this.type,
            )

          tr.replaceWith(
            isWholeBlock ? $from.before() : range.from,
            isWholeBlock ? $from.after() : range.to,
            node,
          )
        },
      }),
    ]
  },
})
