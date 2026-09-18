import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCommand, parseCommands } from '../src/parseCommand.js'
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

test('前后备箱、灯光、季节和天气命令映射为标准命令', () => {
  const cases = [
    ['打开前备箱', 'set-trunk', ['frunk'], 1],
    ['关闭后备箱', 'set-trunk', ['trunk'], 0],
    ['开启大灯', 'set-light', ['headlight'], 1],
    ['关掉雾灯', 'set-light', ['fog'], 0],
    ['打开尾灯', 'set-light', ['tail'], 1],
    ['切换晴天', 'set-weather', ['environment'], 'sunny'],
    ['换成阴天', 'set-weather', ['environment'], 'cloudy'],
    ['切换雨天', 'set-weather', ['environment'], 'rain'],
    ['切换雪天', 'set-weather', ['environment'], 'snow'],
    ['下雪了', 'set-weather', ['environment'], 'snow'],
    ['看雪景', 'set-weather', ['environment'], 'snow'],
    ['切换到夜晚', 'set-weather', ['environment'], 'night'],
    ['打开夜间模式', 'set-weather', ['environment'], 'night'],
    ['切换到春天', 'set-season', ['environment'], 'spring'],
    ['换成春季', 'set-season', ['environment'], 'spring'],
    ['切换夏天', 'set-season', ['environment'], 'summer'],
    ['切换到秋季', 'set-season', ['environment'], 'autumn'],
    ['换成冬天', 'set-season', ['environment'], 'winter'],
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
    ['打开再关闭车窗', 'ambiguous-action'],
    ['播放音乐', 'unsupported-command'],
  ]
  for (const [originalText, error] of cases) {
    assert.deepEqual(parseCommand(originalText), { error, originalText })
  }
})

test('常用灯光总称、车漆与轮毂表达映射为现有控制预设', () => {
  const cases = [
    ['打开所有灯光', 'set-light', ['headlight', 'fog', 'tail'], 1],
    ['把车灯都关掉', 'set-light', ['headlight', 'fog', 'tail'], 0],
    ['开灯', 'set-light', ['headlight', 'fog', 'tail'], 1],
    ['换成黑色车漆', 'set-paint', ['vehicle'], 'obsidian'],
    ['把车漆改成银灰色', 'set-paint', ['vehicle'], 'silver'],
    ['喷成红色', 'set-paint', ['vehicle'], 'burgundy'],
    ['选择象牙白', 'set-paint', ['vehicle'], 'ivory'],
    ['换成午夜蓝', 'set-paint', ['vehicle'], 'blue'],
    ['换成涡流轮毂', 'set-wheel-style', ['vehicle'], 'turbine'],
    ['选择银色单体轮毂', 'set-wheel-style', ['vehicle'], 'monoblock'],
    ['改成碳黑轮毂', 'set-wheel-style', ['vehicle'], 'carbon'],
  ]

  for (const [originalText, type, targets, value] of cases) {
    assert.deepEqual(parseCommand(originalText), { type, targets, value, originalText })
  }

  assert.deepEqual(parseCommand('把车漆换成绿色'), {
    error: 'missing-target', originalText: '把车漆换成绿色',
  })
  assert.deepEqual(parseCommand('换个轮毂'), {
    error: 'missing-target', originalText: '换个轮毂',
  })
})

test('档位、方向、中文数字与相对速度表达映射为行驶命令', () => {
  const cases = [
    ['前进', { type: 'set-gear', targets: ['vehicle'], value: 'D' }],
    ['挂D档', { type: 'set-gear', targets: ['vehicle'], value: 'D' }],
    ['后退', { type: 'set-gear', targets: ['vehicle'], value: 'R' }],
    ['倒车到十公里', { type: 'set-gear', targets: ['vehicle'], value: 'R', speed: 10 }],
    ['前进到五十', { type: 'set-gear', targets: ['vehicle'], value: 'D', speed: 50 }],
    ['往前开到六十', { type: 'set-gear', targets: ['vehicle'], value: 'D', speed: 60 }],
    ['停车', { type: 'set-gear', targets: ['vehicle'], value: 'P' }],
    ['停一下', { type: 'set-gear', targets: ['vehicle'], value: 'P' }],
    ['速度调到50', { type: 'set-speed', targets: ['vehicle'], value: 50 }],
    ['车速五十', { type: 'set-speed', targets: ['vehicle'], value: 50 }],
    ['时速八十', { type: 'set-speed', targets: ['vehicle'], value: 80 }],
    ['加速到六十', { type: 'set-speed', targets: ['vehicle'], value: 60 }],
    ['快一点', { type: 'adjust-speed', targets: ['vehicle'], value: 10 }],
    ['加快一点', { type: 'adjust-speed', targets: ['vehicle'], value: 10 }],
    ['减速', { type: 'adjust-speed', targets: ['vehicle'], value: -10 }],
    ['放慢一点', { type: 'adjust-speed', targets: ['vehicle'], value: -10 }],
    ['提高二十公里', { type: 'adjust-speed', targets: ['vehicle'], value: 20 }],
    ['降低10公里', { type: 'adjust-speed', targets: ['vehicle'], value: -10 }],
  ]

  for (const [originalText, expected] of cases) {
    assert.deepEqual(parseCommand(originalText), { ...expected, originalText })
  }
})

