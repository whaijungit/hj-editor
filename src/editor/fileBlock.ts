/**
 * 正文里的「文件」块：一张可点开的文件卡片。
 *
 * 文件内容本身在 Netlify Blobs 里（见 fileStore.ts），节点只记地址与元信息，
 * 所以草稿、分享链接都不会因为附件变大而膨胀。
 */
import { mergeAttributes, Node } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { downloadHref, fileExtension, formatFileSize } from './fileStore'
import './fileBlock.css'

/** 卡片点击预览时派发的全局事件，由 RichTextEditor 接手打开预览弹窗 */
export const FILE_OPEN_EVENT = 'hj:file-open'

export type FileBlockAttrs = {
  id: string
  url: string
  name: string
  size: number
  mime: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fileBlock: {
      insertFileBlock: (attrs: FileBlockAttrs) => ReturnType
    }
  }
}

const ICONS = {
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  download:
    '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
  trash:
    '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
}

function icon(name: keyof typeof ICONS): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

type CardParts = {
  root: HTMLElement
  badge: HTMLElement
  name: HTMLElement
  meta: HTMLElement
  preview: HTMLButtonElement
  download: HTMLAnchorElement
  remove: HTMLButtonElement
}

function describe(attrs: FileBlockAttrs): string {
  const ext = fileExtension(attrs.name)
  const size = formatFileSize(attrs.size)
  return ext ? `${ext} · ${size}` : size
}

function paint(parts: CardParts, attrs: FileBlockAttrs) {
  const label = attrs.name || '附件'
  parts.badge.textContent = fileExtension(label) || 'FILE'
  parts.name.textContent = label
  parts.meta.textContent = describe(attrs)
  parts.download.href = attrs.url ? downloadHref(attrs.url) : '#'
}

function buildCard(attrs: FileBlockAttrs): CardParts {
  const root = element('div', 'file-block')
  root.setAttribute('data-file-block', '')
  root.setAttribute('contenteditable', 'false')
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', `附件 ${attrs.name || ''}`.trim())

  const badge = element('span', 'file-block-badge')
  const name = element('span', 'file-block-name')
  const meta = element('span', 'file-block-meta')

  const text = element('div', 'file-block-text')
  text.append(name, meta)

  const preview = element('button', 'file-block-btn')
  preview.type = 'button'
  preview.dataset.act = 'preview'
  preview.title = '预览文件'
  preview.setAttribute('aria-label', '预览文件')
  preview.innerHTML = icon('eye')

  const download = element('a', 'file-block-btn')
  download.dataset.act = 'download'
  download.target = '_blank'
  download.rel = 'noopener noreferrer'
  download.title = '下载文件'
  download.setAttribute('aria-label', '下载文件')
  download.innerHTML = icon('download')

  const remove = element('button', 'file-block-btn is-danger')
  remove.type = 'button'
  remove.dataset.act = 'remove'
  remove.title = '移除卡片'
  remove.setAttribute('aria-label', '移除卡片')
  remove.innerHTML = icon('trash')

  const tools = element('div', 'file-block-tools')
  tools.append(preview, download, remove)

  root.append(badge, text, tools)

  const parts: CardParts = { root, badge, name, meta, preview, download, remove }
  paint(parts, attrs)
  return parts
}

export const FileBlock = Node.create({
  name: 'fileBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: '' },
      url: { default: '' },
      name: { default: '' },
      size: { default: 0 },
      mime: { default: '' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-file-block]',
        getAttrs: (node) => {
          const el = node as HTMLElement
          const url = el.getAttribute('data-url') ?? ''
          // 没有地址的卡片点开也没内容，直接当普通 div 丢弃
          if (!url) return false
          return {
            id: el.getAttribute('data-id') ?? '',
            url,
            name: el.getAttribute('data-name') ?? '附件',
            size: Number(el.getAttribute('data-size')) || 0,
            mime: el.getAttribute('data-mime') ?? '',
          }
        },
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as FileBlockAttrs
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-file-block': '',
        'data-id': attrs.id,
        'data-url': attrs.url,
        'data-name': attrs.name,
        'data-size': String(attrs.size),
        'data-mime': attrs.mime,
      }),
      // 保留一个链接，导出 Markdown 时会得到 [文件名](地址)
      ['a', { href: attrs.url, target: '_blank', rel: 'noopener noreferrer' }, attrs.name || '附件'],
    ]
  },

  addCommands() {
    return {
      insertFileBlock:
        (attrs) =>
        ({ chain }) =>
          chain()
            // 卡片后面垫一个空段落，插入后光标有地方落
            .insertContent([{ type: this.name, attrs }, { type: 'paragraph' }])
            .run(),
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node.attrs as FileBlockAttrs
      const parts = buildCard(current)

      const openPreview = () => {
        if (!current.url) return
        document.dispatchEvent(
          new CustomEvent(FILE_OPEN_EVENT, {
            detail: { url: current.url, name: current.name },
          }),
        )
      }

      parts.preview.addEventListener('click', openPreview)
      parts.root.addEventListener('dblclick', openPreview)

      parts.remove.addEventListener('click', () => {
        // 只读分享里不给删附件
        if (!editor.isEditable) return
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (typeof pos !== 'number') return
        editor
          .chain()
          .focus()
          .deleteRange({ from: pos, to: pos + node.nodeSize })
          .run()
      })

      return {
        dom: parts.root,
        // 只把按钮/链接的点击留给浏览器，其余交给 ProseMirror（否则卡片无法拖拽/选中）
        stopEvent: (event) =>
          Boolean((event.target as HTMLElement | null)?.closest('button, a')),
        ignoreMutation: () => true,
        update: (updated) => {
          if (updated.type.name !== this.name) return false
          current = updated.attrs as FileBlockAttrs
          paint(parts, current)
          return true
        },
      }
    }
  },
})

/** 把已上传的文件插到光标处 */
export function insertFileBlock(
  editor: Editor,
  file: { id?: string; url: string; name: string; size?: number; type?: string },
): void {
  if (!file.url) return
  editor
    .chain()
    .focus()
    .insertFileBlock({
      id: file.id ?? '',
      url: file.url,
      name: file.name || '附件',
      size: file.size ?? 0,
      mime: file.type ?? '',
    })
    .run()
}
