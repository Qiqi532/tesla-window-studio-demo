import { CAMERA_PRESETS } from './cameraRig.js'
import {
  DOOR_PARTS,
  GEARS,
  GEAR_SPEED_LIMITS,
  LIGHT_LABELS,
  MANUAL_LIGHT_IDS,
  PAINT_PRESETS,
  TRUNK_PARTS,
  WHEEL_PRESETS,
  WINDOW_IDS,
  WINDOW_LABELS,
} from './vehicleParts.js'

const bySelectorAll = (selector) => [...document.querySelectorAll(selector)]

export function createEnvironmentUi({ environment, cameraRig, feedback }) {
  const toolbar = document.getElementById('experience-toolbar')
  const status = document.getElementById('environment-status')
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
  listen(orbitButton, 'click', () => {
    const enabled = !cameraRig.getState().autoOrbit
    cameraRig.setAutoOrbit(enabled)
    feedback(`自动环绕已${enabled ? '开启' : '关闭'}。`)
  })

  const unsubscribeEnvironment = environment.subscribe((state) => {
    for (const button of bySelectorAll('[data-scene]')) button.classList.toggle('is-active', button.dataset.scene === state.mode)
    for (const button of bySelectorAll('[data-weather]')) button.classList.toggle('is-active', button.dataset.weather === state.weather && state.mode === 'road')
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

/* ------------------------------------------------------- vehicle controls --- */

const HINGE_ENTRIES = [
  ...Object.entries(DOOR_PARTS).map(([id, part]) => ({ id, type: 'set-door', label: part.label })),
  ...Object.entries(TRUNK_PARTS).map(([id, part]) => ({ id, type: 'set-trunk', label: part.label })),
]

/**
 * Drives the whole vehicle panel. Every control goes through the same
 * `controller.dispatch()` entry point the model clicks and the voice layer use, so the
 * panel can never drift from the underlying behaviour.
 */
export function createVehicleUi({ vehicle: controller, feedback }) {
  const windowList = document.getElementById('window-list')
  const hingeList = document.getElementById('hinge-list')
  const lightList = document.getElementById('light-list')
  const gearRow = document.getElementById('gear-row')
  const speedRange = document.getElementById('speed-range')
  const speedValue = document.getElementById('speed-value')
  const interlockNote = document.getElementById('interlock-note')
  const cleanups = []

  const listen = (element, event, handler) => {
    element.addEventListener(event, handler)
    cleanups.push(() => element.removeEventListener(event, handler))
  }
  const send = (command) => {
    const result = controller.dispatch(command)
    feedback(result.message)
    return result
  }

  /* --- windows: full-width rows keep the original switch look --- */
  for (const id of WINDOW_IDS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'window-row'
    button.dataset.window = id
    button.setAttribute('aria-pressed', 'false')
    button.innerHTML = `<span class="window-row-index">${id}</span><span class="window-row-name">${WINDOW_LABELS[id]}</span><span class="window-row-status">已关闭</span><span class="window-switch"><span></span></span>`
    listen(button, 'click', () => {
      const open = controller.getState().windows[id].target !== 1
      send({ type: 'set-window', targets: [id], value: open ? 1 : 0 })
    })
    windowList.append(button)
  }

  /* --- doors and lids --- */
  for (const entry of HINGE_ENTRIES) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'chip'
    button.dataset.hinge = entry.id
    button.setAttribute('aria-pressed', 'false')
    button.innerHTML = `<span class="chip-dot"></span><span>${entry.label}</span>`
    listen(button, 'click', () => {
      const snapshot = controller.getState()
      const group = entry.type === 'set-door' ? snapshot.doors : snapshot.trunks
      const open = group[entry.id].target !== 1
      send({ type: entry.type, targets: [entry.id], value: open ? 1 : 0 })
    })
    hingeList.append(button)
  }

  /* --- lights --- */
  const lightIds = [...MANUAL_LIGHT_IDS]
  for (const id of lightIds) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'chip'
    button.dataset.light = id
    button.setAttribute('aria-pressed', 'false')
    button.innerHTML = `<span class="chip-dot"></span><span>${LIGHT_LABELS[id]}</span>`
    listen(button, 'click', () => {
      const on = controller.getState().switches[id] !== 1
      send({ type: 'set-light', targets: [id], value: on ? 1 : 0 })
    })
    lightList.append(button)
  }

  /* --- gear --- */
  for (const gear of GEARS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'gear-button'
    button.dataset.gear = gear
    button.textContent = gear
    button.setAttribute('aria-pressed', 'false')
    listen(button, 'click', () => send({ type: 'set-gear', value: gear }))
    gearRow.append(button)
  }

  /* --- speed --- */
  const syncSpeedRange = (state) => {
    const limit = GEAR_SPEED_LIMITS[state.gear]
    speedRange.max = String(limit)
    speedRange.disabled = state.gear === 'P'
    if (state.gear === 'P') {
      speedRange.value = '0'
    } else if (Number(speedRange.value) !== state.targetSpeed) {
      speedRange.value = String(state.targetSpeed)
    }
    speedValue.textContent = `${Math.round(state.speed)} km/h`
  }
  listen(speedRange, 'input', () => {
    send({ type: 'set-speed', value: Number(speedRange.value) })
  })

  /* --- paint and rims --- */
  const buildSwatches = (container, presets, attribute, onPick) => {
    for (const [id, preset] of Object.entries(presets)) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'swatch'
      button.dataset[attribute] = id
      button.setAttribute('aria-pressed', 'false')
      button.innerHTML = `<span class="swatch-color" style="background:${preset.color}"></span><span>${preset.label}</span>`
      listen(button, 'click', () => send(onPick(id)))
      container.append(button)
    }
  }
  buildSwatches(document.getElementById('paint-list'), PAINT_PRESETS, 'paint', (id) => ({ type: 'set-paint', value: id }))
  buildSwatches(document.getElementById('wheel-list'), WHEEL_PRESETS, 'wheel', (id) => ({ type: 'set-wheel-style', value: id }))

  /* --- state rendering --- */
  const render = (state) => {
    const openWindows = WINDOW_IDS.filter((id) => state.windows?.[id]?.target === 1).length
    for (const id of WINDOW_IDS) {
      const button = windowList.querySelector(`[data-window="${id}"]`)
      const open = state.windows?.[id]?.target === 1
      button.classList.toggle('is-open', open)
      button.setAttribute('aria-pressed', String(open))
      button.querySelector('.window-row-status').textContent = open ? '已打开' : '已关闭'
    }
    document.getElementById('window-summary').textContent = openWindows === 0
      ? '全部车窗已关闭'
      : openWindows === WINDOW_IDS.length ? '全部车窗已打开' : `${openWindows} 扇车窗已打开`

    for (const entry of HINGE_ENTRIES) {
      const button = hingeList.querySelector(`[data-hinge="${entry.id}"]`)
      const group = entry.type === 'set-door' ? state.doors : state.trunks
      const open = group[entry.id].target === 1
      // Kept clickable while driving: the controller rejects the command and the panel
      // explains why, which is more useful than a silently dead button.
      const locked = state.driving && !open
      button.classList.toggle('is-on', open)
      button.classList.toggle('is-locked', locked)
      button.setAttribute('aria-pressed', String(open))
      button.setAttribute('aria-disabled', String(locked))
      button.title = locked ? '行驶中车门与备箱已锁定，请先切回 P 档' : ''
    }
    const openHinges = HINGE_ENTRIES.filter((entry) => {
      const group = entry.type === 'set-door' ? state.doors : state.trunks
      return group[entry.id].target === 1
    })
    document.getElementById('hinge-summary').textContent = openHinges.length
      ? `${openHinges.length} 处已打开`
      : '全部关闭'

    for (const id of lightIds) {
      const button = lightList.querySelector(`[data-light="${id}"]`)
      const on = state.switches[id] === 1
      button.classList.toggle('is-on', on)
      button.setAttribute('aria-pressed', String(on))
    }
    const litNow = [
      ...Object.entries(state.switches),
      ...Object.entries(state.illumination).filter(([id]) => id === 'brake' || id === 'reverse'),
    ]
      .filter(([, level]) => level === 1)
      .map(([id]) => LIGHT_LABELS[id])
    document.getElementById('light-summary').textContent = litNow.length ? `${litNow.join('、')} 亮起` : '灯光已关闭'

    for (const gear of GEARS) {
      const button = gearRow.querySelector(`[data-gear="${gear}"]`)
      const active = state.gear === gear
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-pressed', String(active))
    }
    document.getElementById('gear-summary').textContent = state.gear === 'P'
      ? 'P 档 · 静止'
      : `${state.gear} 档 · ${Math.round(state.speed)} km/h`
    syncSpeedRange(state)

    interlockNote.classList.toggle('is-ok', !state.driving && openHinges.length === 0)
    interlockNote.textContent = openHinges.length
      ? `${openHinges.map((entry) => entry.label).join('、')}未关闭，无法进入 D/R 档。`
      : state.driving
        ? `${state.gear} 档行驶中：车门与备箱已锁定，车窗与灯光仍可用。`
        : '全部部件已关闭，可以挂入 D 或 R 档。'

    for (const button of bySelectorAll('[data-paint]')) {
      const active = button.dataset.paint === state.paint
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-pressed', String(active))
    }
    document.getElementById('paint-summary').textContent = PAINT_PRESETS[state.paint].label
    for (const button of bySelectorAll('[data-wheel]')) {
      const active = button.dataset.wheel === state.wheelStyle
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-pressed', String(active))
    }
    document.getElementById('wheel-summary').textContent = WHEEL_PRESETS[state.wheelStyle].label
  }

  const unsubscribe = controller.subscribe(render)

  return {
    dispose() {
      cleanups.forEach((cleanup) => cleanup())
      unsubscribe()
    },
  }
}
