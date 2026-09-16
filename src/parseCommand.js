const ALL_CABIN_POSITIONS = Object.freeze(['FL', 'FR', 'RL', 'RR'])

const OPEN_TERMS = /(打开|开启|开开|降下|降一降|放下|摇下|亮起|点亮)/
const CLOSE_TERMS = /(关闭|关上|关掉|关起来|升起|升上|摇上|熄灭)/

const PART_TERMS = Object.freeze({
  window: /(车窗|窗户|侧窗|车玻璃|左前窗|右前窗|左后窗|右后窗)/,
  trunk: /(备箱|备厢|前舱盖|后舱盖|引擎盖)/,
  door: /(车门|侧门)/,
  light: /(灯光|灯|双闪)/,
})

const LIGHT_TARGETS = Object.freeze([
  ['headlight', /(前大灯|大灯|前灯)/],
  ['fog', /雾灯/],
  ['tail', /(尾灯|后灯)/],
  ['brake', /刹车灯/],
  ['reverse', /倒车灯/],
])
const UNAVAILABLE_LIGHT_TERMS = /(双闪|危险警示灯|警示灯|转向灯|左转灯|右转灯|车内灯|内饰灯|氛围灯)/

const WEATHER_TARGETS = Object.freeze([
  ['sunny', /(晴天|晴朗)/],
  ['cloudy', /(阴天|多云)/],
  ['rain', /(雨天|下雨|雨景)/],
])

function resultError(error, originalText) {
  return { error, originalText }
}

function parseBinaryAction(command, originalText) {
  const isOpen = OPEN_TERMS.test(command)
  const isClose = CLOSE_TERMS.test(command)
  if (isOpen && isClose) return resultError('ambiguous-action', originalText)
  if (!isOpen && !isClose) return resultError('missing-action', originalText)
  return isOpen ? 1 : 0
}

function parseCabinPositions(command) {
  if (/(全部|所有|四扇|四个)/.test(command)) return [...ALL_CABIN_POSITIONS]

  const targets = []
  if (/(驾驶位|司机位|主驾|左前|前左)/.test(command)) targets.push('FL')
  if (/(副驾驶|副驾|右前|前右)/.test(command)) targets.push('FR')
  if (/(左后|后左)/.test(command)) targets.push('RL')
  if (/(右后|后右)/.test(command)) targets.push('RR')
  if (/(前排)/.test(command)) targets.push('FL', 'FR')
  if (/(后排|后座)/.test(command)) targets.push('RL', 'RR')
  return [...new Set(targets)]
}

function standardCommand(type, targets, value, originalText) {
  return { type, targets, value, originalText }
}

export function parseCommand(text) {
  const originalText = String(text ?? '').trim()
  const command = originalText.replace(/[\s，。！？、,.!?]/g, '')
  if (!command) return resultError('unsupported-command', originalText)

  const weatherMatches = WEATHER_TARGETS.filter(([, pattern]) => pattern.test(command))
  if (weatherMatches.length) {
    if (weatherMatches.length !== 1) return resultError('ambiguous-target', originalText)
    return standardCommand('set-weather', ['environment'], weatherMatches[0][0], originalText)
  }

  if (PART_TERMS.window.test(command)) {
    const value = parseBinaryAction(command, originalText)
    if (typeof value !== 'number') return value
    const positions = parseCabinPositions(command)
    return standardCommand('set-window', positions.length ? positions : [...ALL_CABIN_POSITIONS], value, originalText)
  }

  if (PART_TERMS.trunk.test(command)) {
    const value = parseBinaryAction(command, originalText)
    if (typeof value !== 'number') return value
    const all = /(全部|所有|前后)/.test(command)
    const targets = []
    if (all || /(前备箱|前备厢|前舱盖|引擎盖)/.test(command)) targets.push('frunk')
    if (all || /(后备箱|后备厢|后舱盖)/.test(command)) targets.push('trunk')
    if (!targets.length) return resultError('missing-position', originalText)
    return standardCommand('set-trunk', targets, value, originalText)
  }

  if (PART_TERMS.door.test(command)) {
    const value = parseBinaryAction(command, originalText)
    if (typeof value !== 'number') return value
    const targets = parseCabinPositions(command)
    if (!targets.length) return resultError('missing-position', originalText)
    return standardCommand('set-door', targets, value, originalText)
  }

  if (PART_TERMS.light.test(command)) {
    if (UNAVAILABLE_LIGHT_TERMS.test(command)) return resultError('unavailable-light', originalText)
    const value = parseBinaryAction(command, originalText)
    if (typeof value !== 'number') return value
    const targets = LIGHT_TARGETS.filter(([, pattern]) => pattern.test(command)).map(([id]) => id)
    if (!targets.length) return resultError('missing-target', originalText)
    return standardCommand('set-light', [...new Set(targets)], value, originalText)
  }

  if (/(档位|挂[入到]?[PDR]档|[PDR]档|车速|速度|加速|减速|停车|前进|倒车)/i.test(command)) {
    return resultError('driving-control-not-supported', originalText)
  }

  return resultError('unsupported-command', originalText)
}
