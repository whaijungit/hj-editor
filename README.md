# hj-editor

基于 **Vite + React 19 + TypeScript + Tiptap 3** 的富文本编辑器示例。

## 功能

- 段落格式：正文 / 标题 1-4、对齐方式（左、中、右、两端）
- 行内样式：加粗、斜体、下划线、删除线、行内代码、文字颜色、背景高亮
- 块级内容：引用、代码块、分割线、无序 / 有序 / 任务列表
- 插入内容：链接、图片（链接或本地文件，转 Base64）、表格（可调整列宽、合并 / 拆分单元格）
- 粘贴 Markdown：自动还原成标题、列表、表格、公式等（按住 Shift 粘贴保留原文）
- 导入文件：菜单「文件（标题栏最左的文档图标）→ 导入文件…」或 Ctrl O，支持 .md / .txt / .html，也可直接把文件拖进编辑器；导入会替换当前文稿
- 窄屏（≤720px）：标题栏只保留一个菜单按钮（☰），六个菜单和源码、主题、激光笔、导出等入口都收进左侧侧边栏，点按分组展开，点条目即执行并收起
- 激光笔批注（`Ctrl Shift L`）：自由笔 / 直线 / 矩形 / 椭圆 / 箭头 / 文字；渐隐模式沿书写方向从头到尾逐段擦除（不是整条变透明），也可切换为保留；切到「移动 / 选择」（`7`）后能直接拖动已画的笔迹与文字调整位置，`S` 截屏保存
- 导出：Markdown（.md）、HTML（.html），或复制 Markdown 到剪贴板
- 选中文字时显示气泡工具栏
- 底部实时统计字符数、字数、段落数
- 右侧面板实时输出 HTML / JSON，支持一键复制
- 沉浸排版：默认不显示标题栏，首屏只有正文（状态栏保留）；大纲常驻正文右侧，是一条极细的标题标尺（线长对应层级、当前章节加深），悬停或点击标尺即展开目录面板，点条目跳转；`Ctrl Shift H` 一键隐藏 / 恢复标题栏与状态栏，收起后可用右上角胶囊按钮找回
- 打字演示：打开页面时若正文还是示例文稿，会带闪烁光标逐字打出全文，新落下的字轻微弹跳、光标处冒一把心形粒子（点赞手感）；任意点击 / 按键立即结束，期间不显示大纲与字数统计，`prefers-reduced-motion` 下自动关闭

## 开发

```bash
pnpm install
pnpm dev
```

## 构建

```bash
pnpm build
pnpm preview
```

## 目录结构

```
src/
  editor/
    RichTextEditor.tsx  # 编辑器容器、状态栏、输出面板
    Toolbar.tsx         # 工具栏、气泡菜单、各类弹出面板
    extensions.ts       # Tiptap 扩展配置
    initialContent.ts   # 初始示例内容
    editor.css          # 编辑器与工具栏样式
  App.tsx               # 页面骨架
```

## 扩展说明

所有扩展集中在 `src/editor/extensions.ts`：

| 扩展 | 作用 |
| --- | --- |
| `StarterKit` | 基础节点与标记（含 Link、Underline、撤销重做） |
| `TextStyle` + `Color` | 文字颜色 |
| `Highlight` | 多色背景高亮 |
| `TextAlign` | 段落对齐 |
| `TaskList` + `TaskItem` | 任务列表 |
| `Image` | 图片，支持 Base64 |
| `Table` + `TableRow` / `TableHeader` / `TableCell` | 表格 |
| `Placeholder` | 空文档占位提示 |

新增扩展后，在 `Toolbar.tsx` 中通过 `editor.chain().focus()` 调用对应命令即可。
