import { Extension, type Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ReplaceStep } from '@tiptap/pm/transform'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * 启动打字演示：文档内容一开始就完整存在，只是把「还没敲到」的部分藏起来，
 * 逐帧抬高已敲字数即可逐字显示。这样不会反复重建文档，也不会打乱撤销栈。
 */

export type TypingRevealState = {
  total: number
  revealed: number
}

type RevealMeta = { type: 'set'; revealed: number } | { type: 'stop' }

export const typingRevealKey = new PluginKey<TypingRevealState | null>('typingReveal')

/** 一个字符算 1；块级节点进场再算 1（相当于按下回车）；图片 / 公式 / 分割线等原子节点算 1 */
function unitCount(node: ProseMirrorNode): number {
  if (node.isText) return node.text?.length ?? 0
  if (node.isLeaf) return 1
  let total = 1
  node.forEach((child) => {
    total += unitCount(child)
  })
  return total
}

export function countTypingUnits(doc: ProseMirrorNode): number {
  let total = 0
  doc.forEach((child) => {
    total += unitCount(child)
  })
  return total
}

/** 刚敲下的字符会弹一下，窗口大小约等于动画期间的落字数 */
const POP_WINDOW = 14

let caretElement: HTMLElement | null = null

/** 复用同一个光标节点，避免每帧重建导致闪烁重新计时 */
function caretDom(): HTMLElement {
  if (!caretElement) {
    caretElement = document.createElement('span')
    caretElement.className = 'typing-caret'
    caretElement.setAttribute('aria-hidden', 'true')
  }
  return caretElement
}

type TypingLayout = {
  decorations: DecorationSet
  caretPos: number | null
}

/**
 * 按已敲字数生成装饰：未敲到的文字用内联装饰隐藏，整块还没轮到的节点直接藏掉，
 * 这样行宽会像真的在打字一样重排，而不是先把整篇排版好再揭盖头。
 */
export function buildTypingLayout(
  doc: ProseMirrorNode,
  revealed: number,
): TypingLayout {
  const decorations: Decoration[] = []
  let typed = 0
  let caretPos: number | null = 0

  const hideBlock = (from: number, to: number) => {
    decorations.push(Decoration.node(from, to, { class: 'typing-hidden-block' }))
  }

  const walkInline = (block: ProseMirrorNode, pos: number) => {
    if (block.childCount === 0) {
      caretPos = pos + 1
      return
    }

    block.forEach((child, offset) => {
      const from = pos + 1 + offset

      if (child.isText) {
        const length = child.text?.length ?? 0
        const visible = Math.max(0, Math.min(length, revealed - typed))
        if (visible < length) {
          decorations.push(
            Decoration.inline(from + visible, from + length, {
              class: 'typing-hidden',
            }),
          )
        }
        if (visible > 0) {
          caretPos = from + visible
          // 逐字给「刚落下的字」套一层激光扫过的发光：每个字独立成段，
          // 窗口滑走后旧的段自然回收，新进来的字才会重新播放
          const glowFrom = Math.max(0, visible - POP_WINDOW)
          for (let index = glowFrom; index < visible; index += 1) {
            if (typed + index < revealed - POP_WINDOW) continue
            decorations.push(
              Decoration.inline(from + index, from + index + 1, {
                class: 'typing-glow',
              }),
            )
          }
        }
        typed += length
        return
      }

      // 行内原子节点：图片、行内公式、硬换行
      if (child.isLeaf) {
        if (typed >= revealed) {
          decorations.push(
            Decoration.node(from, from + child.nodeSize, {
              class: 'typing-hidden-block',
            }),
          )
        } else {
          caretPos = from + child.nodeSize
        }
        typed += 1
        return
      }

      if (typed >= revealed) hideBlock(from, from + child.nodeSize)
      typed += unitCount(child)
    })
  }

  const walkBlock = (node: ProseMirrorNode, pos: number) => {
    if (typed >= revealed) {
      hideBlock(pos, pos + node.nodeSize)
      typed += unitCount(node)
      return
    }

    typed += 1 // 这一块前面的「回车」已经敲下
    if (node.isTextblock) {
      walkInline(node, pos)
      return
    }
    if (node.isLeaf) {
      caretPos = pos + node.nodeSize
      return
    }
    node.forEach((child, offset) => walkBlock(child, pos + 1 + offset))
  }

  doc.forEach((child, offset) => walkBlock(child, offset))

  return { decorations: DecorationSet.create(doc, decorations), caretPos }
}

export function isTypingRevealActive(editor: Editor): boolean {
  return Boolean(typingRevealKey.getState(editor.state))
}

