import { useEditorState, type Editor } from '@tiptap/react'

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
  const stats = useEditorState({
    editor,
    selector: ({ editor }) => {
      const text = editor.getText()
      const words = text.replace(/\s/g, '').length
      return {
        characters: text.length,
        words,
        paragraphs: editor.state.doc.childCount,
        minutes: Math.max(1, Math.round(words / 350)),
      }
    },
  })

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
