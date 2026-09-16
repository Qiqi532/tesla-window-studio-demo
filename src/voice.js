import { createNativeRecognizer, SpeechRecognitionError, classifyMediaError } from './speech/nativeRecognition.js'
import { createLocalRecognizer } from './speech/localRecognition.js'
import { selectTranscriptCandidate } from './speech/transcript.js'

const SPEECH_OUTPUT_KEY = 'tesla-demo-speech-output'
const LOCAL_MODEL_BYTES = 45_500_000
const MODEL_ID = 'Xenova/whisper-tiny'
const MODEL_REVISION = '5332fcc35e32a33b86612b9a57a89be7906102b1'

const ERROR_MESSAGES = Object.freeze({
  'insecure-context': '麦克风只可在 HTTPS 或 localhost 中使用，文字输入仍可完整控制车辆。',
  'permission-denied': '麦克风权限被拒绝。请在浏览器网站权限中允许麦克风，或直接输入文字指令。',
  'device-not-found': '没有可用的麦克风。请检查设备连接，文字输入仍可使用。',
  'device-busy': '麦克风暂时无法使用或正被其他应用占用，请稍后重试或输入文字。',
  'no-speech': '没有听到清晰指令，请重试或直接输入文字。',
  'native-service-unavailable': '浏览器语音服务暂不可用。可启用本地识别，或继续使用文字输入。',
  'language-pack-unavailable': '浏览器中文语言包不可用，将尝试浏览器语音服务。',
  'model-download-failed': '本地语音模型未能加载，请检查模型地址、网络与 R2 跨域配置。',
  'model-load-failed': '本地语音模型未能加载，请检查模型地址、网络与 R2 跨域配置。',
  'recognition-timeout': '语音识别等待超时，请重试或直接输入文字。',
  'unsupported-browser': '当前浏览器无法启动语音识别，文字输入仍可完整控制车辆。',
  'low-confidence': '没有听清指令，请说得更清楚一些，或使用文字输入。',
  'ambiguous-transcript': '识别到多个不同指令，请一次只说一个明确操作。',
})

function readPreference(storage) {
  try {
    return storage?.getItem(SPEECH_OUTPUT_KEY) === 'true'
  } catch {
    return false
  }
}

function writePreference(storage, enabled) {
  try {
    storage?.setItem(SPEECH_OUTPUT_KEY, String(enabled))
  } catch {
    // The toggle still works for this page when storage is blocked.
  }
}

function defaultModelConfig(windowObject) {
  const modelBaseUrl = String(import.meta.env?.VITE_ASR_MODEL_BASE_URL ?? '').trim()
  const baseUrl = import.meta.env?.BASE_URL ?? './'
  const wasmBaseUrl = windowObject?.location
    ? new URL(`${baseUrl}asr-runtime/`, windowObject.location.href).href
    : `${baseUrl}asr-runtime/`
  return { modelBaseUrl, wasmBaseUrl, modelId: MODEL_ID, revision: MODEL_REVISION }
}

