export function createVoiceControl({ button, label, form, input, execute, feedback }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  let recognition = null
  let unavailable = false
  let seenFinals = new Set()

  const setUnavailable = (message) => {
    unavailable = true
    button.disabled = true
    button.classList.remove('listening')
    label.textContent = '文字控车已就绪'
    feedback(message)
    input.focus()
  }

  if (!Recognition) {
    setUnavailable('当前浏览器不支持语音识别，输入文字指令即可控车。')
  } else {
    recognition = new Recognition()
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      seenFinals = new Set()
      button.classList.add('listening')
      label.textContent = '正在聆听…'
      feedback('正在聆听，请说“打开车窗”或“关闭车窗”。')
    }
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (!result.isFinal || seenFinals.has(i)) continue
        seenFinals.add(i)
        execute(result[0]?.transcript ?? '')
      }
    }
    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        feedback('没有听到指令，请重试或直接输入文字。')
        return
      }
      setUnavailable('语音识别暂不可用，请改用下方文字输入。')
    }
    recognition.onend = () => {
      button.classList.remove('listening')
      if (!unavailable) label.textContent = '点击说话'
    }
  }

  const onClick = () => {
    if (!recognition || unavailable || button.classList.contains('listening')) return
    try {
      recognition.start()
    } catch {
      setUnavailable('语音识别未能启动，请改用文字输入。')
    }
  }
  const onSubmit = (event) => {
    event.preventDefault()
    const text = input.value.trim()
    if (!text) return
    execute(text)
    input.value = ''
  }
  button.addEventListener('click', onClick)
  form.addEventListener('submit', onSubmit)

  return {
    dispose() {
      button.removeEventListener('click', onClick)
      form.removeEventListener('submit', onSubmit)
      if (recognition) recognition.abort()
    },
  }
}
