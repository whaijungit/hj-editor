import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { Mermaid, MermaidConfig } from 'mermaid'
import { observeViewport, stopObservingViewport } from './lazyRender'
import {
  buildSourceToggle,
  hiddenSourceDecoration,
  isSourceHidden,
  revealedSourceAt,
  toggleSourceKey,
} from './sourceToggle'

/** ```mermaid 与社区常用的简写 ```mmd 都当作图表块 */
const MERMAID_LANGUAGES = new Set(['mermaid', 'mmd'])

type ThemeName = 'light' | 'dark'

type RenderOutcome = { svg: string } | { error: string }

type WidgetFactory = (view: EditorView, getPos: () => number | undefined) => HTMLElement

/** `revealed` 是「因为光标进来了而临时露出来的源码块」，其余按节点属性隐藏 */
type MermaidState = { revealed: number | null; decorations: DecorationSet }

const pluginKey = new PluginKey<MermaidState>('mermaidPreview')
const CACHE_LIMIT = 80
const RENDER_DELAY = 180

const renderCache = new Map<string, RenderOutcome>()
/**
 * prosemirror 用 toDOM 的引用相等判断 widget 有没有变化，
 * 缓存住工厂函数，光标移动/无关编辑时图表就不会被重建、重画
 */
const widgetFactories = new Map<string, WidgetFactory>()
let mermaidPromise: Promise<Mermaid> | null = null
let loadedTheme: ThemeName | null = null
let currentTheme: ThemeName =
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
let redraw: (() => void) | null = null
let sequence = 0

export function isMermaidLanguage(language: string | null | undefined): boolean {
  if (!language) return false
  return MERMAID_LANGUAGES.has(language.trim().toLowerCase())
}

function cacheKey(code: string, theme: ThemeName): string {
  return `${theme}\u0000${code}`
}

function trimCache<V>(cache: Map<string, V>) {
  if (cache.size <= CACHE_LIMIT) return
  const oldest = cache.keys().next().value
  if (oldest !== undefined) cache.delete(oldest)
}

function buildConfig(theme: ThemeName): MermaidConfig {
  return {
    startOnLoad: false,
    // 图表来自用户输入，禁止交互脚本与内联事件
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'default',
    fontFamily:
      'ui-sans-serif, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
    flowchart: { curve: 'basis' },
  }
}

/** mermaid 体积不小，等文档里真的出现图表再加载 */
async function loadMermaid(theme: ThemeName): Promise<Mermaid> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => mermaid)
  }
  const mermaid = await mermaidPromise
  // 配色在 initialize 时就固定了，换主题要重新初始化
  if (loadedTheme !== theme) {
    mermaid.initialize(buildConfig(theme))
    loadedTheme = theme
  }
  return mermaid
}

async function renderDiagram(code: string, theme: ThemeName): Promise<RenderOutcome> {
  const key = cacheKey(code, theme)
  const cached = renderCache.get(key)
  if (cached) return cached

  let outcome: RenderOutcome
  try {
    const mermaid = await loadMermaid(theme)
    sequence += 1
    const { svg } = await mermaid.render(`mermaid-diagram-${sequence}`, code)
    outcome = { svg }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    outcome = { error: message.split('\n')[0] }
  }

  renderCache.set(key, outcome)
  trimCache(renderCache)
  return outcome
}

/**
 * 换掉图表内容，但留着右上角的「隐藏代码」开关——
 * 之前直接 figure.innerHTML / replaceChildren 会连按钮一起冲掉。
 */
function setContent(figure: HTMLElement, nodes: Node[]) {
  const toolbar = figure.querySelector('.code-source-toolbar')
  figure.replaceChildren(...(toolbar ? [toolbar] : []), ...nodes)
}

function makeHint(text: string): HTMLElement {
  const hint = document.createElement('span')
  hint.className = 'mermaid-figure-hint'
  hint.textContent = text
  return hint
}

function paint(figure: HTMLElement, outcome: RenderOutcome) {
  figure.style.minHeight = ''
  if ('svg' in outcome) {
    figure.dataset.state = 'ready'
    const holder = document.createElement('div')
    holder.innerHTML = outcome.svg
    // mermaid 可能返回 <style> + <svg>，整体搬进去
    setContent(figure, Array.from(holder.childNodes))
    return
  }
  figure.dataset.state = 'error'
  setContent(figure, [makeHint(`Mermaid 语法错误：${outcome.error}`)])
}

/** 滚出视口后丢掉 SVG，占位高度保留，滚回来直接从缓存恢复 */
function releaseDiagram(figure: HTMLElement) {
  if (figure.dataset.state === 'pending') {
    // 还在异步渲染，标记一下让渲染结果直接丢掉
    figure.dataset.state = 'idle'
    return
  }
  if (figure.dataset.state !== 'ready') return

  const height = figure.offsetHeight
  if (height > 0) figure.style.minHeight = `${height}px`
  figure.dataset.state = 'idle'
  // 只留工具栏，SVG 丢掉
  setContent(figure, [])
}

