import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { Check, ChevronDown } from 'lucide-react'
import {
  CODE_LANGUAGES,
  codeLanguageLabel,
  resolveCodeLanguage,
} from './codeLanguages'

type CodeBlockInfo = {
  language: string | null
  rect: { top: number; right: number; bottom: number }
}

const PANEL_WIDTH = 244
const PANEL_MAX_HEIGHT = 320
const BADGE_OFFSET = 8
const LANGUAGE_OPTION_IDS = new Set(CODE_LANGUAGES.map((language) => language.id))

/** 光标所在的代码块，以及它在视口里的位置 */
function readCodeBlock(editor: Editor): CodeBlockInfo | null {
  const { $from } = editor.state.selection

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'codeBlock') continue

    const dom = editor.view.nodeDOM($from.before(depth))
    if (!(dom instanceof HTMLElement)) return null

    const rect = dom.getBoundingClientRect()
    // 代码块滚出视口时不再显示徽标
    if (rect.bottom < 48 || rect.top > window.innerHeight - 24) return null

    return {
      language: (node.attrs.language as string | null) ?? null,
      rect: { top: rect.top, right: rect.right, bottom: rect.bottom },
    }
  }

  return null
}

function sameInfo(a: CodeBlockInfo | null, b: CodeBlockInfo | null) {
  if (!a || !b) return a === b
  return (
    a.language === b.language &&
    a.rect.top === b.rect.top &&
    a.rect.right === b.rect.right &&
    a.rect.bottom === b.rect.bottom
  )
}

/** 代码块右上角的语言徽标，点击可在常用语言之间切换 */
export function CodeBlockLanguage({ editor }: { editor: Editor }) {
  const [info, setInfo] = useState<CodeBlockInfo | null>(null)
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLButtonElement>(null)

  const sync = useCallback(() => {
    const next = readCodeBlock(editor)
    setInfo((current) => (sameInfo(current, next) ? current : next))
    if (!next) setOpen(false)
  }, [editor])

  useEffect(() => {
    const frame = window.requestAnimationFrame(sync)
    editor.on('update', sync)
    editor.on('selectionUpdate', sync)
    editor.on('focus', sync)
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)

    return () => {
      window.cancelAnimationFrame(frame)
      editor.off('update', sync)
      editor.off('selectionUpdate', sync)
      editor.off('focus', sync)
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
    }
  }, [editor, sync])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        !panelRef.current?.contains(target) &&
        !badgeRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!info) return null

  const { rect } = info
  const titlebar = Number.parseFloat(
    getComputedStyle(
      document.querySelector('.typora-app') ?? document.documentElement,
    ).getPropertyValue('--titlebar-h'),
  )
  const minTop = (Number.isFinite(titlebar) ? titlebar : 46) + 10

  // 代码块顶部滚出视口时，徽标贴着可视区顶部继续可用
  const badgeTop = Math.max(
    minTop,
    Math.min(rect.top + BADGE_OFFSET, window.innerHeight - 34),
  )
  const panelLeft = Math.max(
    12,
    Math.min(rect.right - BADGE_OFFSET - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 12),
  )

  // 优先在徽标下方展开，下方放不下就向上展开并收窄，避免压住徽标
  const spaceBelow = window.innerHeight - (badgeTop + 30) - 12
  const openUpward = spaceBelow < 260 && badgeTop - minTop > 220
  const panelMaxHeight = openUpward
    ? Math.max(160, Math.min(PANEL_MAX_HEIGHT, badgeTop - minTop - 8))
    : Math.min(PANEL_MAX_HEIGHT, spaceBelow)
  const panelTop = openUpward
    ? Math.max(minTop, badgeTop - 8 - panelMaxHeight)
    : badgeTop + 30

  // 文档里可能是 js / html 这类别名，优先匹配下拉里的同名项，否则归一后再匹配
  const current = info.language ?? 'plaintext'
  const activeLanguage = LANGUAGE_OPTION_IDS.has(current)
    ? current
    : (resolveCodeLanguage(current) ?? current)

  const apply = (language: string) => {
    editor.chain().focus().updateAttributes('codeBlock', { language }).run()
    setOpen(false)
  }

  return (
    <>
      <button
        ref={badgeRef}
        type="button"
        className="code-lang-badge"
        style={{ top: badgeTop, left: rect.right - BADGE_OFFSET }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="切换代码语言"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        {codeLanguageLabel(info.language)}
        <ChevronDown size={11} />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="code-lang-panel"
            role="listbox"
            aria-label="代码语言"
            style={{
              top: panelTop,
              left: panelLeft,
              width: PANEL_WIDTH,
              maxHeight: panelMaxHeight,
            }}
          >
            {CODE_LANGUAGES.map((language) => {
              const active = activeLanguage === language.id
              return (
                <button
                  key={language.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className="code-lang-item"
                  data-active={active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => apply(language.id)}
                >
                  <span>{language.label}</span>
                  {active && <Check size={12} strokeWidth={3} />}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
