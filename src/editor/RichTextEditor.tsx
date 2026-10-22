import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react'
import { PenLine, Zap } from 'lucide-react'
import {
  EditorContent,
  useEditor,
  type Editor,
} from '@tiptap/react'
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
import { Sidebar } from './Sidebar'
import { SlashMenu } from './SlashMenu'
import {
  buildInsertPalette,
  filterPalette,
  flattenPalette,
  type PaletteEntry,
  type PaletteItem,
} from './insertPalette'
import { eventToKey } from './keys'
import {
  defaultShortcutKeys,
  isRetiredDefault,
  loadShortcutKeys,
  resolveShortcut,
  saveShortcutKeys,
  shortcutHint,
  type ShortcutDef,
  type ShortcutMap,
} from './shortcuts'
import { OutlineRail } from './OutlineRail'
import { DocResizer } from './DocResizer'
import { SourceDrawer } from './SourceDrawer'
import { HelpDialog, type HelpTab } from './HelpDialog'
import { ThemeDialog } from './ThemeDialog'
import { ShareDialog } from './ShareDialog'
import {
  clearCloudDocRef,
  fetchSharedDocument,
  loadCloudDocRef,
  saveCloudDocRef,
  saveDocumentToServer,
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
/** 示例文稿超过这个长度就不敲了：几千字敲完要一分多钟，读者只能干等 */
const TYPEWRITER_MAX_CHARS = 3000
const TYPEWRITER_START_DELAY = 420
/** 激光光束的最小间隔：控制出现密度，避免每个字都在闪光 */
const TYPEWRITER_FLASH_INTERVAL = 90

type SlashTrigger = {
  /** 「/」所在位置，选中后从这里开始删 */
  from: number
  /** 光标位置，也是查询串的结尾 */
  to: number
  query: string
  /** 菜单定位用的视口坐标 */
  left: number
  top: number
}

/**
 * 光标前是不是刚敲了「/」：只认行首或空格之后，
 * 查询串不含空白，敲空格 / 换行就等于放弃这次插入。
 */
function readSlashTrigger(editor: Editor): SlashTrigger | null {
  const { selection } = editor.state
  if (!selection.empty) return null

  const { $from } = selection
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null

  // 原子节点（公式等）记成占位符，免得把它们的文本当成查询串
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const match = /(?:^|[\s\u3000])\/([^\s/]{0,20})$/.exec(before)
  if (!match) return null

  const from = $from.pos - match[1].length - 1
  const coords = editor.view.coordsAtPos(from)
  return {
    from,
    to: $from.pos,
    query: match[1],
    left: coords.left,
    top: coords.bottom + 6,
  }
}

/** 先删掉「/查询」，再执行插入：光标落点才正好在插入结果上 */
function applyPaletteItem(
  editor: Editor,
  trigger: { from: number; to: number },
  item: PaletteItem,
) {
  editor.chain().focus().deleteRange({ from: trigger.from, to: trigger.to }).run()
  item.run(editor)
}

type RichTextEditorProps = {
  /** 分享页传入：只读呈现这个 id 的文稿，既不读也不写本地草稿 */
  sharedDocId?: string
  /** 从分享页退回编辑页时要补的一条提示：在编辑页挂载后 toast 一次 */
  notice?: string
  /** 离开分享页：由路由层实现，让 URL 与 router 状态一起切回编辑页 */
  onExitShare?: (notice?: string) => void
}

export function RichTextEditor({
  sharedDocId,
  notice,
  onExitShare,
}: RichTextEditorProps) {
  // 同步快照保证首屏不闪；正式草稿在 IndexedDB 里，异步补齐
  const [draft, setDraft] = useState(loadDraft)
  const [hydrated, setHydrated] = useState(false)
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => !loadChromeVisibility().sidebar,
  )
  /** 写作模式：侧栏、大纲、拖拽手柄全部让出，整页只剩正文 */
  const [writingMode, setWritingMode] = useState(
    () => loadChromeVisibility().writing,
  )

  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceMarkdown, setSourceMarkdown] = useState('')
  const [sourceCopied, setSourceCopied] = useState(false)

  const [helpOpen, setHelpOpen] = useState(false)
  const [helpTab, setHelpTab] = useState<HelpTab>('syntax')
  const [toast, setToast] = useState<string | null>(null)
  /** 光标处的「/」插入菜单；null 表示没打开 */
  const [slashMenu, setSlashMenu] = useState<SlashTrigger | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  /** 正文快捷键：可在帮助面板里改，改了存 localStorage */
  const [shortcutKeys, setShortcutKeys] = useState<ShortcutMap>(loadShortcutKeys)

  const [shareOpen, setShareOpen] = useState(false)
  const [sharePublishing, setSharePublishing] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [shareError, setShareError] = useState<string | null>(null)
  const [cloudSaving, setCloudSaving] = useState(false)
  /** 这篇文稿最近一次存到云端的时间；0 表示还没存过 */
  const [cloudSavedAt, setCloudSavedAt] = useState(
    () => loadCloudDocRef()?.savedAt ?? 0,
  )
  const [sharedReadonly, setSharedReadonly] = useState(false)
  // 分享页一进来就是加载态：先别把编辑入口亮出来
  const [sharedLoading, setSharedLoading] = useState(sharedDocId !== undefined)

  const editorRef = useRef<Editor | null>(null)
  const titleRef = useRef(title)
  const dirtyRef = useRef(false)
  /** 用户是否真的动过键盘 / 粘贴：异步补载草稿时据此决定要不要覆盖现有内容 */
  const userTouchedRef = useRef(false)
  const draftRef = useRef(draft)
  const toastTimer = useRef<number | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** 分享页的路由参数：只读期间既不写本地草稿，也不重新拉取 */
  const sharedIdRef = useRef<string | null>(sharedDocId ?? null)
  const sharedReadonlyRef = useRef(false)
  /** 这篇文稿在云端的 id；null 表示还没存过，第一次保存会新建 */
  const cloudIdRef = useRef<string | null>(loadCloudDocRef()?.id ?? null)
  /** 同步的「保存中」标记：连按快捷键时不要并发上传同一篇 */
  const cloudSavingRef = useRef(false)
  /** 斜杠菜单：ref 给 editorProps.handleKeyDown 读最新值，state 只负责渲染 */
  const slashMenuRef = useRef<SlashTrigger | null>(null)
  const slashItemsRef = useRef<PaletteEntry[]>([])
  const slashIndexRef = useRef(0)
  /** 快捷键表同样走 ref：按键处理在 ProseMirror 里，读不到最新的渲染闭包 */
  const shortcutKeysRef = useRef<ShortcutMap>(shortcutKeys)

  titleRef.current = title

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }, [])

  // 从分享页退回来时带的一次性提示，挂载后播一次就够了
  const noticeShownRef = useRef(false)
  useEffect(() => {
    if (noticeShownRef.current || !notice) return
    noticeShownRef.current = true
    notify(notice)
  }, [notice, notify])

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

  /** 换了一篇文稿：云端指向要跟着断，免得新内容覆盖掉上一篇 */
  const forgetCloudDoc = useCallback(() => {
    cloudIdRef.current = null
    clearCloudDocRef()
    setCloudSavedAt(0)
  }, [])

  /**
   * 保存到服务器（Netlify Blobs）：第一次新建，之后覆盖同一篇，
   * 所以反复保存只会更新内容，链接不变、也不会在云端堆一堆重复文稿。
   */
  const saveToCloud = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return
    if (sharedReadonlyRef.current) {
      notify('分享文稿是只读的，先接管为本地文稿再保存')
      return
    }
    if (cloudSavingRef.current) return

    cloudSavingRef.current = true
    setCloudSaving(true)
    // 第一次保存会生成链接，顺手复制一下；之后只是更新内容，链接没变
    const isFirstSave = cloudIdRef.current === null
    try {
      const saved = await saveDocumentToServer(
        cloudIdRef.current,
        titleRef.current,
        editor.getHTML(),
      )
      cloudIdRef.current = saved.id
      saveCloudDocRef({ id: saved.id, savedAt: saved.updatedAt })
      setCloudSavedAt(saved.updatedAt)

      if (isFirstSave) {
        try {
          await navigator.clipboard.writeText(saved.url)
          notify('已保存到云端，链接已复制')
        } catch {
          notify('已保存到云端')
        }
      } else {
        notify('已保存到云端')
      }
    } catch (error) {
      notify(
        error instanceof Error ? error.message : '保存到云端失败，请稍后再试',
      )
    } finally {
      cloudSavingRef.current = false
      setCloudSaving(false)
    }
  }, [notify])

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
        // 导入的是另一篇文稿：云端保存从新建开始，别覆盖上一篇
        forgetCloudDoc()
        dirtyRef.current = true
        notify(`已导入 ${file.name}`)
      } catch {
        notify('文件读取失败，请确认文件格式正确')
      }
    },
    [forgetCloudDoc, notify],
  )

  const openImportPicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  /** 把快捷键动作接到当前编辑器与界面回调上；依赖都稳定，闭包不会过期 */
  const runShortcut = useCallback(
    (action: ShortcutDef) => {
      const current = editorRef.current
      if (!current) return
      action.run({
        editor: current,
        save: () => persist(true),
        saveCloud: () => void saveToCloud(),
        importFile: openImportPicker,
        toggleSource: () => setSourceOpen((value) => !value),
        openHelp: () => {
          setHelpTab('shortcuts')
          setHelpOpen(true)
        },
        toggleSidebar: () => setSidebarCollapsed((value) => !value),
        toggleWriting: () => setWritingMode((value) => !value),
        toggleLaser: () => setLaserActive((value) => !value),
      })
    },
    [openImportPicker, persist, saveToCloud],
  )

  /** 用户在帮助面板里改了键位：立刻生效，顺手落盘 */
  const applyShortcutKeys = useCallback((next: ShortcutMap) => {
    shortcutKeysRef.current = next
    setShortcutKeys(next)
    saveShortcutKeys(next)
  }, [])

  const resetShortcutKeys = useCallback(() => {
    applyShortcutKeys(defaultShortcutKeys())
    notify('快捷键已恢复默认')
  }, [applyShortcutKeys, notify])

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
    // 一进来就锁住：内容还没到的空档也不该让人打进去
    editable: !sharedIdRef.current,
    editorProps: {
      attributes: {
        class: 'tiptap-content',
        spellcheck: 'false',
      },
      handlePaste: (_view, event) => {
        if (sharedReadonlyRef.current) {
          event.preventDefault()
          return true
        }
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
        if (sharedReadonlyRef.current) {
          event.preventDefault()
          return true
        }
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (!files.length) return false

        const coords = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })
        const images = files.filter((file) => file.type.startsWith('image/'))
        if (images.length) {
          event.preventDefault()
          const current = editorRef.current
          if (coords && current) {
            current.chain().focus().setTextSelection(coords.pos).run()
          }
          insertImageFiles(images)
          return true
        }

        // 拖入 Markdown / HTML / 文本文件时直接导入
        const importable = files.find(canImportFile)
        if (importable) {
          event.preventDefault()
          void importFile(importable)
          return true
        }

        // 其余类型的文件没有对应功能，拖进来直接忽略
        event.preventDefault()
        return true
      },
      handleKeyDown: (_view, event) => {
        // 斜杠菜单开着时，方向键与回车归菜单管：光标别跑，也别把换行插进正文
        if (slashMenuRef.current) {
          const entries = slashItemsRef.current
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (entries.length) {
              event.preventDefault()
              const step = event.key === 'ArrowDown' ? 1 : -1
              const next =
                (slashIndexRef.current + step + entries.length) % entries.length
              slashIndexRef.current = next
              setSlashIndex(next)
            }
            return true
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            const entry = entries[slashIndexRef.current]
            if (!entry) {
              // 没有可选项就当用户放弃了这次插入，回车照常换行
              slashMenuRef.current = null
              setSlashMenu(null)
              return false
            }
            event.preventDefault()
            const current = editorRef.current
            const trigger = slashMenuRef.current
            slashMenuRef.current = null
            setSlashMenu(null)
            if (current && trigger) applyPaletteItem(current, trigger, entry.item)
            return true
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            slashMenuRef.current = null
            setSlashMenu(null)
            return true
          }
        }

        // 输入法组合期间不抢键：确认候选的那些键要留给输入法
        if (event.isComposing) return false

        // 用户自定义的正文快捷键：按配置分派，不再各处 if (key === 'b')
        const combo = eventToKey(event)
        const action = combo
          ? resolveShortcut(shortcutKeysRef.current, combo)
          : null
        if (!action) {
          // 用户把某个动作挪走后，TipTap 内置的旧键位也不该继续生效
          if (combo && isRetiredDefault(shortcutKeysRef.current, combo)) {
            event.preventDefault()
            return true
          }
          return false
        }

        // 只读分享里只留帮助，写入类动作既不执行也不触发浏览器默认行为
        if (sharedReadonlyRef.current && !action.readonlySafe) {
          event.preventDefault()
          return true
        }

        event.preventDefault()
        runShortcut(action)
        return true
      },
    },
  })

  if (editor) editorRef.current = editor

  // 光标前刚敲了「/」就打开插入菜单；光标离开、失焦或滚动时跟着关掉 / 重新定位
  useEffect(() => {
    if (!editor) return

    const close = () => {
      if (!slashMenuRef.current) return
      slashMenuRef.current = null
      setSlashMenu(null)
    }

    const sync = () => {
      const current = editorRef.current
      if (!current || !current.isEditable || sharedReadonlyRef.current) {
        close()
        return
      }
      // 输入法组合期间光标位置不稳，等 commit 后再算
      if (current.view.composing) return

      const trigger = readSlashTrigger(current)
      if (!trigger) {
        close()
        return
      }

      const previous = slashMenuRef.current
      const unchanged =
        previous !== null &&
        previous.from === trigger.from &&
        previous.to === trigger.to &&
        previous.query === trigger.query &&
        Math.abs(previous.left - trigger.left) < 0.5 &&
        Math.abs(previous.top - trigger.top) < 0.5

      slashMenuRef.current = trigger
      if (!unchanged) {
        setSlashMenu(trigger)
        // 查询变了就回到第一项；只是光标挪了位置则保留当前选中
        if (!previous || previous.query !== trigger.query) {
          slashIndexRef.current = 0
          setSlashIndex(0)
        }
      }
    }

    editor.on('update', sync)
    editor.on('selectionUpdate', sync)
    editor.on('focus', sync)
    editor.on('blur', close)
    // 滚动是捕获阶段：正文区域自己滚也要重算菜单位置
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)

    return () => {
      editor.off('update', sync)
      editor.off('selectionUpdate', sync)
      editor.off('focus', sync)
      editor.off('blur', close)
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
    }
  }, [editor])

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

  // 分享页（/share/<id>）拉取文稿，只读呈现，避免误改后覆盖本地草稿
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
        // 标签页标题跟着文稿走，转发出去也更像一篇文稿
        document.title = doc.title || document.title
      })
      .catch((error: unknown) => {
        if (!alive) return
        // 分享失效就退回编辑页：本地草稿交给重新挂载的编辑器自己加载
        sharedIdRef.current = null
        onExitShare?.(
          error instanceof Error ? error.message : '分享文稿加载失败',
        )
      })
      .finally(() => {
        if (alive) setSharedLoading(false)
      })

    return () => {
      alive = false
    }
  }, [onExitShare])

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
    saveChromeVisibility({ sidebar: !sidebarCollapsed, writing: writingMode })
  }, [sidebarCollapsed, writingMode])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((value) => !value)
  }, [])

  /** 进出写作模式顺手把光标放回正文，别让用户再点一下 */
  const toggleWritingMode = useCallback(() => {
    setWritingMode((value) => !value)
    window.setTimeout(() => editorRef.current?.commands.focus(), 0)
  }, [])

  const updateTheme = useCallback((patch: Partial<ThemeConfig>) => {
    setThemeConfig((current) => ({ ...current, ...patch }))
  }, [])

  // 视图类快捷键（侧栏、激光笔）不等编辑器焦点：走窗口监听，但让编辑器先处理
  useEffect(() => {
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) return
      const combo = eventToKey(event)
      const action = combo
        ? resolveShortcut(shortcutKeysRef.current, combo, 'global')
        : null
      if (!action) return
      event.preventDefault()
      runShortcut(action)
    }

    window.addEventListener('keydown', handleGlobalShortcut)
    return () => window.removeEventListener('keydown', handleGlobalShortcut)
  }, [runShortcut])

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

  // 打开页面时把正文逐字敲出来；任意点击 / 按键立即结束。
  // 编辑页只对示例文稿演示，分享页则每次打开都把分享内容敲一遍。
  useEffect(() => {
    if (!editor) return
    const isShare = sharedIdRef.current !== null
    if (isShare) {
      // 分享页等文稿拉回来再敲；加载中、加载失败都没得敲
      if (sharedLoading || !sharedReadonly) return
    } else {
      // 等 IndexedDB 里的正式草稿到位：否则会先把示例文稿敲一遍，再被真实内容顶掉
      if (!hydrated) return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    if (!isShare) {
      const isExample =
        !draft || editor.getText().replace(/\s+/g, '') === EXAMPLE_TEXT
      if (!isExample) return
      // 说明书这类长文稿整篇敲出来要一分多钟，直接排版展示
      if (EXAMPLE_TEXT.length > TYPEWRITER_MAX_CHARS) return
    }

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
        // 分享页演示完仍然只读，别顺手把编辑能力放开
        editor.setEditable(!sharedReadonlyRef.current)
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
  }, [editor, draft, hydrated, sharedLoading, sharedReadonly])

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

  const publishShare = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return
    setSharePublishing(true)
    setShareError(null)
    setShareUrl('')
    try {
      // 已经保存到云端的文稿直接复用那一篇：链接稳定，云端也不会堆重复
      const saved = await saveDocumentToServer(
        cloudIdRef.current,
        titleRef.current,
        editor.getHTML(),
      )
      cloudIdRef.current = saved.id
      saveCloudDocRef({ id: saved.id, savedAt: saved.updatedAt })
      setCloudSavedAt(saved.updatedAt)
      setShareUrl(saved.url)
      try {
        await navigator.clipboard.writeText(saved.url)
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

  /** 只读分享转成本地文稿：恢复编辑、写回草稿，并从 /share/<id> 回到编辑页 */
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
    // 接管过来的是自己的新文稿，云端保存从头开始，不会改到原分享那篇
    forgetCloudDoc()
    // 先落盘再跳转：编辑页重新挂载时读到的就是刚接管的这篇内容
    persist(false)
    onExitShare?.('已转为本地文稿，修改会自动保存')
  }, [forgetCloudDoc, onExitShare, persist])

  // 分享页上不显示任何按钮，留一个快捷键把文稿接管到本地
  useEffect(() => {
    if (!sharedReadonly) return
    const handleForkShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return
      if (event.key.toLowerCase() !== 'e') return
      event.preventDefault()
      forkSharedDocument()
    }
    window.addEventListener('keydown', handleForkShortcut)
    return () => window.removeEventListener('keydown', handleForkShortcut)
  }, [sharedReadonly, forkSharedDocument])

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
    forgetCloudDoc()
    dirtyRef.current = false
    notify('已新建文稿')
  }, [forgetCloudDoc, notify])

  const showHelp = useCallback((tab: HelpTab) => {
    setHelpTab(tab)
    setHelpOpen(true)
  }, [])

  const closeLaser = useCallback(() => setLaserActive(false), [])

  // 键位改过之后，侧栏提示和斜杠菜单里的 kbd 要跟着变
  const insertPalette = useMemo(
    () => buildInsertPalette(shortcutKeys),
    [shortcutKeys],
  )

  const slashQuery = slashMenu?.query ?? ''
  const slashEntries = useMemo(
    () => flattenPalette(filterPalette(insertPalette, slashQuery)),
    [insertPalette, slashQuery],
  )

  // 键盘处理读的是 ref，这里把当前候选同步进去
  useEffect(() => {
    slashItemsRef.current = slashEntries
  }, [slashEntries])

  const pickSlashItem = useCallback((item: PaletteItem) => {
    const current = editorRef.current
    const trigger = slashMenuRef.current
    if (!current || !trigger) return
    slashMenuRef.current = null
    setSlashMenu(null)
    applyPaletteItem(current, trigger, item)
  }, [])

  const hoverSlashItem = useCallback((index: number) => {
    slashIndexRef.current = index
    setSlashIndex(index)
  }, [])

  if (!editor) return null

  // 分享模式（只读）：整页只剩正文与激光笔。
  // 加载期间也算分享模式，免得内容还没到就把界面元素闪出来
  const readOnly = sharedReadonly || sharedLoading
  // 写作模式与分享页共用「无侧栏」布局：整页只剩正文
  const chromeHidden = readOnly || writingMode
  const writingHint = shortcutHint(shortcutKeys, 'toggleWriting')

  return (
    <div
      className="typora-app"
      data-sidebar={chromeHidden ? 'hidden' : sidebarCollapsed ? 'collapsed' : 'open'}
      data-writing={writingMode && !readOnly}
      data-readonly={readOnly}
    >
      {!readOnly && !writingMode && (
        <Sidebar
          editor={editor}
          title={title}
          onTitleChange={setTitle}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
          sourceOpen={sourceOpen}
          onToggleSource={() => setSourceOpen((value) => !value)}
          focusMode={focusMode}
          typewriterMode={typewriterMode}
          laserActive={laserActive}
          onToggleFocus={() => setFocusMode((value) => !value)}
          onToggleWriting={toggleWritingMode}
          onToggleTypewriter={() => setTypewriterMode((value) => !value)}
          onToggleLaser={() => setLaserActive((value) => !value)}
          onOpenTheme={() => setThemeOpen(true)}
          onNew={newDocument}
          onSave={() => persist(true)}
          onSaveCloud={() => void saveToCloud()}
          cloudSaving={cloudSaving}
          cloudSavedAt={cloudSavedAt}
          onExportMarkdown={exportMarkdown}
          onShare={openShare}
          onShowHelp={showHelp}
          shortcutKeys={shortcutKeys}
        />
      )}

      {sharedLoading && (
        <div className="share-banner" role="status">
          正在打开分享文稿…
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
            <CodeBlockLanguage editor={editor} readOnly={readOnly} />
            <TableToolbar editor={editor} hidden={laserActive} />
            {!readOnly && !writingMode && (
              <DocResizer onResize={setDocWidth} onCommit={saveDocWidth} />
            )}
          </div>
        </main>
      </div>

      <OutlineRail
        editor={editor}
        onNavigate={navigateTo}
        hidden={typingDemo || readOnly || writingMode}
      />

      {/* 写作模式里侧栏整块让出，留一个角落按钮当出口 */}
      {writingMode && !readOnly && (
        <button
          type="button"
          className="writing-exit"
          title={`退出写作模式${writingHint ? ` (${writingHint})` : ''}`}
          onClick={toggleWritingMode}
        >
          <PenLine size={14} aria-hidden="true" />
          退出写作模式
        </button>
      )}

      {!readOnly && slashMenu && (
        <SlashMenu
          entries={slashEntries}
          activeIndex={slashIndex}
          left={slashMenu.left}
          top={slashMenu.top}
          query={slashMenu.query}
          onPick={pickSlashItem}
          onHover={hoverSlashItem}
        />
      )}

      <LaserPointer active={laserActive} onExit={closeLaser} />

      {/* 分享页只剩正文，激光笔留一个角落入口 */}
      {readOnly && !sharedLoading && !laserActive && (
        <button
          type="button"
          className="share-laser-fab"
          title="激光笔"
          aria-label="打开激光笔"
          onClick={() => setLaserActive(true)}
        >
          <Zap size={15} />
        </button>
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
        shortcutKeys={shortcutKeys}
        onShortcutChange={applyShortcutKeys}
        onShortcutReset={resetShortcutKeys}
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
