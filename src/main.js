import './style.css'
import * as THREE from 'three'
import { createStudio } from './scene.js'
import { loadVehicle } from './vehicle.js'
import { createWindowController } from './windows.js'
import { createVehicleController } from './vehicleController.js'
import { createVoiceControl } from './voice.js'
import { createCommandDispatcher } from './commandDispatcher.js'
import { createCameraRig } from './cameraRig.js'
import { createEnvironmentController } from './environment.js'
import { createEnvironmentUi, createVehicleUi } from './ui.js'

const byId = (id) => document.getElementById(id)
const feedbackElement = byId('feedback')
const feedback = (message) => { feedbackElement.textContent = message }
const cover = byId('loading-cover')
const progressBar = byId('loading-progress')
const studio = createStudio(byId('stage'))
byId('local-license').href = `${import.meta.env.BASE_URL}assets/TESLA-LICENSE.md`
byId('environment-license').href = `${import.meta.env.BASE_URL}assets/licenses/ASSET-LICENSES.md`

const cameraRig = createCameraRig({ camera: studio.camera, controls: studio.controls })
const environment = createEnvironmentController({
  scene: studio.scene,
  camera: studio.camera,
  renderer: studio.renderer,
  studioEnvironment: studio.studioEnvironment,
  baseUrl: import.meta.env.BASE_URL,
  setQualityScale: (scale) => studio.setQualityScale(scale),
  onLoadProgress: (value) => {
    const status = byId('environment-status')
    if (environment.getState().roadAssetsLoading) status.textContent = `道路资源加载中 · ${Math.round(value * 100)}%`
  },
})
const environmentUi = createEnvironmentUi({ environment, cameraRig, feedback })
let windowController = null
let vehicleController = null
let vehicleUi = null
let voiceControl = null

studio.setFrameHandler((delta) => {
  cameraRig.update(delta)
  environment.update(delta)
  if (!vehicleController) return
  vehicleController.update(delta)
  // The looped road and both axles share one visual speed.
  environment.setRoadSpeed(vehicleController.getState().roadSpeed)
})

/**
 * Development-only inspection hook. It reports the real node rotations, material
 * colours and part hit boxes, so the browser verification pass can assert on what is
 * actually rendered instead of only on the panel text.
 */
function installAuditHook(vehicle, controller) {
  if (!import.meta.env.DEV) return

  let trimColor = null
  vehicle.vehicle.traverse((node) => {
    if (trimColor || !node.isMesh) return
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    const trim = materials.find((material) => material?.name === 'movsteer_1.0.1')
    if (trim) trimColor = `#${trim.color.getHexString()}`
  })

  const round = (value) => Number(value.toFixed(4))
  const project = (object) => {
    const rect = studio.renderer.domElement.getBoundingClientRect()
    const point = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).project(studio.camera)
    return {
      x: Math.round(rect.left + ((point.x + 1) / 2) * rect.width),
      y: Math.round(rect.top + ((1 - point.y) / 2) * rect.height),
    }
  }

  globalThis.__vehicleAudit = () => {
    const state = controller.getState()
    return {
      control: {
        gear: state.gear,
        speed: round(state.speed),
        targetSpeed: state.targetSpeed,
        driving: state.driving,
        opened: state.opened,
        openParts: state.openParts,
        switches: state.switches,
        illumination: state.illumination,
        paint: state.paint,
        wheelStyle: state.wheelStyle,
        roadSpeed: round(state.roadSpeed),
        environmentRoadSpeed: round(environment.getRoadSpeed()),
        roadOffset: environment.getRenderInfo().roadOffset,
        roadOffsets: environment.getRenderInfo().roadOffsets,
      },
      windows: state.windows,
      doors: Object.fromEntries(Object.entries(vehicle.doors).map(([id, part]) => [id, round(part.node.rotation[part.axis])])),
      trunks: Object.fromEntries(Object.entries(vehicle.trunks).map(([id, part]) => [id, round(part.node.rotation[part.axis])])),
      wheels: Object.fromEntries(Object.entries(vehicle.axles).map(([id, axle]) => [id, round(axle.node.rotation.x)])),
      materials: {
        paint: `#${vehicle.materials.paint[0].color.getHexString()}`,
        paintCount: vehicle.materials.paint.length,
        rim: `#${vehicle.materials.rims[0].color.getHexString()}`,
        rimCount: vehicle.materials.rims.length,
        trimColor,
        headlightEmissive: round(vehicle.materials.lights.headlight[0].emissiveIntensity),
        fogEmissive: round(vehicle.materials.lights.fog[0].emissiveIntensity),
        tailEmissive: round(vehicle.materials.lights.tail[0].emissiveIntensity),
        brakeEmissive: round(vehicle.materials.lights.brake[0].emissiveIntensity),
        reverseEmissive: round(vehicle.materials.lights.reverse[0].emissiveIntensity),
      },
      loadingHidden: cover.classList.contains('is-hidden'),
    }
  }

  // Projection walks the model, so it is kept out of the polling path.
  globalThis.__vehiclePoints = () => ({
    partPoints: Object.fromEntries(controller.getHitTargets().map((target) => [
      `${target.userData.partGroup}:${target.userData.partId}`,
      project(target),
    ])),
    windowPoints: Object.fromEntries(Object.entries(vehicle.windows).map(([id, node]) => [id, project(node)])),
  })

  // Lets the browser pass confirm that a screen position really resolves to the part it
  // is about to click, instead of assuming the projected bounding-box centre is free.
  globalThis.__vehiclePickAt = (clientX, clientY) => controller.pickAt(clientX, clientY)
}

