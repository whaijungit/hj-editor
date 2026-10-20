import { Color } from '@tiptap/extension-color'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { Highlight } from '@tiptap/extension-highlight'
import { Image } from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableRow } from '@tiptap/extension-table-row'
import { TaskItem } from '@tiptap/extension-task-item'
import { TaskList } from '@tiptap/extension-task-list'
import { TextAlign } from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { StarterKit } from '@tiptap/starter-kit'
import { DEFAULT_CODE_LANGUAGE, lowlight } from './codeLanguages'
import { BlockMath, InlineMath } from './math'
import { MermaidDiagram } from './mermaid'

export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4] },
    // 用带语法高亮的代码块替换 StarterKit 自带的纯文本代码块
    codeBlock: false,
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    },
    dropcursor: { color: '#5b5bd6', width: 2 },
  }),
  CodeBlockLowlight.configure({
    lowlight,
    defaultLanguage: DEFAULT_CODE_LANGUAGE,
    enableTabIndentation: true,
    tabSize: 2,
  }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Image.configure({ inline: false, allowBase64: true }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  Placeholder.configure({
    placeholder: '开始书写… 支持 Markdown 快捷语法，例如 # + 空格 生成标题',
  }),
  InlineMath,
  BlockMath,
  // ```mermaid 代码块下方渲染成图表
  MermaidDiagram,
]
