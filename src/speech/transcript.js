import { parseCommand, parseCommands } from '../parseCommand.js'

const MIN_CONFIDENCE = 0.35
const LEADING_FILLERS = /^(?:请帮我|麻烦你|麻烦|请|帮我|我要|我想要)+/
const PUNCTUATION = /[\s，。！？、,.!?；;：:]/g
const KNOWN_REPLACEMENTS = Object.freeze([
  [/前(?:被|背)箱/g, '前备箱'],
  [/后(?:被|背)箱/g, '后备箱'],
  [/[前后]备厢/g, (match) => `${match[0]}备箱`],
  [/雾等/g, '雾灯'],
  [/尾等/g, '尾灯'],
  [/大等/g, '大灯'],
  [/车门儿/g, '车门'],
  [/([PDR])挡/gi, (_, gear) => `${gear.toUpperCase()}档`],
  [/车(?:其|奇)/g, '车漆'],
  [/轮(?:谷|骨)/g, '轮毂'],
])

export function normalizeTranscript(text) {
  let normalized = String(text ?? '').normalize('NFKC').trim().replace(PUNCTUATION, '')
  normalized = normalized.replace(LEADING_FILLERS, '')
  for (const [pattern, replacement] of KNOWN_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement)
  }
  return normalized
}

function commandKey(command) {
  if (!command || command.error) return null
  return JSON.stringify({
    type: command.type,
    targets: command.targets,
    value: command.value,
    ...(command.speed === undefined ? {} : { speed: command.speed }),
  })
}

function commandSequenceKey(text) {
  const parsed = parseCommands(text)
  if (!parsed.commands.length) return null
  return JSON.stringify({
    commands: parsed.commands.map((command) => ({
      index: command.index,
      type: command.type,
      targets: command.targets,
      value: command.value,
      ...(command.speed === undefined ? {} : { speed: command.speed }),
    })),
    errors: parsed.errors.map((error) => ({ index: error.index, error: error.error })),
  })
}

export function selectTranscriptCandidate(candidates, {
  parser = parseCommand,
  minConfidence = MIN_CONFIDENCE,
} = {}) {
  const candidatesByText = new Map()

  for (const candidate of candidates ?? []) {
    const text = normalizeTranscript(candidate?.text)
    const confidence = Number(candidate?.confidence)
    const hasKnownConfidence = Number.isFinite(confidence) && confidence > 0
    if (!text || (hasKnownConfidence && confidence < minConfidence)) continue
    const normalizedCandidate = { text, confidence: hasKnownConfidence ? confidence : 0 }
    const previous = candidatesByText.get(text)
    if (!previous || normalizedCandidate.confidence > previous.confidence) {
      candidatesByText.set(text, normalizedCandidate)
    }
  }

  const normalized = [...candidatesByText.values()]
  if (!normalized.length) return { error: 'low-confidence' }
  normalized.sort((left, right) => right.confidence - left.confidence)

  const validCommands = new Map()
  for (const candidate of normalized) {
    const command = parser(candidate.text)
    const key = commandSequenceKey(candidate.text) ?? commandKey(command)
    if (!key) continue
    const previous = validCommands.get(key)
    if (!previous || candidate.confidence > previous.confidence) {
      validCommands.set(key, { ...candidate, command })
    }
  }

  if (validCommands.size > 1) {
    return {
      error: 'ambiguous-transcript',
      alternatives: [...validCommands.values()].map(({ text }) => text),
    }
  }
  if (validCommands.size === 1) return [...validCommands.values()][0]

  return { ...normalized[0], command: parser(normalized[0].text) }
}
