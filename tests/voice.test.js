import test from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceControl } from '../src/voice.js'

function fixture() {
  class NodeStub extends EventTarget {
    disabled = false
    value = ''
    focused = false
    classes = new Set()
    classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    }
    focus() { this.focused = true }
  }
  return {
    button: new NodeStub(),
    label: { textContent: '' },
    form: new NodeStub(),
    input: new NodeStub(),
  }
}

test('语音识别接口缺失时自动启用文本路径', () => {
  const oldWindow = globalThis.window
  globalThis.window = {}
  try {
    const nodes = fixture()
    const messages = []
    const control = createVoiceControl({
      ...nodes,
      execute: () => {},
      feedback: (message) => messages.push(message),
    })
    assert.equal(nodes.button.disabled, true)
    assert.equal(nodes.input.focused, true)
    assert.match(messages[0], /不支持语音识别/)
    control.dispose()
  } finally {
    globalThis.window = oldWindow
  }
})

test('重复最终结果只执行一次，网络错误转为文本输入', () => {
  const oldWindow = globalThis.window
  class RecognitionStub {
    static instance
    constructor() { RecognitionStub.instance = this }
    start() { this.onstart() }
    abort() {}
  }
  globalThis.window = { SpeechRecognition: RecognitionStub }
  try {
    const nodes = fixture()
    const commands = []
    const messages = []
    const control = createVoiceControl({
      ...nodes,
      execute: (text) => commands.push(text),
      feedback: (message) => messages.push(message),
    })
    nodes.button.dispatchEvent(new Event('click'))
    const result = { isFinal: true, 0: { transcript: '打开车窗' } }
    RecognitionStub.instance.onresult({ resultIndex: 0, results: [result] })
    RecognitionStub.instance.onresult({ resultIndex: 0, results: [result] })
    assert.deepEqual(commands, ['打开车窗'])
    RecognitionStub.instance.onerror({ error: 'network' })
    assert.equal(nodes.button.disabled, true)
    assert.equal(nodes.input.focused, true)
    assert.match(messages.at(-1), /文字输入/)
    control.dispose()
  } finally {
    globalThis.window = oldWindow
  }
})
