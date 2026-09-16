let transcriber = null
let currentConfig = null

function postError(id, code, error) {
  self.postMessage({ id, type: 'error', code, message: error?.message ?? String(error ?? code) })
}

async function prepare(id, config) {
  try {
    const { env, pipeline } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    env.allowRemoteModels = true
    env.remoteHost = config.modelBaseUrl
    env.remotePathTemplate = '{model}/{revision}/{file}'
    env.useBrowserCache = true
    env.backends.onnx.wasm.wasmPaths = config.wasmBaseUrl
    env.backends.onnx.wasm.numThreads = 1

    transcriber = await pipeline('automatic-speech-recognition', config.modelId, {
      revision: config.revision,
      dtype: 'q8',
      device: 'wasm',
      progress_callback(progress) {
        self.postMessage({
          id,
          type: 'progress',
          file: progress.file ?? '',
          progress: Number(progress.progress ?? 0),
          status: progress.status ?? '',
        })
      },
    })
    currentConfig = config
    self.postMessage({ id, type: 'ready' })
  } catch (error) {
    transcriber = null
    postError(id, 'model-load-failed', error)
  }
}

self.onmessage = async ({ data }) => {
  if (data.type === 'prepare') {
    await prepare(data.id, data.config)
    return
  }
  if (data.type === 'clear') {
    transcriber = null
    currentConfig = null
    try {
      await self.caches?.delete('transformers-cache')
      self.postMessage({ id: data.id, type: 'cleared' })
    } catch (error) {
      postError(data.id, 'model-load-failed', error)
    }
    return
  }
  if (data.type !== 'transcribe') return

  try {
    if (!transcriber || !currentConfig) throw new Error('Local speech model is not prepared')
    const result = await transcriber(data.audio, {
      language: 'zh',
      task: 'transcribe',
      chunk_length_s: 6,
      stride_length_s: 0,
      return_timestamps: false,
    })
    self.postMessage({ id: data.id, type: 'result', text: String(result?.text ?? '').trim() })
  } catch (error) {
    postError(data.id, 'model-load-failed', error)
  }
}
