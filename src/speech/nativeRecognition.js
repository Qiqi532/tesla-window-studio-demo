export class SpeechRecognitionError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined)
    this.name = 'SpeechRecognitionError'
    this.code = code
  }
}

export function classifyRecognitionError(error, { processLocally = false } = {}) {
  const codes = {
    'not-allowed': 'permission-denied',
    'audio-capture': 'device-not-found',
    'no-speech': 'no-speech',
    network: 'native-service-unavailable',
    'service-not-allowed': 'native-service-unavailable',
    'language-not-supported': processLocally ? 'language-pack-unavailable' : 'native-service-unavailable',
    aborted: 'aborted',
  }
  return codes[error] ?? 'unsupported-browser'
}

export function classifyMediaError(error) {
  const name = error?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission-denied'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'device-not-found'
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'device-busy'
  return 'unsupported-browser'
}

function settleWithin(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve(undefined), timeoutMs)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

export async function resolveNativeStrategy(Recognition, {
  lang = 'zh-CN',
  probeTimeoutMs = 1500,
  installTimeoutMs = 30000,
} = {}) {
  if (typeof Recognition?.available !== 'function') {
    return { engine: 'native-service', processLocally: false }
  }

  try {
    const options = { langs: [lang], processLocally: true }
    const availability = await settleWithin(Recognition.available(options), probeTimeoutMs)
    if (availability === 'available') {
      return { engine: 'native-local', processLocally: true }
    }
    if ((availability === 'downloadable' || availability === 'downloading')
      && typeof Recognition.install === 'function') {
      const installed = await settleWithin(Recognition.install(options), installTimeoutMs)
      if (installed) return { engine: 'native-local', processLocally: true }
    }
  } catch {
    // Experimental language-pack APIs must never block the established service path.
  }
  return { engine: 'native-service', processLocally: false }
}

export function createNativeRecognizer({
  Recognition,
  lang = 'zh-CN',
  timeoutMs = 10000,
  onState = () => {},
} = {}) {
  let activeRecognition = null
  let activeReject = null

  return {
    async recognize({ preferDevice = true } = {}) {
      if (!Recognition) throw new SpeechRecognitionError('unsupported-browser')
      if (activeRecognition) throw new SpeechRecognitionError('device-busy')

      onState('preparing-native')
      const strategy = preferDevice
        ? await resolveNativeStrategy(Recognition, { lang })
        : { engine: 'native-service', processLocally: false }
      const recognition = new Recognition()
      activeRecognition = recognition
      recognition.lang = lang
      recognition.continuous = false
      recognition.interimResults = false
      recognition.maxAlternatives = 3
      if (strategy.processLocally) recognition.processLocally = true

      return new Promise((resolve, reject) => {
        const candidates = []
        let settled = false
        let timeoutId = null

        const finish = (callback, value) => {
          if (settled) return
          settled = true
          if (timeoutId) clearTimeout(timeoutId)
          activeRecognition = null
          activeReject = null
          callback(value)
        }

        activeReject = (error) => finish(reject, error)
        recognition.onstart = () => onState('listening', { engine: strategy.engine })
        recognition.onresult = (event) => {
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index]
            if (!result.isFinal) continue
            const alternativeCount = Number.isInteger(result.length) ? result.length : 1
            for (let alternativeIndex = 0; alternativeIndex < alternativeCount; alternativeIndex += 1) {
              const alternative = result[alternativeIndex]
              candidates.push({
                text: String(alternative?.transcript ?? '').trim(),
                confidence: Number(alternative?.confidence ?? 0),
              })
            }
          }
        }
        recognition.onerror = (event) => {
          const code = classifyRecognitionError(event.error, { processLocally: strategy.processLocally })
          finish(reject, new SpeechRecognitionError(code, event))
        }
        recognition.onend = () => {
          if (candidates.length) {
            finish(resolve, { candidates, engine: strategy.engine })
          } else {
            finish(reject, new SpeechRecognitionError('no-speech'))
          }
        }

        timeoutId = setTimeout(() => {
          recognition.abort()
          finish(reject, new SpeechRecognitionError('recognition-timeout'))
        }, timeoutMs)

        try {
          recognition.start()
        } catch (error) {
          finish(reject, new SpeechRecognitionError(classifyMediaError(error), error))
        }
      })
    },

    abort() {
      if (!activeRecognition) return
      const recognition = activeRecognition
      activeRecognition = null
      recognition.abort()
      activeReject?.(new SpeechRecognitionError('aborted'))
      activeReject = null
    },
  }
}
