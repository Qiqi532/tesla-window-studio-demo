import * as THREE from 'three'

export const RAIN_PARTICLE_BUDGETS = Object.freeze({ high: 1400, medium: 800, low: 360 })
export const SNOW_PARTICLE_BUDGETS = Object.freeze({ high: 900, medium: 500, low: 220 })
export const LEAF_PARTICLE_BUDGETS = Object.freeze({ high: 260, medium: 150, low: 70 })
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

/**
 * A camera-centred particle field that falls with a per-particle speed. Rain and snow
 * share the same mechanics but different budgets, sizes, colours and fall speeds, so
 * the whole layer stays one code path with two tuned presets.
 */
function createFallField(scene, {
  name,
  count,
  color,
  size,
  opacity,
  spread = [24, 15, 28],
  fallRange = [13, 22],
  drift = 0,
}) {
  const positions = new Float32Array(count * 3)
  const speeds = new Float32Array(count)
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3
    positions[offset] = (Math.random() - 0.5) * spread[0]
    positions[offset + 1] = Math.random() * spread[1] + 1
    positions[offset + 2] = (Math.random() - 0.5) * spread[2]
    speeds[index] = fallRange[0] + Math.random() * (fallRange[1] - fallRange[0])
  }
  const geometry = new THREE.BufferGeometry()
  const attribute = new THREE.BufferAttribute(positions, 3)
  attribute.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', attribute)
  const material = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.visible = false
  scene.add(points)

  let phase = 0
  return {
    points,
    setBudget(budget) { geometry.setDrawRange(0, Math.min(budget, count)) },
    update(delta, camera) {
      points.position.set(camera.position.x, 0, camera.position.z)
      phase += delta
      for (let index = 0; index < count; index += 1) {
        const offset = index * 3
        positions[offset + 1] -= speeds[index] * delta
        if (drift) positions[offset] += Math.sin(phase * 1.4 + index) * drift * delta
        if (positions[offset + 1] < -0.5) {
          positions[offset + 1] = spread[1] + Math.random() * 3
          positions[offset] = (Math.random() - 0.5) * spread[0]
        }
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

function createRain(scene) {
  return createFallField(scene, {
    name: 'rain',
    count: RAIN_PARTICLE_BUDGETS.high,
    color: '#c8dded',
    size: 0.055,
    opacity: 0.62,
    fallRange: [13, 22],
  })
}

function createSnow(scene) {
  return createFallField(scene, {
    name: 'snow',
    count: SNOW_PARTICLE_BUDGETS.high,
    color: '#ffffff',
    size: 0.11,
    opacity: 0.88,
    spread: [34, 14, 38],
    fallRange: [2.4, 4.6],
    drift: 0.7,
  })
}

function createLeaves(scene) {
  return createFallField(scene, {
    name: 'leaves',
    count: LEAF_PARTICLE_BUDGETS.high,
    color: '#c96a2b',
    size: 0.17,
    opacity: 0.8,
    spread: [30, 13, 34],
    fallRange: [1.4, 2.8],
    drift: 1.1,
  })
}

export function createWeatherController({ scene, camera, onTierChange = () => {} }) {
  const initialTier = getInitialPerformanceTier(getCapabilities())
  const monitor = createPerformanceMonitor(initialTier)
  let season = 'summer'
  let weather = 'sunny'
  let roadActive = false
  let rain = null
  let snow = null
  let leaves = null

  const syncParticles = () => {
    const shouldShowRain = roadActive && weather === 'rain'
    if (shouldShowRain && !rain) rain = createRain(scene)
    if (rain) rain.points.visible = shouldShowRain

    const shouldShowSnow = roadActive && weather === 'snow'
    if (shouldShowSnow && !snow) snow = createSnow(scene)
    if (snow) snow.points.visible = shouldShowSnow

    const shouldShowLeaves = roadActive && season === 'autumn' && weather !== 'night' && weather !== 'snow'
    if (shouldShowLeaves && !leaves) leaves = createLeaves(scene)
    if (leaves) leaves.points.visible = shouldShowLeaves

    const tier = monitor.getTier()
    if (rain) rain.setBudget(RAIN_PARTICLE_BUDGETS[tier])
    if (snow) snow.setBudget(SNOW_PARTICLE_BUDGETS[tier])
    if (leaves) leaves.setBudget(LEAF_PARTICLE_BUDGETS[tier])
  }
  onTierChange(initialTier)

  return {
    getTier: monitor.getTier,
    setRoadActive(active) {
      roadActive = Boolean(active)
      syncParticles()
    },
    setSeason(nextSeason) {
      season = nextSeason
      syncParticles()
    },
    setWeather(nextWeather) {
      weather = nextWeather
      syncParticles()
    },
    update(delta) {
      if (monitor.recordFrame(delta)) {
        onTierChange(monitor.getTier())
        syncParticles()
      }
      if (rain?.points.visible) rain.update(delta, camera)
      if (snow?.points.visible) snow.update(delta, camera)
      if (leaves?.points.visible) leaves.update(delta, camera)
    },
    dispose() {
      rain?.dispose()
      snow?.dispose()
      leaves?.dispose()
    },
  }
}