test('包含行驶、外观与全部灯光的展示长句保持原始执行顺序', () => {
  const parsed = parseCommands('关闭所有车门，然后前进到五十，再打开全部灯光')
  assert.deepEqual(parsed.errors, [])
  assert.deepEqual(parsed.commands.map(({ type, targets, value, speed }) => ({
    type, targets, value, ...(speed === undefined ? {} : { speed }),
  })), [
    { type: 'set-door', targets: ['FL', 'FR', 'RL', 'RR'], value: 0 },
    { type: 'set-gear', targets: ['vehicle'], value: 'D', speed: 50 },
    { type: 'set-light', targets: ['headlight', 'fog', 'tail'], value: 1 },
  ])
})

test('长句按时序词与跨类别并列关系拆成多条标准命令', () => {
  const parsed = parseCommands('打开左前车门和后备箱，然后打开大灯')
  assert.deepEqual(parsed.errors, [])
  assert.deepEqual(parsed.commands.map(({ type, targets, value }) => ({ type, targets, value })), [
    { type: 'set-door', targets: ['FL'], value: 1 },
    { type: 'set-trunk', targets: ['trunk'], value: 1 },
    { type: 'set-light', targets: ['headlight'], value: 1 },
  ])
})

test('同类多目标保持单条命令，代词沿用上一条命令的目标', () => {
  const lights = parseCommands('关闭雾灯和尾灯')
  assert.deepEqual(lights.errors, [])
  assert.deepEqual(lights.commands.map(({ type, targets, value }) => ({ type, targets, value })), [
    { type: 'set-light', targets: ['fog', 'tail'], value: 0 },
  ])

  const window = parseCommands('打开左前车窗，然后关闭它')
  assert.deepEqual(window.errors, [])
  assert.deepEqual(window.commands.map(({ type, targets, value }) => ({ type, targets, value })), [
    { type: 'set-window', targets: ['FL'], value: 1 },
    { type: 'set-window', targets: ['FL'], value: 0 },
  ])
})

test('速度数值不会被误用为后续部件的开关动作或代词目标', () => {
  const missingAction = parseCommands('速度调到五十，然后左前车门')
  assert.deepEqual(missingAction.commands.map(({ type, value }) => ({ type, value })), [
    { type: 'set-speed', value: 50 },
  ])
  assert.equal(missingAction.errors[0].error, 'missing-action')

  const pronoun = parseCommands('速度调到五十，然后关闭它')
  assert.deepEqual(pronoun.commands.map(({ type, value }) => ({ type, value })), [
    { type: 'set-speed', value: 50 },
  ])
  assert.equal(pronoun.errors[0].error, 'unsupported-command')
})

test('命令分发器把车辆、天气和季节命令送到对应控制器', async () => {
  const vehicleCommands = []
  const environmentCommands = []
  const dispatcher = createCommandDispatcher({
    vehicle: {
      dispatch(command) {
        vehicleCommands.push(command)
        return { ok: true, changed: command.targets, code: 'lights-on', detail: command }
      },
    },
    environment: {
      async setWeather(weather) { environmentCommands.push(['weather', weather]) },
      async setSeason(season) { environmentCommands.push(['season', season]) },
    },
  })

  assert.equal(await dispatcher.execute('打开大灯'), '已打开前大灯。')
  assert.deepEqual(vehicleCommands, [{ type: 'set-light', targets: ['headlight'], value: 1 }])
  assert.equal(await dispatcher.execute('切换雨天'), '已切换到雨天道路。')
  assert.equal(await dispatcher.execute('切换春天'), '已切换到春季道路。')
  assert.deepEqual(environmentCommands, [['weather', 'rain'], ['season', 'spring']])
})

test('命令分发器反馈歧义时不把无效指令送给车辆控制器', async () => {
  let dispatches = 0
  const dispatcher = createCommandDispatcher({
    vehicle: { dispatch() { dispatches += 1 } },
    environment: { async setWeather() {} },
  })

  assert.match(await dispatcher.execute('打开车门'), /补充位置/)
  assert.equal(dispatches, 0)
})

test('命令分发器顺序执行长句并只返回一条汇总反馈', async () => {
  const vehicleCommands = []
  const dispatcher = createCommandDispatcher({
    vehicle: {
      dispatch(command) {
        vehicleCommands.push(command)
        return { message: `第${vehicleCommands.length}项完成。` }
      },
    },
    environment: { async setWeather() {} },
  })

  assert.equal(
    await dispatcher.execute('打开左前车门和后备箱，然后打开大灯'),
    '第1项完成；第2项完成；第3项完成。',
  )
  assert.deepEqual(vehicleCommands, [
    { type: 'set-door', targets: ['FL'], value: 1 },
    { type: 'set-trunk', targets: ['trunk'], value: 1 },
    { type: 'set-light', targets: ['headlight'], value: 1 },
  ])
})

