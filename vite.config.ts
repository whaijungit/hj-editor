import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

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

/** 本地附件目录，与 netlify/functions/file.ts 同一套接口契约 */
const LOCAL_FILE_DIR = '.local-files'
const MAX_FILE_BYTES = 5 * 1024 * 1024
const ID_PATTERN = /^[a-z0-9]{6,32}$/i

/** multipart 里的文件字段（Node 的 File 实现） */
type UploadEntry = {
  name: string
  type: string
  size: number
  arrayBuffer: () => Promise<ArrayBuffer>
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

function createId(): string {
  return randomBytes(6).toString('hex')
}

/**
 * 本地开发用的附件接口（POST / GET / DELETE /api/file）。
 *
 * 线上由 Netlify Functions 写 Netlify Blobs 提供；但 `vite dev` 没有函数运行时，
 * /api 代理到 8888 只会连接失败，插入文件看起来就像「点了没反应」。
 * 这里按同样的契约把文件落到 .local-files/，本地就能完整跑通「选文件 → 上传 → 变卡片」。
 */
function localFileApi(): Plugin {
  return {
    name: 'local-file-api',
    apply: 'serve',
    configureServer(server) {
      const dir = path.resolve(server.config.root, LOCAL_FILE_DIR)
      const metaFile = (id: string) => path.join(dir, `${id}.json`)
      const dataFile = (id: string) => path.join(dir, `${id}.bin`)

      const handle = async (
        req: import('node:http').IncomingMessage,
        res: ServerResponse,
        url: URL,
      ) => {
        const id = url.searchParams.get('id')?.trim() ?? ''

        if (req.method === 'POST') {
          let entry: unknown = null
          try {
            const request = new Request(url, {
              method: 'POST',
              // 只带 content-type：boundary 在里面，formData 解析需要它
              headers: {
                'content-type': String(req.headers['content-type'] ?? ''),
              },
              body: req as unknown as ReadableStream,
              duplex: 'half',
            } as RequestInit)
            entry = (await request.formData()).get('file')
          } catch {
            sendJson(res, 400, { error: 'invalid form data' })
            return
          }
          if (!entry || typeof entry === 'string') {
            sendJson(res, 400, { error: 'missing file' })
            return
          }
          const file = entry as UploadEntry
          if (file.size === 0) {
            sendJson(res, 400, { error: 'empty file' })
            return
          }
          if (file.size > MAX_FILE_BYTES) {
            sendJson(res, 413, { error: 'file too large', limit: MAX_FILE_BYTES })
            return
          }

          const nextId = createId()
          const meta = {
            name: (file.name || '未命名文件').slice(0, 180),
            type: file.type || 'application/octet-stream',
            size: file.size,
            createdAt: Date.now(),
          }
          await mkdir(dir, { recursive: true })
          await writeFile(
            dataFile(nextId),
            Buffer.from(await file.arrayBuffer()),
          )
          await writeFile(metaFile(nextId), JSON.stringify(meta))
          sendJson(res, 201, {
            id: nextId,
            url: `/api/file?id=${nextId}`,
            ...meta,
          })
          return
        }

        if (!ID_PATTERN.test(id)) {
          sendJson(res, 400, { error: 'invalid id' })
          return
        }

        if (req.method === 'GET') {
          let meta: { name?: string; type?: string } = {}
          let data: Buffer
          try {
            const [rawMeta, rawData] = await Promise.all([
              readFile(metaFile(id), 'utf8'),
              readFile(dataFile(id)),
            ])
            meta = JSON.parse(rawMeta) as { name?: string; type?: string }
            data = rawData
          } catch {
            sendJson(res, 404, { error: 'not found' })
            return
          }
          const attachment = url.searchParams.get('download') === '1'
          res.statusCode = 200
          res.setHeader(
            'content-type',
            meta.type || 'application/octet-stream',
          )
          res.setHeader('content-length', String(data.byteLength))
          res.setHeader(
            'content-disposition',
            `${attachment ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(meta.name || 'file')}`,
          )
          res.setHeader('cache-control', 'public, max-age=31536000, immutable')
          res.setHeader('x-content-type-options', 'nosniff')
          res.end(data)
          return
        }

        if (req.method === 'DELETE') {
          await Promise.all([
            rm(dataFile(id), { force: true }),
            rm(metaFile(id), { force: true }),
          ])
          sendJson(res, 200, { id, deleted: true })
          return
        }

        sendJson(res, 405, { error: 'method not allowed' })
      }

      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname !== '/api/file') {
          next()
          return
        }
        void handle(req, res, url).catch(() => {
          if (!res.headersSent) sendJson(res, 500, { error: 'local file api failed' })
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localFileApi()],
  build: {
    rollupOptions: {
      output: { codeSplitting },
    },
  },
  server: {
    // 线上附件由 Netlify Functions 提供；本地由上面的 localFileApi 直接处理
    proxy: {
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
})
