import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { EChartsType } from 'echarts/core'
import { observeViewport, stopObservingViewport } from './lazyRender'
import {
  buildSourceToggle,
  hiddenSourceDecoration,
  isSourceHidden,
  revealedSourceAt,
  toggleSourceKey,
} from './sourceToggle'

/** ```echarts / ```chart 都当作图表块 */
const ECHARTS_LANGUAGES = new Set(['echarts', 'echart', 'chart'])

type ThemeName = 'light' | 'dark'

type ChartSource = { option: Record<string, unknown>; height: number }
/** echartsSetup 的默认导出就是 `import * as echarts from 'echarts/core'` 的命名空间 */
type EchartsNamespace = typeof import('./echartsSetup').default

const DEFAULT_HEIGHT = 360
const MIN_HEIGHT = 160
const MAX_HEIGHT = 900
const CACHE_LIMIT = 60
/** 编辑图表代码后等停手再重画，避免每次按键都重播动画 */
const REBUILD_DELAY = 320

/** `revealed` 是「因为光标进来了而临时露出来的源码块」，其余按节点属性隐藏 */
type ChartState = { revealed: number | null; decorations: DecorationSet }

const pluginKey = new PluginKey<ChartState>('echartsPreview')
const redrawKey = 'echarts-redraw'

type WidgetFactory = (view: EditorView, getPos: () => number | undefined) => HTMLElement

/**
 * widget 工厂缓存：prosemirror 用工厂函数的引用判断 widget 是否变化，
 * 缓存住之后，光标移动、无关段落的编辑都不会让图表重建重画。
 * key 里带上「是否隐藏源码」，切换开关时才会换成新的 widget（按钮文案跟着变）。
 */
const widgetFactories = new Map<string, WidgetFactory>()
/** 每个挂载点上的图表实例和它的尺寸监听，释放时一起收掉 */
const liveCharts = new Map<HTMLElement, { chart: EChartsType; resize: ResizeObserver }>()

let echartsPromise: Promise<EchartsNamespace> | null = null
let currentTheme: ThemeName =
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
let redrawView: EditorView | null = null

export function isEchartsLanguage(language: string | null | undefined): boolean {
  if (!language) return false
  return ECHARTS_LANGUAGES.has(language.trim().toLowerCase())
}

function loadEcharts() {
  if (!echartsPromise) {
    echartsPromise = import('./echartsSetup').then((module) => module.default)
  }
  return echartsPromise
}

function trimCache<V>(cache: Map<string, V>) {
  if (cache.size <= CACHE_LIMIT) return
  const oldest = cache.keys().next().value
  if (oldest !== undefined) cache.delete(oldest)
}

type OptionResult = { option: Record<string, unknown> } | { error: string }

function formatError(error: unknown): string {
  return error instanceof Error ? error.message.split('\n')[0] : String(error)
}

/** 归一化：允许返回函数（直接调用取返回值），最终必须是一个对象 */
function toOption(value: unknown): OptionResult {
  let option = value
  if (typeof option === 'function') {
    option = (option as () => unknown)()
  }
  if (!option || typeof option !== 'object' || Array.isArray(option)) {
    return { error: '图表配置需要返回一个对象，例如 { xAxis: {…}, series: […] }' }
  }
  return { option: option as Record<string, unknown> }
}

/**
 * 把代码块内容当 JS 执行，取回 option。执行作用域里给了 `echarts`（就是 ECharts 命名空间），
 * 所以官方示例里的 `new echarts.graphic.LinearGradient(…)` 能直接抄。
 * - 先当表达式试：`{ … }`、`echarts.graphic.LinearGradient(…)`、`() => ({…})` 这类
 * - 表达式不成，再当语句试：`option = {…}`、`const option = {…}`、`return {…}` 这类
 * 语句模式不开严格模式（官方示例常写 `option = {…}` 不声明），落到全局的 `option` 用完立刻还原。
 * 注意：JS 写法会在页面里执行，等价于在文档里跑脚本，只应打开可信的文档。
 */
