/**
 * 文件预览：在编辑器里直接看 docx / xlsx / pptx / pdf / 压缩包等文件，不用先导入。
 * 预览器（@file-viewer/react-full）体积较大，等真正打开时才动态加载。
 */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { FileSearch, FolderOpen, Link2, Loader2, Upload, X } from 'lucide-react'
import type { ViewerOptions, ViewerState } from '@file-viewer/react-full'
import './filePreview.css'

const LazyFileViewer = lazy(async () => {
  const module = await import('@file-viewer/react-full')
  return { default: module.FileViewer }
})

type PreviewSource =
  | { kind: 'file'; file: File; name: string }
  | { kind: 'url'; url: string; name: string }

export type FilePreviewProps = {
  open: boolean
  theme: 'light' | 'dark'
  onClose: () => void
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '文件解析失败，换一个文件或换一种格式试试'
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function FilePreview({ open, theme, onClose }: FilePreviewProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<PreviewSource | null>(null)
  const [urlDraft, setUrlDraft] = useState('')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 关掉就清干净，下次打开不残留上一个文件
  useEffect(() => {
    if (open) return
    setSource(null)
    setUrlDraft('')
    setDragging(false)
    setLoading(false)
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const viewerOptions = useMemo<ViewerOptions>(
    () => ({ theme, toolbar: { position: 'bottom-right' } }),
    [theme],
  )

  const handleStateChange = useCallback((state: ViewerState) => {
    setLoading(state.loading)
    setError(state.error ? describeError(state.error) : null)
  }, [])

  const openFile = (file: File) => {
    setError(null)
    setLoading(false)
    setSource({ kind: 'file', file, name: file.name })
  }

  const openUrl = (event: FormEvent) => {
    event.preventDefault()
    const url = urlDraft.trim()
    if (!url) return
    setError(null)
    setLoading(false)
    setSource({
      kind: 'url',
      url,
      name: decodeURIComponent(url.split('/').pop() || url),
    })
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) openFile(file)
  }

  if (!open) return null

  const viewerProps =
    source?.kind === 'file'
      ? { file: source.file, name: source.name }
      : source?.kind === 'url'
        ? { url: source.url, name: source.name }
        : null

  return createPortal(
    <div
      className="file-preview-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="file-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="文件预览"
      >
        <header className="file-preview-head">
          <span className="file-preview-title">
            <FileSearch size={16} aria-hidden="true" />
            <span>{source?.name ?? '文件预览'}</span>
            {source?.kind === 'file' && (
              <em>{formatSize(source.file.size)}</em>
            )}
          </span>
          <div className="file-preview-tools">
            <button type="button" className="file-preview-btn" onClick={() => inputRef.current?.click()}>
              <FolderOpen size={15} aria-hidden="true" />
              打开文件
            </button>
            <button
              type="button"
              className="file-preview-icon"
              aria-label="关闭文件预览"
              onClick={onClose}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div
          className={`file-preview-body${dragging ? ' is-dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          {source && viewerProps ? (
            <Suspense
              fallback={
                <div className="file-preview-status">
                  <Loader2 className="file-preview-spin" size={18} aria-hidden="true" />
                  正在加载预览器…
                </div>
              }
            >
              <LazyFileViewer
                key={source.kind === 'file' ? `${source.name}:${source.file.lastModified}` : source.url}
                {...viewerProps}
                options={viewerOptions}
                onStateChange={handleStateChange}
              />
            </Suspense>
          ) : (
            <div className="file-preview-empty">
              <Upload size={26} strokeWidth={1.5} aria-hidden="true" />
              <p>把文件拖到这里，或在下方选择文件</p>
              <p className="file-preview-formats">
                支持 Word、Excel、PowerPoint、PDF、Markdown、图片、压缩包等常见格式
              </p>
              <button type="button" className="file-preview-primary" onClick={() => inputRef.current?.click()}>
                <FolderOpen size={15} aria-hidden="true" />
                选择本地文件
              </button>
              <form className="file-preview-url" onSubmit={openUrl}>
                <Link2 size={14} aria-hidden="true" />
                <input
                  value={urlDraft}
                  onChange={(event) => setUrlDraft(event.target.value)}
                  placeholder="或粘贴文件链接 https://…"
                  spellCheck={false}
                  aria-label="文件链接"
                />
                <button type="submit" disabled={!urlDraft.trim()}>
                  预览
                </button>
              </form>
            </div>
          )}

          {source && loading && (
            <div className="file-preview-status">
              <Loader2 className="file-preview-spin" size={18} aria-hidden="true" />
              正在解析文件…
            </div>
          )}
          {source && error && !loading && (
            <div className="file-preview-status is-error">{error}</div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) openFile(file)
            event.target.value = ''
          }}
        />
      </section>
    </div>,
    document.body,
  )
}
