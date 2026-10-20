import {
  looksLikeMarkdown,
  markdownToHtml,
  normalizeIncomingHtml,
} from './markdownPaste'

/** 文件选择框可选的扩展名 */
export const IMPORT_FILE_ACCEPT = '.md,.markdown,.mdown,.mkd,.txt,.text,.html,.htm'

const MARKDOWN_EXTENSION = /\.(?:md|markdown|mdown|mkd)$/i
const HTML_EXTENSION = /\.(?:html?|xhtml)$/i
const TEXT_EXTENSION = /\.(?:txt|text)$/i

export type ImportedDocument = {
  title: string
  html: string
}

export function canImportFile(file: File): boolean {
  return (
    MARKDOWN_EXTENSION.test(file.name) ||
    HTML_EXTENSION.test(file.name) ||
    TEXT_EXTENSION.test(file.name)
  )
}

function fileNameToTitle(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim()
  return base || name
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 纯文本按空行分段，段内换行保留为 <br> */
function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** 取 HTML 文件里可编辑的正文，去掉脚本、样式等外部依赖 */
function htmlFileToHtml(source: string): string {
  const dom = new DOMParser().parseFromString(source, 'text/html')
  dom
    .querySelectorAll('script, style, link, meta, title, base')
    .forEach((node) => node.remove())
  return normalizeIncomingHtml(dom.body.innerHTML)
}

/**
 * 读取导入文件并转换成编辑器可解析的 HTML。
 * 支持 Markdown（.md/.markdown/…）、纯文本（.txt）与 HTML 文件。
 */
export async function readImportFile(file: File): Promise<ImportedDocument> {
  const title = fileNameToTitle(file.name)

  if (HTML_EXTENSION.test(file.name)) {
    return { title, html: htmlFileToHtml(await file.text()) }
  }

  const text = (await file.text()).replace(/^\uFEFF/, '')

  if (MARKDOWN_EXTENSION.test(file.name)) {
    return { title, html: markdownToHtml(text) }
  }

  // .txt 交给 Markdown 判断，命中语法就排版，否则按纯文本分段
  return {
    title,
    html: looksLikeMarkdown(text) ? markdownToHtml(text) : plainTextToHtml(text),
  }
}
