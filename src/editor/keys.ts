/**
 * 键位字符串工具：统一用 `mod+shift+s` 这种写法记录，显示时再按平台翻译。
 * 正文快捷键、激光笔和设置面板都走这一套，用户改完键位两边提示不会对不上。
 */

const MODIFIER_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'Dead',
])

const CODE_KEYS: Record<string, string> = {
  Slash: '/',
  Backslash: '\\',
  Equal: '=',
  Minus: '-',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
}

export function isMac(): boolean {
  return /Mac|iPhone|iPad/i.test(window.navigator.userAgent)
}

function codeToKey(code: string): string | null {
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  return CODE_KEYS[code] ?? null
}

/**
 * 把键盘事件转成稳定的键位字符串，例如 `mod+shift+l`、`escape`。
 * Ctrl 与 Cmd 都归成 `mod`，同一套默认键位在 Windows / macOS 都能用。
 * Shift 与数字、符号组合会回退到物理键位，避免 `!`、`@` 这类字符差异。
 */
export function eventToKey(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null

  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) parts.push('mod')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey) parts.push('shift')

  let main = event.key.toLowerCase()
  if (event.key.length === 1 && event.shiftKey && !/^[a-z]$/i.test(event.key)) {
    main = codeToKey(event.code) ?? main
  } else if (event.key === ' ') {
    main = 'space'
  }
  parts.push(main)
  return parts.join('+')
}

/** 键位串是否带上了不会和打字冲突的修饰键 */
export function hasModifier(combo: string): boolean {
  return /^(mod|alt)\+/.test(combo) || combo.includes('+alt+')
}

export function formatKey(combo: string): string {
  if (!combo) return '未设置'
  const mac = isMac()
  const parts = combo.split('+').map((part) => {
    if (part === 'mod') return mac ? '⌘' : 'Ctrl'
    if (part === 'shift') return mac ? '⇧' : 'Shift'
    if (part === 'alt') return mac ? '⌥' : 'Alt'
    if (part === 'escape') return 'Esc'
    if (part === 'space') return 'Space'
    if (part === 'backspace') return 'Backspace'
    if (part === 'delete') return 'Del'
    if (part === 'arrowup') return '↑'
    if (part === 'arrowdown') return '↓'
    if (part === 'arrowleft') return '←'
    if (part === 'arrowright') return '→'
    return part.length === 1 ? part.toUpperCase() : part
  })
  return mac ? parts.join('') : parts.join('+')
}
