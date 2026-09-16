import { CAMERA_PRESETS } from './cameraRig.js'

const bySelectorAll = (selector) => [...document.querySelectorAll(selector)]

export function createEnvironmentUi({ environment, cameraRig, feedback }) {
  const toolbar = document.getElementById('experience-toolbar')
  const status = document.getElementById('environment-status')
  const equipmentButton = document.getElementById('equipment-toggle')
  const orbitButton = document.getElementById('orbit-toggle')
  const cleanups = []

  const listen = (element, event, handler) => {
    element.addEventListener(event, handler)
    cleanups.push(() => element.removeEventListener(event, handler))
  }
  const run = async (action) => {
    toolbar.classList.add('is-loading')
    status.textContent = '正在读取本地环境资源…'
    try {
      await action()
    } catch (error) {
      status.textContent = '环境切换失败'
      feedback(error?.message || '环境切换失败，请重试。')
    } finally {
      toolbar.classList.remove('is-loading')
    }
  }

  for (const button of bySelectorAll('[data-scene]')) {
    listen(button, 'click', () => run(async () => {
      await environment.setMode(button.dataset.scene)
      feedback(`已切换到${button.dataset.scene === 'studio' ? '影棚' : '循环道路'}场景。`)
    }))
  }
  for (const button of bySelectorAll('[data-weather]')) {
    listen(button, 'click', () => run(async () => {
      await environment.setWeather(button.dataset.weather)
      const labels = { sunny: '晴天', cloudy: '阴天', rain: '雨天' }
      feedback(`已切换到${labels[button.dataset.weather]}道路。`)
    }))
  }
  for (const button of bySelectorAll('[data-camera]')) {
    listen(button, 'click', () => {
      cameraRig.selectPreset(button.dataset.camera)
      feedback(`镜头正在转向${CAMERA_PRESETS[button.dataset.camera].label}预设。`)
    })
  }
  listen(equipmentButton, 'click', () => {
    const visible = !environment.getState().equipmentVisible
    environment.setEquipmentVisible(visible)
    feedback(`幕后灯光设备已${visible ? '显示' : '隐藏'}，布光效果保持不变。`)
  })
  listen(orbitButton, 'click', () => {
    const enabled = !cameraRig.getState().autoOrbit
    cameraRig.setAutoOrbit(enabled)
    feedback(`自动环绕已${enabled ? '开启' : '关闭'}。`)
  })

  const unsubscribeEnvironment = environment.subscribe((state) => {
    for (const button of bySelectorAll('[data-scene]')) button.classList.toggle('is-active', button.dataset.scene === state.mode)
    for (const button of bySelectorAll('[data-weather]')) button.classList.toggle('is-active', button.dataset.weather === state.weather && state.mode === 'road')
    equipmentButton.classList.toggle('is-active', state.equipmentVisible)
    equipmentButton.setAttribute('aria-pressed', String(state.equipmentVisible))
    status.textContent = state.roadAssetsLoading
      ? '道路资源加载中…'
      : state.mode === 'studio'
        ? '影棚 · 本地反射环境'
        : `道路 · ${{ sunny: '晴天', cloudy: '阴天', rain: '雨天' }[state.weather]}`
  })
  const unsubscribeCamera = cameraRig.subscribe((state) => {
    for (const button of bySelectorAll('[data-camera]')) button.classList.toggle('is-active', button.dataset.camera === state.preset)
    orbitButton.classList.toggle('is-active', state.autoOrbit)
    orbitButton.setAttribute('aria-pressed', String(state.autoOrbit))
  })

  return {
    dispose() {
      cleanups.forEach((cleanup) => cleanup())
      unsubscribeEnvironment()
      unsubscribeCamera()
    },
  }
}
