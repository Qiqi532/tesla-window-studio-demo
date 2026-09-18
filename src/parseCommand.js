const ALL_CABIN_POSITIONS = Object.freeze(['FL', 'FR', 'RL', 'RR'])

const OPEN_TERMS = /(打开|开启|开开|开灯|降下|降一降|放下|摇下|亮起|点亮)/
const CLOSE_TERMS = /(关闭|关上|关掉|关起来|关灯|升起|升上|摇上|熄灭)/

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
const ALL_MANUAL_LIGHTS = Object.freeze(['headlight', 'fog', 'tail'])
const UNAVAILABLE_LIGHT_TERMS = /(双闪|危险警示灯|警示灯|转向灯|左转灯|右转灯|车内灯|内饰灯|氛围灯)/

const PAINT_TARGETS = Object.freeze([
  ['obsidian', /(曜石黑|纯黑|黑色|黑漆)/],
  ['silver', /(液态银|银灰|银色|灰色)/],
  ['burgundy', /(勃艮第红|酒红|深红|红色)/],
  ['ivory', /(象牙白|米白|白色|白漆)/],
  ['blue', /(午夜蓝|藏蓝|深蓝|蓝色)/],
])
const WHEEL_TARGETS = Object.freeze([
  ['turbine', /(涡流|涡轮|21寸|二十一寸)/],
  ['monoblock', /(单体|银色单体|银色轮毂|20寸|二十寸)/],
  ['carbon', /(碳黑|黑色轮毂|22寸|二十二寸)/],
])
const APPEARANCE_ACTION_TERMS = /(换成|切换|改成|变成|喷成|选择|换个|更换)/
const PAINT_TERMS = /(车漆|车身颜色|外观颜色|颜色)/
const WHEEL_TERMS = /(轮毂|轮圈|车轮样式)/

const WEATHER_TARGETS = Object.freeze([
  ['sunny', /(晴天|晴朗)/],
  ['cloudy', /(阴天|多云)/],
  ['rain', /(雨天|下雨|雨景)/],
  ['snow', /(雪天|下雪|雪景|降雪|飘雪)/],
  ['night', /(夜晚|夜间|晚上|黑夜|深夜)/],
])

const SEASON_TARGETS = Object.freeze([
  ['spring', /(春天|春季|初春|开春)/],
  ['summer', /(夏天|夏季|盛夏)/],
  ['autumn', /(秋天|秋季|深秋|金秋)/],
  ['winter', /(冬天|冬季|寒冬|深冬)/],
])

const CLAUSE_PUNCTUATION = /[，,、；;。.！!？?\n]+/g
const SEQUENCE_TERMS = /(然后|接着|随后|之后|完了|同时|再)/g
const LEADING_SEQUENCE_TERMS = /^(?:(?:然后|接着|随后|之后|完了|同时|再)+)/
const PARALLEL_TERMS = /(以及|并且|和|跟|与|并)/g
const LEADING_FILLERS = /^(?:请帮我|麻烦你|麻烦|请|帮我|我要|我想要)+/
const PRONOUN_TARGET = /(它|它们|他们|这个|这些)$/
const BINARY_COMMAND_TYPES = Object.freeze(['set-window', 'set-door', 'set-trunk', 'set-light'])

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

function standardCommand(type, targets, value, originalText, extra = {}) {
  return { type, targets, value, ...extra, originalText }
}

function parseChineseNumber(value) {
  const digits = {
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
    五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  }
  const text = String(value ?? '')
  if (!text) return null
  if (text.includes('十')) {
    const [tensText, unitsText] = text.split('十')
    const tens = tensText ? digits[tensText] : 1
    const units = unitsText ? digits[unitsText] : 0
    if (!Number.isInteger(tens) || !Number.isInteger(units)) return null
    return tens * 10 + units
  }
  if (![...text].every((character) => Object.hasOwn(digits, character))) return null
  return Number([...text].map((character) => digits[character]).join(''))
}

function parseSpokenNumber(command) {
  const text = String(command).replace(/(?:加快|放慢|快|慢)一点/g, '')
  const arabic = text.match(/\d{1,3}/)
  if (arabic) return Number(arabic[0])
  const chinese = text.match(/[零〇一二两三四五六七八九十]{1,3}/)
  return chinese ? parseChineseNumber(chinese[0]) : null
}

