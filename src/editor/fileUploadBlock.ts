/**
 * 正文里的「插入文件」占位块。
 *
 * 文件可以放在文稿的任何位置：把光标停在任意段落之间，工具栏点「插入文件」，
 * 或者直接敲 `/file`，就会在光标处出现这个上传块；传完它自动变成文件卡片。
 * 占位块本身是一个 atom 节点，所以能被拖动、删除，也能随草稿恢复。
 */
import { Node } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { uploadFile, type StoredFile } from './fileStore'
import './fileUploadBlock.css'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fileUploadBlock: {
      /** 在光标处插入文件上传块 */
      insertFileUpload: () => ReturnType
    }
  }
}

const ICONS = {
  upload:
    '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
}

function icon(name: keyof typeof ICONS): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

function linkName(href: string): string {
  const last = href.split('/').pop() || href
  try {
    return decodeURIComponent(last.split('?')[0] ?? '') || '附件'
  } catch {
    return last.split('?')[0] || '附件'
  }
}

export const FileUploadBlock = Node.create({
  name: 'fileUploadBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addCommands() {
    return {
      insertFileUpload:
        () =>
        ({ state, commands }) => {
          const { $from } = state.selection
          // 光标在一段文字中间：先切开段落，块级占位块才能落在光标处
          if (
            $from.parent.isTextblock &&
            !$from.parent.type.spec.code &&
            $from.parentOffset > 0
          ) {
            commands.splitBlock()
          }
          // 占位块后面垫一个空段落，传完文件后光标有地方落
          return commands.insertContent([
            { type: this.name },
            { type: 'paragraph' },
          ])
        },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-file-upload]' }]
  },

  renderHTML() {
    return ['div', { 'data-file-upload': '' }]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            // 光标前正好打完 /file、/文件、/附件 再敲空格，就在原地展开上传块
            if (event.isComposing) return false
            if (event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey) {
              return false
            }
            const { $from } = view.state.selection
            if (!$from.parent.isTextblock || $from.parent.type.spec.code) return false
            const textBefore = $from.parent.textBetween(
              0,
              $from.parentOffset,
              undefined,
              '\ufffc',
            )
            const match = /\/(?:file|文件|附件)$/i.exec(textBefore)
            if (!match) return false
            event.preventDefault()
            const from = $from.pos - match[0].length
            this.editor
              .chain()
              .focus()
              .deleteRange({ from, to: $from.pos })
              .insertFileUpload()
              .run()
            return true
          },
        },
      }),
    ]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const resolvePos = () =>
        typeof getPos === 'function' ? getPos() : undefined

      const root = element('div', 'file-upload')
      root.setAttribute('data-file-upload', '')
      root.setAttribute('contenteditable', 'false')
      root.setAttribute('role', 'group')
      root.setAttribute('aria-label', '插入文件')

      const main = element('div', 'file-upload-main')

      const glyph = element('span', 'file-upload-icon')
      glyph.innerHTML = icon('upload')

      const copy = element('div', 'file-upload-copy')
      const title = element('strong', 'file-upload-title')
      title.textContent = '插入文件'
      const hint = element('span', 'file-upload-hint')
      hint.textContent = '点击或拖拽文件到这里 · Word / Excel / PPT / PDF / 图片 / 压缩包，单个不超过 5MB'
      copy.append(title, hint)

      const pick = element('button', 'file-upload-pick')
      pick.type = 'button'
      pick.textContent = '选择文件'

      const close = element('button', 'file-upload-close')
      close.type = 'button'
      close.title = '取消插入'
      close.setAttribute('aria-label', '取消插入')
      close.innerHTML = icon('close')

      main.append(glyph, copy, pick, close)

      const linkRow = element('div', 'file-upload-link')
      const linkInput = element('input', 'file-upload-link-input')
      linkInput.type = 'text'
      linkInput.placeholder = '或粘贴文件链接，回车插入'
      linkInput.spellcheck = false
      linkRow.append(linkInput)

      const error = element('p', 'file-upload-error')
      error.hidden = true

      const fileInput = element('input')
      fileInput.type = 'file'
      fileInput.multiple = true
      fileInput.hidden = true

      root.append(main, linkRow, error, fileInput)

      let busy = false

      const setBusy = (value: boolean) => {
        busy = value
        pick.disabled = value
        pick.textContent = value ? '上传中…' : '选择文件'
        root.dataset.busy = String(value)
      }

      const setError = (message: string) => {
        error.textContent = message
        error.hidden = !message
      }

      const removeSelf = () => {
        const pos = resolvePos()
        if (typeof pos !== 'number') return
        editor
          .chain()
          .focus()
          .deleteRange({ from: pos, to: pos + node.nodeSize })
          .run()
      }

      /** 上传完成后把占位块原地换成文件卡片 */
      const replaceWith = (files: StoredFile[]) => {
        const pos = resolvePos()
        if (typeof pos !== 'number' || !files.length) return
        editor
          .chain()
          .focus()
          .insertContentAt({ from: pos, to: pos + node.nodeSize }, [
            ...files.map((file) => ({
              type: 'fileBlock',
              attrs: {
                id: file.id,
                url: file.url,
                name: file.name,
                size: file.size,
                mime: file.type,
              },
            })),
            { type: 'paragraph' },
          ])
          .run()
      }

      const upload = async (picked: File[]) => {
        if (busy || !picked.length) return
        setBusy(true)
        setError('')
        const done: StoredFile[] = []
        try {
          for (const [index, file] of picked.entries()) {
            hint.textContent =
              picked.length > 1
                ? `正在上传 ${index + 1}/${picked.length}：${file.name}`
                : `正在上传：${file.name}`
            done.push(await uploadFile(file))
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : '文件上传失败')
        }
        if (done.length) {
          replaceWith(done)
          return
        }
        setBusy(false)
        hint.textContent = '点击或拖拽文件到这里 · 单个不超过 5MB'
      }

      const insertLink = () => {
        const raw = linkInput.value.trim()
        if (!raw) return
        const href = /^(https?:\/\/|data:)/i.test(raw) ? raw : `https://${raw}`
        replaceWith([
          {
            id: '',
            url: href,
            name: linkName(href),
            size: 0,
            type: '',
            createdAt: Date.now(),
          },
        ])
      }

      // 只读分享里这个占位块不该还能选文件或删掉自己
      pick.addEventListener('click', () => {
        if (editor.isEditable) fileInput.click()
      })
      // 点文字区域也能选文件；点边框则只是选中这个块
      copy.addEventListener('click', () => {
        if (editor.isEditable) fileInput.click()
      })
      close.addEventListener('click', () => {
        if (editor.isEditable) removeSelf()
      })
      fileInput.addEventListener('change', () => {
        const picked = Array.from(fileInput.files ?? [])
        fileInput.value = ''
        void upload(picked)
      })
      linkInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          insertLink()
        } else if (event.key === 'Escape') {
          event.stopPropagation()
          removeSelf()
        }
      })

      root.addEventListener('dragover', (event) => {
        event.preventDefault()
        if (!busy) root.dataset.dragging = 'true'
      })
      root.addEventListener('dragleave', () => {
        delete root.dataset.dragging
      })
      root.addEventListener('drop', (event) => {
        event.preventDefault()
        // 别让 ProseMirror 再走一遍「拖拽插入卡片」
        event.stopPropagation()
        delete root.dataset.dragging
        void upload(Array.from(event.dataTransfer?.files ?? []))
      })

      return {
        dom: root,
        stopEvent: (event) =>
          Boolean(
            (event.target as HTMLElement | null)?.closest('button, input'),
          ),
        ignoreMutation: () => true,
      }
    }
  },
})

/** 供外部菜单/快捷键调用：在光标处插入上传块 */
export function insertFileUpload(editor: Editor): void {
  editor.chain().focus().insertFileUpload().run()
}
