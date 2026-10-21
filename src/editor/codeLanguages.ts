import { createLowlight } from 'lowlight'
import type { LanguageFn } from 'highlight.js'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cmake from 'highlight.js/lib/languages/cmake'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import dart from 'highlight.js/lib/languages/dart'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import graphql from 'highlight.js/lib/languages/graphql'
import http from 'highlight.js/lib/languages/http'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import latex from 'highlight.js/lib/languages/latex'
import less from 'highlight.js/lib/languages/less'
import lua from 'highlight.js/lib/languages/lua'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import matlab from 'highlight.js/lib/languages/matlab'
import nginx from 'highlight.js/lib/languages/nginx'
import objectivec from 'highlight.js/lib/languages/objectivec'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import powershell from 'highlight.js/lib/languages/powershell'
import protobuf from 'highlight.js/lib/languages/protobuf'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scala from 'highlight.js/lib/languages/scala'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

export type CodeLanguage = {
  /** 写进 codeBlock.language 与 ``` 后面的标识 */
  id: string
  label: string
}

/** 逐模块引入，避免把 highlight.js 的全量语言打进包里 */
const LANGUAGE_MODULES: Record<string, LanguageFn> = {
  bash,
  c,
  cmake,
  cpp,
  csharp,
  css,
  dart,
  diff,
  dockerfile,
  go,
  graphql,
  http,
  ini,
  java,
  javascript,
  json,
  kotlin,
  latex,
  less,
  lua,
  makefile,
  markdown,
  matlab,
  nginx,
  objectivec,
  php,
  plaintext,
  powershell,
  protobuf,
  python,
  r,
  ruby,
  rust,
  scala,
  scss,
  sql,
  swift,
  typescript,
  xml,
  yaml,
}

/**
 * 语言下拉里的顺序：写作里最常用的排前面。
 * id 取 highlight.js 认识的名称（或下面注册的别名），Vue / JSX 保留独立标识。
 */
export const CODE_LANGUAGES: CodeLanguage[] = [
  { id: 'plaintext', label: '纯文本' },
  // 不是 highlight.js 的语言，由 mermaid.ts / echarts.ts 渲染成图表
  { id: 'mermaid', label: 'Mermaid 图表' },
  { id: 'echarts', label: 'ECharts 图表' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'jsx', label: 'React (JSX)' },
  { id: 'vue', label: 'Vue' },
  { id: 'xml', label: 'HTML / XML' },
  { id: 'css', label: 'CSS' },
  { id: 'scss', label: 'SCSS' },
  { id: 'less', label: 'Less' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'ini', label: 'TOML / INI' },
  { id: 'bash', label: 'Shell' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'php', label: 'PHP' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'swift', label: 'Swift' },
  { id: 'dart', label: 'Dart' },
  { id: 'objectivec', label: 'Objective-C' },
  { id: 'scala', label: 'Scala' },
  { id: 'lua', label: 'Lua' },
  { id: 'r', label: 'R' },
  { id: 'matlab', label: 'MATLAB' },
  { id: 'sql', label: 'SQL' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'latex', label: 'LaTeX' },
  { id: 'diff', label: 'Diff' },
  { id: 'dockerfile', label: 'Dockerfile' },
  { id: 'makefile', label: 'Makefile' },
  { id: 'cmake', label: 'CMake' },
  { id: 'nginx', label: 'Nginx' },
  { id: 'graphql', label: 'GraphQL' },
  { id: 'http', label: 'HTTP' },
  { id: 'protobuf', label: 'Protobuf' },
]

export const DEFAULT_CODE_LANGUAGE = 'plaintext'

/**
 * 别名 → 注册语言。highlight.js 自带的别名会在 highlight 时自动解析，
 * 这里额外覆盖常用写法（ts、vue、yml…），并用于统一展示与下拉选中态。
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  html: 'xml',
  htm: 'xml',
  xhtml: 'xml',
  svg: 'xml',
  vue: 'xml',
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  py: 'python',
  python3: 'python',
  md: 'markdown',
  mkd: 'markdown',
  yml: 'yaml',
  toml: 'ini',
  docker: 'dockerfile',
  gql: 'graphql',
  proto: 'protobuf',
  tex: 'latex',
  rb: 'ruby',
  cs: 'csharp',
  'c#': 'csharp',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  golang: 'go',
  rs: 'rust',
  kt: 'kotlin',
  kts: 'kotlin',
  ps: 'powershell',
  ps1: 'powershell',
  objc: 'objectivec',
  'obj-c': 'objectivec',
  sass: 'scss',
  make: 'makefile',
  mk: 'makefile',
  jsonc: 'json',
  json5: 'json',
  // 图表块的简写，落到 echarts.ts 的渲染器上
  chart: 'echarts',
  echart: 'echarts',
}

const LANGUAGE_IDS = new Set(Object.keys(LANGUAGE_MODULES))
// 不参与语法高亮、但有专门渲染器的语言
const NON_HIGHLIGHT_IDS = new Set(['mermaid', 'echarts'])

const lowlight = createLowlight()

lowlight.register(LANGUAGE_MODULES)

for (const [alias, language] of Object.entries(LANGUAGE_ALIASES)) {
  // 图表语言没有 highlight.js 模块，别名只在 resolveCodeLanguage 里生效
  if (!LANGUAGE_IDS.has(language)) continue
  lowlight.registerAlias(language, [alias])
}

export { lowlight }

const LABELS = new Map(CODE_LANGUAGES.map((language) => [language.id, language.label]))

/** 把 js / ts / yml 之类的写法归一到注册过的语言；未知语言返回 null */
export function resolveCodeLanguage(id: string | null | undefined): string | null {
  if (!id) return null
  const normalized = id.trim().toLowerCase()
  if (!normalized) return null
  if (NON_HIGHLIGHT_IDS.has(normalized)) return normalized
  if (LANGUAGE_IDS.has(normalized)) return normalized
  const alias = LANGUAGE_ALIASES[normalized]
  if (!alias) return null
  if (NON_HIGHLIGHT_IDS.has(alias)) return alias
  return LANGUAGE_IDS.has(alias) ? alias : null
}

/** 编辑器里显示的语言名，未知语言直接显示原始标识 */
export function codeLanguageLabel(id: string | null | undefined): string {
  if (!id) return LABELS.get(DEFAULT_CODE_LANGUAGE) ?? '纯文本'
  const direct = LABELS.get(id)
  if (direct) return direct
  const resolved = resolveCodeLanguage(id)
  if (resolved) return LABELS.get(resolved) ?? resolved
  return id
}
