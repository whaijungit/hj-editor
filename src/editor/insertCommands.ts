import { Extension, type Editor } from '@tiptap/core'
import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'

/**
 * Markdown 插入语法的统一入口：侧边栏清单和快捷键调的是同一批函数，
 * 保证「看到的快捷键」真的能按出同样的结果。
 *
 * 块级插入（表格、分割线、代码块、流程图、图表、块公式）统一顶掉光标所在那一行，
 * 不在原行留残余空行；行内公式这类行内内容仍在光标处插入。
 */

/** 光标所在文本块（段落、标题、代码块…）的范围与父节点 */
function currentBlockRange(editor: Editor) {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (!$from.node(depth).isTextblock) continue
    return {
      from: $from.before(depth),
      to: $from.after(depth),
      depth,
      parent: $from.node(depth - 1),
      index: $from.index(depth - 1),
    }
  }
  return null
}

/**
 * 用新块替换光标所在行；替换不了（例如列表项里塞不进表格）返回 false，
 * 交给调用方退回原来的就地插入。
 */
function replaceCurrentBlock(editor: Editor, node: PMNode): boolean {
  const range = currentBlockRange(editor)
  if (!range) return false
  if (!range.parent.canReplaceWith(range.index, range.index + 1, node.type)) {
    return false
  }

  const { state, view } = editor
  const { tr, schema } = state
  tr.replaceWith(range.from, range.to, node)

  const after = range.from + node.nodeSize
  // 表格可以直接进单元格，代码块本身就是文本块；分割线、块公式是原子块，
  // 后面没有兄弟节点时补一个空段落，否则光标无处落脚
  const canTypeInside = node.isTextblock || node.type.name === 'table'
  if (!canTypeInside) {
    const tail = tr.doc.resolve(Math.min(after, tr.doc.content.size)).nodeAfter
    if (!tail) tr.insert(after, schema.nodes.paragraph.createAndFill()!)
  }

  const target = canTypeInside ? range.from + 1 : Math.min(after, tr.doc.content.size) + 1
  tr.setSelection(TextSelection.near(tr.doc.resolve(target), 1))
  tr.scrollIntoView()
  view.dispatch(tr)
  view.focus()
  return true
}

function createTableNode(schema: Schema, rows = 3, cols = 3): PMNode {
  const cell = (header: boolean) =>
    (header ? schema.nodes.tableHeader : schema.nodes.tableCell).createAndFill()!
  return schema.nodes.table.create(
    null,
    Array.from({ length: rows }, (_, row) =>
      schema.nodes.tableRow.create(
        null,
        Array.from({ length: cols }, () => cell(row === 0)),
      ),
    ),
  )
}

export function toggleHighlight(editor: Editor) {
  if (!editor.isEditable) return
  if (editor.isActive('highlight')) {
    editor.chain().focus().unsetHighlight().run()
    return
  }
  editor.chain().focus().setHighlight({ color: '#fef08a' }).run()
}

/** 表格顶掉当前行 */
export function insertTable(editor: Editor) {
  if (!editor.isEditable) return
  if (replaceCurrentBlock(editor, createTableNode(editor.schema))) return
  editor
    .chain()
    .focus()
    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    .run()
}

/** 分割线顶掉当前行 */
export function insertRule(editor: Editor) {
  if (!editor.isEditable) return
  if (replaceCurrentBlock(editor, editor.schema.nodes.horizontalRule.create())) return
  editor.chain().focus().setHorizontalRule().run()
}

/** 插入空代码块：mermaid / echarts 都靠它起手；language 为空就是普通代码块 */
export function insertCodeBlock(editor: Editor, language = '') {
  if (!editor.isEditable) return
  const node = editor.schema.nodes.codeBlock.create(
    language ? { language } : null,
  )
  if (replaceCurrentBlock(editor, node)) return
  editor
    .chain()
    .focus()
    .setCodeBlock(language ? { language } : undefined)
    .run()
}

export function insertMath(editor: Editor, kind: 'inline' | 'block') {
  if (!editor.isEditable) return
  const latex = window.prompt('输入 LaTeX 公式（留空取消）', '')
  if (!latex?.trim()) return

  // 行内公式是行内内容，替换整行会吃掉文字，仍在光标处插入
  const content = {
    type: kind === 'inline' ? 'inlineMath' : 'blockMath',
    attrs: { latex: latex.trim() },
  }
  if (kind === 'block') {
    const blockMath = editor.schema.nodes.blockMath
    if (blockMath && replaceCurrentBlock(editor, blockMath.create({ latex: latex.trim() }))) {
      return
    }
  }
  editor.chain().focus().insertContent(content).run()
}

/**
 * 只补 StarterKit 没给的键位：加粗、标题、列表、引用这些编辑器自带，
 * 这里注册表格、分割线、图表、公式与高亮。
 */
export const MarkdownInsertShortcuts = Extension.create({
  name: 'markdownInsertShortcuts',

  addKeyboardShortcuts() {
    const { editor } = this
    return {
      'Mod-Alt-h': () => {
        toggleHighlight(editor)
        return true
      },
      'Mod-Alt-t': () => {
        insertTable(editor)
        return true
      },
      'Mod-Alt-d': () => {
        insertRule(editor)
        return true
      },
      'Mod-Alt-g': () => {
        insertCodeBlock(editor, 'mermaid')
        return true
      },
      'Mod-Alt-e': () => {
        insertCodeBlock(editor, 'echarts')
        return true
      },
      'Mod-Alt-m': () => {
        insertMath(editor, 'inline')
        return true
      },
      'Mod-Alt-Shift-m': () => {
        insertMath(editor, 'block')
        return true
      },
    }
  },
})
