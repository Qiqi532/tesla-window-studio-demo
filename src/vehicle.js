import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const WINDOW_NAMES = {
  FL: 'door_lf_glass.0_0',
  FR: 'door_rf_glass.0_0',
  RL: 'door_lr_glass.0_0',
  RR: 'door_rr_glass.0_0',
}

function normalizedName(name) {
  return name.replace(/[^a-z0-9_-]/gi, '').toLowerCase()
}

function findPart(root, name) {
  const exact = root.getObjectByName(name)
  if (exact) return exact
  let found = null
  root.traverse((node) => {
    if (!found && normalizedName(node.name) === normalizedName(name)) found = node
  })
  return found
}

export async function loadVehicle(onProgress = () => {}) {
  const url = `${import.meta.env.BASE_URL}assets/tesla-model-3-2018.glb`
  const loader = new GLTFLoader()
  const gltf = await new Promise((resolve, reject) => {
    loader.load(url, resolve, (event) => {
      if (event.lengthComputable && event.total) onProgress(event.loaded / event.total)
    }, reject)
  })

  const vehicle = gltf.scene
  const windows = Object.fromEntries(Object.entries(WINDOW_NAMES).map(([id, name]) => [id, findPart(vehicle, name)]))
  const missing = Object.entries(windows).filter(([, node]) => !node?.isMesh).map(([id]) => id)
  if (missing.length) throw new Error(`模型缺少独立侧窗部件：${missing.join('、')}`)

  vehicle.traverse((node) => {
    if (!node.isMesh) return
    node.castShadow = true
    node.receiveShadow = true
  })

  const bounds = new THREE.Box3().setFromObject(vehicle)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const scale = 5.65 / Math.max(size.x, size.z)
  vehicle.position.set(-center.x, -bounds.min.y, -center.z)

  const root = new THREE.Group()
  root.add(vehicle)
  root.scale.setScalar(scale)
  root.rotation.y = Math.PI
  root.updateMatrixWorld(true)
  onProgress(1)
  return { root, windows }
}
