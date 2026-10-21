import type { Editor } from '@tiptap/core'
import { CODE_LANGUAGES, lowlight, resolveCodeLanguage } from './codeLanguages'

/** 代码块语言是这些值时，视为作者没有标注语言，可以自动识别 */
const UNDETERMINED = new Set(['', 'plaintext', 'plain', 'text', 'txt', 'none'])

/** highlightAuto 的候选语言：去掉没有高亮模块的图表语言与纯文本 */
const AUTO_SUBSET = Array.from(
  new Set(
    CODE_LANGUAGES.map((language) => resolveCodeLanguage(language.id)).filter(
      (id): id is string => {
        if (!id || id === 'plaintext') return false
        return lowlight.registered(id)
      },
    ),
  ),
)

/** 代码太短时 highlightAuto 很容易瞎猜，直接放弃 */
const MIN_AUTO_LENGTH = 24
/** highlightAuto 的置信度下限，低于这个分数宁可保持纯文本 */
const MIN_RELEVANCE = 6

export function isUndeterminedLanguage(language: unknown): boolean {
  if (typeof language !== 'string') return true
  return UNDETERMINED.has(language.trim().toLowerCase())
}

function isJson(code: string): boolean {
  if (!/^[{[]/.test(code.trim())) return false
  try {
    JSON.parse(code)
    return true
  } catch {
    return false
  }
}

/**
 * 靠特征判断语言：只收录辨识度高的写法（shebang、#include、package main…），
 * 拿不准就交给 highlightAuto。
 */
function ruleLanguage(code: string): string | null {
  if (
    /^\s*(?:graph\s+(?:TD|TB|LR|RL|BT)|flowchart\s+(?:TD|TB|LR|RL|BT)|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph)\b/m.test(
      code,
    )
  ) {
    return 'mermaid'
  }

  const shebang = /^#!\s*(\S+)(?:\s+(\S+))?/.exec(code)
  if (shebang) {
    const command = `${shebang[1]} ${shebang[2] ?? ''}`
    if (/\bpython/.test(command)) return 'python'
    if (/\bnode\b/.test(command)) return 'javascript'
    if (/\b(?:bash|sh|zsh|ksh|dash|fish)\b/.test(command)) return 'bash'
  }

  if (/^\s*(?:<\?xml\b|<!doctype\s+html|<html[\s>])/i.test(code)) return 'xml'
  if (
    /^\s*<(?:div|span|section|article|template|svg|table|form)\b/im.test(code) &&
    /<\/[\w-]+\s*>/m.test(code)
  ) {
    return 'xml'
  }

  if (isJson(code)) return 'json'

  if (/^\s*package\s+\w+\s*$/m.test(code) && /\bfunc\s+\w+\s*\(/.test(code)) {
    return 'go'
  }

  if (
    /\bfn\s+\w+\s*\(/.test(code) &&
    /(?:let\s+mut\b|println!|->\s*[\w:<])/.test(code)
  ) {
    return 'rust'
  }

  if (/^\s*#include\s*[<"]/m.test(code)) {
    return /(?:std::|iostream|using\s+namespace|cout\b|vector<)/.test(code)
      ? 'cpp'
      : 'c'
  }

  if (/(?:using\s+System\s*;|Console\.(?:Write|Read))/.test(code)) {
    return 'csharp'
  }

  if (/(?:System\.out\.|public\s+static\s+void\s+main|import\s+java\.)/.test(code)) {
    return 'java'
  }
  if (/\bpublic\s+(?:final\s+|abstract\s+)?class\s+\w+/.test(code)) return 'java'

  if (/^\s*def\s+\w+\s*\([^)]*\)\s*(?:->\s*[^:]+)?:\s*$/m.test(code)) {
    return 'python'
  }
  if (
    /^\s*(?:from\s+[\w.]+\s+import|import\s+[\w.]+(?:\s+as\s+\w+)?)\s*$/m.test(code) &&
    /(?:print\s*\(|def\s+\w+\s*\()/.test(code)
  ) {
    return 'python'
  }

  if (
    /\b(?:SELECT\s+[\s\S]{0,400}?\sFROM|INSERT\s+INTO|CREATE\s+TABLE|UPDATE\s+\w+\s+SET|ALTER\s+TABLE|DELETE\s+FROM)\b/i.test(
      code,
    )
  ) {
    return 'sql'
  }

  if (
    /^\s*FROM\s+\S+/m.test(code) &&
    /^\s*(?:RUN|CMD|COPY|ADD|WORKDIR|ENV|EXPOSE|ENTRYPOINT)\s+/m.test(code)
  ) {
    return 'dockerfile'
  }

  if (/^\s*\[[\w .:-]+\]\s*$/m.test(code) && /^\s*[\w.-]+\s*=/m.test(code)) {
    return 'ini'
  }

  if (
    /^[A-Za-z_][\w-]*:[ \t]*(?:\S[^{}\n]*)?$/m.test(code) &&
    /^\s{2,}[A-Za-z_][\w-]*:[ \t]*(?:\S[^{}\n]*)?$/m.test(code)
  ) {
    return 'yaml'
  }

  // 样式表要放在 YAML 之前：.card:hover { display: flex } 很像 key: value
  if (/\$[\w-]+\s*:\s*[^;{}]+;/.test(code)) return 'scss'
  if (/^\s*@[\w-]+\s*:\s*[^;{}]+;/m.test(code) && /\{[\s\S]*:/.test(code)) {
    return 'less'
  }
  if (
    /^\s*[.#][\w-]+(?:[\s,:>.#[\]]*)\{[\s\S]*:[^;{}]+;/m.test(code) ||
    (/^\s*[a-z][\w-]*(?:[\s,>.#:[\]]*)\{[\s\S]*:[^;{}]+;/m.test(code) &&
      !/\b(?:function|const|let|var|if|for|while)\b/.test(code))
  ) {
    return 'css'
  }

  if (
    /^\s*interface\s+\w+/m.test(code) ||
    /^\s*type\s+\w+\s*=/m.test(code)
  ) {
    return 'typescript'
  }

  if (
    /(?:function\s+\w+\s*\(|=>|const\s+\w+\s*=|let\s+\w+\s*=|console\.log\s*\(|require\s*\()/.test(
      code,
    )
  ) {
    return /(?::\s*(?:string|number|boolean|void)\b|\bas\s+[\w<>]+\s*[;)\n])/.test(
      code,
    )
      ? 'typescript'
      : 'javascript'
  }

  return null
}

/** 特征不够明显时，用 highlight.js 的自动识别兜底 */
function autoLanguage(code: string): string | null {
  if (code.length < MIN_AUTO_LENGTH) return null
  if (!/[;{}()<>=]/.test(code)) return null
  if (!/[\u0020-\u007e]/.test(code)) return null

  const result = lowlight.highlightAuto(code, { subset: AUTO_SUBSET })
  const data = (result.data ?? {}) as {
    language?: string | null
    relevance?: number
  }

  if ((data.relevance ?? 0) < MIN_RELEVANCE) return null

  const language = resolveCodeLanguage(data.language)
  if (!language || language === 'plaintext' || language === 'markdown') return null
  return language
}

/** 猜测一段代码的语言；猜不出来返回 null（保持纯文本） */
export function detectCodeLanguage(source: string): string | null {
  const code = source.replace(/\r\n?/g, '\n').trim()
  if (!code) return null
  const rule = ruleLanguage(code)
  if (rule) return rule
  return autoLanguage(code)
}

type Detection = { pos: number; language: string }

/** 给文档里所有「还没标语言」的代码块补上识别结果，返回处理数量 */
export function autoDetectCodeBlocks(editor: Editor): number {
  const { state } = editor
  const detections: Detection[] = []

  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return true
    if (!isUndeterminedLanguage(node.attrs.language)) return false
    const language = detectCodeLanguage(node.textContent)
    if (language) detections.push({ pos, language })
    return false
  })

  if (!detections.length) return 0

  const tr = state.tr
  detections.forEach(({ pos, language }) => {
    const node = tr.doc.nodeAt(pos)
    if (!node) return
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, language })
  })
  editor.view.dispatch(tr)
  return detections.length
}

/** 光标所在代码块还没标语言时，按内容识别一次（用于往空代码块里粘贴代码） */
export function detectCurrentCodeBlock(editor: Editor): boolean {
  const { state } = editor
  const { $from } = state.selection

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'codeBlock') continue
    if (!isUndeterminedLanguage(node.attrs.language)) return false

    const language = detectCodeLanguage(node.textContent)
    if (!language) return false

    const pos = $from.before(depth)
    const tr = state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      language,
    })
    editor.view.dispatch(tr)
    return true
  }

  return false
}