/** 开始演示，返回总字数（0 表示空文档，无需演示） */
export function startTypingReveal(editor: Editor): number {
  const total = countTypingUnits(editor.state.doc)
  if (!total) return 0
  editor.view.dispatch(
    editor.state.tr.setMeta(typingRevealKey, {
      type: 'set',
      revealed: 0,
    } satisfies RevealMeta),
  )
  return total
}

/** 推进到指定字数，返回实际生效的字数 */
export function stepTypingReveal(editor: Editor, revealed: number): number {
  const state = typingRevealKey.getState(editor.state)
  if (!state) return 0
  const next = Math.max(0, Math.min(revealed, state.total))
  editor.view.dispatch(
    editor.state.tr.setMeta(typingRevealKey, {
      type: 'set',
      revealed: next,
    } satisfies RevealMeta),
  )
  return next
}

export function stopTypingReveal(editor: Editor) {
  if (!typingRevealKey.getState(editor.state)) return
  editor.view.dispatch(
    editor.state.tr.setMeta(typingRevealKey, { type: 'stop' } satisfies RevealMeta),
  )
}

/** 当前应该画光标的位置，供自动滚动使用 */
export function typingCaretPos(
  doc: ProseMirrorNode,
  revealed: number,
): number | null {
  return buildTypingLayout(doc, revealed).caretPos
}

let flashLayer: HTMLElement | null = null

/** 每束光的刃数与整束光的存活时长 */
const LASER_BEAMS = 7
const LASER_LIFETIME = 620

function ensureFlashLayer(): HTMLElement {
  if (!flashLayer) {
    flashLayer = document.createElement('div')
    flashLayer.className = 'typing-laser-layer'
    flashLayer.setAttribute('aria-hidden', 'true')
    document.body.appendChild(flashLayer)
  }
  return flashLayer
}

/** 在文档坐标处打一束激光：核心亮点 + 扩散光环 + 数道向外射出的光刃 */
export function spawnLaserFlash(x: number, y: number) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const flash = document.createElement('span')
  flash.className = 'typing-laser'
  flash.style.transform = `translate(${x}px, ${y}px)`

  for (let index = 0; index < LASER_BEAMS; index += 1) {
    const beam = document.createElement('i')
    const spread = (index - (LASER_BEAMS - 1) / 2) * 0.42
    const angle = -Math.PI / 2 + spread + (Math.random() - 0.5) * 0.22
    beam.style.setProperty('--rot', `${(angle * 180) / Math.PI}deg`)
    beam.style.setProperty('--dist', `${14 + Math.random() * 18}px`)
    beam.style.setProperty('--len', `${9 + Math.random() * 13}px`)
    beam.style.setProperty('--delay', `${Math.random() * 45}ms`)
    flash.appendChild(beam)
  }

  ensureFlashLayer().appendChild(flash)
  window.setTimeout(() => flash.remove(), LASER_LIFETIME)
}

/** 演示结束时把还亮着的光束一并收走 */
export function clearLaserFlashes() {
  flashLayer?.remove()
  flashLayer = null
}

type PopMeta = { type: 'set'; from: number; to: number } | { type: 'clear' }

export const typingPopKey = new PluginKey<DecorationSet | null>('typingPop')

/** 刚落下的字保持发光样式的时长，动画演完就回收，别让装饰长期留在正文里 */
const TYPED_POP_LIFETIME = 240
/** 激光光束的最小间隔，连续敲字时也不至于糊成一片 */
const TYPED_FLASH_INTERVAL = 110
/** 单次输入超过这个字数多半是粘贴 / 输入法整段提交，不算「逐字敲」 */
const TYPED_MAX_CHARS = 24

let popTimer = 0
let flashClock = 0

function scheduleGlowClear(editor: Editor) {
  window.clearTimeout(popTimer)
  popTimer = window.setTimeout(() => {
    if (editor.isDestroyed) return
    if (!typingPopKey.getState(editor.state)) return
    editor.view.dispatch(
      editor.state.tr
        .setMeta(typingPopKey, { type: 'clear' } satisfies PopMeta)
        .setMeta('addToHistory', false),
    )
  }, TYPED_POP_LIFETIME)
}

/** 在 pos 处打一束激光：节流后异步出手，位置取不到就静默跳过 */
function spawnFlashAt(editor: Editor, pos: number) {
  const now = performance.now()
  if (now - flashClock <= TYPED_FLASH_INTERVAL) return
  flashClock = now

  window.setTimeout(() => {
    if (editor.isDestroyed) return
    try {
      const coords = editor.view.coordsAtPos(pos)
      if (coords.bottom < 0 || coords.top > window.innerHeight) return
      spawnLaserFlash(
        coords.left + window.scrollX,
        (coords.top + coords.bottom) / 2 + window.scrollY,
      )
    } catch {
      // 文档刚被改过时位置可能取不到坐标，跳过这一次光束即可
    }
  }, 0)
}

