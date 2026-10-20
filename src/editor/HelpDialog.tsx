import { useEffect } from 'react'
import { X } from 'lucide-react'

export type HelpTab = 'syntax' | 'shortcuts'

const SYNTAX_ROWS: [string, string][] = [
  ['标题', '# 一级标题 / ## 二级标题'],
  ['加粗', '**文本**'],
  ['斜体', '*文本*'],
  ['下划线', '选中后使用工具栏'],
  ['删除线', '~~文本~~'],
  ['行内代码', '`代码`'],
  ['链接', '[文字](https://example.com)'],
  ['图片', '![说明](图片地址)'],
  ['引用', '> 引用内容'],
  ['无序列表', '- 项目'],
  ['有序列表', '1. 项目'],
  ['任务列表', '- [ ] 待办事项'],
  ['代码块', '``` 回车'],
  ['流程图 / 图表', '```mermaid 回车，代码块下方实时出图'],
  ['表格', '| 列 A | 列 B |'],
  ['行内公式', '$E = mc^2$'],
  ['块级公式', '$$ 回车，或 $$公式$$'],
  ['分割线', '---'],
]

const SHORTCUT_ROWS: [string, string][] = [
  ['保存草稿', 'Ctrl S'],
  ['导入文件', 'Ctrl O（.md / .txt / .html，也可拖入）'],
  ['Markdown 源码', 'Ctrl /'],
  ['加粗 / 斜体 / 下划线', 'Ctrl B / Ctrl I / Ctrl U'],
  ['删除线 / 行内代码', 'Ctrl Shift S / Ctrl E'],
  ['正文 / 标题 1-4', 'Ctrl Alt 0 ~ 4'],
  ['引用 / 代码块', 'Ctrl Shift B / Ctrl Alt C'],
  ['无序 / 有序 / 任务列表', 'Ctrl Shift 8 / 7 / 9'],
  ['插入链接', 'Ctrl K'],
  ['撤销 / 重做', 'Ctrl Z / Ctrl Shift Z'],
  ['全选', 'Ctrl A'],
  ['粘贴 Markdown', '直接粘贴自动排版 · Shift 粘贴保留原文'],
  ['激光笔 / 页面批注', 'Ctrl Shift L'],
  ['隐藏标题栏和状态栏', 'Ctrl Shift H'],
  ['画笔工具 / 粗细', '1-5 切换工具 · F 渐隐或保留'],
  ['文字标注 / 截屏', '6 点按输入文字 · S 截屏保存'],
  ['移动批注', '7 选中移动工具，拖动笔迹或文字调整位置'],
  ['清除与退出', 'C 清空 · Ctrl Z 撤销 · Esc 退出'],
]

export function HelpDialog({
  open,
  tab,
  onTabChange,
  onClose,
}: {
  open: boolean
  tab: HelpTab
  onTabChange: (tab: HelpTab) => void
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

  const rows = tab === 'syntax' ? SYNTAX_ROWS : SHORTCUT_ROWS

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
          <dl className="help-list">
            {rows.map(([label, value]) => (
              <div className="help-row" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <footer className="help-foot">
          标题、列表、引用、代码块、公式与分割线支持直接输入 Markdown 语法，回车后自动转换；双击公式可修改 LaTeX。代码块语言选 Mermaid（或在围栏后写 mermaid）即在下方渲染图表。
        </footer>
      </section>
    </div>
  )
}
