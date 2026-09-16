import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTranscript, selectTranscriptCandidate } from '../src/speech/transcript.js'

test('转写规范化只修正常见语气词、标点和已知同音词', () => {
  assert.equal(normalizeTranscript('请帮我，打开前被箱。'), '打开前备箱')
  assert.equal(normalizeTranscript('麻烦关闭后备厢！'), '关闭后备箱')
  assert.equal(normalizeTranscript('打开雾等'), '打开雾灯')
})

test('多个候选映射到同一命令时只选择最高置信度文本', () => {
  const result = selectTranscriptCandidate([
    { text: '打开前被箱', confidence: 0.75 },
    { text: '打开前备箱', confidence: 0.92 },
    { text: '打开前备厢', confidence: 0.88 },
  ])

  assert.deepEqual(result, {
    text: '打开前备箱',
    confidence: 0.92,
    command: { type: 'set-trunk', targets: ['frunk'], value: 1, originalText: '打开前备箱' },
  })
})

test('候选映射到不同命令时返回歧义而不猜测', () => {
  const result = selectTranscriptCandidate([
    { text: '打开左前车门', confidence: 0.87 },
    { text: '打开右前车门', confidence: 0.83 },
  ])

  assert.equal(result.error, 'ambiguous-transcript')
  assert.deepEqual(result.alternatives, ['打开左前车门', '打开右前车门'])
})

test('低置信度候选和重复最终结果不会触发命令', () => {
  assert.deepEqual(selectTranscriptCandidate([
    { text: '打开大灯', confidence: 0.12 },
  ]), { error: 'low-confidence' })

  assert.deepEqual(selectTranscriptCandidate([
    { text: '打开大灯', confidence: 0.9 },
    { text: '打开 大灯', confidence: 0.9 },
  ]).command, {
    type: 'set-light', targets: ['headlight'], value: 1, originalText: '打开大灯',
  })
})
