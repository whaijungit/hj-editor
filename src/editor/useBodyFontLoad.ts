import { useCallback, useEffect, useState } from 'react'
import { useCustomFonts } from './customFonts'
import {
  ensureBodyFont,
  getBodyFont,
  type BodyFontId,
  type FontLoadStatus,
} from './fonts'

type LoadResult = { id: BodyFontId; attempt: number; ok: boolean }

/** 选中字体后按需加载，返回加载状态与重试方法 */
export function useBodyFontLoad(fontId: BodyFontId) {
  const [result, setResult] = useState<LoadResult | null>(null)
  const [attempt, setAttempt] = useState(0)
  // 导入字体列表就绪后重新解析 fontId，触发实际加载
  useCustomFonts()
  const font = getBodyFont(fontId)

  useEffect(() => {
    if (!font.family) return

    let active = true

    void ensureBodyFont(fontId, attempt > 0).then((ok) => {
      if (active) setResult({ id: fontId, attempt, ok })
    })

    return () => {
      active = false
    }
  }, [font.family, fontId, attempt])

  // 本机字体无需加载；结果未回来前按下「加载中」处理
  const settled =
    result !== null && result.id === fontId && result.attempt === attempt

  const status: FontLoadStatus = !font.family
    ? 'ready'
    : settled
      ? result.ok
        ? 'ready'
        : 'error'
      : 'loading'

  const retry = useCallback(() => setAttempt((count) => count + 1), [])

  return { status, retry }
}
