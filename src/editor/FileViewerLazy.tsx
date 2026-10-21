import { lazy } from 'react'

/**
 * 预览器（@file-viewer/react-full）体积较大，等真正要看文件时再加载。
 * 弹窗预览和编辑区文件面板共用这一份懒加载入口，避免各打一遍。
 */
export const LazyFileViewer = lazy(async () => {
  const module = await import('@file-viewer/react-full')
  return { default: module.FileViewer }
})
