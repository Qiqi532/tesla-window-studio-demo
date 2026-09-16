import * as THREE from 'three'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { createWeatherController } from './weather.js'

const MODES = new Set(['studio', 'road'])
const WEATHER_TYPES = new Set(['sunny', 'cloudy', 'rain'])
const ROAD_SPEED = 5.4
const ROAD_SEGMENT_LENGTH = 40

export function createEnvironmentState() {
  let value = {
    mode: 'studio',
    weather: 'sunny',
    equipmentVisible: false,
    roadAssetsLoaded: false,
    roadAssetsLoading: false,
  }
  const subscribers = new Set()
  const getState = () => ({ ...value })
  const update = (patch) => {
    value = { ...value, ...patch }
    subscribers.forEach((listener) => listener(getState()))
  }

  return {
    getState,
    subscribe(listener) {
      subscribers.add(listener)
      listener(getState())
      return () => subscribers.delete(listener)
    },
    setMode(mode) {
      if (!MODES.has(mode)) throw new Error(`未知场景：${mode}`)
      update({ mode })
    },
    setWeather(weather) {
      if (!WEATHER_TYPES.has(weather)) throw new Error(`未知天气：${weather}`)
      update({ weather, mode: 'road' })
    },
    setEquipmentVisible(equipmentVisible) { update({ equipmentVisible: Boolean(equipmentVisible) }) },
    setRoadAssetStatus(patch) { update(patch) },
    dispose() { subscribers.clear() },
  }
}

function makeSoftbox(position, scale, color) {
  const group = new THREE.Group()
  group.position.copy(position)
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.08, 0.85),
    new THREE.MeshStandardMaterial({ color: '#1a2028', emissive: color, emissiveIntensity: 0.85, roughness: 0.34 }),
  )
  panel.rotation.x = Math.PI / 2
  panel.scale.copy(scale)
  panel.lookAt(0, 0.65, 0)
  group.add(panel)
  const standMaterial = new THREE.MeshStandardMaterial({ color: '#202833', metalness: 0.7, roughness: 0.35 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.45, 8), standMaterial)
  pole.position.y = -1.25
  group.add(pole)
  for (const angle of [-0.9, 0, 0.9]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.027, 1.05, 7), standMaterial)
    leg.position.set(Math.sin(angle) * 0.34, -2.32, Math.cos(angle) * 0.34)
    leg.rotation.z = Math.sin(angle) * 0.42
    leg.rotation.x = Math.cos(angle) * 0.42
    group.add(leg)
  }
  return group
}

function createTripodCamera() {
  const group = new THREE.Group()
  group.position.set(3.9, 1.55, 5.2)
  group.lookAt(0, 0.7, 0)
  const material = new THREE.MeshStandardMaterial({ color: '#111820', metalness: 0.72, roughness: 0.3 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.34, 0.72), material)
  group.add(body)
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.38, 16), material)
  lens.rotation.x = Math.PI / 2
  lens.position.z = -0.5
  group.add(lens)
  for (const x of [-0.42, 0, 0.42]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 2.7, 8), material)
    leg.position.set(x, -1.5, Math.abs(x) * 0.28)
    leg.rotation.z = -x * 0.22
    group.add(leg)
  }
  return group
}

