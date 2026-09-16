const SPEECH_OUTPUT_KEY = 'tesla-demo-speech-output'

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

export function createVoiceControl({
  button,
  label,
  form,
  input,
  speechToggle,
  execute,
  feedback,
  mediaDevices = globalThis.navigator?.mediaDevices,
}) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const synthesis = window.speechSynthesis
  const Utterance = window.SpeechSynthesisUtterance
  const speechAvailable = Boolean(synthesis && Utterance)
  let recognition = null
  let microphoneUnavailable = false
  let requestingMicrophone = false
  let seenFinalTexts = new Set()
  let disposed = false

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

  if (speechToggle) {
    speechToggle.checked = speechAvailable && readPreference(window.localStorage)
    speechToggle.disabled = !speechAvailable
    speechToggle.setAttribute('aria-checked', String(speechToggle.checked))
  }

  const onSpeechToggle = () => {
    if (!speechToggle || !speechAvailable) return
    speechToggle.setAttribute('aria-checked', String(speechToggle.checked))
    writePreference(window.localStorage, speechToggle.checked)
    if (!speechToggle.checked) synthesis.cancel()
  }

  if (!Recognition) {
    setMicrophoneUnavailable('当前浏览器不支持语音识别，文字输入仍可完整控制车辆。')
  } else {
    recognition = new Recognition()
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      seenFinalTexts = new Set()
      button.classList.add('listening')
      label.textContent = '正在聆听…'
      feedback('正在聆听，可说车窗、车门、备箱、灯光或天气指令。')
    }
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (!result.isFinal) continue
        const transcript = String(result[0]?.transcript ?? '').trim()
        const finalKey = transcript.replace(/\s+/g, '')
        if (!finalKey || seenFinalTexts.has(finalKey)) continue
        seenFinalTexts.add(finalKey)
        void runCommand(transcript)
      }
    }
    recognition.onerror = (event) => {
      button.classList.remove('listening')
      const error = event.error
      if (error === 'not-allowed') {
        setMicrophoneUnavailable('麦克风权限被拒绝。请在浏览器网站权限中允许麦克风，或直接输入文字指令。')
      } else if (error === 'audio-capture') {
        setMicrophoneUnavailable('没有可用的麦克风。请检查设备连接，文字输入仍可使用。')
      } else if (error === 'service-not-allowed') {
        setMicrophoneUnavailable('语音识别服务被浏览器禁用，请检查浏览器设置或使用文字输入。')
      } else if (error === 'no-speech') {
        feedback('没有听到指令，请重试或直接输入文字。')
      } else if (error === 'network') {
        feedback('语音识别服务暂不可用，请稍后重试或直接输入文字。')
      } else if (error !== 'aborted') {
        feedback('语音识别发生错误，请重试或直接输入文字。')
      }
    }
    recognition.onend = () => {
      button.classList.remove('listening')
      if (!microphoneUnavailable) label.textContent = '点击说话'
    }
  }

  const onClick = async () => {
    if (!recognition || microphoneUnavailable || requestingMicrophone || button.classList.contains('listening')) return
    requestingMicrophone = true
    button.disabled = true
    label.textContent = '正在请求麦克风…'
    try {
      if (mediaDevices?.getUserMedia) {
        const stream = await mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
      }
      if (disposed || microphoneUnavailable) return
      button.disabled = false
      recognition.start()
    } catch (error) {
      const name = error?.name
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setMicrophoneUnavailable('麦克风权限被拒绝。请在浏览器网站权限中允许麦克风，或直接输入文字指令。')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setMicrophoneUnavailable('没有可用的麦克风。请检查设备连接，文字输入仍可使用。')
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        feedback('麦克风暂时无法使用或正被其他应用占用，请稍后重试或输入文字。')
      } else {
        feedback('语音识别未能启动，请稍后重试或直接输入文字。')
      }
    } finally {
      requestingMicrophone = false
      if (!microphoneUnavailable && !button.classList.contains('listening')) {
        button.disabled = false
        label.textContent = '点击说话'
      }
    }
  }
  const onSubmit = (event) => {
    event.preventDefault()
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    void runCommand(text)
  }

  button.addEventListener('click', onClick)
  form.addEventListener('submit', onSubmit)
  speechToggle?.addEventListener('change', onSpeechToggle)

  return {
    dispose() {
      disposed = true
      button.removeEventListener('click', onClick)
      form.removeEventListener('submit', onSubmit)
      speechToggle?.removeEventListener('change', onSpeechToggle)
      if (recognition) recognition.abort()
      if (speechAvailable) synthesis.cancel()
    },
  }
}
