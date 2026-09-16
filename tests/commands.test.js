import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCommand } from '../src/parseCommand.js'
import { createCommandDispatcher } from '../src/commandDispatcher.js'
import { createWindowState } from '../src/windows.js'

test('车窗命令使用统一格式并识别位置、范围和同义词', () => {
  const cases = [
    ['打开车窗', ['FL', 'FR', 'RL', 'RR'], 1],
    ['关闭窗户。', ['FL', 'FR', 'RL', 'RR'], 0],
    ['降下驾驶位侧窗', ['FL'], 1],
    ['升起副驾车玻璃', ['FR'], 0],
    ['把后排车窗摇下', ['RL', 'RR'], 1],
    ['关上左后窗', ['RL'], 0],
  ]

  for (const [originalText, targets, value] of cases) {
    assert.deepEqual(parseCommand(originalText), {
      type: 'set-window',
      targets,
      value,
      originalText,
    })
  }
})

test('车门必须给出位置或明确说全部', () => {
  assert.deepEqual(parseCommand('打开左前车门'), {
    type: 'set-door', targets: ['FL'], value: 1, originalText: '打开左前车门',
  })
  assert.deepEqual(parseCommand('关闭全部车门'), {
    type: 'set-door', targets: ['FL', 'FR', 'RL', 'RR'], value: 0, originalText: '关闭全部车门',
  })
  assert.deepEqual(parseCommand('打开车门'), {
    error: 'missing-position', originalText: '打开车门',
  })
})

test('前后备箱、灯光和天气命令映射为标准命令', () => {
  const cases = [
    ['打开前备箱', 'set-trunk', ['frunk'], 1],
    ['关闭后备箱', 'set-trunk', ['trunk'], 0],
    ['开启大灯', 'set-light', ['headlight'], 1],
    ['关掉雾灯', 'set-light', ['fog'], 0],
    ['打开尾灯', 'set-light', ['tail'], 1],
    ['切换晴天', 'set-weather', ['environment'], 'sunny'],
    ['换成阴天', 'set-weather', ['environment'], 'cloudy'],
    ['切换雨天', 'set-weather', ['environment'], 'rain'],
  ]

  for (const [originalText, type, targets, value] of cases) {
    assert.deepEqual(parseCommand(originalText), { type, targets, value, originalText })
  }
})

test('歧义、动作冲突、行驶和无关指令给出明确错误', () => {
  const cases = [
    ['打开备箱', 'missing-position'],
    ['打开转向灯', 'unavailable-light'],
    ['开启双闪', 'unavailable-light'],
    ['关闭车内灯', 'unavailable-light'],
    ['打开灯光', 'missing-target'],
    ['打开再关闭车窗', 'ambiguous-action'],
    ['挂D档', 'driving-control-not-supported'],
    ['把速度调到五十', 'driving-control-not-supported'],
    ['播放音乐', 'unsupported-command'],
  ]
  for (const [originalText, error] of cases) {
    assert.deepEqual(parseCommand(originalText), { error, originalText })
  }
})

test('命令分发器把车辆和天气命令送到对应控制器', async () => {
  const vehicleCommands = []
  const weatherCommands = []
  const dispatcher = createCommandDispatcher({
    vehicle: {
      dispatch(command) {
        vehicleCommands.push(command)
        return { ok: true, changed: command.targets, code: 'lights-on', detail: command }
      },
    },
    environment: {
      async setWeather(weather) { weatherCommands.push(weather) },
    },
  })

  assert.equal(await dispatcher.execute('打开大灯'), '已打开前大灯。')
  assert.deepEqual(vehicleCommands, [{ type: 'set-light', targets: ['headlight'], value: 1 }])
  assert.equal(await dispatcher.execute('切换雨天'), '已切换到雨天道路。')
  assert.deepEqual(weatherCommands, ['rain'])
})

test('命令分发器反馈歧义，且不把行驶指令送给车辆控制器', async () => {
  let dispatches = 0
  const dispatcher = createCommandDispatcher({
    vehicle: { dispatch() { dispatches += 1 } },
    environment: { async setWeather() {} },
  })

  assert.match(await dispatcher.execute('打开车门'), /补充位置/)
  assert.match(await dispatcher.execute('挂D档'), /按钮/)
  assert.equal(dispatches, 0)
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
