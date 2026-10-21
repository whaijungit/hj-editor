import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * 只按「更新频率」切 vendor：react / tiptap 单独成块，
 * 业务代码改动时这两个块的 hash 不变，浏览器缓存可长期命中。
 * 不再按 katex / highlight.js 等细分：这些库同时被 file-viewer 的内部
 * chunk 引用，强绑到同一个 chunk 会把两份不同版本打进同一个文件，
 * 反而让首屏更大。它们由各自的动态 import 自然分包。
 */
const codeSplitting = {
  groups: [
    {
      name: 'react',
      test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
    },
    {
      name: 'tiptap',
      test: /[\\/]node_modules[\\/](@tiptap|prosemirror-[a-z-]+|orderedmap|rope-sequence|w3c-keyname|linkifyjs)[\\/]/,
    },
  ],
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { codeSplitting },
    },
  },
  server: {
    // 分享接口由 Netlify Functions 提供；本地用 netlify dev 时它会占 8888
    proxy: {
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
})