function evaluateJs(code: string, echarts: EchartsNamespace): OptionResult {
  try {
    return toOption(new Function('echarts', `"use strict";return (\n${code}\n)`)(echarts))
  } catch (error) {
    // 语法错误说明是语句写法；`option = {…}` 这种未声明的赋值会报 ReferenceError，也要再来一遍
    const bareAssignment = error instanceof ReferenceError && /option/.test(error.message)
    if (!(error instanceof SyntaxError) && !bareAssignment) return { error: formatError(error) }
  }

  const scope = globalThis as unknown as Record<string, unknown>
  const hadOption = 'option' in scope
  const previousOption = scope.option
  try {
    const value = new Function(
      'echarts',
      `${code}\n;return typeof option === "undefined" ? undefined : option`,
    )(echarts)
    return toOption(value)
  } catch (error) {
    // 语法错误的原始消息会指向我们注入的包装代码，换成能看懂的说法
    if (error instanceof SyntaxError) {
      return { error: '语法不完整或括号未闭合（JSON 与 JS 写法都看一下）' }
    }
    return { error: formatError(error) }
  } finally {
    if (hadOption) scope.option = previousOption
    else delete scope.option
  }
}

/** 解析结果缓存：键是代码块内容，option 里的函数也一起缓存，重建图表不会重跑脚本 */
const optionCache = new Map<string, OptionResult>()

/** 只读首行 `// height: 420`，不执行代码，所以建 widget 时就能定高 */
function readHeight(code: string): number {
  const match = code.match(/^\s*\/\/\s*height\s*[:=]\s*(\d{2,4})\s*$/im)
  if (!match) return DEFAULT_HEIGHT
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Number(match[1])))
}

/**
 * 解析代码块内容，支持两种写法：
 * - JSON：允许 `//` 整行注释、`/* *\/` 块注释、尾逗号，只走 JSON.parse，不执行代码
 * - JS：变量 / 循环 / map / 模板字符串 / formatter 函数都可以，最后交出 option 对象
 */
function parseOption(code: string, echarts: EchartsNamespace): OptionResult {
  if (!code.trim()) return { error: '图表配置为空，写一段 ECharts 的 option（JSON 或 JS 都行）' }

  const json = code
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim()

  if (json) {
    try {
      return toOption(JSON.parse(json))
    } catch {
      // 不是 JSON，继续按 JS 处理
    }
  }

  const evaluated = evaluateJs(code, echarts)
  if ('error' in evaluated) {
    return { error: `既不是合法 JSON，按 JS 执行也失败：${evaluated.error}` }
  }
  return evaluated
}

function buildOption(code: string, echarts: EchartsNamespace): OptionResult {
  const cached = optionCache.get(code)
  if (cached) return cached
  const parsed = parseOption(code, echarts)
  optionCache.set(code, parsed)
  trimCache(optionCache)
  return parsed
}

/**
 * echarts 是动态 import 的，JS 写法又要用到它的命名空间，所以 option 等到这里才解析。
 * 高度是同步读的，建 widget 时就能占好位置，解析完成不会让布局跳动。
 */
async function loadSource(code: string): Promise<ChartSource | { error: string }> {
  const height = readHeight(code)
  try {
    const echarts = await loadEcharts()
    const result = buildOption(code, echarts)
    return 'error' in result ? result : { option: result.option, height }
  } catch (error) {
    return { error: formatError(error) }
  }
}

function makeHint(figure: HTMLElement, text: string): HTMLElement {
  const hint = document.createElement('span')
  hint.className = 'echarts-hint'
  hint.textContent = text
  figure.appendChild(hint)
  return hint
}

function showError(figure: HTMLElement, message: string) {
  figure.dataset.state = 'error'
  // 不动工具栏：报错时也得留一个「显示代码」的入口
  figure.querySelector('.echarts-mount')?.remove()
  figure.querySelector('.echarts-hint')?.remove()
  const hint = document.createElement('span')
  hint.className = 'echarts-hint'
  hint.textContent = `ECharts 配置错误：${message}`
  figure.appendChild(hint)
}

