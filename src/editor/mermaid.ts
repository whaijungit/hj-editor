import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { Mermaid, MermaidConfig } from 'mermaid'

/** ```mermaid 与社区常用的简写 ```mmd 都当作图表块 */
const MERMAID_LANGUAGES = new Set(['mermaid', 'mmd'])

type ThemeName = 'light' | 'dark'

type RenderOutcome = { svg: string } | { error: string }

type WidgetFactory = () => HTMLElement

const pluginKey = new PluginKey('mermaidPreview')
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

function paint(figure: HTMLElement, outcome: RenderOutcome) {
  if ('svg' in outcome) {
    figure.dataset.state = 'ready'
    figure.innerHTML = outcome.svg
    return
  }
  figure.dataset.state = 'error'
  const hint = document.createElement('span')
  hint.className = 'mermaid-figure-hint'
  hint.textContent = `Mermaid 语法错误：${outcome.error}`
  figure.replaceChildren(hint)
}

function buildFigure(code: string, theme: ThemeName): HTMLElement {
  const figure = document.createElement('div')
  figure.className = 'mermaid-figure'
  figure.contentEditable = 'false'
  figure.dataset.state = 'pending'

  const cached = renderCache.get(cacheKey(code, theme))
  if (cached) {
    paint(figure, cached)
    return figure
  }

  figure.innerHTML = '<span class="mermaid-figure-hint">图表渲染中…</span>'

  // 打字过程中代码每变一次都会重建图表，用延时合并渲染，避免拖慢输入
  window.setTimeout(() => {
    if (!figure.isConnected) return
    void renderDiagram(code, theme).then((outcome) => {
      if (figure.isConnected) paint(figure, outcome)
    })
  }, RENDER_DELAY)

  return figure
}

function widgetFactory(code: string, theme: ThemeName): WidgetFactory {
  const key = cacheKey(code, theme)
  let factory = widgetFactories.get(key)
  if (!factory) {
    factory = () => buildFigure(code, theme)
    widgetFactories.set(key, factory)
    trimCache(widgetFactories)
  }
  return factory
}

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return
    if (!isMermaidLanguage(node.attrs.language as string | null)) return

    const code = node.textContent.trim()
    if (!code) return

    // 图表贴在代码块下方，代码本身仍可编辑
    decorations.push(
      Decoration.widget(pos + node.nodeSize, widgetFactory(code, currentTheme), {
        side: 1,
      }),
    )
  })

  return DecorationSet.create(doc, decorations)
}

export const MermaidDiagram = Extension.create({
  name: 'mermaidDiagram',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        props: {
          decorations: (state) => buildDecorations(state.doc),
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
