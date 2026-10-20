export const initialContent = `
<h1>欢迎使用 hj-editor</h1>
<p>这是一个参照 <strong>Typora</strong> 使用方式打造的沉浸式写作空间：没有多余的按钮，右边那列细线是标题大纲，悬停或点击就会展开目录，中间是一张白纸，输入 Markdown 语法即可即时排版。</p>
<blockquote>
  <p>所见即所得。在空白行输入 <code>#</code>、<code>-</code>、<code>&gt;</code> 或三个反引号，按下空格就会自动转换。</p>
</blockquote>

<h2>快速开始</h2>
<ul>
  <li><p><strong>标题</strong>：输入 <code>#</code> 加空格，最多支持四级标题。</p></li>
  <li><p><strong>强调</strong>：用 <code>**加粗**</code>、<code>*斜体*</code>、<code>~~删除线~~</code> 包裹文字，选中文字还会浮出迷你工具栏。</p></li>
  <li><p><strong>列表</strong>：<code>-</code> 生成无序列表，<code>1.</code> 生成有序列表，<code>- [ ]</code> 生成任务列表。</p></li>
  <li><p><strong>图片</strong>：直接把图片拖进编辑区，或按 <code>Ctrl</code> + <code>V</code> 粘贴截图。</p></li>
</ul>

<h2>排版示例</h2>
<h3>引用与代码</h3>
<blockquote>
  <p>好的工具应当隐入背景，让文字本身成为主角。</p>
</blockquote>
<pre><code class="language-typescript">function greet(name: string) {
  return \`你好，\${name}！\`
}</code></pre>

<h3>数学公式</h3>
<p>行内公式写成 <span data-type="inline-math" data-latex="E = mc^2"></span> 这样，块级公式单独占一行：</p>
<div data-type="block-math" data-latex="\\int_{0}^{1} x^{2}\\,\\mathrm{d}x = \\frac{1}{3}"></div>

<h3>表格</h3>
<table>
  <tbody>
    <tr>
      <th><p>能力</p></th>
      <th><p>说明</p></th>
    </tr>
    <tr>
      <td><p>自动保存</p></td>
      <td><p>内容实时写入浏览器本地存储</p></td>
    </tr>
    <tr>
      <td><p>源码预览</p></td>
      <td><p>一键查看当前文档的 Markdown 源码</p></td>
    </tr>
    <tr>
      <td><p>导出</p></td>
      <td><p>支持导出 .md 与独立 .html 文件</p></td>
    </tr>
  </tbody>
</table>

<h2>今日清单</h2>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="true"><p>打开顶部的「视图」菜单</p></li>
  <li data-type="taskItem" data-checked="false"><p>试试专注模式与打字机模式</p></li>
  <li data-type="taskItem" data-checked="false"><p>把这篇示例改成自己的笔记</p></li>
</ul>

<h2>快捷键</h2>
<table>
  <tbody>
    <tr>
      <th><p>操作</p></th>
      <th><p>快捷键</p></th>
    </tr>
    <tr>
      <td><p>保存草稿</p></td>
      <td><p><code>Ctrl + S</code></p></td>
    </tr>
    <tr>
      <td><p>Markdown 源码</p></td>
      <td><p><code>Ctrl + /</code></p></td>
    </tr>
    <tr>
      <td><p>加粗 / 斜体</p></td>
      <td><p><code>Ctrl + B</code> / <code>Ctrl + I</code></p></td>
    </tr>
    <tr>
      <td><p>标题 1-4</p></td>
      <td><p><code>Ctrl + Alt + 1</code> 至 <code>4</code></p></td>
    </tr>
  </tbody>
</table>

<hr>
<p>内容会在输入后自动保存。刷新页面不会丢失，也可以在「文件」菜单中导出带走。</p>
`