function commandDomains(text) {
  const command = String(text ?? '').replace(/\s/g, '')
  const domains = new Set()
  for (const [domain, pattern] of Object.entries(PART_TERMS)) {
    if (pattern.test(command)) domains.add(domain)
  }
  if (WEATHER_TARGETS.some(([, pattern]) => pattern.test(command))) domains.add('weather')
  if (SEASON_TARGETS.some(([, pattern]) => pattern.test(command))) domains.add('season')
  if (PAINT_TERMS.test(command) || PAINT_TARGETS.some(([, pattern]) => pattern.test(command))) domains.add('paint')
  if (WHEEL_TERMS.test(command) || WHEEL_TARGETS.some(([, pattern]) => pattern.test(command))) domains.add('wheel')
  if (/(档位|挂[入到]?[PDR][档挡]|[PDR][档挡]|车速|时速|速度|加速|减速|停车|停下|停一下|停住|刹停|前进|后退|倒车|向前开|往前开|向后开|往后开|快一点|慢一点|加快|放慢|慢下来|提高|降低|开到|跑到)/i.test(command)) {
    domains.add('driving')
  }
  return domains
}

function hasBinaryAction(text) {
  return OPEN_TERMS.test(text) || CLOSE_TERMS.test(text)
}

function cleanClause(text) {
  return String(text ?? '')
    .trim()
    .replace(LEADING_SEQUENCE_TERMS, '')
    .replace(LEADING_FILLERS, '')
    .trim()
}

function splitTemporalSegment(segment) {
  const clauses = []
  let cursor = 0
  SEQUENCE_TERMS.lastIndex = 0
  for (let match = SEQUENCE_TERMS.exec(segment); match; match = SEQUENCE_TERMS.exec(segment)) {
    const left = segment.slice(cursor, match.index).trim()
    const right = segment.slice(SEQUENCE_TERMS.lastIndex).trim()
    // "打开再关闭车窗" remains one ambiguous command: a sequence word is only a
    // boundary after the left side has named a controllable target.
    if (!left || !right || commandDomains(left).size === 0) continue
    clauses.push(left)
    cursor = SEQUENCE_TERMS.lastIndex
  }
  clauses.push(segment.slice(cursor))
  return clauses.map(cleanClause).filter(Boolean)
}

function splitCrossCategoryClause(clause) {
  const clauses = []
  let remainder = clause

  // Split only when the conjunction separates different control domains, or when both
  // sides contain their own action. "雾灯和尾灯" therefore stays one multi-target
  // command, while "车门和后备箱" becomes two commands and inherits the action below.
  while (remainder) {
    let boundary = null
    PARALLEL_TERMS.lastIndex = 0
    for (let match = PARALLEL_TERMS.exec(remainder); match; match = PARALLEL_TERMS.exec(remainder)) {
      const left = remainder.slice(0, match.index).trim()
      const right = remainder.slice(PARALLEL_TERMS.lastIndex).trim()
      if (!left || !right) continue
      const leftDomains = commandDomains(left)
      const rightDomains = commandDomains(right)
      if (!leftDomains.size || !rightDomains.size) continue
      const sameSingleDomain = leftDomains.size === 1
        && rightDomains.size === 1
        && [...leftDomains][0] === [...rightDomains][0]
      if (!sameSingleDomain || (hasBinaryAction(left) && hasBinaryAction(right))) {
        boundary = { left, right }
        break
      }
    }
    if (!boundary) {
      clauses.push(remainder)
      break
    }
    clauses.push(boundary.left)
    remainder = boundary.right
  }

  return clauses.map(cleanClause).filter(Boolean)
}

