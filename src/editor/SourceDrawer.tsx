import { useEffect } from 'react'
import { Check, Copy, X } from 'lucide-react'

export function SourceDrawer({
  open,
  markdown,
  copied,
  onCopy,
  onClose,
}: {
  open: boolean
  markdown: string
  copied: boolean
  onCopy: () => void
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="source-drawer" aria-label="Markdown 源码">
        <header className="source-head">
          <div>
            <p className="source-eyebrow">Markdown</p>
            <h2 className="source-title">源码预览</h2>
          </div>
          <div className="source-actions">
            <button type="button" className="ghost-btn" onClick={onCopy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? '已复制' : '复制'}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="关闭源码面板"
              onClick={onClose}
            >
              <X size={17} />
            </button>
          </div>
        </header>

        <pre className="source-code">
          <code>{markdown}</code>
        </pre>

        <footer className="source-foot">
          实时由编辑器内容转换生成，只读预览。可通过「文件」菜单导出为 .md 文件。
        </footer>
      </aside>
    </>
  )
}
