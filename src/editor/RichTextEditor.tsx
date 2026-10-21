import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react'
import { Link2, PanelBottom, PanelTop } from 'lucide-react'
import {
  EditorContent,
  useEditor,
  type Editor,
} from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { BubbleToolbar } from './Toolbar'
import { CodeBlockLanguage } from './CodeBlockLanguage'
import { TableToolbar } from './TableToolbar'
import { editorExtensions } from './extensions'
import {
  autoDetectCodeBlocks,
  detectCurrentCodeBlock,
  isUndeterminedLanguage,
} from './codeDetect'
import { initialContent } from './initialContent'
import {
  extractMarkdownFromClipboard,
  insertMarkdown,
  isDocumentMarkdown,
} from './markdownPaste'
import {
  canImportFile,
  IMPORT_FILE_ACCEPT,
  readImportFile,
} from './importFile'
import { TitleBar } from './TitleBar'
import { useIsMobile } from './useIsMobile'
import { OutlineRail } from './OutlineRail'
import { DocResizer } from './DocResizer'
import { StatusBar } from './StatusBar'
import { SourceDrawer } from './SourceDrawer'
import { HelpDialog, type HelpTab } from './HelpDialog'
import { ThemeDialog } from './ThemeDialog'
import { FilePreview } from './FilePreview'
import { ShareDialog } from './ShareDialog'
import {
  fetchSharedDocument,
  publishDocument,
  SHARE_QUERY,
  sharedDocIdFromUrl,
} from './share'
import { useCustomFonts } from './customFonts'
import { useBodyFontLoad } from './useBodyFontLoad'
import { LaserPointer } from './LaserPointer'
import { setMermaidTheme } from './mermaid'
import { setEchartsTheme } from './echarts'
import {
  clearLaserFlashes,
  spawnLaserFlash,
  startTypingReveal,
  stepTypingReveal,
  stopTypingReveal,
  typingCaretPos,
} from './typingReveal'
import { downloadText, safeFileName } from './files'
import { loadMarkdown } from './markdownLoader'
import {
  applyTheme,
  DEFAULT_THEME_CONFIG,
  loadThemeConfig,
  resolveThemeMode,
  saveThemeConfig,
  type ThemeConfig,
} from './theme'
import {
  clearDraft,
  loadChromeVisibility,
  loadDocWidth,
  loadDraft,
  loadDraftAsync,
  saveChromeVisibility,
  saveDocWidth,
  saveDraft,
} from './draft'
import './editor.css'
import './typora.css'

/** 示例文稿的纯文本指纹：只有内容还是这篇示例时才播打字演示 */
const EXAMPLE_TEXT = (() => {
  const template = document.createElement('template')
  template.innerHTML = initialContent
  return (template.content.textContent ?? '').replace(/\s+/g, '')
})()

const TYPEWRITER_CHARS_PER_MS = 0.11
const TYPEWRITER_START_DELAY = 420
/** 激光光束的最小间隔：控制出现密度，避免每个字都在闪光 */
const TYPEWRITER_FLASH_INTERVAL = 90

