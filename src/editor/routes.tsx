import { useEffect } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { RichTextEditor } from './RichTextEditor'
import { SharePage } from './SharePage'
import { legacySharePath } from './share'

type NoticeState = { notice?: string } | null

/**
 * 写文档页 `/`。
 * 旧分享链接是 `/?doc=<id>`，这里就地跳到新路由，免得分享参数继续挂在编辑页上。
 */
function EditorRoute() {
  const { search, state } = useLocation()
  const navigate = useNavigate()
  const legacyPath = legacySharePath(search)
  const notice = (state as NoticeState)?.notice

  // 提示只该出现一次：消费完就把 history state 里的一次性消息清掉
  useEffect(() => {
    if (!notice) return
    navigate('/', { replace: true, state: null })
  }, [navigate, notice])

  if (legacyPath) return <Navigate to={legacyPath} replace />

  return <RichTextEditor notice={notice} />
}

/** 应用路由表：写文档页 + 只读分享页，其余路径回编辑页 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<EditorRoute />} />
      <Route path="/share/:id" element={<SharePage />} />
      {/* <Route path="*" element={<Navigate to="/" replace />} /> */}
    </Routes>
  )
}