/**
 * 图表默认带入场动画：ECharts 自身默认也是开着的，这里显式给一组更柔和、稍慢的参数，
 * 让文档里的图一出现就有动感。用户在 option 里写了 animation / animationDuration /
 * animationEasing 时以用户的为准（展开顺序在 option 之后）。
 */
const DEFAULT_ANIMATION = {
  animation: true,
  animationDuration: 900,
  animationEasing: 'cubicOut',
}

function withDefaultAnimation(
  option: Record<string, unknown>,
): Record<string, unknown> {
  return { ...DEFAULT_ANIMATION, ...option }
}

async function paint(figure: HTMLElement, mount: HTMLElement, theme: ThemeName, code: string) {
  // 已画好、正在画、或已经报错的，都不重复初始化（滚动会反复触发）
  const state = figure.dataset.state
  if (state === 'ready' || state === 'painting' || state === 'error') return
  figure.dataset.state = 'painting'

  const source = await loadSource(code)
  if (!figure.isConnected || figure.dataset.state !== 'painting') return
  if ('error' in source) {
    showError(figure, source.error)
    return
  }

  try {
    const echarts = await loadEcharts()
    if (!figure.isConnected || figure.dataset.state !== 'painting') return

    const chart = echarts.init(mount, theme === 'dark' ? 'dark' : undefined, {
      renderer: 'canvas',
    })
    chart.setOption(withDefaultAnimation(source.option) as never)

    const resize = new ResizeObserver(() => chart.resize())
    resize.observe(mount)
    liveCharts.set(mount, { chart, resize })

    figure.dataset.state = 'ready'
    figure.querySelector('.echarts-hint')?.remove()
  } catch (error) {
    if (!figure.isConnected) return
    const message = error instanceof Error ? error.message : String(error)
    showError(figure, message.split('\n')[0])
  }
}

/** 滚出视口后释放图表实例，占位高度保留，滚回来再按需重画 */
function releaseFigure(figure: HTMLElement, mount: HTMLElement) {
  if (figure.dataset.state === 'painting') {
    // 还在异步解析/初始化，标记一下让 paint 的后续步骤直接放弃
    figure.dataset.state = 'idle'
    return
  }
  if (figure.dataset.state !== 'ready') return

  const live = liveCharts.get(mount)
  if (live) {
    live.resize.disconnect()
    live.chart.dispose()
    liveCharts.delete(mount)
  }
  figure.dataset.state = 'idle'
  mount.replaceChildren()
}

function buildFigure(
  view: EditorView,
  getPos: () => number | undefined,
  code: string,
  theme: ThemeName,
  hidden: boolean,
): HTMLElement {
  const figure = document.createElement('div')
  figure.className = 'echarts-figure'
  figure.contentEditable = 'false'
  figure.dataset.state = 'pending'
  figure.appendChild(buildSourceToggle(view, getPos, hidden))

  if (!code.trim()) {
    showError(figure, '图表配置为空，写一段 ECharts 的 option（JSON 或 JS 都行）')
    return figure
  }

  const mount = document.createElement('div')
  mount.className = 'echarts-mount'
  mount.style.height = `${readHeight(code)}px`
  figure.appendChild(mount)
  makeHint(figure, '图表渲染中…')

  // 滚到视口附近才初始化图表，滚远后释放画布，只保留占位高度
  observeViewport(figure, {
    mount: () => void paint(figure, mount, theme, code),
    unmount: () => releaseFigure(figure, mount),
  })

  return figure
}

function widgetFactory(code: string, theme: ThemeName, hidden: boolean): WidgetFactory {
  const key = `${theme}\u0000${hidden ? '1' : '0'}\u0000${code}`
  let factory = widgetFactories.get(key)
  if (!factory) {
    factory = (view, getPos) => buildFigure(view, getPos, code, theme, hidden)
    widgetFactories.set(key, factory)
    trimCache(widgetFactories)
  }
  return factory
}

