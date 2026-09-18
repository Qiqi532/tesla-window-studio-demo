import * as THREE from 'three'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { createWeatherController } from './weather.js'
import { RENDER_PROFILE, resolveRoadProfile } from './renderProfile.js'

const MODES = new Set(['studio', 'road'])
const SEASONS = new Set(['spring', 'summer', 'autumn', 'winter'])
const WEATHER_TYPES = new Set(['sunny', 'cloudy', 'rain', 'snow', 'night'])
const ROAD_SEGMENT_LENGTH = 40

/**
 * Single source of truth for the season wording, so the toolbar, the spoken-command
 * feedback and the voice dispatcher can never drift apart.
 */
export const SEASON_LABELS = Object.freeze({
  spring: '春季',
  summer: '夏季',
  autumn: '秋季',
  winter: '冬季',
})

/**
 * Single source of truth for the weather wording, so the toolbar, the spoken-command
 * feedback and the voice dispatcher can never drift apart.
 */
export const WEATHER_LABELS = Object.freeze({
  sunny: '晴天',
  cloudy: '阴天',
  rain: '雨天',
  snow: '雪天',
  night: '夜晚',
})

/** Every sky the loop road can show, keyed by the profile's `skyHdr` file name. */
const HDR_FILES = Object.freeze({
  'sunny-country-road-2k.hdr': 'environments/sunny-country-road-2k.hdr',
  'fouriesburg-cloudy-2k.hdr': 'environments/fouriesburg-cloudy-2k.hdr',
  'flower-road-2k.hdr': 'environments/flower-road-2k.hdr',
  'autumn-road-2k.hdr': 'environments/autumn-road-2k.hdr',
  'horn-koppe-snow-2k.hdr': 'environments/horn-koppe-snow-2k.hdr',
  'cloudy-cliffside-road-2k.hdr': 'environments/cloudy-cliffside-road-2k.hdr',
  'qwantani-night-2k.hdr': 'environments/qwantani-night-2k.hdr',
})

/** Road surface sets, keyed by the profile's `roadTexture` name. */
const ROAD_TEXTURE_SETS = Object.freeze({
  asphalt: 'textures/asphalt',
  'autumn-road': 'textures/autumn-road',
  'snow-road': 'textures/snow-road',
})
const TEXTURE_MAPS = Object.freeze(['diffuse-2k.jpg', 'normal-gl-2k.jpg', 'roughness-2k.jpg'])

export function createEnvironmentState() {
  let value = {
    mode: 'studio',
    season: 'summer',
    weather: 'sunny',
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
    setSeason(season) {
      if (!SEASONS.has(season)) throw new Error(`未知季节：${season}`)
      update({ season, mode: 'road' })
    },
    setWeather(weather) {
      if (!WEATHER_TYPES.has(weather)) throw new Error(`未知天气：${weather}`)
      update({ weather, mode: 'road' })
    },
    setRoadAssetStatus(patch) { update(patch) },
    dispose() { subscribers.clear() },
  }
}

function createStudioRig(scene) {
  const profile = RENDER_PROFILE.studio
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
  const hemisphere = new THREE.HemisphereLight(
    profile.hemisphere.color,
    profile.hemisphere.groundColor,
    profile.hemisphere.intensity,
  )
  const key = new THREE.RectAreaLight(
    profile.key.color,
    profile.key.intensity,
    profile.key.width,
    profile.key.height,
  )
  key.position.set(...profile.key.position)
  key.lookAt(0, 0.65, 0)
  const fill = new THREE.RectAreaLight(
    profile.fill.color,
    profile.fill.intensity,
    profile.fill.width,
    profile.fill.height,
  )
  fill.position.set(...profile.fill.position)
  fill.lookAt(0, 0.65, 0)
  const rim = new THREE.RectAreaLight(
    profile.rim.color,
    profile.rim.intensity,
    profile.rim.width,
    profile.rim.height,
  )
  rim.position.set(...profile.rim.position)
  rim.lookAt(0, 0.8, 0)
  const shadow = new THREE.DirectionalLight(profile.shadow.color, profile.shadow.intensity)
  shadow.position.set(...profile.shadow.position)
  shadow.castShadow = true
  shadow.shadow.mapSize.set(2048, 2048)
  Object.assign(shadow.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 24 })
  shadow.shadow.bias = -0.0005
  shadow.shadow.normalBias = 0.018
  shadow.shadow.radius = 3
  lights.add(hemisphere, key, fill, rim, shadow)
  root.add(lights)

  scene.add(root)
  return { root, floor, lights: { hemisphere, key, fill, rim, shadow } }
}

