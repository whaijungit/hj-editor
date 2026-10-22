import { useCallback } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { RichTextEditor } from './RichTextEditor'
import { isValidShareId } from './share'

/**
 * 分享页：路由 `/share/<id>`。
 * 只读呈现别人发来的文稿，不读、也不写本地草稿。
 */
export function SharePage() {
  const { id } = useParams()
  const navigate = useNavigate()

  // 退出分享：交给路由跳转，router 的 location 才会跟着一起回到编辑页
  const exitShare = useCallback(
    (notice?: string) =>
      navigate('/', { replace: true, state: notice ? { notice } : null }),
    [navigate],
  )

  if (!isValidShareId(id)) return <Navigate to="/" replace />

  return <RichTextEditor sharedDocId={id} onExitShare={exitShare} />
}