/** 进入视口时才渲染；同一张图滚动时可能被反复触发，这里按状态幂等 */
function mountDiagram(figure: HTMLElement, code: string, theme: ThemeName) {
  if (figure.dataset.state === 'ready' || figure.dataset.state === 'pending') return

  const cached = renderCache.get(cacheKey(code, theme))
  if (cached) {
    paint(figure, cached)
    return
  }

  figure.dataset.state = 'pending'
  setContent(figure, [makeHint('图表渲染中…')])

  // 进入视口后再略等一下，打字时不会每键重画
  window.setTimeout(() => {
    if (!figure.isConnected || figure.dataset.state !== 'pending') return
    void renderDiagram(code, theme).then((outcome) => {
      if (figure.isConnected && figure.dataset.state === 'pending') {
        paint(figure, outcome)
      }
    })
  }, RENDER_DELAY)
}

function buildFigure(
  view: EditorView,
  getPos: () => number | undefined,
  code: string,
  theme: ThemeName,
  hidden: boolean,
): HTMLElement {
  const figure = document.createElement('div')
  figure.className = 'mermaid-figure'
  figure.contentEditable = 'false'
  figure.dataset.state = 'idle'
  figure.appendChild(buildSourceToggle(view, getPos, hidden))
  // 空元素没有面积 IntersectionObserver 不好判断，先给一点占位高度
  figure.style.minHeight = '40px'

  observeViewport(figure, {
    mount: () => mountDiagram(figure, code, theme),
    unmount: () => releaseDiagram(figure),
  })

  return figure
}

function widgetFactory(code: string, theme: ThemeName, hidden: boolean): WidgetFactory {
  const key = `${cacheKey(code, theme)}\u0000${hidden ? '1' : '0'}`
  let factory = widgetFactories.get(key)
  if (!factory) {
    factory = (view, getPos) => buildFigure(view, getPos, code, theme, hidden)
    widgetFactories.set(key, factory)
    trimCache(widgetFactories)
  }
  return factory
}

function buildDecorations(doc: ProseMirrorNode, revealed: number | null): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return
    if (!isMermaidLanguage(node.attrs.language as string | null)) return

    const code = node.textContent.trim()
    if (!code) return

    const hidden = isSourceHidden(node)
    // 收起源码的块用装饰加类隐藏，文档内容原样保留；光标进来时临时露出来
    if (hidden && pos !== revealed) {
      decorations.push(hiddenSourceDecoration(pos, node.nodeSize))
    }

    // 图表贴在代码块下方，代码本身仍可编辑
    decorations.push(
      Decoration.widget(pos + node.nodeSize, widgetFactory(code, currentTheme, hidden), {
        side: 1,
        // widget 被移除时停止视口观察
        destroy: stopObservingViewport,
      }),
    )
  })

  return DecorationSet.create(doc, decorations)
}

export const MermaidDiagram = Extension.create({
  name: 'mermaidDiagram',

  addProseMirrorPlugins() {
    const { editor } = this
    // 只读（分享页）不做「光标进块就临时露源码」：看的人不编辑，
    // 露出来只会把源码直接摊在读者面前，图表反而被顶下去
    const canRevealSource = () => editor.isEditable !== false

    return [
      new Plugin<MermaidState>({
        key: pluginKey,
        state: {
          init: (_config, state) => {
            const revealed = revealedSourceAt(state, isMermaidLanguage, canRevealSource())
            return { revealed, decorations: buildDecorations(state.doc, revealed) }
          },
          /**
           * 只在文档真正变化、主题切换、切换「隐藏源码」，
           * 或光标进出被隐藏的块时重算装饰。
           * 原来每个事务（含光标移动）都全量遍历文档，长文档输入会被这里拖慢。
           */
          apply: (tr, value, _oldState, newState) => {
            const revealed = revealedSourceAt(newState, isMermaidLanguage, canRevealSource())
            if (
              tr.docChanged ||
              tr.getMeta(pluginKey) ||
              tr.getMeta(toggleSourceKey) ||
              revealed !== value.revealed
            ) {
              return { revealed, decorations: buildDecorations(newState.doc, revealed) }
            }
            return value
          },
        },
        props: {
          decorations: (state) =>
            pluginKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
        view: (editorView: EditorView) => {
          redraw = () => {
            editorView.dispatch(editorView.state.tr.setMeta(pluginKey, true))
          }
          return {
            destroy: () => {
              if (redraw) redraw = null
            },
          }
        },
      }),
    ]
  },
})

/** 主题变化后重新渲染：mermaid 的配色在初始化时就定好了 */
export function setMermaidTheme(theme: ThemeName): void {
  if (theme === currentTheme) return
  currentTheme = theme
  redraw?.()
}
