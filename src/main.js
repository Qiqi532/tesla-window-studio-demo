import './style.css'
import { createStudio } from './scene.js'
import { loadVehicle } from './vehicle.js'
import { createWindowController, WINDOW_LABELS } from './windows.js'
import { createVoiceControl } from './voice.js'
import { parseCommand } from './parseCommand.js'

const byId = (id) => document.getElementById(id)
const feedbackElement = byId('feedback')
const feedback = (message) => { feedbackElement.textContent = message }
const cover = byId('loading-cover')
const progressBar = byId('loading-progress')
const studio = createStudio(byId('stage'))
byId('local-license').href = `${import.meta.env.BASE_URL}assets/TESLA-LICENSE.md`

function makeControls(controller) {
  const list = byId('window-list')
  for (const [id, label] of Object.entries(WINDOW_LABELS)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'window-row'
    button.dataset.window = id
    button.setAttribute('aria-pressed', 'false')
    button.innerHTML = `<span class="window-row-index">${id}</span><span class="window-row-name">${label}</span><span class="window-row-status">已关闭</span><span class="window-switch"><span></span></span>`
    button.addEventListener('click', () => {
      const open = !controller.getState()[id].target
      controller.setWindow(id, open)
      feedback(`${label}已${open ? '打开' : '关闭'}。`)
    })
    list.append(button)
  }

  controller.subscribe((state) => {
    const openCount = Object.values(state).filter(({ target }) => target === 1).length
    for (const [id, entry] of Object.entries(state)) {
      const button = list.querySelector(`[data-window="${id}"]`)
      button.classList.toggle('is-open', entry.target === 1)
      button.setAttribute('aria-pressed', String(entry.target === 1))
      button.querySelector('.window-row-status').textContent = entry.target === 1 ? '已打开' : '已关闭'
    }
    byId('window-summary').textContent = openCount === 0
      ? '全部车窗已关闭'
      : openCount === 4 ? '全部车窗已打开' : `${openCount} 扇车窗已打开`
  })
}

function executeCommand(text, controller) {
  const action = parseCommand(text)
  if (!action) {
    feedback(`未理解“${text}”。试试“打开车窗”或“关闭驾驶位车窗”。`)
    return
  }
  const changed = action.targets.length === 4
    ? controller.setAllWindows(action.open)
    : action.targets.reduce((didChange, id) => controller.setWindow(id, action.open) || didChange, false)
  const subject = action.targets.length === 4
    ? '全部车窗'
    : action.targets.map((id) => WINDOW_LABELS[id]).join('、')
  feedback(changed
    ? `已执行“${text}”：${subject}已${action.open ? '打开' : '关闭'}。`
    : `${subject}已经${action.open ? '打开' : '关闭'}。`)
}

async function start() {
  try {
    const vehicle = await loadVehicle((value) => {
      progressBar.style.width = `${Math.round(value * 100)}%`
      byId('loading-detail').textContent = `模型载入中 · ${Math.round(value * 100)}%`
    })
    studio.scene.add(vehicle.root)
    vehicle.root.updateMatrixWorld(true)
    const controller = createWindowController({
      scene: studio.scene,
      camera: studio.camera,
      canvas: studio.renderer.domElement,
      windows: vehicle.windows,
      feedback,
    })
    controller.update(0)
    studio.setFrameHandler((delta) => controller.update(delta))
    makeControls(controller)
    createVoiceControl({
      button: byId('mic-button'),
      label: byId('mic-label'),
      form: byId('command-form'),
      input: byId('command-input'),
      execute: (text) => executeCommand(text, controller),
      feedback,
    })
    cover.classList.add('is-hidden')
  } catch (error) {
    byId('loading-title').textContent = '车模加载失败'
    byId('loading-detail').textContent = error?.message || '请检查模型文件后刷新页面。'
    cover.classList.add('is-error')
    feedback('车模未能加载，控车功能暂不可用。')
  }
}

start()