function createStudioRig(scene) {
  RectAreaLightUniformsLib.init()
  const root = new THREE.Group()
  root.name = 'studio-environment'
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: '#0a1422', metalness: 0.08, roughness: 0.86 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.025
  floor.receiveShadow = true
  root.add(floor)

  const lights = new THREE.Group()
  const hemisphere = new THREE.HemisphereLight('#c6dcff', '#172334', 1.15)
  const key = new THREE.RectAreaLight('#eaf5ff', 11, 4.2, 2.6)
  key.position.set(-4.2, 5.3, 4.7)
  key.lookAt(0, 0.65, 0)
  const fill = new THREE.RectAreaLight('#8db9e6', 5.8, 3.3, 2.1)
  fill.position.set(5.1, 3.4, 3.1)
  fill.lookAt(0, 0.65, 0)
  const rim = new THREE.RectAreaLight('#ffb985', 7.2, 2.5, 1.6)
  rim.position.set(-2.8, 3.5, -4.8)
  rim.lookAt(0, 0.8, 0)
  const shadow = new THREE.DirectionalLight('#f4f8ff', 1.8)
  shadow.position.set(-4, 8, 5)
  shadow.castShadow = true
  shadow.shadow.mapSize.set(2048, 2048)
  Object.assign(shadow.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 24 })
  shadow.shadow.bias = -0.0005
  shadow.shadow.normalBias = 0.018
  shadow.shadow.radius = 3
  lights.add(hemisphere, key, fill, rim, shadow)
  root.add(lights)

  const equipment = new THREE.Group()
  equipment.name = 'behind-the-scenes-equipment'
  equipment.add(
    makeSoftbox(new THREE.Vector3(-4.2, 4.9, 4.7), new THREE.Vector3(1.2, 1, 1), '#d8efff'),
    makeSoftbox(new THREE.Vector3(5.1, 3.2, 3.1), new THREE.Vector3(0.9, 1, 0.85), '#8abbe8'),
    makeSoftbox(new THREE.Vector3(-2.8, 3.4, -4.8), new THREE.Vector3(0.75, 1, 0.75), '#efa96f'),
    createTripodCamera(),
  )
  equipment.visible = false
  root.add(equipment)
  scene.add(root)
  return { root, floor, lights: { hemisphere, key, fill, rim, shadow }, equipment }
}

function configureTexture(texture, { color = false, repeat = [2, 10] } = {}) {
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(...repeat)
  texture.anisotropy = 8
  if (color) texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
}

function createRoadGroup(textures) {
  const root = new THREE.Group()
  root.name = 'loop-road'
  root.visible = false
  const roadGeometry = new THREE.PlaneGeometry(16, ROAD_SEGMENT_LENGTH)
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: '#8b8e91',
    map: textures.diffuse,
    normalMap: textures.normal,
    roughnessMap: textures.roughness,
    roughness: 0.78,
    metalness: 0.03,
  })
  const railMaterial = new THREE.MeshStandardMaterial({ color: '#8b9399', metalness: 0.74, roughness: 0.34 })
  const lineMaterial = new THREE.MeshStandardMaterial({ color: '#e8e0c7', roughness: 0.7 })
  const roadSegments = []

  for (const z of [-ROAD_SEGMENT_LENGTH, 0, ROAD_SEGMENT_LENGTH]) {
    const segment = new THREE.Group()
    segment.position.z = z
    const road = new THREE.Mesh(roadGeometry, roadMaterial)
    road.rotation.x = -Math.PI / 2
    road.position.y = -0.02
    road.receiveShadow = true
    segment.add(road)

    const dashGeometry = new THREE.BoxGeometry(0.12, 0.018, 2.25)
    const dashes = new THREE.InstancedMesh(dashGeometry, lineMaterial, 10)
    const transform = new THREE.Matrix4()
    for (let index = 0; index < 10; index += 1) {
      transform.makeTranslation(0, 0.015, -18 + index * 4)
      dashes.setMatrixAt(index, transform)
    }
    dashes.receiveShadow = true
    segment.add(dashes)

    const railGeometry = new THREE.BoxGeometry(0.16, 0.34, ROAD_SEGMENT_LENGTH)
    for (const x of [-8.15, 8.15]) {
      const rail = new THREE.Mesh(railGeometry, railMaterial)
      rail.position.set(x, 0.42, 0)
      rail.castShadow = true
      segment.add(rail)
    }
    roadSegments.push(segment)
    root.add(segment)
  }
  return { root, roadMaterial, roadSegments }
}

