import * as THREE from 'three'

export const RAIN_PARTICLE_BUDGETS = Object.freeze({ high: 1400, medium: 800, low: 360 })
const TIER_ORDER = ['low', 'medium', 'high']

export function getInitialPerformanceTier({ reducedMotion = false, deviceMemory = 8, hardwareConcurrency = 8 } = {}) {
  if (reducedMotion || deviceMemory <= 2 || hardwareConcurrency <= 4) return 'low'
  if (deviceMemory <= 4 || hardwareConcurrency <= 8) return 'medium'
  return 'high'
}

export function createPerformanceMonitor(initialTier = 'high', { sampleSeconds = 2, minimumFps = 45 } = {}) {
  let tier = TIER_ORDER.includes(initialTier) ? initialTier : 'medium'
  let elapsed = 0
  let frames = 0
  let slowWindows = 0

  return {
    getTier: () => tier,
    recordFrame(delta) {
      elapsed += Math.min(Math.max(delta, 0), 0.25)
      frames += 1
      if (elapsed + Number.EPSILON < sampleSeconds) return false
      const fps = frames / elapsed
      elapsed = 0
      frames = 0
      slowWindows = fps < minimumFps ? slowWindows + 1 : 0
      if (slowWindows < 2 || tier === 'low') return false
      tier = TIER_ORDER[TIER_ORDER.indexOf(tier) - 1]
      slowWindows = 0
      return true
    },
  }
}

function getCapabilities() {
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  return {
    reducedMotion,
    deviceMemory: globalThis.navigator?.deviceMemory ?? 8,
    hardwareConcurrency: globalThis.navigator?.hardwareConcurrency ?? 8,
  }
}

function createRain(scene) {
  const maxCount = RAIN_PARTICLE_BUDGETS.high
  const positions = new Float32Array(maxCount * 3)
  const speeds = new Float32Array(maxCount)
  for (let index = 0; index < maxCount; index += 1) {
    const offset = index * 3
    positions[offset] = (Math.random() - 0.5) * 24
    positions[offset + 1] = Math.random() * 15 + 1
    positions[offset + 2] = (Math.random() - 0.5) * 28
    speeds[index] = 13 + Math.random() * 9
  }
  const geometry = new THREE.BufferGeometry()
  const attribute = new THREE.BufferAttribute(positions, 3)
  attribute.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', attribute)
  const material = new THREE.PointsMaterial({
    color: '#c8dded',
    size: 0.055,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.visible = false
  scene.add(points)

  return {
    points,
    setBudget(count) { geometry.setDrawRange(0, Math.min(count, maxCount)) },
    update(delta, camera) {
      points.position.set(camera.position.x, 0, camera.position.z)
      for (let index = 0; index < maxCount; index += 1) {
        const y = index * 3 + 1
        positions[y] -= speeds[index] * delta
        if (positions[y] < -0.5) positions[y] = 15 + Math.random() * 3
      }
      attribute.needsUpdate = true
    },
    dispose() {
      scene.remove(points)
      geometry.dispose()
      material.dispose()
    },
  }
}

export function createWeatherController({ scene, camera, onTierChange = () => {} }) {
  const initialTier = getInitialPerformanceTier(getCapabilities())
  const monitor = createPerformanceMonitor(initialTier)
  let weather = 'sunny'
  let roadActive = false
  let rain = null

  const syncRain = () => {
    const shouldShow = roadActive && weather === 'rain'
    if (shouldShow && !rain) rain = createRain(scene)
    if (!rain) return
    rain.points.visible = shouldShow
    rain.setBudget(RAIN_PARTICLE_BUDGETS[monitor.getTier()])
  }
  onTierChange(initialTier)

  return {
    getTier: monitor.getTier,
    setRoadActive(active) {
      roadActive = Boolean(active)
      syncRain()
    },
    setWeather(nextWeather) {
      weather = nextWeather
      syncRain()
    },
    update(delta) {
      if (monitor.recordFrame(delta)) {
        onTierChange(monitor.getTier())
        syncRain()
      }
      if (rain?.points.visible) rain.update(delta, camera)
    },
    dispose() { rain?.dispose() },
  }
}
