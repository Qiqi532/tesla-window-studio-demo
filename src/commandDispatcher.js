import { parseCommands } from './parseCommand.js'
import { describeCommand } from './vehicleController.js'
import { SEASON_LABELS, WEATHER_LABELS } from './environment.js'

const ERROR_MESSAGES = Object.freeze({
  'ambiguous-action': '指令里同时出现了打开和关闭，请只保留一个动作。',
  'missing-action': '请说明要打开还是关闭。',
  'missing-position': '请补充位置，例如“左前车门”或“前备箱”。',
  'ambiguous-target': '指令包含多个互相冲突的目标，请一次选择一个。',
  'missing-target': '请说明要操作哪一组灯光，例如“大灯”或“雾灯”。',
  'unavailable-light': '当前模型仅保留可见的大灯、雾灯和尾灯控制。',
  'unsupported-command': '未理解这条指令。可控制车辆部件、灯光、天气、外观、档位与速度。',
})

function errorMessage(entry) {
  if (entry.error !== 'missing-target') {
    return ERROR_MESSAGES[entry.error] ?? ERROR_MESSAGES['unsupported-command']
  }
  const text = String(entry.originalText ?? entry.clauseText ?? '')
  if (/(车漆|颜色|喷成)/.test(text)) return '请说明车漆颜色，例如“曜石黑”或“午夜蓝”。'
  if (/(轮毂|轮圈|车轮样式)/.test(text)) return '请说明轮毂样式，例如“涡流”或“碳黑”。'
  if (/(速度|车速|加速|减速|公里|码)/.test(text)) return '请说明目标速度，例如“速度调到五十”。'
  if (/(档位|挂档)/.test(text)) return '请说明档位，例如“挂 D 档”或“停车”。'
  return ERROR_MESSAGES['missing-target']
}

function commandSucceeded(result) {
  return result?.ok !== false
}

function commandFeedback(result) {
  return result?.message ?? describeCommand(result)
}

function mergeFeedback(parts) {
  const messages = parts.map((part) => String(part ?? '').trim()).filter(Boolean)
  if (messages.length <= 1) return messages[0] ?? ERROR_MESSAGES['unsupported-command']
  return `${messages.map((message) => message.replace(/[。！？]+$/g, '')).join('；')}。`
}

export function createCommandDispatcher({ vehicle, environment }) {
  return {
    async execute(text) {
      const parsed = parseCommands(text)
      const entries = [
        ...parsed.commands.map((command) => ({ ...command, kind: 'command' })),
        ...parsed.errors.map((error) => ({ ...error, kind: 'error' })),
      ].sort((left, right) => left.index - right.index)
      const feedback = []

      for (const entry of entries) {
        if (entry.kind === 'error') {
          feedback.push(errorMessage(entry))
          continue
        }

        if (entry.type === 'set-weather') {
          try {
            await environment.setWeather(entry.value)
            feedback.push(`已切换到${WEATHER_LABELS[entry.value]}道路。`)
          } catch (error) {
            feedback.push(`天气切换失败：${error?.message ?? '请稍后重试'}。`)
          }
          continue
        }

        if (entry.type === 'set-season') {
          try {
            await environment.setSeason(entry.value)
            feedback.push(`已切换到${SEASON_LABELS[entry.value]}道路。`)
          } catch (error) {
            feedback.push(`季节切换失败：${error?.message ?? '请稍后重试'}。`)
          }
          continue
        }

        const dispatchVehicle = (command) => {
          const result = vehicle.dispatch(command)
          feedback.push(commandFeedback(result))
          return result
        }
        const ensureForwardGear = () => {
          const state = vehicle.getState?.()
          if (!state || state.gear !== 'P') return true
          return commandSucceeded(dispatchVehicle({
            type: 'set-gear', targets: ['vehicle'], value: 'D',
          }))
        }

        if (entry.type === 'set-speed' || entry.type === 'adjust-speed') {
          if (!ensureForwardGear()) continue
          const state = vehicle.getState?.() ?? {}
          const currentSpeed = Number(state.targetSpeed ?? state.speed ?? 0)
          const targetSpeed = entry.type === 'adjust-speed'
            ? Math.max(0, currentSpeed + Number(entry.value))
            : entry.value
          dispatchVehicle({ type: 'set-speed', targets: entry.targets, value: targetSpeed })
          continue
        }

        if (entry.type === 'set-gear') {
          const result = dispatchVehicle({
            type: entry.type,
            targets: entry.targets,
            value: entry.value,
          })
          if (commandSucceeded(result) && Number.isFinite(entry.speed)) {
            dispatchVehicle({ type: 'set-speed', targets: entry.targets, value: entry.speed })
          }
          continue
        }

        dispatchVehicle({
          type: entry.type,
          targets: entry.targets,
          value: entry.value,
        })
      }

      return mergeFeedback(feedback)
    },
  }
}