async function start() {
  try {
    const vehicle = await loadVehicle((value) => {
      progressBar.style.width = `${Math.round(value * 100)}%`
      byId('loading-detail').textContent = `模型载入中 · ${Math.round(value * 100)}%`
    })
    studio.scene.add(vehicle.root)
    vehicle.root.updateMatrixWorld(true)

    // The window controller owns the glass slide motion and registers the window click
    // areas. The vehicle controller arbitrates all picking across windows, doors and lids.
    windowController = createWindowController({
      scene: studio.scene,
      windows: vehicle.windows,
    })
    windowController.update(0)

    vehicleController = createVehicleController({
      vehicle,
      scene: studio.scene,
      camera: studio.camera,
      canvas: studio.renderer.domElement,
      windowController,
      feedback,
    })
    vehicleController.update(0)

    vehicleUi = createVehicleUi({ vehicle: vehicleController, feedback })
    const commandDispatcher = createCommandDispatcher({
      vehicle: vehicleController,
      environment,
    })
    feedback('车辆控制已就绪：点击车身部件，或使用右侧面板、语音与文字指令。')
    voiceControl = createVoiceControl({
      button: byId('mic-button'),
      label: byId('mic-label'),
      form: byId('command-form'),
      input: byId('command-input'),
      speechToggle: byId('speech-output-toggle'),
      modeSelect: byId('voice-mode'),
      modelButton: byId('local-model-enable'),
      modelClearButton: byId('local-model-clear'),
      engineStatus: byId('voice-engine-status'),
      execute: (text) => commandDispatcher.execute(text),
      feedback,
    })
    cover.classList.add('is-hidden')
    installAuditHook(vehicle, vehicleController)
  } catch (error) {
    byId('loading-title').textContent = '车模加载失败'
    byId('loading-detail').textContent = error?.message || '请检查模型文件后刷新页面。'
    cover.classList.add('is-error')
    feedback('车模未能加载，控车功能暂不可用。')
  }
}

start()

window.addEventListener('beforeunload', () => {
  voiceControl?.dispose()
  vehicleUi?.dispose()
  vehicleController?.dispose()
  windowController?.dispose()
  environmentUi.dispose()
  cameraRig.dispose()
  environment.dispose()
  studio.dispose()
}, { once: true })
