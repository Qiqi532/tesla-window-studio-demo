import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RENDER_PROFILE } from './renderProfile.js'

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
  renderer.toneMapping = THREE.AgXToneMapping
  renderer.toneMappingExposure = RENDER_PROFILE.renderer.exposure
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  stage.append(renderer.domElement)

  const room = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environmentTarget = pmrem.fromScene(room)
  scene.environment = environmentTarget.texture
  scene.environmentIntensity = RENDER_PROFILE.studio.environmentIntensity
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

  /**
   * Bloom is built lazily and only switched on for the dark scenes. Routing through a
   * composer costs an extra full-screen resolve, so the studio and the daylight road
   * keep the direct single-pass path they had before.
   */
  let composer = null
  let bloomPass = null
  let bloomEnabled = false
  const ensureComposer = () => {
    if (composer) return composer
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    composer = new EffectComposer(renderer, target)
    composer.addPass(new RenderPass(scene, camera))
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      RENDER_PROFILE.bloom.strength,
      RENDER_PROFILE.bloom.radius,
      RENDER_PROFILE.bloom.threshold,
    )
    composer.addPass(bloomPass)
    composer.addPass(new OutputPass())
    return composer
  }

  const resize = () => {
    const width = stage.clientWidth
    const height = stage.clientHeight
    if (!width || !height) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    if (composer) {
      composer.setPixelRatio(basePixelRatio * qualityScale)
      composer.setSize(width, height)
    }
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
    if (bloomEnabled) ensureComposer().render(delta)
    else renderer.render(scene, camera)
  }
  frameId = requestAnimationFrame(frame)

  return {
    scene,
    camera,
    renderer,
    controls,
    studioEnvironment: environmentTarget.texture,
    setFrameHandler(handler) { onFrame = handler },
    /**
     * Toggle the additive bloom pass. Enabling it also refreshes the viewport chain, so
     * the composer matches whatever size and pixel ratio the renderer currently uses.
     */
    setBloom(enabled) {
      const next = Boolean(enabled)
      if (next === bloomEnabled) return
      bloomEnabled = next
      if (bloomEnabled) {
        ensureComposer()
        composer.setPixelRatio(basePixelRatio * qualityScale)
        composer.setSize(stage.clientWidth || 1, stage.clientHeight || 1)
      }
    },
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
      composer?.dispose()
      environmentTarget.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
