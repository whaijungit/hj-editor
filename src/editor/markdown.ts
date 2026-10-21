import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import katex from 'katex'
import { lowlight } from './codeLanguages'
import { isEchartsLanguage, renderEchartsSvg } from './echarts'

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
  // 公式节点是空元素，会走 blankReplacement，在这里还原成 LaTeX 语法
  blankReplacement: (_content, node) => {
    const element = node as HTMLElement & { isBlock?: boolean }
    const type = element.getAttribute?.('data-type')
    const latex = element.getAttribute?.('data-latex')?.trim()
    if (latex && type === 'inline-math') return `$${latex}$`
    if (latex && type === 'block-math') return `\n\n$$\n${latex}\n$$\n\n`
    return element.isBlock ? '\n\n' : ''
  },
})

turndown.use(gfm)

turndown.addRule('underline', {
  filter: 'u',
  replacement: (content) => `<u>${content}</u>`,
})

turndown.addRule('highlight', {
  filter: 'mark',
  replacement: (content, node) => {
    const color = (node as HTMLElement).style.backgroundColor
    return color
      ? `<mark style="background-color: ${color}">${content}</mark>`
      : `<mark>${content}</mark>`
  },
})

turndown.addRule('coloredText', {
  filter: (node) =>
    node.nodeName === 'SPAN' && Boolean((node as HTMLElement).style.color),
  replacement: (content, node) => {
    const color = (node as HTMLElement).style.color
    return `<span style="color: ${color}">${content}</span>`
  },
})

// 保留代码块的语言标识：```ts 而不是裸 ```
turndown.addRule('fencedCodeWithLanguage', {
  filter: (node) => node.nodeName === 'PRE',
  replacement: (_content, node) => {
    const element = node as unknown as HTMLElement
    const code = element.querySelector('code')
    const language = Array.from(code?.classList ?? [])
      .find((name) => name.startsWith('language-'))
      ?.slice('language-'.length)
    const text = (code?.textContent ?? element.textContent ?? '').replace(/\n+$/, '')
    const fence = text.includes('```') ? '````' : '```'
    return `\n\n${fence}${language ?? ''}\n${text}\n${fence}\n\n`
  },
})

export function htmlToMarkdown(html: string): string {
  const markdown = turndown.turndown(html).trimEnd()
  return `${markdown}\n`
}

type HastNode = {
  type: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function hastToHtml(nodes: HastNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return escapeHtml(node.value ?? '')
      const className = node.properties?.className
      const names = Array.isArray(className) ? className.map(String) : []
      const attribute = names.length
        ? ` class="${escapeHtml(names.join(' '))}"`
        : ''
      return `<span${attribute}>${hastToHtml(node.children ?? [])}</span>`
    })
    .join('')
}

/** 把公式节点渲染成 KaTeX 的 HTML，导出的文件离开编辑器也能看到公式 */
function renderMath(html: string): string {
  const parsed = new DOMParser().parseFromString(
    `<div data-export-root>${html}</div>`,
    'text/html',
  )
  const root = parsed.querySelector('[data-export-root]')
  if (!root) return html

  root
    .querySelectorAll('[data-type="inline-math"], [data-type="block-math"]')
    .forEach((element) => {
      const latex = element.getAttribute('data-latex') ?? ''
      if (!latex.trim()) {
        element.remove()
        return
      }
      element.innerHTML = katex.renderToString(latex, {
        displayMode: element.getAttribute('data-type') === 'block-math',
        throwOnError: false,
        strict: false,
      })
    })

  return root.innerHTML
}

/** 给导出的 HTML 补上语法高亮：视图层的 decoration 不会被 getHTML 序列化 */
function highlightCode(html: string): string {
  const parsed = new DOMParser().parseFromString(
    `<div data-export-root>${html}</div>`,
    'text/html',
  )
  const root = parsed.querySelector('[data-export-root]')
  if (!root) return html

  root.querySelectorAll('pre > code').forEach((code) => {
    const language = Array.from(code.classList)
      .find((name) => name.startsWith('language-'))
      ?.slice('language-'.length)

    if (!language || !lowlight.registered(language)) return

    code.innerHTML = hastToHtml(
      lowlight.highlight(language, code.textContent ?? '')
        .children as unknown as HastNode[],
    )
  })

  return root.innerHTML
}

/**
 * 把 ```echarts 代码块渲染成内联 SVG：
 * 导出文件不依赖 CDN、离线打开也能看到图表，尺寸也与编辑时一致。
 */
async function inlineEcharts(html: string, theme: 'light' | 'dark'): Promise<string> {
  const parsed = new DOMParser().parseFromString(
    `<div data-export-root>${html}</div>`,
    'text/html',
  )
  const root = parsed.querySelector('[data-export-root]')
  if (!root) return html

  const blocks = Array.from(root.querySelectorAll('pre > code')).filter((code) => {
    const language = Array.from(code.classList)
      .find((name) => name.startsWith('language-'))
      ?.slice('language-'.length)
    return isEchartsLanguage(language)
  })

  for (const code of blocks) {
    const svg = await renderEchartsSvg(code.textContent ?? '', theme)
    if (!svg) continue
    const figure = parsed.createElement('div')
    figure.className = 'echarts-figure'
    figure.innerHTML = svg
    code.closest('pre')?.after(figure)
  }

  return root.innerHTML
}

