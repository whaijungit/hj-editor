import type { Editor } from '@tiptap/core'
import { marked } from 'marked'

/** 剪贴板里被包成代码块、但内容其实是 Markdown 的语言标识别名 */
const MARKDOWN_LANGUAGES = new Set(['markdown', 'md', 'mkd', 'gfm'])

/** 出现这些标签说明剪贴板是排好版的富文本，应交给默认粘贴流程 */
const RICH_TAGS =
  'h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote,strong,em,del,a,img,hr,mark'

/** 判断一段纯文本是否值得按 Markdown 解析：至少命中两类语法 */
export function looksLikeMarkdown(text: string): boolean {
  const source = text.trim()
  if (!source) return false

  const patterns = [
    /^#{1,6}\s+\S/m, // 标题
    /^(?:```|~~~)/m, // 围栏代码块
    /^\s*[-*+]\s+\S/m, // 无序列表
    /^\s*\d+[.)]\s+\S/m, // 有序列表
    /^\s*>\s?/m, // 引用
    /^\s*\|.*\|\s*$/m, // 表格
    /^\s*(?:[-*_]\s*){3,}$/m, // 分割线
    /!?\[[^\]]*\]\([^)\s]+\)/, // 链接 / 图片
    /\*\*[^*\n]+\*\*/, // 加粗
    /`[^`\n]+`/, // 行内代码
    /^-\s+\[[ xX]\]/m, // 任务列表
  ]

  let score = 0
  for (const pattern of patterns) {
    if (pattern.test(source)) score += 1
  }
  return score >= 2
}

/**
 * 整篇文档级的 Markdown（标题 + 块级结构 + 空行）。
 * 用于在代码块里粘贴时，仍能识别“整篇 Markdown 被当成代码”的误粘贴。
 */
export function isDocumentMarkdown(text: string): boolean {
  const source = text.replace(/\r\n?/g, '\n')
  if (source.length < 200 || !/\n\s*\n/.test(source)) return false
  return (
    /^#{1,6}\s+\S/m.test(source) &&
    (/^(?:```|~~~)/m.test(source) ||
      /^\s*\|.*\|\s*$/m.test(source) ||
      /^\s*[-*+]\s+\S/m.test(source))
  )
}

function preLanguage(dom: Document): string | null {
  const code = dom.body.querySelector('pre > code')
  const className = code?.getAttribute('class') ?? ''
  const fromClass = /language-([\w-]+)/.exec(className)?.[1]
  if (fromClass) return fromClass.toLowerCase()
  const fromPre = dom.body.querySelector('pre')?.getAttribute('lang')
  return fromPre ? fromPre.toLowerCase() : null
}

/**
 * 从剪贴板里取出应当按 Markdown 解析的文本。
 * - 只有一个 markdown 代码块（GitHub 源码视图、部分编辑器复制）时取其中的原文；
 * - HTML 只是纯文本的外壳（无标题/列表/表格等结构），且文本像 Markdown 时按纯文本解析；
 * - 真正的富文本 HTML 返回 null，保持原有粘贴行为。
 */
export function extractMarkdownFromClipboard(
  html: string,
  text: string,
): string | null {
  const plain = text.replace(/\r\n?/g, '\n')

  if (!html.trim()) {
    return looksLikeMarkdown(plain) ? plain : null
  }

  const dom = new DOMParser().parseFromString(html, 'text/html')
  const language = preLanguage(dom)

  // 明确标注成其它语言的代码块，保持代码块粘贴
  if (language && !MARKDOWN_LANGUAGES.has(language)) return null

  if (language) {
    const source = dom.body.querySelector('pre')?.textContent ?? ''
    return source.trim() ? source : null
  }

  if (dom.body.querySelector(RICH_TAGS)) return null
  return looksLikeMarkdown(plain) ? plain : null
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 把数学公式先换成节点标签，避免 LaTeX 里的 _ * 被当成强调语法。
 * 代码围栏与行内代码不参与替换。
 */
function protectMath(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/)
    .map((part, index) => {
      if (index % 2 === 1) return part
      return part
        .replace(
          /\$\$([\s\S]+?)\$\$/g,
          (_match, latex: string) =>
            `\n\n<div data-type="block-math" data-latex="${escapeAttribute(
              latex.trim(),
            )}"></div>\n\n`,
        )
        .replace(
          /\$([^$\n]+?)\$(?!\$)/g,
          (_match, latex: string) =>
            `<span data-type="inline-math" data-latex="${escapeAttribute(
              latex.trim(),
            )}"></span>`,
        )
    })
    .join('')
}

function wrapListItemContent(dom: Document, item: Element) {
  let paragraph = item.firstElementChild

  if (paragraph?.tagName !== 'P') {
    paragraph = dom.createElement('p')
    Array.from(item.childNodes).forEach((node) => {
      if (node.nodeType === 1 && /^(UL|OL)$/.test((node as Element).tagName)) {
        return
      }
      paragraph!.appendChild(node)
    })
    item.insertBefore(paragraph, item.firstChild)
  }

  // 去掉复选框移除后残留的行首空格
  const first = paragraph.firstChild
  if (first?.nodeType === 3) {
    first.textContent = first.textContent?.replace(/^\s+/, '') ?? ''
  }
}

/** 把 GFM 的 <input type="checkbox"> 列表改写成 Tiptap 任务列表结构 */
function normalizeTaskLists(dom: Document) {
  dom.querySelectorAll('li > input[type="checkbox"]').forEach((input) => {
    const item = input.parentElement
    if (!item) return

    const checked = input.hasAttribute('checked')
    input.remove()
    item.setAttribute('data-type', 'taskItem')
    item.setAttribute('data-checked', checked ? 'true' : 'false')
    wrapListItemContent(dom, item)
    item.parentElement?.setAttribute('data-type', 'taskList')
  })
}

/** 编辑器只支持到四级标题，更深的标题降级显示 */
function normalizeHeadings(dom: Document) {
  dom.querySelectorAll('h5, h6').forEach((heading) => {
    const replacement = dom.createElement('h4')
    replacement.innerHTML = heading.innerHTML
    heading.replaceWith(replacement)
  })
}

/** 清洗外部 HTML：统一标题层级、补齐任务列表结构，供粘贴与文件导入复用 */
export function normalizeIncomingHtml(html: string): string {
  const dom = new DOMParser().parseFromString(html, 'text/html')
  normalizeTaskLists(dom)
  normalizeHeadings(dom)
  return dom.body.innerHTML
}

export function markdownToHtml(markdown: string): string {
  const html = marked.parse(protectMath(markdown.replace(/\r\n?/g, '\n')), {
    async: false,
    gfm: true,
    breaks: false,
  }) as string

  return normalizeIncomingHtml(html)
}

/**
 * 把 Markdown 粘贴成富文本。
 * 返回 false 表示没有处理，继续走编辑器默认粘贴。
 */
export function insertMarkdown(editor: Editor, markdown: string): boolean {
  const html = markdownToHtml(markdown)
  const { state } = editor
  const { $from } = state.selection

  // 代码块里粘贴：调用方已确认要转换（空代码块或整篇 Markdown），整块替换
  if ($from.parent.type.spec.code) {
    editor
      .chain()
      .insertContentAt(
        { from: $from.before($from.depth), to: $from.after($from.depth) },
        html,
      )
      .run()
    return true
  }

  editor.chain().insertContent(html).run()
  return true
}
