import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export function createStudio(stage) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#080d15')
  scene.fog = new THREE.Fog('#080d15', 15, 27)

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
  camera.position.set(6.3, 2.8, 7.8)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.18
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  stage.append(renderer.domElement)

  const room = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTarget = pmrem.fromScene(room)
  scene.environment = envTarget.texture
  scene.environmentIntensity = 1
  room.dispose()
  pmrem.dispose()

  scene.add(new THREE.HemisphereLight('#c6dcff', '#172334', 1.6))

  const key = new THREE.DirectionalLight('#f7fbff', 3.4)
  key.position.set(-4, 8, 5)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -7
  key.shadow.camera.right = 7
  key.shadow.camera.top = 7
  key.shadow.camera.bottom = -7
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 22
  key.shadow.bias = -0.0005
  key.shadow.normalBias = 0.018
  key.shadow.radius = 3
  scene.add(key)

  const rim = new THREE.DirectionalLight('#6799dc', 2.7)
  rim.position.set(5, 5, -5)
  scene.add(rim)
  const warm = new THREE.DirectionalLight('#e5ae86', 0.9)
  warm.position.set(-6, 3, -4)
  scene.add(warm)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: '#0a1422', metalness: 0.08, roughness: 0.86 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.025
  floor.receiveShadow = true
  scene.add(floor)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0.55, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.065
  controls.enablePan = false
  controls.minDistance = 7.4
  controls.maxDistance = 17
  controls.minPolarAngle = 0.45
  controls.maxPolarAngle = 1.48
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
    controls.update()
    renderer.render(scene, camera)
  }
  frameId = requestAnimationFrame(frame)

  return {
    scene, camera, renderer,
    setFrameHandler(handler) { onFrame = handler },
    dispose() {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      controls.dispose()
      envTarget.dispose()
      floor.geometry.dispose()
      floor.material.dispose()
      renderer.dispose()
    },
  }
}
