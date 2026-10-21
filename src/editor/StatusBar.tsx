import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'

type DocStats = {
  characters: number
  words: number
  paragraphs: number
  minutes: number
}

function readStats(editor: Editor): DocStats {
  const text = editor.getText()
  const words = text.replace(/\s/g, '').length
  return {
    characters: text.length,
    words,
    paragraphs: editor.state.doc.childCount,
    minutes: Math.max(1, Math.round(words / 350)),
  }
}

export function StatusBar({
  editor,
  focusMode,
  typewriterMode,
  laserActive,
  sourceOpen,
  typing,
}: {
  editor: Editor
  focusMode: boolean
  typewriterMode: boolean
  laserActive: boolean
  sourceOpen: boolean
  /** 打字演示期间还没敲完，先别把全文字数亮出来 */
  typing?: boolean
}) {
  /**
   * 字数统计要遍历整篇文本（O(n)）。原来走 useEditorState，每次事务都会同步算一遍，
   * 长文档里等于每个按键都全文扫一次；这里合并成 300ms 一次。
   */
  const [stats, setStats] = useState(() => readStats(editor))

  useEffect(() => {
    let timer = 0
    const run = () => setStats(readStats(editor))
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(run, 300)
    }

    run()
    editor.on('update', schedule)
    return () => {
      window.clearTimeout(timer)
      editor.off('update', schedule)
    }
  }, [editor])

  return (
    <footer className="statusbar">
      <div className="statusbar-group">
        {typing ? (
          <span>正在逐字打出示例文稿…</span>
        ) : (
          <>
            <span>
              <strong>{stats.words}</strong> 字
            </span>
            <span className="statusbar-dot" />
            <span>
              <strong>{stats.characters}</strong> 字符
            </span>
            <span className="statusbar-dot" />
            <span>
              <strong>{stats.paragraphs}</strong> 段落
            </span>
            <span className="statusbar-dot" />
            <span>约 {stats.minutes} 分钟读完</span>
          </>
        )}
      </div>

      <div className="statusbar-group">
        <span className="statusbar-flag" data-active={sourceOpen}>
          源码
        </span>
        <span className="statusbar-flag" data-active={focusMode}>
          专注
        </span>
        <span className="statusbar-flag" data-active={typewriterMode}>
          打字机
        </span>
        <span className="statusbar-flag" data-active={laserActive}>
          激光笔
        </span>
        <span className="statusbar-dot" />
        <span className="statusbar-markdown">Markdown</span>
      </div>
    </footer>
  )
}
