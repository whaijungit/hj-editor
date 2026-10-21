/**
 * 视口内渲染：滚到附近的区域才挂载组件，滚远后释放。
 * 长文档打开时不再把整篇的图表/公式都渲染一遍，只保留视口附近的那几个。
 */
type ViewportHandlers = {
  /** 进入视口附近时挂载，必须幂等（滚动过程中可能被反复调用） */
  mount: () => void
  /** 离开视口较远时释放 */
  unmount?: () => void
}

const callbacks = new WeakMap<Element, ViewportHandlers>()
const releaseTimers = new WeakMap<Element, number>()
let observer: IntersectionObserver | null = null

/** 只提前一小段，避免“还没看到就先渲染” */
const MOUNT_MARGIN = '160px 0px'
/** 离开视口超过这个距离才释放，上下小幅滚动时不会反复挂载/卸载 */
const RELEASE_DISTANCE = 600
const RELEASE_DELAY = 240

function farFromViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect()
  const height = window.innerHeight || document.documentElement.clientHeight
  return rect.bottom < -RELEASE_DISTANCE || rect.top > height + RELEASE_DISTANCE
}

function cancelRelease(element: Element) {
  const timer = releaseTimers.get(element)
  if (timer === undefined) return
  window.clearTimeout(timer)
  releaseTimers.delete(element)
}

function scheduleRelease(element: Element) {
  cancelRelease(element)
  releaseTimers.set(
    element,
    window.setTimeout(() => {
      releaseTimers.delete(element)
      if (!element.isConnected) return
      if (!farFromViewport(element)) return
      callbacks.get(element)?.unmount?.()
    }, RELEASE_DELAY),
  )
}

function getObserver(): IntersectionObserver {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = entry.target
          const handlers = callbacks.get(target)
          if (!handlers || !target.isConnected) {
            if (!target.isConnected) callbacks.delete(target)
            observer?.unobserve(target)
            continue
          }
          if (entry.isIntersecting) {
            cancelRelease(target)
            handlers.mount()
          } else if (handlers.unmount) {
            scheduleRelease(target)
          }
        }
      },
      { rootMargin: MOUNT_MARGIN },
    )
  }
  return observer
}

export function observeViewport(element: Element, handlers: ViewportHandlers): void {
  if (typeof IntersectionObserver === 'undefined') {
    handlers.mount()
    return
  }

  callbacks.set(element, handlers)
  getObserver().observe(element)
}

/** widget 被 prosemirror 移除时停止观察，避免 observer 一直持有已经销毁的 DOM */
export function stopObservingViewport(node: Node): void {
  if (!(node instanceof Element)) return
  cancelRelease(node)
  callbacks.delete(node)
  observer?.unobserve(node)
}
