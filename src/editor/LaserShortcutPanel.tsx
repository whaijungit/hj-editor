import { RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  LASER_SHORTCUTS,
  LASER_SHORTCUT_GROUPS,
  defaultLaserKeys,
  eventToKey,
  formatKey,
  type LaserActionId,
  type LaserKeyMap,
} from './laserShortcuts'

export function LaserShortcutPanel({
  keys,
  onChange,
  onClose,
}: {
  keys: LaserKeyMap
  onChange: (keys: LaserKeyMap) => void
  onClose: () => void
}) {
  const [recording, setRecording] = useState<LaserActionId | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (!recording) {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setRecording(null)
        setConflict(null)
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        setRecording(null)
        setConflict(null)
        onChange({ ...keys, [recording]: '' })
        return
      }

      const combo = eventToKey(event)
      if (!combo) return

      const taken = LASER_SHORTCUTS.find(
        (item) => item.id !== recording && keys[item.id] === combo,
      )
      if (taken) {
        setConflict(`与「${taken.label}」冲突，换一个组合或先修改它`)
        return
      }

      setRecording(null)
      setConflict(null)
      onChange({ ...keys, [recording]: combo })
    }

    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [recording, keys, onChange, onClose])

  return (
    <div className="laser-panel" role="dialog" aria-label="自定义激光笔快捷键">
      <div className="laser-panel-head">
        <span>自定义快捷键</span>
        <button
          type="button"
          className="laser-action"
          aria-label="关闭快捷键设置"
          onClick={() => {
            setRecording(null)
            onClose()
          }}
        >
          <X size={14} />
        </button>
      </div>

      <div className="laser-panel-body">
        {LASER_SHORTCUT_GROUPS.map((group) => (
          <div key={group} className="laser-panel-group">
            <span className="laser-panel-title">{group}</span>
            {LASER_SHORTCUTS.filter((item) => item.group === group).map((item) => {
              const active = recording === item.id
              return (
                <div key={item.id} className="laser-panel-row" data-recording={active}>
                  <span>{item.label}</span>
                  <button
                    type="button"
                    className="laser-key"
                    data-recording={active}
                    aria-label={`${item.label}：${formatKey(keys[item.id])}，点击修改`}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setConflict(null)
                      setRecording(item.id)
                    }}
                  >
                    {active ? '按下按键…' : formatKey(keys[item.id])}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
        {conflict && (
          <p className="laser-panel-note" data-variant="error" role="alert">
            {conflict}
          </p>
        )}
      </div>

      <div className="laser-panel-foot">
        <span className="laser-panel-note">点击键位后按下组合键 · Esc 取消</span>
        <button
          type="button"
          className="laser-panel-reset"
          onClick={() => {
            setRecording(null)
            setConflict(null)
            onChange(defaultLaserKeys())
          }}
        >
          <RotateCcw size={12} />
          恢复默认
        </button>
      </div>
    </div>
  )
}
