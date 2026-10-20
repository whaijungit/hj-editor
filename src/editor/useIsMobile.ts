import { useEffect, useState } from 'react'

/** 与 CSS 里的 720px 断点保持一致 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 720px)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)')
    const handleChange = (event: MediaQueryListEvent) =>
      setIsMobile(event.matches)

    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])

  return isMobile
}
