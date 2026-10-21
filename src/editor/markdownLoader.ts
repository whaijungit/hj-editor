type MarkdownModule = typeof import('./markdown')

let cached: MarkdownModule | null = null
let loading: Promise<MarkdownModule> | null = null

/**
 * turndown / katex / lowlight 只在导出、复制、源码视图时才需要，
 * 首屏不加载；第一次用到时下载并缓存，之后同步可用。
 */
export function loadMarkdown(): Promise<MarkdownModule> {
  if (cached) return Promise.resolve(cached)
  loading ??= import('./markdown').then((module) => {
    cached = module
    return module
  })
  return loading
}