function configureTexture(texture, { color = false, repeat = [2, 10] } = {}) {
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(...repeat)
  texture.anisotropy = 8
  if (color) texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
}

function createRoadGroup(textureSets) {
  const root = new THREE.Group()
  root.name = 'loop-road'
  root.visible = false
  const railMaterial = new THREE.MeshStandardMaterial({ color: '#8b9399', metalness: 0.74, roughness: 0.34 })
  const lineMaterial = new THREE.MeshStandardMaterial({ color: '#e8e0c7', roughness: 0.7 })
  const roadSegments = []
  const materials = {}

  for (const [name, textures] of Object.entries(textureSets)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: '#8b8e91',
      map: textures.diffuse,
      normalMap: textures.normal,
      roughnessMap: textures.roughness,
      roughness: 0.86,
      metalness: 0.03,
    })
  }

  const roadGeometry = new THREE.PlaneGeometry(16, ROAD_SEGMENT_LENGTH)
  const roadMeshes = []
  for (const z of [-ROAD_SEGMENT_LENGTH, 0, ROAD_SEGMENT_LENGTH]) {
    const segment = new THREE.Group()
    segment.position.z = z
    // One mesh per segment (an object can only have one parent); they all share the
    // material, so a profile change swaps every segment in one pass.
    const road = new THREE.Mesh(roadGeometry, materials.asphalt)
    road.rotation.x = -Math.PI / 2
    road.position.y = -0.02
    road.receiveShadow = true
    roadMeshes.push(road)
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
  return { root, roadMeshes, materials, roadSegments }
}

/**
 * The roadside dressing that makes the loop read as a real countryside road instead of
 * a floating strip: one large ground plane and two rows of instanced trees that keep
 * their world positions while the road surface scrolls underneath.
 */
