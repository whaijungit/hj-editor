import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react'
import { PanelBottom, PanelTop } from 'lucide-react'
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
import { useCustomFonts } from './customFonts'
import { useBodyFontLoad } from './useBodyFontLoad'
import { LaserPointer } from './LaserPointer'
import { setMermaidTheme } from './mermaid'
import {
  clearLaserFlashes,
  spawnLaserFlash,
  startTypingReveal,
  stepTypingReveal,
  stopTypingReveal,
  typingCaretPos,
} from './typingReveal'
import {
  buildStandaloneHtml,
  downloadText,
  htmlToMarkdown,
  safeFileName,
} from './markdown'
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
  const [draft] = useState(loadDraft)
  const [title, setTitle] = useState(draft?.title ?? '未命名文稿')
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(loadThemeConfig)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const [themeOpen, setThemeOpen] = useState(false)
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

  const editorRef = useRef<Editor | null>(null)
  const titleRef = useRef(title)
  const dirtyRef = useRef(false)
  const toastTimer = useRef<number | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    content: draft?.html ?? initialContent,
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
    }
    editor.on('update', markDirty)
    return () => {
      editor.off('update', markDirty)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const timer = window.setInterval(() => {
      if (!dirtyRef.current) return
      dirtyRef.current = false
      persist(false)
    }, 1200)

    const handleBeforeUnload = () => persist(false)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      persist(false)
    }
  }, [editor, persist])

  useEffect(() => {
    if (!editor || !sourceOpen) return
    const update = () => setSourceMarkdown(htmlToMarkdown(editor.getHTML()))
    update()
    editor.on('update', update)
    return () => {
      editor.off('update', update)
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

    const updateFocusBlock = () => {
      editor.view.dom
        .querySelectorAll('.is-focus-block')
        .forEach((element) => element.classList.remove('is-focus-block'))
      if (!focusMode) return
      resolveActiveBlock()?.classList.add('is-focus-block')
    }

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
  }, [editor, draft])

  const navigateTo = useCallback((pos: number) => {
    const editor = editorRef.current
    if (!editor) return
    editor.chain().focus().setTextSelection(pos + 1).run()
    const dom = editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const exportMarkdown = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    downloadText(
      `${safeFileName(titleRef.current)}.md`,
      htmlToMarkdown(editor.getHTML()),
      'text/markdown;charset=utf-8',
    )
    notify('Markdown 文件已导出')
  }, [notify])

  const exportHtml = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    downloadText(
      `${safeFileName(titleRef.current)}.html`,
      buildStandaloneHtml(titleRef.current, editor.getHTML()),
      'text/html;charset=utf-8',
    )
    notify('HTML 文件已导出')
  }, [notify])

  const copyMarkdown = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return
    try {
      await navigator.clipboard.writeText(htmlToMarkdown(editor.getHTML()))
      notify('Markdown 已复制到剪贴板')
    } catch {
      notify('浏览器未授权剪贴板，请使用源码面板手动复制')
    }
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
          onSave={() => persist(true)}
          onExportMarkdown={exportMarkdown}
          onExportHtml={exportHtml}
          onCopyMarkdown={copyMarkdown}
          onShowHelp={showHelp}
        />
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
