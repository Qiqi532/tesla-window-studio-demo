import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  AXLE_PARTS,
  DOOR_PARTS,
  LIGHT_CONES,
  LIGHT_MATERIALS,
  PAINT_MATERIAL,
  TRUNK_PARTS,
  VEHICLE_MODEL_PATH,
  WINDOW_NODES,
  normalizePartName,
} from './vehicleParts.js'
import {
  cloneMutableMaterials,
  collectMutableMaterialNames,
  indexMaterialsByName,
  normalizeDisplayMaterials,
} from './vehicleMaterials.js'

function findPart(root, name) {
  const exact = root.getObjectByName(name)
  if (exact) return exact
  const target = normalizePartName(name)
  let found = null
  root.traverse((node) => {
    if (!found && normalizePartName(node.name) === target) found = node
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

  const windows = Object.fromEntries(
    Object.entries(WINDOW_NODES).map(([id, name]) => [id, findPart(vehicle, name)]),
  )
  const missingWindows = Object.entries(windows).filter(([, node]) => !node?.isMesh).map(([id]) => id)
  if (missingWindows.length) throw new Error(`模型缺少独立侧窗部件：${missingWindows.join('、')}`)

  /** Hinged parts keep their authored pivot and local axis; the controller only adds an angle. */
  const describeHinge = (parts, missing) => Object.fromEntries(Object.entries(parts).map(([id, definition]) => {
    const node = findPart(vehicle, definition.node)
    if (!node) {
      missing.push(definition.node)
      return [id, null]
    }
    return [id, {
      id,
      node,
      label: definition.label,
      axis: definition.axis,
      angle: definition.angle,
      base: node.rotation[definition.axis],
    }]
  }))

  const missingParts = []
  const doors = describeHinge(DOOR_PARTS, missingParts)
  const trunks = describeHinge(TRUNK_PARTS, missingParts)
  if (missingParts.length) throw new Error(`模型缺少车门或备箱节点：${missingParts.join('、')}`)

  const axles = {}
  for (const [id, definition] of Object.entries(AXLE_PARTS)) {
    const node = findPart(vehicle, definition.node)
    if (!node) throw new Error(`模型缺少轮轴节点：${definition.node}`)
    axles[id] = { id, node, label: definition.label, base: node.rotation.x, angle: 0 }
  }
  if (new Set(Object.values(axles).map((axle) => axle.node)).size !== 2) {
    throw new Error('前后轮轴解析到同一个节点，无法分别滚动')
  }

  vehicle.traverse((node) => {
    if (!node.isMesh) return
    node.castShadow = true
    node.receiveShadow = true
  })

  /**
   * Order matters. The display pass installs the lamp lenses and the smoked glazing, so
   * it has to run *before* the mutable materials are cloned — otherwise the light groups
   * would hold clones of materials that no mesh renders any more, and switching a lamp on
   * would change nothing on screen.
   */
  normalizeDisplayMaterials(vehicle)

  const mutableNames = collectMutableMaterialNames()
  const materials = cloneMutableMaterials(vehicle, mutableNames)
  if (!materials.paint.length) throw new Error(`模型缺少车漆材质：${PAINT_MATERIAL}`)
  const emptyLightGroups = Object.entries(materials.lights).filter(([, list]) => !list.length).map(([id]) => id)
  if (emptyLightGroups.length) throw new Error(`模型缺少灯光材质：${emptyLightGroups.join('、')}`)

  // Resolved after cloning, so the index points at the clones the meshes actually render.
  const materialsByName = indexMaterialsByName(vehicle)
  const lightRig = Object.fromEntries(Object.entries(LIGHT_CONES).map(([id, entry]) => [
    id,
    entry.nodes.map((name) => findPart(vehicle, name)).filter(Boolean),
  ]))
  const missingRig = Object.entries(lightRig).filter(([, nodes]) => !nodes.length).map(([id]) => id)
  if (missingRig.length) throw new Error(`模型缺少灯光锥锚点：${missingRig.join('、')}`)

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

  // Rolling radius taken from the front axle so wheel spin matches the road scroll.
  const wheelBounds = new THREE.Box3().setFromObject(axles.front.node)
  const wheelRadius = Math.max((wheelBounds.max.y - wheelBounds.min.y) / 2, 0.05)

  onProgress(1)
  return {
    root,
    vehicle,
    windows,
    doors,
    trunks,
    axles,
    lightRig,
    materials,
    materialsByName,
    wheelRadius,
    modelPath: VEHICLE_MODEL_PATH,
  }
}