export function createVoiceControl({
  button,
  label,
  form,
  input,
  speechToggle,
  modeSelect,
  modelButton,
  modelClearButton,
  engineStatus,
  execute,
  feedback,
  mediaDevices = globalThis.navigator?.mediaDevices,
  windowObject = globalThis.window,
  workerFactory = () => new Worker(new URL('./speech/asr.worker.js', import.meta.url), { type: 'module' }),
  modelConfig = defaultModelConfig(globalThis.window),
  confirmDownload = (message) => globalThis.window?.confirm?.(message) ?? false,
}) {
  const Recognition = windowObject?.SpeechRecognition || windowObject?.webkitSpeechRecognition
  const synthesis = windowObject?.speechSynthesis
  const Utterance = windowObject?.SpeechSynthesisUtterance
  const speechAvailable = Boolean(synthesis && Utterance)
  let disposed = false
  let microphoneUnavailable = false
  let requestingMicrophone = false
  let nativeUnavailable = !Recognition
  let currentEngine = 'none'

  const setEngineStatus = (message) => {
    if (engineStatus) engineStatus.textContent = message
  }

  const setUiState = (state, detail = {}) => {
    if (disposed) return
    if (state === 'listening' || state === 'transcribing') button.classList.add('listening')
    else button.classList.remove('listening')
    if (state === 'requesting-permission') label.textContent = '正在请求麦克风…'
    else if (state === 'preparing-native') label.textContent = '正在检查识别能力…'
    else if (state === 'listening') label.textContent = detail.engine === 'whisper' ? '本地聆听中…' : '正在聆听…'
    else if (state === 'transcribing') label.textContent = '正在本地转写…'
    else if (state === 'downloading-model') {
      const progress = Math.max(0, Math.min(100, Math.round(Number(detail.progress ?? 0))))
      label.textContent = `模型加载 ${progress}%`
      setEngineStatus(`本地模型加载中 · ${progress}%`)
    } else if (state === 'ready') {
      label.textContent = '点击说话'
      setEngineStatus('本地模型已就绪')
    } else if (!microphoneUnavailable) {
      label.textContent = '点击说话'
    }
  }

  const nativeRecognizer = createNativeRecognizer({ Recognition, onState: setUiState })
  const localRecognizer = createLocalRecognizer({
    workerFactory,
    modelConfig,
    mediaDevices,
    onState: setUiState,
  })

  const syncModelControls = () => {
    if (modelButton) {
      modelButton.hidden = localRecognizer.isReady()
      modelButton.disabled = !localRecognizer.isConfigured()
      modelButton.title = localRecognizer.isConfigured()
        ? '下载并缓存本地中文语音模型'
        : '构建时未配置 VITE_ASR_MODEL_BASE_URL'
    }
    if (modelClearButton) modelClearButton.hidden = !localRecognizer.isReady()
  }

  const setMicrophoneUnavailable = (message) => {
    microphoneUnavailable = true
    button.disabled = true
    button.classList.remove('listening')
    label.textContent = '文字指令可用'
    feedback(message)
  }

  const speak = (message) => {
    if (!speechAvailable || !speechToggle?.checked || !message || disposed) return
    synthesis.cancel()
    const utterance = new Utterance(message)
    utterance.lang = 'zh-CN'
    const voices = synthesis.getVoices?.() ?? []
    utterance.voice = voices.find((voice) => voice.lang?.toLowerCase() === 'zh-cn')
      ?? voices.find((voice) => voice.lang?.toLowerCase().startsWith('zh'))
      ?? null
    synthesis.speak(utterance)
  }

  const runCommand = async (text) => {
    try {
      const message = await execute(text)
      if (typeof message === 'string' && message) {
        feedback(message)
        speak(message)
      }
    } catch {
      feedback('指令执行失败，请重试或继续使用文字输入。')
    }
  }

  const runCandidates = async ({ candidates, engine }) => {
    const selection = selectTranscriptCandidate(candidates)
    if (selection.error) {
      feedback(ERROR_MESSAGES[selection.error])
      return
    }
    currentEngine = engine
    const engineLabels = {
      'native-local': '浏览器本机中文包',
      'native-service': '浏览器语音服务',
      whisper: '本地 Whisper',
    }
    setEngineStatus(engineLabels[engine] ?? '语音识别')
    await runCommand(selection.text)
  }

  const prepareLocalModel = async () => {
    if (localRecognizer.isReady()) return true
    if (!localRecognizer.isConfigured()) {
      feedback(ERROR_MESSAGES['model-load-failed'])
      return false
    }
    const megabytes = Math.ceil(LOCAL_MODEL_BYTES / 1_000_000)
    if (!confirmDownload(`首次启用需要下载并缓存约 ${megabytes} MB 中文语音模型。录音仅在本机处理，是否继续？`)) {
      feedback('已取消本地模型下载，文字输入仍可使用。')
      return false
    }
    button.disabled = true
    try {
      await localRecognizer.prepare()
      syncModelControls()
      feedback('本地语音模型已就绪，请点击麦克风重新说一次。')
      return true
    } catch (error) {
      feedback(ERROR_MESSAGES[error?.code] ?? ERROR_MESSAGES['model-load-failed'])
      return false
    } finally {
      if (!microphoneUnavailable) button.disabled = false
      setUiState('idle')
    }
  }

  const handleRecognitionError = (error) => {
    const code = error instanceof SpeechRecognitionError ? error.code : 'unsupported-browser'
    if (code === 'aborted') return
    if (code === 'native-service-unavailable') {
      nativeUnavailable = true
      if (modelButton) modelButton.hidden = false
    }
    if (code === 'permission-denied' || code === 'device-not-found') {
      setMicrophoneUnavailable(ERROR_MESSAGES[code])
      return
    }
    feedback(ERROR_MESSAGES[code] ?? ERROR_MESSAGES['unsupported-browser'])
  }

  if (speechToggle) {
    speechToggle.checked = speechAvailable && readPreference(windowObject?.localStorage)
    speechToggle.disabled = !speechAvailable
    speechToggle.setAttribute('aria-checked', String(speechToggle.checked))
  }
  if (modeSelect) modeSelect.value = 'auto'

  const onSpeechToggle = () => {
    if (!speechToggle || !speechAvailable) return
    speechToggle.setAttribute('aria-checked', String(speechToggle.checked))
    writePreference(windowObject?.localStorage, speechToggle.checked)
    if (!speechToggle.checked) synthesis.cancel()
  }

  const onModeChange = () => {
    const mode = modeSelect?.value ?? 'auto'
    if (mode === 'local' && !localRecognizer.isReady()) void prepareLocalModel()
    else if (mode === 'browser') setEngineStatus('浏览器识别')
    else if (mode === 'auto') setEngineStatus('自动选择')
  }

  const onModelEnable = () => { void prepareLocalModel() }
  const onModelClear = async () => {
    try {
      await localRecognizer.clearCache()
      nativeUnavailable = false
      syncModelControls()
      if (modeSelect?.value === 'local') modeSelect.value = 'auto'
      setEngineStatus('自动选择')
      feedback('本地语音模型缓存已清除。')
    } catch (error) {
      feedback(ERROR_MESSAGES[error?.code] ?? ERROR_MESSAGES['model-load-failed'])
    }
  }

  const preflightMicrophone = async () => {
    if (globalThis.isSecureContext === false) throw new SpeechRecognitionError('insecure-context')
    if (!mediaDevices?.getUserMedia) throw new SpeechRecognitionError('unsupported-browser')
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
    } catch (error) {
      throw new SpeechRecognitionError(classifyMediaError(error), error)
    }
  }

  const onClick = async () => {
    if (disposed || microphoneUnavailable || requestingMicrophone || button.classList.contains('listening')) return
    requestingMicrophone = true
    button.disabled = true
    setUiState('requesting-permission')
    try {
      const mode = modeSelect?.value ?? 'auto'
      const useLocal = mode === 'local' || (mode === 'auto' && nativeUnavailable)

      if (useLocal && !localRecognizer.isReady()) {
        const prepared = await prepareLocalModel()
        if (!prepared) return
        feedback('本地模型已就绪，请再次点击麦克风说出指令。')
        return
      }

      if (!useLocal) await preflightMicrophone()
      if (disposed || microphoneUnavailable) return
      button.disabled = false
      const result = useLocal
        ? await localRecognizer.recognize()
        : await nativeRecognizer.recognize({ preferDevice: mode === 'auto' })
      if (!disposed) await runCandidates(result)
    } catch (error) {
      handleRecognitionError(error)
    } finally {
      requestingMicrophone = false
      button.classList.remove('listening')
      if (!microphoneUnavailable) button.disabled = false
      setUiState('idle')
    }
  }

  const onSubmit = (event) => {
    event.preventDefault()
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    void runCommand(text)
  }

  if (!Recognition && !localRecognizer.isConfigured()) {
    setMicrophoneUnavailable('当前浏览器不支持语音识别，且未配置本地模型。文字输入仍可完整控制车辆。')
  } else {
    setEngineStatus('自动选择')
  }
  syncModelControls()

  button.addEventListener('click', onClick)
  form.addEventListener('submit', onSubmit)
  speechToggle?.addEventListener('change', onSpeechToggle)
  modeSelect?.addEventListener('change', onModeChange)
  modelButton?.addEventListener('click', onModelEnable)
  modelClearButton?.addEventListener('click', onModelClear)

  return {
    getState() {
      return { currentEngine, nativeUnavailable, localReady: localRecognizer.isReady() }
    },
    dispose() {
      disposed = true
      button.removeEventListener('click', onClick)
      form.removeEventListener('submit', onSubmit)
      speechToggle?.removeEventListener('change', onSpeechToggle)
      modeSelect?.removeEventListener('change', onModeChange)
      modelButton?.removeEventListener('click', onModelEnable)
      modelClearButton?.removeEventListener('click', onModelClear)
      nativeRecognizer.abort()
      localRecognizer.dispose()
      if (speechAvailable) synthesis.cancel()
    },
  }
}