test('长句中的单条错误不阻止其余有效命令执行', async () => {
  const vehicleCommands = []
  const dispatcher = createCommandDispatcher({
    vehicle: {
      dispatch(command) {
        vehicleCommands.push(command)
        return { ok: true, changed: command.targets, code: 'lights-on', detail: command }
      },
    },
    environment: { async setWeather() {} },
  })

  const message = await dispatcher.execute('播放音乐，然后打开大灯')
  assert.match(message, /未理解这条指令/)
  assert.match(message, /已打开前大灯/)
  assert.deepEqual(vehicleCommands, [
    { type: 'set-light', targets: ['headlight'], value: 1 },
  ])
})

function createDrivingVehicle({ gear = 'P', targetSpeed = 0, blockGear = false } = {}) {
  const commands = []
  const state = { gear, speed: targetSpeed, targetSpeed }
  return {
    commands,
    getState() { return { ...state } },
    dispatch(command) {
      commands.push(command)
      if (command.type === 'set-gear') {
        if (blockGear && command.value !== 'P') {
          return { ok: false, message: '车门尚未关闭，无法起步。' }
        }
        state.gear = command.value
        state.targetSpeed = command.value === 'D' ? 30 : command.value === 'R' ? 8 : 0
        state.speed = command.value === 'P' ? 0 : state.speed
        return { ok: true, message: `已进入 ${command.value} 档。` }
      }
      if (command.type === 'set-speed') {
        state.targetSpeed = command.value
        return { ok: true, message: `速度已设为 ${command.value}。` }
      }
      return { ok: true, message: `${command.type} 已执行。` }
    },
  }
}

test('P 档速度命令自动进入 D，D/R 档保持当前方向', async () => {
  const parked = createDrivingVehicle()
  const parkedDispatcher = createCommandDispatcher({
    vehicle: parked,
    environment: { async setWeather() {} },
  })
  assert.equal(await parkedDispatcher.execute('速度调到五十'), '已进入 D 档；速度已设为 50。')
  assert.deepEqual(parked.commands, [
    { type: 'set-gear', targets: ['vehicle'], value: 'D' },
    { type: 'set-speed', targets: ['vehicle'], value: 50 },
  ])

  const reversing = createDrivingVehicle({ gear: 'R', targetSpeed: 8 })
  const reversingDispatcher = createCommandDispatcher({
    vehicle: reversing,
    environment: { async setWeather() {} },
  })
  await reversingDispatcher.execute('速度调到十')
  assert.deepEqual(reversing.commands, [
    { type: 'set-speed', targets: ['vehicle'], value: 10 },
  ])
})

test('相对速度基于当前目标速度计算，复合方向成功后再设置速度', async () => {
  const driving = createDrivingVehicle({ gear: 'D', targetSpeed: 30 })
  const drivingDispatcher = createCommandDispatcher({
    vehicle: driving,
    environment: { async setWeather() {} },
  })
  await drivingDispatcher.execute('快一点')
  await drivingDispatcher.execute('降低二十公里')
  assert.deepEqual(driving.commands, [
    { type: 'set-speed', targets: ['vehicle'], value: 40 },
    { type: 'set-speed', targets: ['vehicle'], value: 20 },
  ])

  const reversing = createDrivingVehicle()
  const reversingDispatcher = createCommandDispatcher({
    vehicle: reversing,
    environment: { async setWeather() {} },
  })
  await reversingDispatcher.execute('倒车到十公里')
  assert.deepEqual(reversing.commands, [
    { type: 'set-gear', targets: ['vehicle'], value: 'R' },
    { type: 'set-speed', targets: ['vehicle'], value: 10 },
  ])
})

test('档位切换失败时阻止依赖速度，展示长句保持严格执行顺序', async () => {
  const blocked = createDrivingVehicle({ blockGear: true })
  const blockedDispatcher = createCommandDispatcher({
    vehicle: blocked,
    environment: { async setWeather() {} },
  })
  assert.equal(await blockedDispatcher.execute('前进到五十'), '车门尚未关闭，无法起步。')
  assert.deepEqual(blocked.commands, [
    { type: 'set-gear', targets: ['vehicle'], value: 'D' },
  ])

  const showcase = createDrivingVehicle()
  const showcaseDispatcher = createCommandDispatcher({
    vehicle: showcase,
    environment: { async setWeather() {} },
  })
  await showcaseDispatcher.execute('关闭所有车门，然后前进到五十，再打开全部灯光')
  assert.deepEqual(showcase.commands, [
    { type: 'set-door', targets: ['FL', 'FR', 'RL', 'RR'], value: 0 },
    { type: 'set-gear', targets: ['vehicle'], value: 'D' },
    { type: 'set-speed', targets: ['vehicle'], value: 50 },
    { type: 'set-light', targets: ['headlight', 'fog', 'tail'], value: 1 },
  ])
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