export function downloadText(
  filename: string,
  text: string,
  mime = 'text/plain;charset=utf-8',
) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '-').trim()
  return cleaned || '未命名文稿'
}

const EXPORT_STYLES = `
  :root { color-scheme: light; }
  body {
    max-width: 760px;
    margin: 0 auto;
    padding: 56px 24px 96px;
    color: #1f2328;
    background: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
      'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
    font-size: 16.5px;
    line-height: 1.8;
  }
  h1, h2, h3, h4 { line-height: 1.35; margin: 1.6em 0 0.6em; }
  h1 { font-size: 2em; }
  h2 { font-size: 1.5em; }
  h3 { font-size: 1.22em; }
  h4 { font-size: 1.05em; }
  p { margin: 0 0 1em; }
  a { color: #4f46e5; }
  blockquote {
    margin: 1.2em 0;
    padding: 2px 16px;
    border-left: 3px solid #d8dce9;
    color: #57606a;
  }
  code {
    padding: 0.15em 0.4em;
    border-radius: 5px;
    background: #f3f4f7;
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 0.88em;
  }
  pre {
    padding: 16px 18px;
    border-radius: 10px;
    background: #16172a;
    color: #dfe2f5;
    white-space: pre;
    overflow-x: auto;
    word-break: normal;
    overflow-wrap: normal;
    tab-size: 2;
  }
  pre code { padding: 0; background: transparent; color: inherit; }
  pre .hljs-comment, pre .hljs-quote { color: #7f848e; font-style: italic; }
  pre .hljs-keyword, pre .hljs-doctag, pre .hljs-formula, pre .hljs-section,
  pre .hljs-selector-tag, pre .hljs-literal { color: #c678dd; }
  pre .hljs-string, pre .hljs-regexp, pre .hljs-addition, pre .hljs-attribute,
  pre .hljs-meta .hljs-string { color: #98c379; }
  pre .hljs-number, pre .hljs-built_in, pre .hljs-symbol, pre .hljs-bullet,
  pre .hljs-attr, pre .hljs-variable, pre .hljs-template-variable,
  pre .hljs-link { color: #d19a66; }
  pre .hljs-title, pre .hljs-selector-id, pre .hljs-selector-class { color: #61afef; }
  pre .hljs-type, pre .hljs-class .hljs-title { color: #e5c07b; }
  pre .hljs-tag, pre .hljs-name, pre .hljs-selector-pseudo,
  pre .hljs-deletion { color: #e06c75; }
  pre .hljs-meta, pre .hljs-meta .hljs-keyword { color: #56b6c2; }
  pre .hljs-emphasis { font-style: italic; }
  pre .hljs-strong { font-weight: 600; }
  .mermaid-figure {
    display: flex;
    justify-content: center;
    margin: 1.2em 0;
    padding: 18px 16px;
    border: 1px solid #e3e6ef;
    border-radius: 12px;
    overflow-x: auto;
  }
  .mermaid-figure svg { max-width: 100%; height: auto; }
  .echarts-figure {
    margin: 1.2em 0;
    padding: 12px;
    border: 1px solid #e3e6ef;
    border-radius: 12px;
    overflow-x: auto;
  }
  .echarts-figure svg { max-width: 100%; height: auto; }
  img { max-width: 100%; height: auto; border-radius: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 1.2em 0; }
  th, td { padding: 8px 12px; border: 1px solid #dfe2ee; text-align: left; }
  th { background: #f5f6fa; }
  hr { margin: 2em 0; border: 0; border-top: 1px solid #e3e6ef; }
  ul[data-type='taskList'] { list-style: none; padding-left: 0; }
  ul[data-type='taskList'] li { display: flex; align-items: flex-start; gap: 8px; }
  ul[data-type='taskList'] li > label {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 1.8em;
  }
  ul[data-type='taskList'] li > div { flex: 1 1 auto; min-width: 0; }
  ul[data-type='taskList'] li p { margin: 0; }
  ul[data-type='taskList'] li[data-checked='true'] > div { color: #8b93a3; text-decoration: line-through; }
`

export async function buildStandaloneHtml(
  title: string,
  body: string,
  theme: 'light' | 'dark' = 'light',
): Promise<string> {
  const content = await inlineEcharts(highlightCode(renderMath(body)), theme)
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/katex@0.19.0/dist/katex.min.css"
    />
    <style>${EXPORT_STYLES}</style>
  </head>
  <body>
${content}
    <script type="module">
      // 图表按需渲染：没有 mermaid 代码块就不加载这 1MB 的库
      const blocks = [
        ...document.querySelectorAll('pre > code.language-mermaid, pre > code.language-mmd'),
      ]
      if (blocks.length) {
        import('https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.esm.min.mjs')
          .then(async ({ default: mermaid }) => {
            mermaid.initialize({
              startOnLoad: false,
              securityLevel: 'strict',
              theme: 'default',
            })
            for (const [index, code] of blocks.entries()) {
              const figure = document.createElement('div')
              figure.className = 'mermaid-figure'
              const pre = code.closest('pre')
              if (!pre) continue
              pre.after(figure)
              try {
                const { svg } = await mermaid.render(
                  'export-mermaid-' + index,
                  code.textContent || '',
                )
                figure.innerHTML = svg
              } catch {
                // 语法错误就保留代码块本身
                figure.remove()
              }
            }
          })
          .catch(() => {})
      }
    </script>
  </body>
</html>
`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
