import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyMediaError,
  classifyRecognitionError,
  resolveNativeStrategy,
} from '../src/speech/nativeRecognition.js'
import { createLocalRecognizer, resampleTo16Khz } from '../src/speech/localRecognition.js'

test('浏览器本机中文包可用时优先选择本机原生识别', async () => {
  class RecognitionStub {
    static async available(options) {
      assert.deepEqual(options, { langs: ['zh-CN'], processLocally: true })
      return 'available'
    }
  }

  assert.deepEqual(await resolveNativeStrategy(RecognitionStub), {
    engine: 'native-local', processLocally: true,
  })
})

test('可下载语言包安装成功后使用本机原生识别', async () => {
  let installed = 0
  class RecognitionStub {
    static async available() { return 'downloadable' }
    static async install(options) {
      installed += 1
      assert.deepEqual(options, { langs: ['zh-CN'], processLocally: true })
      return true
    }
  }

  assert.deepEqual(await resolveNativeStrategy(RecognitionStub), {
    engine: 'native-local', processLocally: true,
  })
  assert.equal(installed, 1)
})

test('语言包不可用或实验接口缺失时使用浏览器服务', async () => {
  class UnavailableRecognition {
    static async available() { return 'unavailable' }
  }
  class LegacyRecognition {}

  assert.deepEqual(await resolveNativeStrategy(UnavailableRecognition), {
    engine: 'native-service', processLocally: false,
  })
  assert.deepEqual(await resolveNativeStrategy(LegacyRecognition), {
    engine: 'native-service', processLocally: false,
  })
})

test('实验语言包接口无响应时限时回退到浏览器服务', async () => {
  class HangingRecognition {
    static available() { return new Promise(() => {}) }
  }

  const result = await Promise.race([
    resolveNativeStrategy(HangingRecognition, { probeTimeoutMs: 10 }),
    new Promise((resolve) => setTimeout(() => resolve('test-timeout'), 50)),
  ])
  assert.deepEqual(result, { engine: 'native-service', processLocally: false })
})

test('浏览器和麦克风错误映射为统一错误码', () => {
  assert.equal(classifyRecognitionError('network'), 'native-service-unavailable')
  assert.equal(classifyRecognitionError('service-not-allowed'), 'native-service-unavailable')
  assert.equal(classifyRecognitionError('language-not-supported', { processLocally: true }), 'language-pack-unavailable')
  assert.equal(classifyRecognitionError('language-not-supported', { processLocally: false }), 'native-service-unavailable')
  assert.equal(classifyRecognitionError('no-speech'), 'no-speech')
  assert.equal(classifyMediaError({ name: 'NotAllowedError' }), 'permission-denied')
  assert.equal(classifyMediaError({ name: 'NotFoundError' }), 'device-not-found')
  assert.equal(classifyMediaError({ name: 'NotReadableError' }), 'device-busy')
})

test('本地录音线性重采样为 16 kHz 单声道', () => {
  const source = Float32Array.from({ length: 480 }, (_, index) => index / 480)
  const output = resampleTo16Khz(source, 48000)
  assert.equal(output.length, 160)
  assert.ok(Math.abs(output[80] - 0.5) < 0.01)
})

test('本地识别器通过 Worker 准备模型并只清除 Transformers 缓存', async () => {
  const sent = []
  const states = []
  const worker = {
    postMessage(message) {
      sent.push(message)
      queueMicrotask(() => {
        if (message.type === 'prepare') {
          this.onmessage({ data: { id: message.id, type: 'progress', progress: 50 } })
          this.onmessage({ data: { id: message.id, type: 'ready' } })
        } else if (message.type === 'clear') {
          this.onmessage({ data: { id: message.id, type: 'cleared' } })
        }
      })
    },
    terminate() {},
  }
  const recognizer = createLocalRecognizer({
    workerFactory: () => worker,
    modelConfig: {
      modelBaseUrl: 'https://models.example.com/asr/',
      wasmBaseUrl: 'https://demo.example.com/asr-runtime/',
      modelId: 'Xenova/whisper-tiny',
      revision: 'fixed-revision',
    },
    onState: (state, detail) => states.push([state, detail?.progress]),
  })

  await recognizer.prepare()
  assert.equal(recognizer.isReady(), true)
  assert.equal(sent[0].type, 'prepare')
  assert.deepEqual(states, [
    ['downloading-model', 0],
    ['downloading-model', 50],
    ['ready', undefined],
  ])

  await recognizer.clearCache()
  assert.equal(recognizer.isReady(), false)
  assert.equal(sent[1].type, 'clear')
  recognizer.dispose()
})

test('Worker 模型加载错误使用统一错误码', async () => {
  const worker = {
    postMessage(message) {
      queueMicrotask(() => this.onmessage({
        data: { id: message.id, type: 'error', code: 'model-load-failed' },
      }))
    },
    terminate() {},
  }
  const recognizer = createLocalRecognizer({
    workerFactory: () => worker,
    modelConfig: { modelBaseUrl: 'https://models.example.com/asr/' },
  })

  await assert.rejects(recognizer.prepare(), { code: 'model-load-failed' })
  assert.equal(recognizer.isReady(), false)
  recognizer.dispose()
})

test('dispose 立即中止本地录音并释放麦克风', async () => {
  let recorderStopped = 0
  let trackStopped = 0
  let contextClosed = 0
  class RecorderStub {
    constructor() {
      this.state = 'inactive'
      this.mimeType = 'audio/webm'
    }
    start() { this.state = 'recording' }
    stop() {
      this.state = 'inactive'
      recorderStopped += 1
      queueMicrotask(() => this.onstop?.())
    }
  }
  class AudioContextStub {
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} }
    }
    createAnalyser() {
      return {
        fftSize: 0,
        getByteTimeDomainData(values) { values.fill(128) },
      }
    }
    async close() { contextClosed += 1 }
  }
  const worker = {
    postMessage(message) {
      if (message.type === 'prepare') {
        queueMicrotask(() => this.onmessage({ data: { id: message.id, type: 'ready' } }))
      }
    },
    terminate() {},
  }
  const recognizer = createLocalRecognizer({
    workerFactory: () => worker,
    modelConfig: { modelBaseUrl: 'https://models.example.com/asr/' },
    mediaDevices: {
      async getUserMedia() {
        return { getTracks: () => [{ stop: () => { trackStopped += 1 } }] }
      },
    },
    MediaRecorderCtor: RecorderStub,
    AudioContextCtor: AudioContextStub,
  })

  const recognition = recognizer.recognize()
  await new Promise((resolve) => setTimeout(resolve, 0))
  recognizer.dispose()

  await assert.rejects(recognition, { code: 'aborted' })
  assert.equal(recorderStopped, 1)
  assert.equal(trackStopped, 1)
  assert.equal(contextClosed, 1)
})
