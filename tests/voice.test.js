import test from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceControl } from '../src/voice.js'

function fixture() {
  class NodeStub extends EventTarget {
    disabled = false
    checked = false
    value = ''
    focused = false
    classes = new Set()
    attributes = new Map()
    classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    }
    focus() { this.focused = true }
    setAttribute(name, value) { this.attributes.set(name, String(value)) }
  }
  return {
    button: new NodeStub(),
    label: { textContent: '' },
    form: new NodeStub(),
    input: new NodeStub(),
    speechToggle: new NodeStub(),
  }
}

function createRecognitionWindow() {
  class RecognitionStub {
    static instance
    static startCalls = 0
    constructor() { RecognitionStub.instance = this }
    start() {
      RecognitionStub.startCalls += 1
      this.onstart()
    }
    abort() {}
  }
  const storage = new Map()
  return {
    RecognitionStub,
    window: {
      SpeechRecognition: RecognitionStub,
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
    },
    storage,
  }
}

const allowedMediaDevices = {
  async getUserMedia() {
    return { getTracks: () => [{ stop() {} }] }
  },
}

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0))

test('语音识别接口缺失时文本输入仍可用', () => {
  const oldWindow = globalThis.window
  globalThis.window = { localStorage: { getItem: () => null, setItem: () => {} } }
  try {
    const nodes = fixture()
    const messages = []
    const commands = []
    const control = createVoiceControl({
      ...nodes,
      execute: (text) => commands.push(text),
      feedback: (message) => messages.push(message),
    })
    assert.equal(nodes.button.disabled, true)
    assert.equal(nodes.form.disabled, false)
    assert.equal(nodes.input.disabled, false)
    assert.match(messages[0], /不支持语音识别/)

    nodes.input.value = '打开大灯'
    nodes.form.dispatchEvent(new Event('submit', { cancelable: true }))
    assert.deepEqual(commands, ['打开大灯'])
    assert.equal(nodes.input.value, '')
    control.dispose()
  } finally {
    globalThis.window = oldWindow
  }
})

test('同一会话按最终文本去重，新会话可以再次执行', async () => {
  const oldWindow = globalThis.window
  const browser = createRecognitionWindow()
  globalThis.window = browser.window
  try {
    const nodes = fixture()
    const commands = []
    const control = createVoiceControl({
      ...nodes,
      mediaDevices: allowedMediaDevices,
      execute: (text) => commands.push(text),
      feedback: () => {},
    })
    const result = { isFinal: true, 0: { transcript: '打开车窗' } }
    nodes.button.dispatchEvent(new Event('click'))
    await nextTask()
    browser.RecognitionStub.instance.onresult({ resultIndex: 0, results: [result] })
    browser.RecognitionStub.instance.onresult({ resultIndex: 1, results: [result, result] })
    browser.RecognitionStub.instance.onend()
    await nextTask()
    nodes.button.dispatchEvent(new Event('click'))
    await nextTask()
    browser.RecognitionStub.instance.onresult({ resultIndex: 0, results: [result] })
    browser.RecognitionStub.instance.onend()
    await nextTask()
    assert.deepEqual(commands, ['打开车窗', '打开车窗'])
    control.dispose()
  } finally {
    globalThis.window = oldWindow
  }
})

test('点击说话先获得麦克风权限并释放预检音轨', async () => {
  const oldWindow = globalThis.window
  const browser = createRecognitionWindow()
  globalThis.window = browser.window
  let requests = 0
  let stopped = 0
  try {
    const nodes = fixture()
    const control = createVoiceControl({
      ...nodes,
      mediaDevices: {
        async getUserMedia(constraints) {
          requests += 1
          assert.deepEqual(constraints, { audio: true })
          return { getTracks: () => [{ stop: () => { stopped += 1 } }] }
        },
      },
      execute: () => {},
      feedback: () => {},
    })
    nodes.button.dispatchEvent(new Event('click'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(requests, 1)
    assert.equal(stopped, 1)
    assert.equal(browser.RecognitionStub.startCalls, 1)
    control.dispose()
  } finally {
    globalThis.window = oldWindow
  }
})

test('浏览器错误分别反馈并保持文本降级路径', async () => {
  const cases = [
    ['not-allowed', /麦克风权限被拒绝/, true],
    ['audio-capture', /没有可用的麦克风/, true],
    ['no-speech', /没有听到清晰指令/, false],
    ['network', /浏览器语音服务暂不可用/, false],
    ['service-not-allowed', /浏览器语音服务暂不可用/, false],
  ]

  for (const [error, messagePattern, microphoneDisabled] of cases) {
    const oldWindow = globalThis.window
    const browser = createRecognitionWindow()
    globalThis.window = browser.window
    try {
      const nodes = fixture()
      const messages = []
      const control = createVoiceControl({
        ...nodes,
        mediaDevices: allowedMediaDevices,
        execute: () => {},
        feedback: (message) => messages.push(message),
      })
      nodes.button.dispatchEvent(new Event('click'))
      await nextTask()
      browser.RecognitionStub.instance.onerror({ error })
      await nextTask()
      assert.match(messages.at(-1), messagePattern)
      assert.equal(nodes.button.disabled, microphoneDisabled)
      nodes.input.value = '关闭车窗'
      nodes.form.dispatchEvent(new Event('submit', { cancelable: true }))
      assert.equal(nodes.input.value, '')
      control.dispose()
    } finally {
      globalThis.window = oldWindow
    }
  }
})

test('中文播报默认关闭，开启后持久化并取消旧队列', async () => {
  const oldWindow = globalThis.window
  const browser = createRecognitionWindow()
  const spoken = []
  let cancelled = 0
  class UtteranceStub {
    constructor(text) { this.text = text }
  }
  browser.window.SpeechSynthesisUtterance = UtteranceStub
  browser.window.speechSynthesis = {
    cancel: () => { cancelled += 1 },
    speak: (utterance) => spoken.push(utterance),
    getVoices: () => [{ lang: 'en-US', name: 'English' }, { lang: 'zh-CN', name: '中文' }],
  }
  globalThis.window = browser.window
  try {
    const nodes = fixture()
    const control = createVoiceControl({
      ...nodes,
      execute: async () => '已打开前大灯。',
      feedback: () => {},
    })
    assert.equal(nodes.speechToggle.checked, false)
    nodes.speechToggle.checked = true
    nodes.speechToggle.dispatchEvent(new Event('change'))
    assert.equal(browser.storage.get('tesla-demo-speech-output'), 'true')

    nodes.input.value = '打开大灯'
    nodes.form.dispatchEvent(new Event('submit', { cancelable: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(cancelled, 1)
    assert.equal(spoken[0].text, '已打开前大灯。')
    assert.equal(spoken[0].lang, 'zh-CN')
    assert.equal(spoken[0].voice.name, '中文')
    control.dispose()
  } finally {
    globalThis.window = oldWindow
  }
})
