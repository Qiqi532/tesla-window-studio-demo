import { LIGHT_MATERIALS, PAINT_MATERIAL, RIM_MATERIALS } from './vehicleParts.js'

/** Every material the vehicle controller is allowed to mutate. */
export function collectMutableMaterialNames() {
  return new Set([PAINT_MATERIAL, ...RIM_MATERIALS, ...Object.values(LIGHT_MATERIALS).flat()])
}

/**
 * Clone each mutable material per mesh and group the clones by what they drive.
 *
 * This matters because the GLB shares materials between unrelated parts — painting the
 * body or switching a rim preset would otherwise repaint trim, glass and interior
 * elsewhere on the car. Only materials the controller mutates are cloned, so the rest
 * of the model keeps sharing its originals.
 */
export function cloneMutableMaterials(vehicle, mutableNames = collectMutableMaterialNames()) {
  const groups = {
    paint: [],
    rims: [],
    lights: Object.fromEntries(Object.keys(LIGHT_MATERIALS).map((id) => [id, []])),
  }
  const lightByMaterial = new Map()
  for (const [id, names] of Object.entries(LIGHT_MATERIALS)) {
    for (const name of names) lightByMaterial.set(name, id)
  }

  vehicle.traverse((node) => {
    if (!node.isMesh) return
    const originals = Array.isArray(node.material) ? node.material : [node.material]
    let replaced = false
    const next = originals.map((material) => {
      const name = material?.name
      if (!mutableNames.has(name)) return material
      const clone = material.clone()
      clone.name = name
      replaced = true
      if (name === PAINT_MATERIAL) groups.paint.push(clone)
      if (RIM_MATERIALS.includes(name)) groups.rims.push(clone)
      const lightId = lightByMaterial.get(name)
      if (lightId) groups.lights[lightId].push(clone)
      return clone
    })
    if (replaced) node.material = Array.isArray(node.material) ? next : next[0]
  })

  return groups
}