/** 已离开文档的图表实例要及时销毁，否则主题切换、删代码块后会残留内存 */
function pruneCharts() {
  for (const [mount, live] of liveCharts) {
    if (mount.isConnected) continue
    live.resize.disconnect()
    live.chart.dispose()
    liveCharts.delete(mount)
  }
}

let rebuildTimer = 0

/**
 * 停手后再重画图表：连续输入时先沿用旧图表，
 * 否则每敲一个字符都会重建图表 DOM 并重新初始化 ECharts。
 */
function scheduleRebuild() {
  window.clearTimeout(rebuildTimer)
  rebuildTimer = window.setTimeout(() => {
    rebuildTimer = 0
    const view = redrawView
    if (!view) return
    view.dispatch(view.state.tr.setMeta(redrawKey, true))
  }, REBUILD_DELAY)
}

function buildDecorations(doc: ProseMirrorNode, revealed: number | null): DecorationSet {
  pruneCharts()
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return
    if (!isEchartsLanguage(node.attrs.language as string | null)) return

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
        // widget 被移除时停止视口观察，别让 observer 一直攥着已销毁的 DOM
        destroy: stopObservingViewport,
      }),
    )
  })

  return DecorationSet.create(doc, decorations)
}

export const EchartsDiagram = Extension.create({
  name: 'echartsDiagram',

  addProseMirrorPlugins() {
    const { editor } = this
    // 只读（分享页）不做「光标进块就临时露源码」：看的人不编辑，
    // 露出来只会把源码直接摊在读者面前，图表反而被顶下去
    const canRevealSource = () => editor.isEditable !== false

    return [
      new Plugin<ChartState>({
        key: pluginKey,
        state: {
          init: (_config, state) => {
            const revealed = revealedSourceAt(state, isEchartsLanguage, canRevealSource())
            return { revealed, decorations: buildDecorations(state.doc, revealed) }
          },
          /**
           * 只在文档真正变化、主题切换、切换「隐藏源码」，
           * 或光标进出被隐藏的块时重算装饰。
           * 原实现每次事务（含光标移动）都全量遍历文档，长文档输入会明显变卡。
           */
          apply: (tr, value, _oldState, newState) => {
            const revealed = revealedSourceAt(newState, isEchartsLanguage, canRevealSource())
            if (
              tr.getMeta(redrawKey) ||
              tr.getMeta(toggleSourceKey) ||
              revealed !== value.revealed
            ) {
              return { revealed, decorations: buildDecorations(newState.doc, revealed) }
            }
            if (tr.docChanged) {
              // 旧图表跟着位置映射走，内容变化等防抖结束后再重建
              scheduleRebuild()
              return { revealed, decorations: value.decorations.map(tr.mapping, tr.doc) }
            }
            return value
          },
        },
        props: {
          decorations: (state) =>
            pluginKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
        view: (view) => {
          redrawView = view
          return {
            destroy: () => {
              if (redrawView === view) redrawView = null
            },
          }
        },
      }),
    ]
  },
})

/** 主题变化后重新渲染：ECharts 的配色在初始化时固定 */
export function setEchartsTheme(theme: ThemeName): void {
  if (theme === currentTheme) return
  currentTheme = theme
  redrawView?.dispatch(redrawView.state.tr.setMeta(redrawKey, true))
}

/** 导出时把图表渲染成 SVG 字符串，离线打开也能看到图 */
export async function renderEchartsSvg(
  code: string,
  theme: ThemeName,
  width = 760,
): Promise<string | null> {
  const source = await loadSource(code)
  if ('error' in source) return null

  try {
    const echarts = await loadEcharts()
    const chart = echarts.init(null, theme === 'dark' ? 'dark' : undefined, {
      renderer: 'svg',
      ssr: true,
      width,
      height: source.height,
    })
    try {
      chart.setOption(source.option as never)
      return chart.renderToSVGString({ useViewBox: true })
    } finally {
      chart.dispose()
    }
  } catch {
    return null
  }
}