function disposeHierarchy(root) {
  const geometries = new Set()
  const materials = new Set()
  root.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry)
    const entries = Array.isArray(node.material) ? node.material : [node.material]
    entries.filter(Boolean).forEach((material) => materials.add(material))
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
}

export function createEnvironmentController({
  scene,
  camera,
  renderer,
  studioEnvironment,
  baseUrl = './',
  setQualityScale = () => {},
  onLoadProgress = () => {},
}) {
  const state = createEnvironmentState()
  const studio = createStudioRig(scene)
  let road = null
  let assets = null
  let loadPromise = null
  let disposed = false

  const qualityScales = { high: 1, medium: 0.82, low: 0.66 }
  const weatherController = createWeatherController({
    scene,
    camera,
    onTierChange: (tier) => setQualityScale(qualityScales[tier]),
  })

  const assetUrl = (path) => `${baseUrl}assets/${path}`
  const ensureRoadAssets = async () => {
    if (assets) return assets
    if (loadPromise) return loadPromise
    state.setRoadAssetStatus({ roadAssetsLoading: true })
    loadPromise = (async () => {
      const manager = new THREE.LoadingManager()
      manager.onProgress = (_url, loaded, total) => onLoadProgress(loaded / total)
      const textureLoader = new THREE.TextureLoader(manager)
      const hdrLoader = new RGBELoader(manager)
      const [sunnyHdr, cloudyHdr, diffuse, normal, roughness] = await Promise.all([
        hdrLoader.loadAsync(assetUrl('environments/sunny-country-road-2k.hdr')),
        hdrLoader.loadAsync(assetUrl('environments/fouriesburg-cloudy-2k.hdr')),
        textureLoader.loadAsync(assetUrl('textures/asphalt/diffuse-2k.jpg')),
        textureLoader.loadAsync(assetUrl('textures/asphalt/normal-gl-2k.jpg')),
        textureLoader.loadAsync(assetUrl('textures/asphalt/roughness-2k.jpg')),
      ])
      if (disposed) {
        ;[sunnyHdr, cloudyHdr, diffuse, normal, roughness].forEach((texture) => texture.dispose())
        throw new Error('环境控制器已释放')
      }
      sunnyHdr.mapping = THREE.EquirectangularReflectionMapping
      cloudyHdr.mapping = THREE.EquirectangularReflectionMapping
      configureTexture(diffuse, { color: true })
      configureTexture(normal)
      configureTexture(roughness)
      const pmrem = new THREE.PMREMGenerator(renderer)
      pmrem.compileEquirectangularShader()
      const sunnyTarget = pmrem.fromEquirectangular(sunnyHdr)
      const cloudyTarget = pmrem.fromEquirectangular(cloudyHdr)
      pmrem.dispose()
      road = createRoadGroup({ diffuse, normal, roughness })
      scene.add(road.root)
      assets = { sunnyHdr, cloudyHdr, diffuse, normal, roughness, sunnyTarget, cloudyTarget }
      state.setRoadAssetStatus({ roadAssetsLoaded: true, roadAssetsLoading: false })
      onLoadProgress(1)
      return assets
    })().catch((error) => {
      loadPromise = null
      state.setRoadAssetStatus({ roadAssetsLoading: false })
      throw new Error(`道路环境加载失败：${error.message}`)
    })
    return loadPromise
  }

  const applyLighting = (mode, weather) => {
    const { hemisphere, key, fill, rim, shadow } = studio.lights
    const inStudio = mode === 'studio'
    key.visible = inStudio
    fill.visible = inStudio
    rim.visible = inStudio
    if (inStudio) {
      hemisphere.color.set('#c6dcff')
      hemisphere.groundColor.set('#172334')
      hemisphere.intensity = 1.15
      shadow.color.set('#f4f8ff')
      shadow.intensity = 1.8
      return
    }
    const sunny = weather === 'sunny'
    hemisphere.color.set(sunny ? '#cfe4ff' : '#a8b9c7')
    hemisphere.groundColor.set(sunny ? '#526049' : '#354047')
    hemisphere.intensity = sunny ? 1.35 : 1.75
    shadow.color.set(sunny ? '#fff1d1' : '#c7d4df')
    shadow.intensity = sunny ? 3.1 : weather === 'rain' ? 0.55 : 0.82
  }

  const applyCurrentState = () => {
    const current = state.getState()
    const inStudio = current.mode === 'studio'
    studio.floor.visible = inStudio
    studio.equipment.visible = inStudio && current.equipmentVisible
    if (road) road.root.visible = !inStudio
    weatherController.setRoadActive(!inStudio)
    weatherController.setWeather(current.weather)
    applyLighting(current.mode, current.weather)
    if (inStudio) {
      scene.background = new THREE.Color('#080d15')
      scene.environment = studioEnvironment
      scene.environmentIntensity = 1
      scene.backgroundBlurriness = 0
      scene.fog = new THREE.Fog('#080d15', 15, 27)
      return
    }
    const cloudy = current.weather !== 'sunny'
    scene.background = cloudy ? assets.cloudyHdr : assets.sunnyHdr
    scene.environment = cloudy ? assets.cloudyTarget.texture : assets.sunnyTarget.texture
    scene.environmentIntensity = current.weather === 'rain' ? 1.35 : cloudy ? 0.85 : 1.1
    scene.backgroundBlurriness = cloudy ? 0.12 : 0.03
    scene.backgroundIntensity = cloudy ? 0.72 : 0.95
    scene.backgroundRotation.y = Math.PI * 0.44
    scene.environmentRotation.y = Math.PI * 0.44
    road.roadMaterial.roughness = current.weather === 'rain' ? 0.24 : cloudy ? 0.7 : 0.86
    road.roadMaterial.metalness = current.weather === 'rain' ? 0.18 : 0.03
    road.roadMaterial.envMapIntensity = current.weather === 'rain' ? 1.55 : 0.85
    scene.fog = current.weather === 'rain'
      ? new THREE.FogExp2('#7e8d98', 0.022)
      : new THREE.Fog(cloudy ? '#a9b4ba' : '#c9d8dd', 34, 115)
  }

  applyCurrentState()

  return {
    getState: state.getState,
    subscribe: state.subscribe,
    async setMode(mode) {
      if (!MODES.has(mode)) throw new Error(`未知场景：${mode}`)
      if (mode === 'road') await ensureRoadAssets()
      state.setMode(mode)
      applyCurrentState()
    },
    async setWeather(weather) {
      if (!WEATHER_TYPES.has(weather)) throw new Error(`未知天气：${weather}`)
      await ensureRoadAssets()
      state.setWeather(weather)
      applyCurrentState()
    },
    setEquipmentVisible(visible) {
      state.setEquipmentVisible(visible)
      studio.equipment.visible = state.getState().mode === 'studio' && Boolean(visible)
    },
    update(delta) {
      weatherController.update(delta)
      if (!road?.root.visible) return
      for (const segment of road.roadSegments) {
        segment.position.z += ROAD_SPEED * delta
        if (segment.position.z > ROAD_SEGMENT_LENGTH * 1.5) segment.position.z -= ROAD_SEGMENT_LENGTH * 3
      }
    },
    getRenderInfo() {
      return {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      }
    },
    dispose() {
      disposed = true
      weatherController.dispose()
      scene.remove(studio.root)
      disposeHierarchy(studio.root)
      if (road) {
        scene.remove(road.root)
        disposeHierarchy(road.root)
      }
      if (assets) {
        ;[assets.sunnyHdr, assets.cloudyHdr, assets.diffuse, assets.normal, assets.roughness].forEach((item) => item.dispose())
        assets.sunnyTarget.dispose()
        assets.cloudyTarget.dispose()
      }
      state.dispose()
    },
  }
}