function splitCommandClauses(text) {
  return String(text ?? '')
    .split(CLAUSE_PUNCTUATION)
    .flatMap(splitTemporalSegment)
    .flatMap(splitCrossCategoryClause)
    .map(cleanClause)
    .filter(Boolean)
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

  const seasonMatches = SEASON_TARGETS.filter(([, pattern]) => pattern.test(command))
  if (seasonMatches.length) {
    if (seasonMatches.length !== 1) return resultError('ambiguous-target', originalText)
    return standardCommand('set-season', ['environment'], seasonMatches[0][0], originalText)
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
    return standardCommand(
      'set-light',
      targets.length ? [...new Set(targets)] : [...ALL_MANUAL_LIGHTS],
      value,
      originalText,
    )
  }

  const wheelMatches = WHEEL_TARGETS.filter(([, pattern]) => pattern.test(command))
  const wheelContext = WHEEL_TERMS.test(command)
    || (APPEARANCE_ACTION_TERMS.test(command) && wheelMatches.length > 0)
  if (wheelContext) {
    if (wheelMatches.length !== 1) {
      return resultError(wheelMatches.length ? 'ambiguous-target' : 'missing-target', originalText)
    }
    return standardCommand('set-wheel-style', ['vehicle'], wheelMatches[0][0], originalText)
  }

  const paintMatches = PAINT_TARGETS.filter(([, pattern]) => pattern.test(command))
  const paintContext = PAINT_TERMS.test(command)
    || (APPEARANCE_ACTION_TERMS.test(command) && paintMatches.length > 0)
  if (paintContext) {
    if (paintMatches.length !== 1) {
      return resultError(paintMatches.length ? 'ambiguous-target' : 'missing-target', originalText)
    }
    return standardCommand('set-paint', ['vehicle'], paintMatches[0][0], originalText)
  }

  if (/(停车|停下|停一下|停住|停止|刹停|刹车|驻车|挂[入到]?P[档挡]|P[档挡])/i.test(command)) {
    return standardCommand('set-gear', ['vehicle'], 'P', originalText)
  }

  const reverseRequested = /(后退|倒车|向后开|往后开|往后倒|挂[入到]?R[档挡]|R[档挡])/i.test(command)
  const forwardRequested = /(前进|向前开|往前开|开车|出发|挂[入到]?D[档挡]|D[档挡])/i.test(command)
  if (reverseRequested || forwardRequested) {
    if (reverseRequested && forwardRequested) return resultError('ambiguous-target', originalText)
    const speed = parseSpokenNumber(command)
    return standardCommand(
      'set-gear',
      ['vehicle'],
      reverseRequested ? 'R' : 'D',
      originalText,
      speed === null ? {} : { speed },
    )
  }

  const speedContext = /(车速|时速|速度|公里|km|码|加速|减速|快一点|慢一点|加快|放慢|慢下来|提高|降低|增加|减少|开到|跑到)/i.test(command)
  if (speedContext) {
    const speed = parseSpokenNumber(command)
    const absolute = /(车速|时速|速度|加速到|减速到|开到|跑到|调到|调成|设为|设置为)/.test(command)
    if (absolute) {
      if (speed === null) return resultError('missing-target', originalText)
      return standardCommand('set-speed', ['vehicle'], speed, originalText)
    }

    const increase = /(快一点|加快|加速|提高|增加)/.test(command)
    const decrease = /(慢一点|放慢|慢下来|减速|降低|减少)/.test(command)
    if (increase && decrease) return resultError('ambiguous-action', originalText)
    if (increase || decrease) {
      const amount = speed ?? 10
      return standardCommand('adjust-speed', ['vehicle'], increase ? amount : -amount, originalText)
    }
    return resultError('missing-action', originalText)
  }

  if (/(档位|挂档)/.test(command)) {
    return resultError('missing-target', originalText)
  }

  return resultError('unsupported-command', originalText)
}

/** Parse a spoken or typed sentence into ordered commands without changing parseCommand. */
export function parseCommands(text) {
  const clauses = splitCommandClauses(text)
  const commands = []
  const errors = []
  let previousCommand = null
  let inheritedAction = null

  clauses.forEach((clauseText, position) => {
    let parsed = parseCommand(clauseText)

    if (parsed.error === 'missing-action' && inheritedAction !== null) {
      parsed = parseCommand(`${inheritedAction === 1 ? '打开' : '关闭'}${clauseText}`)
      if (!parsed.error) parsed.originalText = clauseText
    }

    if (parsed.error
      && previousCommand
      && BINARY_COMMAND_TYPES.includes(previousCommand.type)
      && PRONOUN_TARGET.test(clauseText)) {
      const value = parseBinaryAction(clauseText, clauseText)
      if (typeof value === 'number' && typeof previousCommand.value === 'number') {
        parsed = standardCommand(previousCommand.type, [...previousCommand.targets], value, clauseText)
      }
    }

    const entry = { ...parsed, clauseText, index: position + 1 }
    if (parsed.error) {
      errors.push(entry)
      return
    }

    commands.push(entry)
    previousCommand = parsed
    if (BINARY_COMMAND_TYPES.includes(parsed.type) && (parsed.value === 0 || parsed.value === 1)) {
      inheritedAction = parsed.value
    }
  })

  if (!clauses.length) {
    errors.push({ ...resultError('unsupported-command', String(text ?? '').trim()), clauseText: '', index: 1 })
  }

  return { commands, errors }
}
