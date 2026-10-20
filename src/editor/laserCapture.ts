/**
 * 激光笔截屏：借用浏览器的屏幕捕获能力取一帧画面。
 * 支持选择「当前标签页 / 窗口 / 整个屏幕」，批注画布在标签页捕获时会被一并拍下。
 */

type CaptureOptions = {
  /** 拿到视频流、抓取画面之前的回调，用于临时隐藏工具条等界面元素 */
  onBeforeGrab?: () => Promise<void>
}

function waitForFrame(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('empty-frame')), 4000)
    video.addEventListener(
      'loadeddata',
      () => {
        window.clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

export async function captureScreen({ onBeforeGrab }: CaptureOptions = {}): Promise<Blob> {
  const media = navigator.mediaDevices
  if (!media || typeof media.getDisplayMedia !== 'function') {
    throw new Error('unsupported')
  }

  const stream = await media.getDisplayMedia({
    video: { displaySurface: 'browser' },
    audio: false,
    // 仅 Chromium 生效：默认高亮当前标签页
    preferCurrentTab: true,
  } as unknown as DisplayMediaStreamOptions)

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = stream
  video.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;'
  document.body.appendChild(video)

  try {
    await video.play()
    await waitForFrame(video)
    if (onBeforeGrab) await onBeforeGrab()

    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) throw new Error('empty-frame')

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no-canvas')
    ctx.drawImage(video, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })
    if (!blob) throw new Error('encode-failed')
    return blob
  } finally {
    video.remove()
    video.srcObject = null
    stream.getTracks().forEach((track) => track.stop())
  }
}

export function captureErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError') return '截屏已取消或未授权'
  if (name === 'AbortError') return '截屏已取消'
  if (name === 'NotFoundError') return '没有可截取的屏幕或窗口'
  if (name === 'NotReadableError') return '无法读取屏幕画面，请重试'

  const message = error instanceof Error ? error.message : ''
  if (message === 'unsupported') return '当前浏览器不支持截屏，请使用 Chrome / Edge'
  if (message === 'empty-frame') return '没有取到画面，请重试'
  if (message === 'encode-failed') return '截图编码失败，请重试'
  return '截屏失败，请重试'
}

export function captureFileName(prefix = '批注截图') {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${prefix}-${date}-${time}.png`
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