/** 给 from..to 之间的字套上激光扫过的发光 */
function showTypingGlow(editor: Editor, from: number, to: number) {
  if (editor.isDestroyed || to <= from) return
  const size = editor.state.doc.content.size
  if (from < 1 || to > size) return

  editor.view.dispatch(
    editor.state.tr
      .setMeta(typingPopKey, { type: 'set', from, to } satisfies PopMeta)
      .setMeta('addToHistory', false),
  )
}

/**
 * 真实输入时的激光反馈：刚敲下的字亮一下，同时从光标处打出一束激光。
 * 打字演示自己有节奏地逐字落字，所以演示期间这边直接让路。
 */
function createTypingPopPlugin(editor: Editor) {
  return new Plugin<DecorationSet | null>({
    key: typingPopKey,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta(typingPopKey) as PopMeta | undefined

        if (meta?.type === 'clear') return null
        if (meta?.type === 'set') {
          return DecorationSet.create(tr.doc, [
            Decoration.inline(meta.from, meta.to, { class: 'typing-glow' }),
          ])
        }

        return value ? value.map(tr.mapping, tr.doc) : null
      },
    },
    props: {
      decorations(state) {
        return typingPopKey.getState(state)
      },
    },
    view(view) {
      /** 输入法组合开始时的光标位置，上屏后用它圈出刚落下的文字 */
      let composingAnchor = -1

      const onCompositionStart = () => {
        composingAnchor = view.state.selection.from
      }

      const onCompositionEnd = () => {
        const anchor = composingAnchor
        composingAnchor = -1
        if (anchor < 0) return

        // 组合期间的中间态不该闪，等上屏的文字并回文档后，
        // 按「组合起点 → 当前光标」补一次反馈，中文输入才有反应
        window.setTimeout(() => {
          if (editor.isDestroyed) return
          const to = editor.state.selection.from
          if (to <= anchor) return
          showTypingGlow(editor, anchor, to)
          scheduleGlowClear(editor)
          spawnFlashAt(editor, to)
        }, 0)
      }

      view.dom.addEventListener('compositionstart', onCompositionStart)
      view.dom.addEventListener('compositionend', onCompositionEnd)

      return {
        destroy() {
          view.dom.removeEventListener('compositionstart', onCompositionStart)
          view.dom.removeEventListener('compositionend', onCompositionEnd)
        },
      }
    },
    appendTransaction(transactions, _oldState, newState) {
      if (transactions.length !== 1) return null

      const tr = transactions[0]
      if (!tr.docChanged) return null
      if (typingRevealKey.getState(newState)) return null
      // 粘贴、拖拽、撤销重做都不该冒花
      if (tr.getMeta('paste') || tr.getMeta('addToHistory') === false) return null
      if (tr.steps.length !== 1) return null

      const step = tr.steps[0]
      if (!(step instanceof ReplaceStep) || step.from !== step.to) return null

      const inserted = step.slice.content
      if (inserted.childCount !== 1) return null
      const text = inserted.firstChild
      if (!text?.isText || !text.text || text.text.length > TYPED_MAX_CHARS) return null
      // 组合中的拼音中间态不闪，上屏那一下由 compositionend 统一补反馈
      if (editor.view.composing) return null

      const from = step.from
      const to = from + text.text.length

      scheduleGlowClear(editor)
      spawnFlashAt(editor, to)

      return newState.tr
        .setMeta(typingPopKey, { type: 'set', from, to } satisfies PopMeta)
        .setMeta('addToHistory', false)
    },
  })
}

export const TypingPop = Extension.create({
  name: 'typingPop',

  addProseMirrorPlugins() {
    return [createTypingPopPlugin(this.editor)]
  },
})

export const TypingReveal = Extension.create({
  name: 'typingReveal',

  addProseMirrorPlugins() {
    return [
      new Plugin<TypingRevealState | null>({
        key: typingRevealKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(typingRevealKey) as RevealMeta | undefined

            if (meta?.type === 'stop') return null
            if (meta?.type === 'set') {
              const total = countTypingUnits(tr.doc)
              if (!total) return null
              return {
                total,
                revealed: Math.max(0, Math.min(meta.revealed, total)),
              }
            }

            // 演示期间文档被外部改写（导入、清空等）时直接收场
            if (value && tr.docChanged) return null
            return value
          },
        },
        props: {
          decorations(state) {
            const value = typingRevealKey.getState(state)
            if (!value) return null

            const layout = buildTypingLayout(state.doc, value.revealed)
            if (layout.caretPos === null) return layout.decorations

            return layout.decorations.add(state.doc, [
              Decoration.widget(layout.caretPos, caretDom, {
                key: 'typing-caret',
                side: 1,
              }),
            ])
          },
        },
      }),
    ]
  },
})
