import { Fragment, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { PaletteEntry, PaletteItem } from './insertPalette'

const MENU_WIDTH = 288
const MENU_MAX_HEIGHT = 332

type SlashMenuProps = {
  entries: PaletteEntry[]
  activeIndex: number
  /** 光标的视口坐标：菜单贴在光标下方 */
  left: number
  top: number
  query: string
  onPick: (item: PaletteItem) => void
  onHover: (index: number) => void
}

/**
 * 在光标处弹出的插入菜单：敲「/」就地选，不用记快捷键，也不用去侧栏找。
 * 用 fixed 定位挂到 body，避免编辑器容器的 overflow / transform 把浮层裁掉。
 */
export function SlashMenu({
  entries,
  activeIndex,
  left,
  top,
  query,
  onPick,
  onHover,
}: SlashMenuProps) {
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const safeLeft = Math.max(
    8,
    Math.min(left, window.innerWidth - MENU_WIDTH - 12),
  )
  const safeTop = Math.max(
    8,
    Math.min(top, window.innerHeight - MENU_MAX_HEIGHT - 12),
  )

  return createPortal(
    <div
      className="slash-menu"
      style={{ left: safeLeft, top: safeTop, width: MENU_WIDTH }}
      role="listbox"
      aria-label="插入 Markdown 语法"
    >
      <div className="slash-list" ref={listRef}>
        {entries.length === 0 ? (
          <p className="slash-empty">没有匹配「{query}」的语法</p>
        ) : (
          entries.map((entry, index) => (
            <Fragment key={`${entry.group}-${entry.item.label}`}>
              {index === 0 || entries[index - 1].group !== entry.group ? (
                <p className="slash-group-label">{entry.group}</p>
              ) : null}
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className="slash-item"
                data-active={index === activeIndex}
                // 按下时别让编辑器失焦，否则光标位置会跳走
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => onHover(index)}
                onClick={() => onPick(entry.item)}
              >
                <span className="slash-item-label">{entry.item.label}</span>
                {entry.item.hint ? (
                  <kbd className="slash-kbd">{entry.item.hint}</kbd>
                ) : null}
              </button>
            </Fragment>
          ))
        )}
      </div>
      <p className="slash-foot">↑↓ 选择 · Enter 插入 · Esc 收起</p>
    </div>,
    document.body,
  )
}
