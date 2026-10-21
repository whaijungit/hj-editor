/**
 * 与 markdown.ts 拆开：导出/下载只用到这两个小工具，
 * 不应该把 turndown / katex 一起拖进首屏。
 */
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
