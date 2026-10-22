import docSource from '../../public/readme.md?raw'
import { markdownToHtml } from './markdownPaste'

/**
 * 首次打开时的示例文稿，直接取 public/readme.md（对外发布的同一份操作说明）：
 * 文档只维护那一份 Markdown，改完这里自动跟着变。
 */
export const initialContent = markdownToHtml(docSource)
