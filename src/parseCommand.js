const WINDOW_TERMS = /(车窗|窗户|侧窗|车玻璃|左前窗|右前窗|左后窗|右后窗)/
const OPEN_TERMS = /(打开|开启|开开|降下|降一降|放下|摇下)/
const CLOSE_TERMS = /(关闭|关上|关掉|关起来|升起|升上|摇上)/

export function parseCommand(text) {
  const command = String(text ?? '').replace(/[\s，。！？,.!?]/g, '')
  if (!WINDOW_TERMS.test(command)) return null
  const isOpen = OPEN_TERMS.test(command)
  const isClose = CLOSE_TERMS.test(command)
  if (isOpen === isClose) return null

  const targets = []
  if (/(驾驶位|司机位|主驾|左前|前左)/.test(command)) targets.push('FL')
  if (/(副驾驶|副驾|右前|前右)/.test(command)) targets.push('FR')
  if (/(左后|后左)/.test(command)) targets.push('RL')
  if (/(右后|后右)/.test(command)) targets.push('RR')
  if (/(后排|后座)/.test(command)) targets.push('RL', 'RR')
  if (/(前排)/.test(command)) targets.push('FL', 'FR')

  return {
    targets: targets.length ? [...new Set(targets)] : ['FL', 'FR', 'RL', 'RR'],
    open: isOpen,
  }
}
