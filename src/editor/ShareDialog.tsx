import { useEffect } from 'react'
import { Copy, Link2, Loader2, X } from 'lucide-react'

export type ShareDialogProps = {
  open: boolean
  publishing: boolean
  url: string
  error: string | null
  onCopy: () => void
  onRetry: () => void
  onClose: () => void
}

export function ShareDialog({
  open,
  publishing,
  url,
  error,
  onCopy,
  onRetry,
  onClose,
}: ShareDialogProps) {
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
    <div className="help-backdrop" onClick={onClose}>
      <section
        className="help-dialog share-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="分享文稿"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="help-head">
          <h2 className="share-title">
            <Link2 size={15} aria-hidden="true" />
            分享文稿
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭分享"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="help-body share-body">
          {publishing ? (
            <p className="share-status" role="status">
              <Loader2 className="share-spin" size={15} aria-hidden="true" />
              正在上传文稿，生成分享链接…
            </p>
          ) : error ? (
            <>
              <p className="share-status share-error" role="alert">
                {error}
              </p>
              <button type="button" className="ghost-btn" onClick={onRetry}>
                重试
              </button>
            </>
          ) : url ? (
            <>
              <p className="share-label">
                拿到链接的人都能以只读方式查看这篇文稿。
              </p>
              <div className="share-link-row">
                <input
                  className="share-link"
                  value={url}
                  readOnly
                  aria-label="分享链接"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button type="button" className="share-copy" onClick={onCopy}>
                  <Copy size={14} aria-hidden="true" />
                  复制
                </button>
              </div>
            </>
          ) : null}
        </div>

        <footer className="help-foot">
          文稿保存在 Netlify Blobs 中，不写入部署产物；重新部署或继续修改本地文稿都不会改变已生成的链接。
        </footer>
      </section>
    </div>
  )
}