export function RichTextEditor() {
  // 同步快照保证首屏不闪；正式草稿在 IndexedDB 里，异步补齐
  const [draft, setDraft] = useState(loadDraft)
  const [hydrated, setHydrated] = useState(false)
  const [title, setTitle] = useState(draft?.title ?? '未命名文稿')
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(loadThemeConfig)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const [themeOpen, setThemeOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [docWidth, setDocWidth] = useState(loadDocWidth)
  const [focusMode, setFocusMode] = useState(false)
  const [typewriterMode, setTypewriterMode] = useState(false)
  const [typingDemo, setTypingDemo] = useState(false)
  const [laserActive, setLaserActive] = useState(false)
  const [titleBarHidden, setTitleBarHidden] = useState(
    () => !loadChromeVisibility().titleBar,
  )
  const [statusBarHidden, setStatusBarHidden] = useState(
    () => !loadChromeVisibility().statusBar,
  )
  const isMobile = useIsMobile()

  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceMarkdown, setSourceMarkdown] = useState('')
  const [sourceCopied, setSourceCopied] = useState(false)

  const [helpOpen, setHelpOpen] = useState(false)
  const [helpTab, setHelpTab] = useState<HelpTab>('syntax')
  const [toast, setToast] = useState<string | null>(null)

  const [shareOpen, setShareOpen] = useState(false)
  const [sharePublishing, setSharePublishing] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [shareError, setShareError] = useState<string | null>(null)
  const [sharedReadonly, setSharedReadonly] = useState(false)
  const [sharedLoading, setSharedLoading] = useState(false)

  const editorRef = useRef<Editor | null>(null)
  const titleRef = useRef(title)
  const dirtyRef = useRef(false)
  /** 用户是否真的动过键盘 / 粘贴：异步补载草稿时据此决定要不要覆盖现有内容 */
  const userTouchedRef = useRef(false)
  const draftRef = useRef(draft)
  const toastTimer = useRef<number | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** 打开分享链接时固定下来的 id：只读期间既不写本地草稿，也不重新拉取 */
  const sharedIdRef = useRef<string | null>(sharedDocIdFromUrl())
  const sharedReadonlyRef = useRef(false)

  titleRef.current = title

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }, [])

  const persist = useCallback(
    (withToast: boolean) => {
      const editor = editorRef.current
      if (!editor) return
      // 只读分享不落本地草稿：否则打开别人的链接会覆盖自己的文稿
      if (sharedReadonlyRef.current) return
      const html = editor.getHTML()
      saveDraft({ html, title: titleRef.current, updatedAt: Date.now() })
      if (withToast) notify('草稿已保存到浏览器')
    },
    [notify],
  )

  const insertImageFiles = useCallback((files: File[]) => {
    const editor = editorRef.current
    if (!editor) return

    files
      .filter((file) => file.type.startsWith('image/'))
      .forEach((file) => {
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            editor
              .chain()
              .focus()
              .setImage({ src: reader.result, alt: file.name })
              .run()
          }
        }
        reader.readAsDataURL(file)
      })
  }, [])

  const importFile = useCallback(
    async (file: File) => {
      const editor = editorRef.current
      if (!editor) return

      if (!canImportFile(file)) {
        notify('仅支持 Markdown、HTML 或纯文本文件')
        return
      }

      if (
        !editor.isEmpty &&
        !window.confirm(`导入「${file.name}」会覆盖当前文稿，确定继续吗？`)
      ) {
        return
      }

      try {
        const { title: importedTitle, html } = await readImportFile(file)
        editor.commands.setContent(html, { emitUpdate: true })
        // 导入的文稿里常有没标语言的围栏代码块，按内容补齐
        autoDetectCodeBlocks(editor)
        // 从只读分享里导入，等于是明确要接管这篇内容，恢复编辑能力
        sharedReadonlyRef.current = false
        setSharedReadonly(false)
        editor.setEditable(true)
        setTitle(importedTitle)
        dirtyRef.current = true
        notify(`已导入 ${file.name}`)
      } catch {
        notify('文件读取失败，请确认文件格式正确')
      }
    },
    [notify],
  )

  const openImportPicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImportChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) void importFile(file)
    },
    [importFile],
  )

  const editor = useEditor({
    extensions: editorExtensions,
    // 分享模式先留空，等接口返回直接铺内容，避免自己的草稿闪一下
    content: sharedIdRef.current ? '<p></p>' : (draft?.html ?? initialContent),
    editorProps: {
      attributes: {
        class: 'tiptap-content',
        spellcheck: 'false',
      },
      handlePaste: (_view, event) => {
        const clipboard = event.clipboardData
        if (!clipboard) return false

        const files = Array.from(clipboard.files ?? [])
        if (files.some((file) => file.type.startsWith('image/'))) {
          event.preventDefault()
          insertImageFiles(files)
          return true
        }

        // Shift + 粘贴保留纯文本原文，跳过 Markdown 智能解析
        if ((event as ClipboardEvent & { shiftKey?: boolean }).shiftKey) {
          return false
        }

        // 往没标语言的代码块里粘贴代码：交给默认粘贴，粘贴完再按内容补语言
        const activeEditor = editorRef.current
        if (activeEditor) {
          const { $from } = activeEditor.state.selection
          if (
            $from.parent.type.spec.code &&
            isUndeterminedLanguage($from.parent.attrs.language)
          ) {
            window.requestAnimationFrame(() => {
              detectCurrentCodeBlock(activeEditor)
            })
          }
        }

        const markdown = extractMarkdownFromClipboard(
          clipboard.getData('text/html'),
          clipboard.getData('text/plain'),
        )
        const current = editorRef.current
        if (!markdown || !current) return false

        // 代码块里粘贴代码仍走默认逻辑；空代码块或整篇 Markdown 才整体替换
        const { $from } = current.state.selection
        if (
          $from.parent.type.spec.code &&
          $from.parent.content.size > 0 &&
          !isDocumentMarkdown(markdown)
        ) {
          return false
        }


        event.preventDefault()
        insertMarkdown(current, markdown)
        return true
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (!files.length) return false

        const images = files.filter((file) => file.type.startsWith('image/'))
        if (images.length) {
          event.preventDefault()
          const coords = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })
          const current = editorRef.current
          if (coords && current) {
            current.chain().focus().setTextSelection(coords.pos).run()
          }
          insertImageFiles(images)
          return true
        }

        // 拖入 Markdown / HTML / 文本文件时直接导入
        const importable = files.find(canImportFile)
        if (!importable) return false
        event.preventDefault()
        void importFile(importable)
        return true
      },
      handleKeyDown: (_view, event) => {
        const mod = event.metaKey || event.ctrlKey
        if (!mod) return false

        if (event.key.toLowerCase() === 's') {
          event.preventDefault()
          persist(true)
          return true
        }
        if (event.key.toLowerCase() === 'o') {
          event.preventDefault()
          openImportPicker()
          return true
        }
        if (event.key === '/') {
          event.preventDefault()
          setSourceOpen((value) => !value)
          return true
        }
        return false
      },
    },
  })

  if (editor) editorRef.current = editor

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  // 首屏用的是 localStorage 快照；IndexedDB 里的分片草稿更完整，异步补齐
  useEffect(() => {
    // 分享链接优先：不把本地草稿盖到分享文稿上
    if (sharedIdRef.current) {
      setHydrated(true)
      return
    }

    let alive = true
    void loadDraftAsync().then((stored) => {
      if (!alive) return
      if (!stored) {
        setHydrated(true)
        return
      }

      const snapshot = draftRef.current
      if (snapshot && snapshot.updatedAt >= stored.updatedAt) {
        setHydrated(true)
        return
      }

      if (!snapshot) setTitle(stored.title)

      const target = editorRef.current
      // 用户已经开始打字就不覆盖，避免刚输入的内容被异步结果冲掉
      if (target && !userTouchedRef.current && target.getHTML() !== stored.html) {
        target.commands.setContent(stored.html, { emitUpdate: false })
      }

      setDraft(stored)
      setHydrated(true)
    })
    return () => {
      alive = false
    }
  }, [])

  // 带 ?doc= 打开时拉取分享文稿，以只读方式呈现，避免误改后覆盖本地草稿
  useEffect(() => {
    const id = sharedIdRef.current
    if (!id) return

    let alive = true
    setSharedLoading(true)
    void fetchSharedDocument(id)
      .then((doc) => {
        if (!alive) return
        const target = editorRef.current
        if (!target) return
        target.commands.setContent(doc.html, { emitUpdate: false })
        target.setEditable(false)
        sharedReadonlyRef.current = true
        setSharedReadonly(true)
        setTitle(doc.title)
      })
      .catch(async (error: unknown) => {
        if (!alive) return
        notify(error instanceof Error ? error.message : '分享文稿加载失败')
        // 分享失效时退回本地草稿，别让页面一直空着
        sharedIdRef.current = null
        const url = new URL(window.location.href)
        url.searchParams.delete(SHARE_QUERY)
        window.history.replaceState(null, '', url.toString())
        const stored = await loadDraftAsync()
        if (!alive) return
        const target = editorRef.current
        if (target && stored) {
          target.commands.setContent(stored.html, { emitUpdate: false })
          setTitle(stored.title)
        }
      })
      .finally(() => {
        if (alive) setSharedLoading(false)
      })

    return () => {
      alive = false
    }
  }, [notify])

  const resolvedTheme = resolveThemeMode(themeConfig, systemDark)
  const { status: fontStatus, retry: retryFont } = useBodyFontLoad(
    themeConfig.bodyFont,
  )
  // 导入字体从 IndexedDB 读回后，字体栈需要重新落到 :root 上
  const customFontMetas = useCustomFonts()

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) =>
      setSystemDark(event.matches)

    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    applyTheme(themeConfig, resolvedTheme)
    // 图表的配色跟随主题，切换后需要重画
    setMermaidTheme(resolvedTheme)
    setEchartsTheme(resolvedTheme)
    saveThemeConfig(themeConfig)
    // customFontMetas 变化意味着导入字体列表就绪，需要重新解析字体栈
  }, [themeConfig, resolvedTheme, customFontMetas])

  useEffect(() => {
    saveChromeVisibility({
      titleBar: !titleBarHidden,
      statusBar: !statusBarHidden,
    })
  }, [titleBarHidden, statusBarHidden])

  // 标题栏与状态栏都隐藏时再按快捷键恢复，否则一次性收起两者
  const chromeHidden = titleBarHidden && statusBarHidden
  const toggleChrome = useCallback(() => {
    const next = !chromeHidden
    setTitleBarHidden(next)
    setStatusBarHidden(next)
  }, [chromeHidden])

  const updateTheme = useCallback((patch: Partial<ThemeConfig>) => {
    setThemeConfig((current) => ({ ...current, ...patch }))
  }, [])

  useEffect(() => {
    const handleViewShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return
      if (event.key.toLowerCase() !== 'h') return
      event.preventDefault()
      toggleChrome()
    }

    window.addEventListener('keydown', handleViewShortcut)
    return () => window.removeEventListener('keydown', handleViewShortcut)
  }, [toggleChrome])

  useEffect(() => {
    const handleLaserShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return
      if (event.key.toLowerCase() !== 'l') return
      event.preventDefault()
      setLaserActive((value) => !value)
    }

    window.addEventListener('keydown', handleLaserShortcut)
    return () => window.removeEventListener('keydown', handleLaserShortcut)
  }, [])

  useEffect(() => {
    dirtyRef.current = true
  }, [title])

  useEffect(() => {
    if (!editor) return
    const markDirty = () => {
      dirtyRef.current = true
      userTouchedRef.current = true
    }
    editor.on('update', markDirty)
    return () => {
      editor.off('update', markDirty)
    }
  }, [editor])

  /**
   * 保存策略：输入停下 900ms 后落盘，整篇序列化（getHTML）放到浏览器空闲时段。
   * 原实现每 1.2s 无条件轮询 + 同步写 localStorage，长文档输入时会被整篇序列化拖慢。
   */
  useEffect(() => {
    if (!editor) return
    const idleWindow = window as unknown as {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number
      cancelIdleCallback?: (handle: number) => void
    }
    let debounceTimer = 0
    let idleHandle = 0
    let disposed = false

    const flush = () => {
      if (disposed || !dirtyRef.current) return
      const run = () => {
        if (disposed || !dirtyRef.current) return
        dirtyRef.current = false
        persist(false)
      }
      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleHandle = idleWindow.requestIdleCallback(run, { timeout: 2000 })
      } else {
        idleHandle = window.setTimeout(run, 200)
      }
    }

    const schedule = () => {
      dirtyRef.current = true
      window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(flush, 900)
    }

    const handleBeforeUnload = () => persist(false)
    window.addEventListener('beforeunload', handleBeforeUnload)
    editor.on('update', schedule)

    return () => {
      disposed = true
      window.clearTimeout(debounceTimer)
      if (typeof idleWindow.cancelIdleCallback === 'function') {
        idleWindow.cancelIdleCallback(idleHandle)
      } else {
        window.clearTimeout(idleHandle)
      }
      editor.off('update', schedule)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      persist(false)
    }
  }, [editor, persist])

  useEffect(() => {
    if (!editor || !sourceOpen) return
    let cancelled = false
    let detach: (() => void) | null = null
    void loadMarkdown().then(({ htmlToMarkdown }) => {
      if (cancelled) return
      const update = () => setSourceMarkdown(htmlToMarkdown(editor.getHTML()))
      update()
      editor.on('update', update)
      detach = () => editor.off('update', update)
    })
    return () => {
      cancelled = true
      detach?.()
    }
  }, [editor, sourceOpen])

  useEffect(() => {
    if (!editor) return

    const resolveActiveBlock = (): HTMLElement | null => {
      const { $from } = editor.state.selection
      const root = editor.view.dom

      if ($from.depth >= 1) {
        const dom = editor.view.nodeDOM($from.before(1))
        if (dom instanceof HTMLElement && dom.parentElement === root) {
          return dom
        }
      }

      const child = root.children[$from.index(0)]
      if (child instanceof HTMLElement) return child

      const { node } = editor.view.domAtPos($from.pos)
      let element = node instanceof HTMLElement ? node : node.parentElement
      while (element && element.parentElement !== root) {
        element = element.parentElement
      }
      return element instanceof HTMLElement ? element : null
    }

    const clearFocusBlocks = () => {
      editor.view.dom
        .querySelectorAll('.is-focus-block')
        .forEach((element) => element.classList.remove('is-focus-block'))
    }

    // 只改动「当前块」这一个元素：长文档里每键都全量 querySelectorAll 是笔冤枉开销
    let activeBlock: HTMLElement | null = null
    const updateFocusBlock = () => {
      const next = focusMode ? resolveActiveBlock() : null
      if (next === activeBlock) return
      activeBlock?.classList.remove('is-focus-block')
      activeBlock = next
      activeBlock?.classList.add('is-focus-block')
    }

    clearFocusBlocks()
    activeBlock = null
    updateFocusBlock()
    editor.on('selectionUpdate', updateFocusBlock)
    editor.on('update', updateFocusBlock)
    return () => {
      editor.off('selectionUpdate', updateFocusBlock)
      editor.off('update', updateFocusBlock)
    }
  }, [editor, focusMode])

  useEffect(() => {
    if (!editor || !typewriterMode) return

    let frame = 0
    const centerCursor = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const coords = editor.view.coordsAtPos(editor.state.selection.from)
        const offset = coords.top - window.innerHeight / 2
        if (Math.abs(offset) > 6) window.scrollBy({ top: offset })
      })
    }

    editor.on('selectionUpdate', centerCursor)
    return () => {
      editor.off('selectionUpdate', centerCursor)
      window.cancelAnimationFrame(frame)
    }
  }, [editor, typewriterMode])

  // 打开页面时把示例文稿逐字敲出来；任意点击 / 按键立即结束
  useEffect(() => {
    if (!editor) return
    // 分享文稿不做打字演示
    if (sharedIdRef.current) return
    // 等 IndexedDB 里的正式草稿到位：否则会先把示例文稿敲一遍，再被真实内容顶掉
    if (!hydrated) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const isExample =
      !draft || editor.getText().replace(/\s+/g, '') === EXAMPLE_TEXT
    if (!isExample) return

    const total = startTypingReveal(editor)
    if (!total) return

    editor.setEditable(false)
    setTypingDemo(true)

    let frame = 0
    let startTimer = 0
    let stopped = false
    let revealed = 0
    let pending = 0
    let last = 0
    let lastFlash = 0

    const finish = () => {
      if (stopped) return
      stopped = true
      if (frame) window.cancelAnimationFrame(frame)
      window.clearTimeout(startTimer)
      window.removeEventListener('pointerdown', onSkip, true)
      window.removeEventListener('keydown', onSkip, true)
      clearLaserFlashes()
      if (!editor.isDestroyed) {
        stopTypingReveal(editor)
        editor.setEditable(true)
      }
      setTypingDemo(false)
    }

    const onSkip = (event: Event) => {
      // 组合快捷键照常生效，只有单纯的点击 / 敲键才结束演示
      if (
        event instanceof KeyboardEvent &&
        (event.metaKey || event.ctrlKey || event.altKey)
      ) {
        return
      }
      finish()
    }

    /** 光标当前在视口里的位置，一次测量同时喂给自动滚动和粒子 */
    const caretCoords = () => {
      const caret = typingCaretPos(editor.state.doc, revealed)
      if (caret === null) return null
      try {
        return editor.view.coordsAtPos(caret)
      } catch {
        // 位置刚好落在文档末尾时可能取不到坐标，忽略即可
        return null
      }
    }

    const tick = (now: number) => {
      if (stopped) return
      pending += Math.min(now - last, 120) * TYPEWRITER_CHARS_PER_MS
      last = now

      const step = Math.floor(pending)
      if (step > 0) {
        pending -= step
        revealed = Math.min(total, revealed + step)
        stepTypingReveal(editor, revealed)

        const coords = caretCoords()
        if (coords) {
          if (now - lastFlash > TYPEWRITER_FLASH_INTERVAL) {
            lastFlash = now
            spawnLaserFlash(
              coords.left + window.scrollX,
              (coords.top + coords.bottom) / 2 + window.scrollY,
            )
          }

          const limit = window.innerHeight * 0.76
          if (coords.bottom > limit) {
            window.scrollBy(0, Math.min(coords.bottom - limit, 140))
          }
        }

        if (revealed >= total) {
          finish()
          return
        }
      }

      frame = window.requestAnimationFrame(tick)
    }

    window.addEventListener('pointerdown', onSkip, true)
    window.addEventListener('keydown', onSkip, true)
    // 先让空白纸露一下面，再开始敲字
    startTimer = window.setTimeout(() => {
      last = performance.now()
      frame = window.requestAnimationFrame(tick)
    }, TYPEWRITER_START_DELAY)

    return finish
  }, [editor, draft, hydrated])

  const navigateTo = useCallback((pos: number) => {
    const editor = editorRef.current
    if (!editor) return
    editor.chain().focus().setTextSelection(pos + 1).run()
    const dom = editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const exportMarkdown = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return
    const { htmlToMarkdown } = await loadMarkdown()
    downloadText(
      `${safeFileName(titleRef.current)}.md`,
      htmlToMarkdown(editor.getHTML()),
      'text/markdown;charset=utf-8',
    )
    notify('Markdown 文件已导出')
  }, [notify])

  const exportHtml = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return
    const { buildStandaloneHtml } = await loadMarkdown()
    const html = await buildStandaloneHtml(
      titleRef.current,
      editor.getHTML(),
      resolvedTheme,
    )
    downloadText(
      `${safeFileName(titleRef.current)}.html`,
      html,
      'text/html;charset=utf-8',
    )
    notify('HTML 文件已导出')
  }, [notify, resolvedTheme])

  const copyMarkdown = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return
    try {
      const { htmlToMarkdown } = await loadMarkdown()
      await navigator.clipboard.writeText(htmlToMarkdown(editor.getHTML()))
      notify('Markdown 已复制到剪贴板')
    } catch {
      notify('浏览器未授权剪贴板，请使用源码面板手动复制')
    }
  }, [notify])

  const publishShare = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return
    setSharePublishing(true)
    setShareError(null)
    setShareUrl('')
    try {
      const url = await publishDocument(titleRef.current, editor.getHTML())
      setShareUrl(url)
      try {
        await navigator.clipboard.writeText(url)
        notify('分享链接已复制')
      } catch {
        notify('链接已生成，可手动复制')
      }
    } catch (error) {
      setShareError(
        error instanceof Error ? error.message : '分享失败，请稍后再试',
      )
    } finally {
      setSharePublishing(false)
    }
  }, [notify])

  const openShare = useCallback(() => {
    setShareOpen(true)
    void publishShare()
  }, [publishShare])

  const copyShareUrl = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      notify('分享链接已复制')
    } catch {
      notify('复制失败，请手动选择链接')
    }
  }, [notify, shareUrl])

  const closeShare = useCallback(() => setShareOpen(false), [])

  /** 只读分享转成本地文稿：恢复编辑、写回草稿，并摘掉地址栏里的 doc 参数 */
  const forkSharedDocument = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    if (
      !window.confirm('会把分享文稿复制为本地草稿，当前草稿将被覆盖。确定继续吗？')
    ) {
      return
    }
    editor.setEditable(true)
    sharedReadonlyRef.current = false
    setSharedReadonly(false)
    dirtyRef.current = true
    const url = new URL(window.location.href)
    url.searchParams.delete(SHARE_QUERY)
    window.history.replaceState(null, '', url.toString())
    notify('已转为本地文稿，修改会自动保存')
  }, [notify])

  const handleSourceCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sourceMarkdown)
      setSourceCopied(true)
      window.setTimeout(() => setSourceCopied(false), 1600)
    } catch {
      notify('复制失败，请手动选择文本')
    }
  }, [notify, sourceMarkdown])

  const newDocument = useCallback(() => {
    if (!window.confirm('新建文稿会清空当前内容，确定继续吗？')) return
    editorRef.current?.commands.clearContent(true)
    // 在只读分享里新建文稿，同样要退出只读状态
    editorRef.current?.setEditable(true)
    sharedReadonlyRef.current = false
    setSharedReadonly(false)
    setTitle('未命名文稿')
    clearDraft()
    dirtyRef.current = false
    notify('已新建文稿')
  }, [notify])

  const showHelp = useCallback((tab: HelpTab) => {
    setHelpTab(tab)
    setHelpOpen(true)
  }, [])

  const closeLaser = useCallback(() => setLaserActive(false), [])

  if (!editor) return null

  return (
    <div
      className="typora-app"
      data-hide-titlebar={titleBarHidden || isMobile}
      data-hide-statusbar={statusBarHidden}
    >
      {(!titleBarHidden || isMobile) && (
        <TitleBar
          editor={editor}
          title={title}
          onTitleChange={setTitle}
          sourceOpen={sourceOpen}
          onToggleSource={() => setSourceOpen((value) => !value)}
          focusMode={focusMode}
          typewriterMode={typewriterMode}
          laserActive={laserActive}
          titleBarHidden={titleBarHidden}
          statusBarHidden={statusBarHidden}
          onToggleFocus={() => setFocusMode((value) => !value)}
          onToggleTypewriter={() => setTypewriterMode((value) => !value)}
          onToggleLaser={() => setLaserActive((value) => !value)}
          onToggleTitleBar={() => setTitleBarHidden((value) => !value)}
          onToggleStatusBar={() => setStatusBarHidden((value) => !value)}
          onToggleChrome={toggleChrome}
          theme={resolvedTheme}
          onToggleTheme={() =>
            updateTheme({ mode: resolvedTheme === 'dark' ? 'light' : 'dark' })
          }
          onOpenTheme={() => setThemeOpen(true)}
          onNew={newDocument}
          onImport={openImportPicker}
          onOpenPreview={() => setPreviewOpen(true)}
          onSave={() => persist(true)}
          onExportMarkdown={exportMarkdown}
          onExportHtml={exportHtml}
          onCopyMarkdown={copyMarkdown}
          onShare={openShare}
          onShowHelp={showHelp}
        />
      )}

      {sharedLoading && (
        <div className="share-banner" role="status">
          正在打开分享文稿…
        </div>
      )}

      {sharedReadonly && !sharedLoading && (
        <div className="share-banner" role="status">
          <span className="share-banner-label">只读分享</span>
          <button type="button" onClick={forkSharedDocument}>
            复制到本地编辑
          </button>
        </div>
      )}

      <div
        className="typora-body"
        style={
          {
            '--doc-width': docWidth === null ? undefined : `${docWidth}px`,
          } as CSSProperties
        }
      >
        <main className="writer">
          <div
            className="writer-page"
            data-focus-mode={focusMode}
            data-typewriter-mode={typewriterMode}
          >
            <EditorContent editor={editor} />
            <CodeBlockLanguage editor={editor} />
            <TableToolbar editor={editor} hidden={laserActive} />
            <DocResizer onResize={setDocWidth} onCommit={saveDocWidth} />
          </div>
        </main>
      </div>

      <OutlineRail editor={editor} onNavigate={navigateTo} hidden={typingDemo} />

      {!statusBarHidden && (
        <StatusBar
          editor={editor}
          focusMode={focusMode}
          typewriterMode={typewriterMode}
          laserActive={laserActive}
          sourceOpen={sourceOpen}
          typing={typingDemo}
        />
      )}

      <BubbleMenu
        editor={editor}
        className="bubble-menu-shell"
        options={{ strategy: 'fixed', placement: 'top', offset: 10 }}
      >
        <BubbleToolbar editor={editor} />
      </BubbleMenu>

      <LaserPointer active={laserActive} onExit={closeLaser} />

      {((titleBarHidden && !isMobile) || statusBarHidden) && (
        <div className="chrome-restore" role="group" aria-label="显示界面元素">
          {titleBarHidden && !isMobile && (
            <button
              type="button"
              title="显示标题栏"
              aria-label="显示标题栏"
              onClick={() => setTitleBarHidden(false)}
            >
              <PanelTop size={14} />
              标题栏
            </button>
          )}
          {statusBarHidden && (
            <button
              type="button"
              title="显示状态栏"
              aria-label="显示状态栏"
              onClick={() => setStatusBarHidden(false)}
            >
              <PanelBottom size={14} />
              状态栏
            </button>
          )}
          <button
            type="button"
            title="分享文稿"
            aria-label="分享文稿"
            onClick={openShare}
          >
            <Link2 size={14} />
            分享
          </button>
        </div>
      )}

      <SourceDrawer
        open={sourceOpen}
        markdown={sourceMarkdown}
        copied={sourceCopied}
        onCopy={handleSourceCopy}
        onClose={() => setSourceOpen(false)}
      />

      <HelpDialog
        open={helpOpen}
        tab={helpTab}
        onTabChange={setHelpTab}
        onClose={() => setHelpOpen(false)}
      />

      <ThemeDialog
        open={themeOpen}
        config={themeConfig}
        fontStatus={fontStatus}
        onChange={updateTheme}
        onReset={() => setThemeConfig(DEFAULT_THEME_CONFIG)}
        onRetryFont={retryFont}
        onClose={() => setThemeOpen(false)}
      />

      <FilePreview
        open={previewOpen}
        theme={resolvedTheme}
        onClose={() => setPreviewOpen(false)}
      />

      <ShareDialog
        open={shareOpen}
        publishing={sharePublishing}
        url={shareUrl}
        error={shareError}
        onCopy={copyShareUrl}
        onRetry={publishShare}
        onClose={closeShare}
      />

      {typingDemo && (
        <div className="typing-hint" role="status">
          打字演示中 · 点击任意处跳过
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={IMPORT_FILE_ACCEPT}
        hidden
        onChange={handleImportChange}
      />
    </div>
  )
}
