import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'

type HeadingItem = { level: number; text: string; pos: number }

/** 层级越深横线越短，右端对齐后可一眼看出文档结构 */
const LEVEL_LENGTH: Record<number, number> = { 1: 30, 2: 22, 3: 15, 4: 10 }

/**
 * 右侧大纲标尺：一条细横线对应一个标题，常驻但只占十几像素宽度。
 * 悬停或点击标尺时弹出完整目录，点击目录项或横线都能跳转。
 */
export function OutlineRail({
  editor,
  onNavigate,
}: {
  editor: Editor
  onNavigate: (pos: number) => void
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const activeRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)

  const { headings } = useEditorState({
    editor,
    selector: ({ editor }) => {
      const items: HeadingItem[] = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading' && node.textContent.trim()) {
          items.push({
            level: node.attrs.level as number,
            text: node.textContent,
            pos,
          })
        }
      })
      return { headings: items }
    },
    equalityFn: (prev, next) =>
      !!prev &&
      !!next &&
      prev.headings.length === next.headings.length &&
      prev.headings.every((heading, index) => {
        const other = next.headings[index]
        return (
          heading.pos === other.pos &&
          heading.level === other.level &&
          heading.text === other.text
        )
      }),
  })

  const headingCount = headings.length

  // 视口内最靠上、且已越过阅读线的标题即为当前章节
  useEffect(() => {
    if (headingCount === 0) {
      setActiveIndex(-1)
      return
    }

    let frame = 0
    const update = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const nodes = Array.from(
          editor.view.dom.querySelectorAll(
            ':scope > h1, :scope > h2, :scope > h3, :scope > h4',
          ),
        )
        const threshold = window.innerHeight * 0.32
        let next = 0
        nodes.forEach((node, index) => {
          if (node.getBoundingClientRect().top <= threshold) next = index
        })
        setActiveIndex(next)
      })
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [editor, headingCount])

  // 标题很多时，让当前章节落在标尺可见范围内（只滚动标尺，不动页面）
  useEffect(() => {
    const node = activeRef.current
    const rail = node?.closest('.outline-rail') as HTMLElement | null
    if (!node || !rail) return

    const railRect = rail.getBoundingClientRect()
    const nodeRect = node.getBoundingClientRect()
    if (nodeRect.top < railRect.top) {
      rail.scrollTop -= railRect.top - nodeRect.top
    } else if (nodeRect.bottom > railRect.bottom) {
      rail.scrollTop += nodeRect.bottom - railRect.bottom
    }
  }, [activeIndex])

  // 目录展开时，把当前章节滚进面板可见区域
  useEffect(() => {
    if (!menuOpen) return
    const menu = menuRef.current
    const link = menu?.querySelector<HTMLElement>('[data-active="true"]')
    if (!menu || !link) return

    const menuRect = menu.getBoundingClientRect()
    const linkRect = link.getBoundingClientRect()
    const pad = 8
    if (linkRect.top < menuRect.top + pad) {
      menu.scrollTop -= menuRect.top + pad - linkRect.top
    } else if (linkRect.bottom > menuRect.bottom - pad) {
      menu.scrollTop += linkRect.bottom - (menuRect.bottom - pad)
    }
  }, [menuOpen, activeIndex])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  /** 只收起状态还不够：标尺里的按钮仍持有焦点时面板会被焦点撑开，所以顺手收回焦点 */
  const closeMenu = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    setMenuOpen(false)
    wrapRef.current?.querySelector<HTMLElement>(':focus')?.blur()
  }, [])

  const openMenu = () => {
    window.clearTimeout(closeTimer.current)
    setMenuOpen(true)
  }

  /** 延迟收起，给指针从标尺移动到面板留出时间 */
  const closeMenuSoon = () => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setMenuOpen(false), 140)
  }

  // 点击面板以外的地方、或按 Esc 都收起（标尺自身或面板内部的点击不算）
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const wrap = wrapRef.current
      if (!wrap || (event.target instanceof Node && wrap.contains(event.target))) return
      closeMenu()
    }
    // Esc 要挂在 document 上：焦点在正文里时按键不会冒泡到标尺
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      closeMenu()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [closeMenu])

  if (headingCount === 0) return null

  return (
    <div
      ref={wrapRef}
      className="outline-rail-wrap"
      onPointerEnter={openMenu}
      onPointerLeave={closeMenuSoon}
    >
      <nav className="outline-rail" aria-label="文档大纲">
        {headings.map((heading, index) => (
          <button
            type="button"
            // 打字时标题文本与位置持续变化，按顺序复用节点可避免反复重建
            key={index}
            ref={index === activeIndex ? activeRef : undefined}
            className="outline-rail-item"
            data-level={heading.level}
            data-active={index === activeIndex}
            aria-label={`${heading.text}（${heading.level} 级标题）`}
            aria-current={index === activeIndex ? 'location' : undefined}
            style={
              {
                '--rail-len': `${LEVEL_LENGTH[heading.level] ?? 12}px`,
              } as CSSProperties
            }
            onClick={() => {
              onNavigate(heading.pos)
              openMenu()
            }}
          >
            <span className="outline-rail-bar" aria-hidden="true" />
          </button>
        ))}
      </nav>

      <div
        ref={menuRef}
        className="outline-rail-menu"
        data-open={menuOpen}
        role="group"
        aria-label="大纲目录"
        onFocus={openMenu}
      >
        <p className="outline-rail-menu-head">
          <span className="outline-rail-menu-title">大纲</span>
          <span className="outline-rail-menu-count">{headingCount}</span>
        </p>
        {headings.map((heading, index) => (
          <button
            type="button"
            key={index}
            className="outline-rail-link"
            data-level={heading.level}
            data-active={index === activeIndex}
            title={heading.text}
            onClick={() => {
              onNavigate(heading.pos)
              closeMenu()
            }}
          >
            {heading.text}
          </button>
        ))}
      </div>
    </div>
  )
}