function createRoadside() {
  const root = new THREE.Group()
  root.name = 'roadside'
  root.visible = false

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshStandardMaterial({ color: '#7a9b4c', roughness: 1, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.06
  ground.receiveShadow = true
  root.add(ground)

  const trunkGeometry = new THREE.CylinderGeometry(0.15, 0.24, 3.6, 6)
  const foliageGeometry = new THREE.SphereGeometry(1.7, 8, 6)
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#5d4a35', roughness: 0.9 })
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: '#3f7d32', roughness: 0.85 })

  const treePositions = []
  for (let z = -60; z <= 60; z += 12) {
    treePositions.push([-13.5, z], [13.5, z])
  }
  const count = treePositions.length
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count)
  const foliage = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, count)
  trunks.castShadow = true
  foliage.castShadow = true

  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const scale = new THREE.Vector3()
  const position = new THREE.Vector3()
  treePositions.forEach(([x, z], index) => {
    const variety = 0.8 + Math.random() * 0.55
    const squash = 0.75 + Math.random() * 0.4
    euler.set(0, Math.random() * Math.PI * 2, 0)
    quaternion.setFromEuler(euler)
    position.set(x + (Math.random() - 0.5) * 0.9, 1.8 * variety, z + (Math.random() - 0.5) * 0.9)
    scale.set(variety, variety * 1.1, variety)
    matrix.compose(position, quaternion, scale)
    trunks.setMatrixAt(index, matrix)
    position.y = 3.6 * variety + 1.5 * variety * squash
    scale.set(variety * squash, variety * squash, variety * squash)
    matrix.compose(position, quaternion, scale)
    foliage.setMatrixAt(index, matrix)
  })

  root.add(trunks, foliage)
  return { root, ground, trunks, foliage, trunkMaterial, foliageMaterial }
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
  const roadside = createRoadside()
  scene.add(roadside.root)
  let road = null
  let assets = null
  let loadPromise = null
  let disposed = false
  let roadSpeed = 0

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

      const hdrEntries = Object.entries(HDR_FILES).map(([name, path]) => ({
        name,
        promise: hdrLoader.loadAsync(assetUrl(path)),
      }))
      const textureEntries = Object.entries(ROAD_TEXTURE_SETS).flatMap(([name, dir]) => (
        TEXTURE_MAPS.map((file) => ({
          set: name,
          file,
          promise: textureLoader.loadAsync(assetUrl(`${dir}/${file}`)),
        }))
      ))
      const resolvedHdrs = await Promise.all(hdrEntries.map((entry) => entry.promise))
      const resolvedTextures = await Promise.all(textureEntries.map((entry) => entry.promise))
      if (disposed) {
        ;[...resolvedHdrs, ...resolvedTextures].forEach((texture) => texture.dispose())
        throw new Error('环境控制器已释放')
      }

      const hdrs = {}
      hdrEntries.forEach((entry, index) => {
        const texture = resolvedHdrs[index]
        texture.mapping = THREE.EquirectangularReflectionMapping
        hdrs[entry.name] = { texture, target: null }
      })
      const pmrem = new THREE.PMREMGenerator(renderer)
      pmrem.compileEquirectangularShader()
      for (const entry of Object.values(hdrs)) {
        entry.target = pmrem.fromEquirectangular(entry.texture)
      }
      pmrem.dispose()

      const textureSets = {}
      for (const set of Object.keys(ROAD_TEXTURE_SETS)) {
        const maps = {}
        textureEntries.forEach((entry, index) => {
          if (entry.set !== set) return
          const texture = resolvedTextures[index]
          if (entry.file === 'diffuse-2k.jpg') {
            configureTexture(texture, { color: true })
            maps.diffuse = texture
          } else if (entry.file === 'normal-gl-2k.jpg') {
            configureTexture(texture)
            maps.normal = texture
          } else {
            configureTexture(texture)
            maps.roughness = texture
          }
        })
        textureSets[set] = maps
      }

      road = createRoadGroup(textureSets)
      scene.add(road.root)
      assets = { hdrs, textureSets }
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

  const applyLighting = (mode, season, weather) => {
    const { hemisphere, key, fill, rim, shadow } = studio.lights
    const inStudio = mode === 'studio'
    key.visible = inStudio
    fill.visible = inStudio
    rim.visible = inStudio
    if (inStudio) {
      const profile = RENDER_PROFILE.studio
      hemisphere.color.set(profile.hemisphere.color)
      hemisphere.groundColor.set(profile.hemisphere.groundColor)
      hemisphere.intensity = profile.hemisphere.intensity
      shadow.color.set(profile.shadow.color)
      shadow.intensity = profile.shadow.intensity
      return
    }
    const profile = resolveRoadProfile(season, weather)
    hemisphere.color.set(profile.hemisphereColor)
    hemisphere.groundColor.set(profile.hemisphereGround)
    hemisphere.intensity = profile.hemisphereIntensity
    shadow.color.set(profile.shadowColor)
    shadow.intensity = profile.shadowIntensity
  }

  const applyCurrentState = () => {
    const current = state.getState()
    const inStudio = current.mode === 'studio'
    studio.floor.visible = inStudio
    roadside.root.visible = !inStudio
    if (road) road.root.visible = !inStudio
    weatherController.setRoadActive(!inStudio)
    weatherController.setSeason(current.season)
    weatherController.setWeather(current.weather)
    applyLighting(current.mode, current.season, current.weather)
    if (inStudio) {
      scene.background = new THREE.Color('#080d15')
      scene.environment = studioEnvironment
      scene.environmentIntensity = RENDER_PROFILE.studio.environmentIntensity
      scene.backgroundBlurriness = 0
      scene.fog = new THREE.Fog('#080d15', 15, 27)
      return
    }

    const profile = resolveRoadProfile(current.season, current.weather)
    const sky = assets.hdrs[profile.skyHdr]
    scene.background = sky.texture
    scene.environment = sky.target.texture
    scene.environmentIntensity = profile.environmentIntensity
    scene.backgroundIntensity = profile.backgroundIntensity
    scene.backgroundBlurriness = profile.backgroundBlurriness
    scene.backgroundRotation.y = Math.PI * 0.44
    scene.environmentRotation.y = Math.PI * 0.44

    const roadMaterial = road.materials[profile.roadTexture]
    road.roadMeshes.forEach((mesh) => { mesh.material = roadMaterial })
    roadMaterial.roughness = profile.roadRoughness
    roadMaterial.metalness = profile.roadMetalness
    roadMaterial.envMapIntensity = profile.roadEnvMapIntensity

    roadside.ground.material.color.set(profile.groundColor)
    roadside.trunkMaterial.color.set(profile.trunkColor)
    roadside.foliageMaterial.color.set(profile.foliageColor)

    if (profile.fogMode === 'exp2') {
      scene.fog = new THREE.FogExp2(profile.fogColor, profile.fogDensity)
    } else {
      scene.fog = new THREE.Fog(profile.fogColor, profile.fogNear, profile.fogFar)
    }
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
    async setSeason(season) {
      if (!SEASONS.has(season)) throw new Error(`未知季节：${season}`)
      await ensureRoadAssets()
      state.setSeason(season)
      applyCurrentState()
    },
    async setWeather(weather) {
      if (!WEATHER_TYPES.has(weather)) throw new Error(`未知天气：${weather}`)
      await ensureRoadAssets()
      state.setWeather(weather)
      applyCurrentState()
    },
    /**
     * Visual speed of the looped road in scene units per second, along the car's
     * forward axis. The vehicle controller feeds its own signed speed in here, so the
     * road surface, the lane markings and both wheel axles advance together — and turn
     * around together in reverse. Zero keeps the road still while parked.
     */
    setRoadSpeed(value) {
      roadSpeed = Number.isFinite(value) ? value : 0
    },
    getRoadSpeed() {
      return roadSpeed
    },
    /**
     * True when ambient light is low enough that the lamps are the subject. The render
     * loop uses this to route through the bloom chain; everything else stays on the
     * cheaper direct path.
     */
    isDarkScene() {
      const current = state.getState()
      return current.mode === 'road' && current.weather === 'night'
    },
    update(delta) {
      weatherController.update(delta)
      if (!road?.root.visible || roadSpeed === 0) return
      for (const segment of road.roadSegments) {
        // The car's nose points along +Z in scene space, so driving forward makes the
        // ground flow the other way. Reversing flips the sign, so the wrap has to work
        // in both directions.
        segment.position.z -= roadSpeed * delta
        if (segment.position.z < -ROAD_SEGMENT_LENGTH * 1.5) segment.position.z += ROAD_SEGMENT_LENGTH * 3
        else if (segment.position.z > ROAD_SEGMENT_LENGTH * 1.5) segment.position.z -= ROAD_SEGMENT_LENGTH * 3
      }
    },
    getRenderInfo() {
      return {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        roadOffset: road ? Number(road.roadSegments[0].position.z.toFixed(4)) : null,
        roadOffsets: road ? road.roadSegments.map((segment) => Number(segment.position.z.toFixed(4))) : null,
      }
    },
    dispose() {
      disposed = true
      weatherController.dispose()
      scene.remove(studio.root)
      disposeHierarchy(studio.root)
      scene.remove(roadside.root)
      disposeHierarchy(roadside.root)
      if (road) {
        scene.remove(road.root)
        disposeHierarchy(road.root)
      }
      if (assets) {
        for (const entry of Object.values(assets.hdrs)) {
          entry.texture.dispose()
          entry.target.dispose()
        }
        for (const set of Object.values(assets.textureSets)) {
          Object.values(set).forEach((texture) => texture.dispose())
        }
      }
      state.dispose()
    },
  }
}
