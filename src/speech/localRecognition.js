import { SpeechRecognitionError, classifyMediaError } from './nativeRecognition.js'

export function resampleTo16Khz(source, sourceRate) {
  if (!(source instanceof Float32Array) || !Number.isFinite(sourceRate) || sourceRate <= 0) {
    throw new TypeError('Invalid PCM input')
  }
  if (sourceRate === 16000) return source.slice()
  const outputLength = Math.max(1, Math.round(source.length * 16000 / sourceRate))
  const output = new Float32Array(outputLength)
  const ratio = sourceRate / 16000

  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio
    const left = Math.floor(position)
    const right = Math.min(left + 1, source.length - 1)
    const mix = position - left
    output[index] = source[left] * (1 - mix) + source[right] * mix
  }
  return output
}

function mixToMono(audioBuffer) {
  const mono = new Float32Array(audioBuffer.length)
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel)
    for (let index = 0; index < data.length; index += 1) mono[index] += data[index]
  }
  if (audioBuffer.numberOfChannels > 1) {
    for (let index = 0; index < mono.length; index += 1) mono[index] /= audioBuffer.numberOfChannels
  }
  return mono
}

async function recordCommandAudio({
  mediaDevices,
  MediaRecorderCtor,
  AudioContextCtor,
  onState,
  signal,
  maximumMs = 6000,
  silenceMs = 1000,
}) {
  if (!mediaDevices?.getUserMedia || !MediaRecorderCtor || !AudioContextCtor) {
    throw new SpeechRecognitionError('unsupported-browser')
  }

  let stream
  try {
    stream = await mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch (error) {
    throw new SpeechRecognitionError(classifyMediaError(error), error)
  }

  const context = new AudioContextCtor()
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = 1024
  source.connect(analyser)
  const levels = new Uint8Array(analyser.fftSize)
  const chunks = []
  const recorder = new MediaRecorderCtor(stream)
  let heardVoice = false
  let quietFor = 0
  let monitor = null
  let maximum = null
  let aborted = signal?.aborted ?? false
  const abortRecording = () => {
    aborted = true
    if (recorder.state === 'recording') recorder.stop()
  }
  signal?.addEventListener('abort', abortRecording, { once: true })

  try {
    const stopped = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data)
      }
      recorder.onerror = (event) => reject(event.error ?? event)
      recorder.onstop = resolve
    })

    recorder.start()
    if (aborted) abortRecording()
    onState('listening', { engine: 'whisper' })
    monitor = setInterval(() => {
      analyser.getByteTimeDomainData(levels)
      let sum = 0
      for (const value of levels) {
        const centered = (value - 128) / 128
        sum += centered * centered
      }
      const rms = Math.sqrt(sum / levels.length)
      if (rms > 0.025) {
        heardVoice = true
        quietFor = 0
      } else if (heardVoice) {
        quietFor += 100
        if (quietFor >= silenceMs && recorder.state === 'recording') recorder.stop()
      }
    }, 100)
    maximum = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop()
    }, maximumMs)

    await stopped
    if (aborted) throw new SpeechRecognitionError('aborted')
    if (!heardVoice || !chunks.length) throw new SpeechRecognitionError('no-speech')

    onState('transcribing', { engine: 'whisper' })
    const encoded = await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer()
    const decoded = await context.decodeAudioData(encoded.slice(0))
    return resampleTo16Khz(mixToMono(decoded), decoded.sampleRate)
  } catch (error) {
    if (error instanceof SpeechRecognitionError) throw error
    throw new SpeechRecognitionError('unsupported-browser', error)
  } finally {
    if (monitor) clearInterval(monitor)
    if (maximum) clearTimeout(maximum)
    signal?.removeEventListener('abort', abortRecording)
    if (recorder.state === 'recording') recorder.stop()
    stream.getTracks().forEach((track) => track.stop())
    source.disconnect()
    await context.close()
  }
}

export function createLocalRecognizer({
  workerFactory,
  modelConfig,
  mediaDevices = globalThis.navigator?.mediaDevices,
  MediaRecorderCtor = globalThis.MediaRecorder,
  AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext,
  onState = () => {},
} = {}) {
  let worker = null
  let ready = false
  let requestId = 0
  let disposed = false
  let activeRecording = null
  const pending = new Map()

  const ensureWorker = () => {
    if (worker) return worker
    worker = workerFactory()
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        onState('downloading-model', data)
        return
      }
      const request = pending.get(data.id)
      if (!request) return
      if (data.type === 'error') {
        pending.delete(data.id)
        request.reject(new SpeechRecognitionError(data.code ?? 'model-load-failed'))
      } else if (data.type === 'ready' || data.type === 'result' || data.type === 'cleared') {
        pending.delete(data.id)
        request.resolve(data)
      }
    }
    worker.onerror = (event) => {
      for (const request of pending.values()) {
        request.reject(new SpeechRecognitionError('model-load-failed', event))
      }
      pending.clear()
      ready = false
    }
    return worker
  }

  const send = (type, payload = {}, transfer = []) => new Promise((resolve, reject) => {
    if (disposed) {
      reject(new SpeechRecognitionError('aborted'))
      return
    }
    const id = ++requestId
    pending.set(id, { resolve, reject })
    ensureWorker().postMessage({ id, type, ...payload }, transfer)
  })

  return {
    isConfigured: () => Boolean(modelConfig?.modelBaseUrl),
    isReady: () => ready,

    async prepare() {
      if (ready) return
      if (!modelConfig?.modelBaseUrl) throw new SpeechRecognitionError('model-load-failed')
      onState('downloading-model', { progress: 0 })
      await send('prepare', { config: modelConfig })
      ready = true
      onState('ready', { engine: 'whisper' })
    },

    async recognize() {
      if (activeRecording) throw new SpeechRecognitionError('device-busy')
      if (!ready) await this.prepare()
      const controller = new AbortController()
      activeRecording = controller
      try {
        const audio = await recordCommandAudio({
          mediaDevices, MediaRecorderCtor, AudioContextCtor, onState, signal: controller.signal,
        })
        const response = await send('transcribe', { audio }, [audio.buffer])
        return {
          candidates: [{ text: response.text, confidence: Number(response.confidence ?? 0) }],
          engine: 'whisper',
        }
      } finally {
        if (activeRecording === controller) activeRecording = null
      }
    },

    async clearCache() {
      await send('clear')
      ready = false
    },

    dispose() {
      disposed = true
      activeRecording?.abort()
      activeRecording = null
      for (const request of pending.values()) request.reject(new SpeechRecognitionError('aborted'))
      pending.clear()
      worker?.terminate()
      worker = null
      ready = false
    },
  }
}
