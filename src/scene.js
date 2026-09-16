import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export function createStudio(stage) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#080d15')
  scene.fog = new THREE.Fog('#080d15', 15, 27)

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 140)
  camera.position.set(6.3, 2.8, 7.8)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  const basePixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2)
  let qualityScale = 1
  renderer.setPixelRatio(basePixelRatio)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.14
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  stage.append(renderer.domElement)

  const room = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environmentTarget = pmrem.fromScene(room)
  scene.environment = environmentTarget.texture
  scene.environmentIntensity = 1
  room.dispose()
  pmrem.dispose()

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0.55, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.065
  controls.enablePan = false
  controls.minDistance = 5.1
  controls.maxDistance = 18
  controls.minPolarAngle = 0.3
  controls.maxPolarAngle = 1.5
  controls.update()

  const resize = () => {
    const width = stage.clientWidth
    const height = stage.clientHeight
    if (!width || !height) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(stage)
  resize()

  let lastTime = performance.now()
  let frameId = 0
  let onFrame = () => {}
  const frame = (now) => {
    frameId = requestAnimationFrame(frame)
    const delta = Math.min((now - lastTime) / 1000, 0.05)
    lastTime = now
    onFrame(delta)
    controls.update(delta)
    renderer.render(scene, camera)
  }
  frameId = requestAnimationFrame(frame)

  return {
    scene,
    camera,
    renderer,
    controls,
    studioEnvironment: environmentTarget.texture,
    setFrameHandler(handler) { onFrame = handler },
    setQualityScale(scale) {
      const next = THREE.MathUtils.clamp(scale, 0.5, 1)
      if (next === qualityScale) return
      qualityScale = next
      renderer.setPixelRatio(basePixelRatio * qualityScale)
      resize()
    },
    dispose() {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      controls.dispose()
      environmentTarget.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
