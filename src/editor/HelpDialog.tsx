import { useEffect, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { eventToKey, formatKey, hasModifier } from './keys'
import {
  findShortcutConflict,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  type ShortcutId,
  type ShortcutMap,
} from './shortcuts'

export type HelpTab = 'syntax' | 'shortcuts'

const SYNTAX_ROWS: [string, string][] = [
  ['标题', '# 一级标题 / ## 二级标题'],
  ['加粗', '**文本**'],
  ['斜体', '*文本*'],
  ['删除线', '~~文本~~'],
  ['行内代码', '`代码`'],
  ['链接', '[文字](https://example.com)'],
  ['图片', '![说明](图片地址)'],
  ['引用', '> 引用内容'],
  ['无序列表', '- 项目'],
  ['有序列表', '1. 项目'],
  ['任务列表', '- [ ] 待办事项'],
  ['代码块', '``` 回车，超过 8 行可在右上角折叠'],
  ['流程图', '```mermaid 回车，代码块下方实时出图'],
  ['数据图表', '```echarts 回车，代码块里写 ECharts 的 option（JSON 或 JS）'],
  ['表格', '| 列 A | 列 B |'],
  ['行内公式', '$E = mc^2$'],
  ['块级公式', '$$ 回车，或 $$公式$$'],
  ['分割线', '---'],
]

export function HelpDialog({
  open,
  tab,
  onTabChange,
  shortcutKeys,
  onShortcutChange,
  onShortcutReset,
  onClose,
}: {
  open: boolean
  tab: HelpTab
  onTabChange: (tab: HelpTab) => void
  shortcutKeys: ShortcutMap
  onShortcutChange: (keys: ShortcutMap) => void
  onShortcutReset: () => void
  onClose: () => void
}) {
  const [recording, setRecording] = useState<ShortcutId | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // 录制时 Esc 归录制逻辑管，别顺手把面板也关了
      if (event.key === 'Escape' && !recording) onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, recording, onClose])

  // 录制键位：window 捕获阶段先截住，免得同一个组合键在编辑器里也触发一次
  useEffect(() => {
    if (!open || !recording) return

    const handleKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setRecording(null)
        setConflict(null)
        return
      }
      // 清空等于退回默认：内置键位和自定义键位始终只有一套
      if (event.key === 'Backspace' || event.key === 'Delete') {
        const item = SHORTCUTS.find((entry) => entry.id === recording)
        onShortcutChange({
          ...shortcutKeys,
          [recording]: item?.defaultKey ?? '',
        })
        setRecording(null)
        setConflict(null)
        return
      }

      const combo = eventToKey(event)
      if (!combo) return

      if (!hasModifier(combo)) {
        setConflict('要和打字区分开，请带上 Ctrl / ⌘ 或 Alt')
        return
      }

      const taken = findShortcutConflict(shortcutKeys, recording, combo)
      if (taken) {
        setConflict(`与「${taken.label}」冲突，换一个组合或先改它`)
        return
      }

      onShortcutChange({ ...shortcutKeys, [recording]: combo })
      setRecording(null)
      setConflict(null)
    }

    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [open, recording, shortcutKeys, onShortcutChange])

  if (!open) return null

  return (
    <div className="help-backdrop" onClick={onClose}>
      <section
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="帮助"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="help-head">
          <div className="help-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              data-active={tab === 'syntax'}
              aria-selected={tab === 'syntax'}
              onClick={() => onTabChange('syntax')}
            >
              Markdown 语法
            </button>
            <button
              type="button"
              role="tab"
              data-active={tab === 'shortcuts'}
              aria-selected={tab === 'shortcuts'}
              onClick={() => onTabChange('shortcuts')}
            >
              快捷键
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭帮助"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="help-body">
          {tab === 'syntax' ? (
            <dl className="help-list">
              {SYNTAX_ROWS.map(([label, value]) => (
                <div className="help-row" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="help-shortcut-groups">
              {SHORTCUT_GROUPS.map((group) => (
                <section className="help-shortcut-group" key={group}>
                  <p className="help-shortcut-title">{group}</p>
                  <dl className="help-list">
                    {SHORTCUTS.filter((item) => item.group === group).map(
                      (item) => {
                        const active = recording === item.id
                        return (
                          <div className="help-row" key={item.id}>
                            <dt>{item.label}</dt>
                            <dd>
                              <button
                                type="button"
                                className="help-key"
                                data-recording={active}
                                aria-label={`${item.label}：${formatKey(
                                  shortcutKeys[item.id],
                                )}，点击修改`}
                                onPointerDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  setConflict(null)
                                  setRecording(item.id)
                                }}
                              >
                                {active
                                  ? '按下组合键…'
                                  : formatKey(shortcutKeys[item.id])}
                              </button>
                            </dd>
                          </div>
                        )
                      },
                    )}
                  </dl>
                </section>
              ))}
              {conflict && (
                <p className="help-shortcut-note" role="alert">
                  {conflict}
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="help-foot">
          {tab === 'syntax' ? (
            <p className="help-note">
              标题、列表、引用、代码块、公式与分割线支持直接输入 Markdown
              语法，回车后自动转换；双击公式可修改 LaTeX。光标处输入「/」可以就地选插入项，左侧栏留作速查。
              代码块语言选 Mermaid 渲染流程图，选 ECharts
              渲染数据图表（内容是 option，JSON 或一段返回对象的 JS 都行，可用
              `// height: 420` 指定高度）。长代码块可在右上角折叠成 3
              行，块下方的「展开代码」按钮随时点开。
            </p>
          ) : (
            <div className="help-shortcut-foot">
              <p className="help-note">
                点键位后按下组合键即可改 · Backspace 恢复默认 · Esc 取消。改动即时生效并记住，侧栏、图标提示与「/」菜单里的 kbd 会一起更新。
              </p>
              <button
                type="button"
                className="help-reset"
                onClick={() => {
                  setRecording(null)
                  setConflict(null)
                  onShortcutReset()
                }}
              >
                <RotateCcw size={12} />
                恢复默认
              </button>
            </div>
          )}
        </footer>
      </section>
    </div>
  )
}
