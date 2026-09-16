import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCommand } from '../src/parseCommand.js'
import { createWindowState } from '../src/windows.js'

test('没有指定位置的开关命令控制全部四窗', () => {
  assert.deepEqual(parseCommand('打开车窗'), { targets: ['FL', 'FR', 'RL', 'RR'], open: true })
  assert.deepEqual(parseCommand('关闭窗户。'), { targets: ['FL', 'FR', 'RL', 'RR'], open: false })
})

test('驾驶位和四个方位能够分别识别', () => {
  const cases = [
    ['打开驾驶位车窗', 'FL'],
    ['降下左前窗', 'FL'],
    ['开启副驾驶车窗', 'FR'],
    ['打开右前窗', 'FR'],
    ['把左后车窗打开', 'RL'],
    ['打开右后窗', 'RR'],
  ]
  for (const [text, id] of cases) assert.deepEqual(parseCommand(text), { targets: [id], open: true })
})

test('指定范围和关闭同义词', () => {
  assert.deepEqual(parseCommand('把后排车窗升上去'), { targets: ['RL', 'RR'], open: false })
  assert.deepEqual(parseCommand('关上右前车窗'), { targets: ['FR'], open: false })
  assert.deepEqual(parseCommand('摇上左后窗'), { targets: ['RL'], open: false })
})

test('未理解或冲突指令不会产生动作', () => {
  assert.equal(parseCommand('打开大灯'), null)
  assert.equal(parseCommand('看看车窗'), null)
  assert.equal(parseCommand('打开再关闭车窗'), null)
})

test('重复目标不更新状态，反向命令可以在动画中执行', () => {
  const state = createWindowState()
  let notifications = 0
  state.subscribe(() => { notifications += 1 })
  assert.equal(state.setAllWindows(true), true)
  assert.equal(state.setAllWindows(true), false)
  assert.equal(notifications, 2)
  const duringOpen = state.advance(0.1).FL.current
  assert.ok(duringOpen > 0 && duringOpen < 1)
  assert.equal(state.setWindow('FL', false), true)
  assert.equal(state.setWindow('FL', false), false)
  assert.ok(state.advance(0.1).FL.current < duringOpen)
})
