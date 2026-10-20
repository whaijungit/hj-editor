import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  Loader2,
  Monitor,
  Moon,
  Plus,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import {
  deleteCustomFont,
  importCustomFont,
  customFontId,
  toCustomFontKey,
  useCustomFonts,
  type CustomFontMeta,
} from './customFonts'
import {
  DEFAULT_BODY_FONT,
  ensureBodyFont,
  getAllBodyFonts,
  type BodyFont,
  type FontLoadStatus,
} from './fonts'
import {
  ACCENT_SWATCHES,
  DEFAULT_THEME_CONFIG,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  THEME_PRESETS,
  type ThemeConfig,
  type ThemeMode,
} from './theme'

const MODE_OPTIONS: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: '浅色', Icon: Sun },
  { id: 'dark', label: '深色', Icon: Moon },
  { id: 'system', label: '跟随系统', Icon: Monitor },
]

export function ThemeDialog({
  open,
  config,
  fontStatus,
  onChange,
  onReset,
  onRetryFont,
  onClose,
}: {
  open: boolean
  config: ThemeConfig
  fontStatus: FontLoadStatus
  onChange: (patch: Partial<ThemeConfig>) => void
  onReset: () => void
  onRetryFont: () => void
  onClose: () => void
}) {
  // 订阅导入字体，列表就绪或变化时重新渲染字体卡片
  useCustomFonts()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const currentAccent = config.accent?.toLowerCase() ?? null
  const isDefault =
    JSON.stringify(config) === JSON.stringify(DEFAULT_THEME_CONFIG)
  const fonts = getAllBodyFonts()

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return

    setImporting(true)
    setImportError(null)

    try {
      let latest: CustomFontMeta | null = null
      for (const file of Array.from(files)) {
        latest = await importCustomFont(file)
      }
      if (latest) onChange({ bodyFont: customFontId(latest.id) })
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '字体导入失败')
    } finally {
      setImporting(false)
    }
  }

  const handleDelete = async (font: BodyFont) => {
    const key = toCustomFontKey(font.id)
    if (!key) return

    try {
      await deleteCustomFont(key)
      if (config.bodyFont === font.id) {
        onChange({ bodyFont: DEFAULT_BODY_FONT })
      }
    } catch {
      setImportError('移除字体失败，请重试')
    }
  }

  return (
    <div className="help-backdrop" onClick={onClose}>
      <section
        className="help-dialog theme-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="主题与排版"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="help-head">
          <h2 className="theme-title">主题与排版</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭主题设置"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="help-body theme-body">
          <section className="theme-section">
            <div className="theme-section-head">
              <span className="theme-label">外观</span>
              <span className="theme-hint">可跟随系统偏好自动切换</span>
            </div>
            <div className="segmented" role="group" aria-label="外观模式">
              {MODE_OPTIONS.map(({ id, label, Icon }) => (
                <button
                  type="button"
                  key={id}
                  data-active={config.mode === id}
                  aria-pressed={config.mode === id}
                  onClick={() => onChange({ mode: id })}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="theme-section">
            <div className="theme-section-head">
              <span className="theme-label">配色</span>
              <span className="theme-hint">每套配色自带明暗两版</span>
            </div>
            <div className="theme-presets">
              {THEME_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className="theme-card"
                  data-active={config.preset === preset.id}
                  aria-pressed={config.preset === preset.id}
                  onClick={() => onChange({ preset: preset.id, accent: null })}
                >
                  <span
                    className="theme-swatch"
                    style={{ background: preset.swatches[0] }}
                    aria-hidden="true"
                  >
                    <span
                      className="theme-swatch-paper"
                      style={{ background: preset.swatches[1] }}
                    />
                    <span
                      className="theme-swatch-accent"
                      style={{ background: preset.swatches[2] }}
                    />
                  </span>
                  <span className="theme-card-text">
                    <span className="theme-card-name">{preset.name}</span>
                    <span className="theme-card-hint">{preset.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="theme-section">
            <div className="theme-section-head">
              <span className="theme-label">强调色</span>
              <button
                type="button"
                className="theme-link"
                onClick={() => onChange({ accent: null })}
                disabled={!config.accent}
              >
                跟随配色
              </button>
            </div>
            <div className="theme-colors">
              {ACCENT_SWATCHES.map((color) => (
                <button
                  type="button"
                  key={color}
                  className="theme-color"
                  style={{ background: color }}
                  data-active={currentAccent === color}
                  aria-label={`使用强调色 ${color}`}
                  aria-pressed={currentAccent === color}
                  onClick={() => onChange({ accent: color })}
                />
              ))}
              <label className="theme-custom">
                <input
                  type="color"
                  value={config.accent ?? '#4f46e5'}
                  aria-label="自定义强调色"
                  onChange={(event) =>
                    onChange({ accent: event.target.value.toUpperCase() })
                  }
                />
                自定义
              </label>
            </div>
          </section>

          <section className="theme-section">
            <div className="theme-section-head">
              <span className="theme-label">正文排版</span>
              <span className="theme-hint">只影响编辑区；在线字体首次使用需联网</span>
            </div>

            <div className="theme-fonts" role="group" aria-label="正文字体">
              {fonts.map((font) => {
                const active = config.bodyFont === font.id
                const loading = active && fontStatus === 'loading'
                const failed = active && fontStatus === 'error'
                const select = () => onChange({ bodyFont: font.id })

                return (
                  <div
                    key={font.id}
                    className="font-card"
                    data-active={active}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    title={font.note}
                    onMouseEnter={() => void ensureBodyFont(font.id)}
                    onClick={select}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        select()
                      }
                    }}
                  >
                    <span className="font-card-head">
                      <span className="font-card-name">
                        <span className="font-card-name-text">{font.name}</span>
                        {font.custom ? (
                          <span className="font-card-tag">本地</span>
                        ) : font.family ? (
                          <span className="font-card-tag">在线</span>
                        ) : null}
                      </span>
                      <span className="font-card-tools">
                        {loading ? (
                          <Loader2 size={12} className="font-spin" />
                        ) : failed ? (
                          <AlertCircle size={12} className="font-card-alert" />
                        ) : active ? (
                          <Check size={12} />
                        ) : null}
                        {font.custom ? (
                          <button
                            type="button"
                            className="font-card-delete"
                            aria-label={`移除字体 ${font.name}`}
                            title="移除这个字体"
                            onClick={(event) => {
                              event.stopPropagation()
                              void handleDelete(font)
                            }}
                          >
                            <Trash2 size={11} />
                          </button>
                        ) : null}
                      </span>
                    </span>
                    {failed ? (
                      <span className="font-card-failed">加载失败，点此重试</span>
                    ) : (
                      <span
                        className="font-card-sample"
                        style={{ fontFamily: font.stack }}
                      >
                        汉字排版 Aa
                      </span>
                    )}
                  </div>
                )
              })}

              <button
                type="button"
                className="font-card font-card-add"
                disabled={importing}
                onClick={() => fileRef.current?.click()}
              >
                <span className="font-card-head">
                  <span className="font-card-name">
                    {importing ? '正在导入' : '导入本地字体'}
                  </span>
                  {importing ? (
                    <Loader2 size={12} className="font-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                </span>
                <span className="font-card-add-hint">ttf / otf / ttc / woff2</span>
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".ttf,.otf,.ttc,.woff,.woff2"
              multiple
              hidden
              onChange={(event) => {
                void handleFiles(event.target.files)
                event.target.value = ''
              }}
            />

            {importError && <p className="font-error">{importError}</p>}

            {fontStatus === 'error' && (
              <p className="font-error">
                字体没加载成功，正文已回退到本机字体。
                <button type="button" className="theme-link" onClick={onRetryFont}>
                  重试
                </button>
              </p>
            )}

            <label className="theme-slider">
              <span className="theme-row-label">字号</span>
              <input
                type="range"
                className="theme-range"
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                step={0.5}
                value={config.bodyFontSize}
                onChange={(event) =>
                  onChange({ bodyFontSize: Number(event.target.value) })
                }
              />
              <output>{config.bodyFontSize}px</output>
            </label>

            <label className="theme-slider">
              <span className="theme-row-label">行高</span>
              <input
                type="range"
                className="theme-range"
                min={LINE_HEIGHT_MIN}
                max={LINE_HEIGHT_MAX}
                step={0.05}
                value={config.bodyLineHeight}
                onChange={(event) =>
                  onChange({ bodyLineHeight: Number(event.target.value) })
                }
              />
              <output>{config.bodyLineHeight.toFixed(2)}</output>
            </label>
          </section>
        </div>

        <footer className="help-foot theme-foot">
          <span>设置会自动保存在本机</span>
          <button
            type="button"
            className="theme-reset"
            onClick={onReset}
            disabled={isDefault}
          >
            恢复默认
          </button>
        </footer>
      </section>
    </div>
  )
}
