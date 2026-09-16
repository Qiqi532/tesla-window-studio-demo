import { parseCommand } from './parseCommand.js'
import { describeCommand } from './vehicleController.js'

const WEATHER_LABELS = Object.freeze({ sunny: '晴天', cloudy: '阴天', rain: '雨天' })

const ERROR_MESSAGES = Object.freeze({
  'ambiguous-action': '指令里同时出现了打开和关闭，请只保留一个动作。',
  'missing-action': '请说明要打开还是关闭。',
  'missing-position': '请补充位置，例如“左前车门”或“前备箱”。',
  'ambiguous-target': '指令包含多个互相冲突的目标，请一次选择一个。',
  'missing-target': '请说明要操作哪一组灯光，例如“大灯”或“雾灯”。',
  'unavailable-light': '当前模型仅保留可见的大灯、雾灯和尾灯控制。',
  'driving-control-not-supported': '行驶控制仅支持页面按钮，请使用档位与速度面板。',
  'unsupported-command': '未理解这条指令。可控制车窗、车门、前后备箱、灯光或天气。',
})

export function createCommandDispatcher({ vehicle, environment }) {
  return {
    async execute(text) {
      const command = parseCommand(text)
      if (command.error) return ERROR_MESSAGES[command.error] ?? ERROR_MESSAGES['unsupported-command']

      if (command.type === 'set-weather') {
        try {
          await environment.setWeather(command.value)
          return `已切换到${WEATHER_LABELS[command.value]}道路。`
        } catch (error) {
          return `天气切换失败：${error?.message ?? '请稍后重试'}。`
        }
      }

      const result = vehicle.dispatch({
        type: command.type,
        targets: command.targets,
        value: command.value,
      })
      return result.message ?? describeCommand(result)
    },
  }
}
