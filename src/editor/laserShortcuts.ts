import type { LaserTool } from './laserConfig'

const STORAGE_KEY = 'hj-editor:laser-shortcuts'

export { eventToKey, formatKey } from './keys'

export type LaserActionId =
  | 'exit'
  | 'undo'
  | 'clear'
  | 'fade'
  | 'shot'
  | LaserTool

export type LaserShortcutDef = {
  id: LaserActionId
  label: string
  group: '操作' | '工具'
  defaultKey: string
}

export const LASER_SHORTCUT_GROUPS = ['操作', '工具'] as const

export const LASER_SHORTCUTS: LaserShortcutDef[] = [
  { id: 'undo', label: '撤销一步', group: '操作', defaultKey: 'mod+z' },
  { id: 'clear', label: '清空批注', group: '操作', defaultKey: 'c' },
  { id: 'shot', label: '截屏保存', group: '操作', defaultKey: 's' },
  { id: 'fade', label: '切换渐隐 / 保留', group: '操作', defaultKey: 'f' },
  { id: 'exit', label: '退出激光笔', group: '操作', defaultKey: 'escape' },
  { id: 'pen', label: '自由笔', group: '工具', defaultKey: '1' },
  { id: 'line', label: '直线', group: '工具', defaultKey: '2' },
  { id: 'rect', label: '矩形', group: '工具', defaultKey: '3' },
  { id: 'ellipse', label: '椭圆', group: '工具', defaultKey: '4' },
  { id: 'arrow', label: '箭头', group: '工具', defaultKey: '5' },
  { id: 'text', label: '文字', group: '工具', defaultKey: '6' },
  { id: 'move', label: '移动 / 选择', group: '工具', defaultKey: '7' },
]

export type LaserKeyMap = Record<LaserActionId, string>

export function defaultLaserKeys(): LaserKeyMap {
  const map = {} as LaserKeyMap
  LASER_SHORTCUTS.forEach((item) => {
    map[item.id] = item.defaultKey
  })
  return map
}

export function loadLaserKeys(): LaserKeyMap {
  const map = defaultLaserKeys()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return map
    const parsed = JSON.parse(raw) as Partial<LaserKeyMap>
    LASER_SHORTCUTS.forEach((item) => {
      const value = parsed[item.id]
      if (typeof value === 'string') map[item.id] = value
    })
  } catch {
    // 忽略损坏的配置
  }
  return map
}

export function saveLaserKeys(keys: LaserKeyMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
  } catch {
    // 忽略隐私模式下的写入失败
  }
}

export function resolveLaserAction(keys: LaserKeyMap, combo: string): LaserActionId | null {
  if (!combo) return null
  const hit = LASER_SHORTCUTS.find((item) => keys[item.id] === combo)
  return hit ? hit.id : null
}
