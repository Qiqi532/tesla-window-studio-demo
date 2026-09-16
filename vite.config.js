import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { defineConfig, loadEnv } from 'vite'

const ASR_RUNTIME_FILES = Object.freeze([
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
])

function asrRuntimePlugin() {
  const runtimeDirectory = join(process.cwd(), 'node_modules', '@huggingface', 'transformers', 'dist')

  return {
    name: 'local-asr-runtime',
    configureServer(server) {
      server.middlewares.use('/asr-runtime/', (request, response, next) => {
        const fileName = basename(new URL(request.url, 'http://localhost').pathname)
        if (!ASR_RUNTIME_FILES.includes(fileName)) return next()
        const filePath = join(runtimeDirectory, fileName)
        if (!existsSync(filePath)) return next()
        response.statusCode = 200
        response.setHeader('Content-Length', statSync(filePath).size)
        response.setHeader('Content-Type', fileName.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache')
        createReadStream(filePath).pipe(response)
      })
    },
    generateBundle() {
      for (const fileName of ASR_RUNTIME_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: `asr-runtime/${fileName}`,
          source: readFileSync(join(runtimeDirectory, fileName)),
        })
      }
    },
  }
}

function cloudflareHeadersPlugin(modelBaseUrl) {
  let modelOrigin = ''
  try {
    modelOrigin = modelBaseUrl ? new URL(modelBaseUrl).origin : ''
  } catch {
    throw new Error('VITE_ASR_MODEL_BASE_URL must be an absolute HTTPS URL ending in /asr/')
  }
  const connectSources = ["'self'", modelOrigin].filter(Boolean).join(' ')
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src ${connectSources}`,
  ].join('; ')

  return {
    name: 'cloudflare-static-headers',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: `/*\n  Permissions-Policy: microphone=(self)\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Content-Security-Policy: ${contentSecurityPolicy}\n`,
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    base: './',
    plugins: [
      asrRuntimePlugin(),
      cloudflareHeadersPlugin(String(env.VITE_ASR_MODEL_BASE_URL ?? '').trim()),
    ],
  }
})
