import * as THREE from 'three'

export const CAMERA_PRESETS = Object.freeze({
  hero: { label: '主视觉', position: [6.3, 2.8, 7.8], target: [0, 0.55, 0], fov: 34 },
  front: { label: '正面', position: [0.15, 1.65, 10.6], target: [0, 0.55, 0], fov: 32 },
  side: { label: '侧面', position: [10.2, 1.7, 0.25], target: [0, 0.55, 0], fov: 31 },
  rear: { label: '后方', position: [-0.2, 1.8, -10.4], target: [0, 0.55, 0], fov: 32 },
  top: { label: '俯视', position: [4.4, 10.8, 5.6], target: [0, 0.15, 0], fov: 36 },
  detail: { label: '细节', position: [-4.1, 1.45, 4.8], target: [-0.85, 0.78, 0.45], fov: 27 },
})

const TRANSITION_SECONDS = 0.6

function smoothstep(value) {
  return value * value * (3 - 2 * value)
}

export function createCameraRig({ camera, controls }) {
  let transition = null
  let preset = 'hero'
  let autoOrbit = false
  const subscribers = new Set()
  const getState = () => ({ preset, autoOrbit, transitioning: Boolean(transition) })
  const notify = () => subscribers.forEach((listener) => listener(getState()))

  const stopTransition = () => {
    if (!transition) return
    transition = null
    notify()
  }
  controls.addEventListener('start', stopTransition)
  controls.autoRotateSpeed = 0.42

  return {
    getState,
    subscribe(listener) {
      subscribers.add(listener)
      listener(getState())
      return () => subscribers.delete(listener)
    },
    selectPreset(id) {
      const next = CAMERA_PRESETS[id]
      if (!next) throw new Error(`未知摄影机预设：${id}`)
      preset = id
      transition = {
        elapsed: 0,
        startPosition: camera.position.clone(),
        startTarget: controls.target.clone(),
        startFov: camera.fov,
        endPosition: new THREE.Vector3(...next.position),
        endTarget: new THREE.Vector3(...next.target),
        endFov: next.fov,
      }
      notify()
    },
    setAutoOrbit(enabled) {
      autoOrbit = Boolean(enabled)
      controls.autoRotate = autoOrbit
      notify()
    },
    update(delta) {
      if (!transition) return
      transition.elapsed += delta
      const linear = Math.min(transition.elapsed / TRANSITION_SECONDS, 1)
      const eased = smoothstep(linear)
      camera.position.lerpVectors(transition.startPosition, transition.endPosition, eased)
      controls.target.lerpVectors(transition.startTarget, transition.endTarget, eased)
      camera.fov = THREE.MathUtils.lerp(transition.startFov, transition.endFov, eased)
      camera.updateProjectionMatrix()
      if (linear === 1) {
        transition = null
        notify()
      }
    },
    dispose() {
      controls.removeEventListener('start', stopTransition)
      controls.autoRotate = false
      subscribers.clear()
    },
  }
}
