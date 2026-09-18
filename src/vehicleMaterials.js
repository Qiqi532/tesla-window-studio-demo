import * as THREE from 'three'
import {
  GRAPHITE_TRIM,
  LIGHT_MATERIALS,
  PAINT_LINKED_TRIM,
  PAINT_MATERIAL,
  RIM_MATERIALS,
} from './vehicleParts.js'
import { getMaterialRole } from './vehicleMaterialManifest.js'

const GLASS_PROFILES = Object.freeze({
  'glass.0': Object.freeze({
    color: '#192a34', opacity: 0.58, roughness: 0.22, transmission: 0.12,
    thickness: 0.015, envMapIntensity: 0.3, renderOrder: 20,
  }),
  'glass.1': Object.freeze({
    color: '#0e1820', opacity: 0.68, roughness: 0.28, transmission: 0.06,
    thickness: 0.02, envMapIntensity: 0.24, renderOrder: 21,
  }),
})

/**
 * Lamp covers.
 *
 * The authored GLB gives the front and the rear lamps ONE shared translucent material
 * (`tembus_red.0`, "tembus" = see-through). It was previously tinted a flat dark red,
 * which is what made the headlights read as dark glass: that single material is the big
 * 195 × 46 × 54 cover across the whole front end, while the emissive strip inside it is
 * only 20 × 8 × 9.
 *
 * The cover is therefore split per mesh and picked by which end of the car the mesh sits
 * on — the model's nose is at −Z. Front covers become a bright clear lens, rear covers a
 * red one. The family is stashed in `userData.lampCover` so the later clone pass can put
 * each cover into the right light group and make it glow.
 */
const LAMP_COVERS = Object.freeze({
  'tembus_red.0': Object.freeze({
    front: Object.freeze({
      kind: 'front', color: '#c6d0d8', transmission: 0.86, roughness: 0.08, metalness: 0,
      envMapIntensity: 0.38,
    }),
    rear: Object.freeze({
      kind: 'rear', color: '#921822', transmission: 0.68, roughness: 0.1, metalness: 0,
      envMapIntensity: 0.4,
    }),
  }),
})

/** Names of every material handled by the cover pass. */
export const LAMP_COVER_NAMES = Object.freeze(Object.keys(LAMP_COVERS))

/** Families a cover can belong to; the clone pass keys its groups by these. */
export const LAMP_COVER_FAMILIES = Object.freeze(['front', 'rear'])

/** The model's nose sits at −Z, so the sign of a lamp mesh's Z centre decides the end. */
function lampFamilyForNode(node) {
  const box = new THREE.Box3().setFromObject(node)
  if (box.isEmpty()) return null
  return (box.min.z + box.max.z) / 2 < 0 ? 'front' : 'rear'
}

/**
 * Lamp lenses.
 *
 * The authored lamp materials contain the reflector, light-strip and lens colour atlas.
 * Each controlled lamp therefore keeps those maps while receiving a calibrated physical
 * finish:
 *
 *  - front lamps are bright, cool and slightly transmissive, so they read as a lens over
 *    a reflector rather than as another pane of dark glass;
 *  - rear lamps carry a red lens that stays visibly red when unlit;
 *  - the reverse lamp keeps a clear lens, because a red reversing light is not a thing.
 *
 * All controlled surfaces have zero emission while unlit; `LIGHT_APPEARANCE` supplies
 * colour and intensity only after the matching lamp is switched on.
 */
const LAMP_LENS_PROFILES = Object.freeze({
  left_front_light: Object.freeze({
    kind: 'front', color: '#dce5ec', roughness: 0.2, metalness: 0.04,
    clearcoat: 0.58, clearcoatRoughness: 0.16, envMapIntensity: 0.72, renderOrder: 10,
  }),
  right_front_light: Object.freeze({
    kind: 'front', color: '#dce5ec', roughness: 0.2, metalness: 0.04,
    clearcoat: 0.58, clearcoatRoughness: 0.16, envMapIntensity: 0.72, renderOrder: 10,
  }),
  foglight_l: Object.freeze({
    kind: 'front', color: '#e1e4e6', roughness: 0.24, metalness: 0.03,
    clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.65, renderOrder: 10,
  }),
  foglight_r: Object.freeze({
    kind: 'front', color: '#e1e4e6', roughness: 0.24, metalness: 0.03,
    clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.65, renderOrder: 10,
  }),
  left_rear_light: Object.freeze({
    kind: 'rear', color: '#a71921', roughness: 0.22, metalness: 0.02,
    clearcoat: 0.52, clearcoatRoughness: 0.17, envMapIntensity: 0.58, renderOrder: 10,
  }),
  right_rear_light: Object.freeze({
    kind: 'rear', color: '#a71921', roughness: 0.22, metalness: 0.02,
    clearcoat: 0.52, clearcoatRoughness: 0.17, envMapIntensity: 0.58, renderOrder: 10,
  }),
  breaklight_l: Object.freeze({
    kind: 'rear', color: '#b31a22', roughness: 0.2, metalness: 0.02,
    clearcoat: 0.52, clearcoatRoughness: 0.16, envMapIntensity: 0.58, renderOrder: 10,
  }),
  revlight_L: Object.freeze({
    kind: 'clear', color: '#d0d7dc', roughness: 0.22, metalness: 0.02,
    clearcoat: 0.48, clearcoatRoughness: 0.18, envMapIntensity: 0.62, renderOrder: 10,
  }),
})

/** Rear lenses are smoked, front lenses are bright; only the body tint differs. */
const LENS_FINISH = Object.freeze({
  front: Object.freeze({ thickness: 0.02, ior: 1.5, clearcoat: 0.65, clearcoatRoughness: 0.08, renderOrder: 11 }),
  rear: Object.freeze({ thickness: 0.06, ior: 1.48, clearcoat: 1, clearcoatRoughness: 0.06, renderOrder: 11 }),
  clear: Object.freeze({ thickness: 0.06, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.05, renderOrder: 11 }),
})

const PASSIVE_EMISSIVE_PRESETS = Object.freeze({
  'pantulans.0': Object.freeze({ color: '#68615b', roughness: 0.42 }),
  'tembus_red.0': Object.freeze({ color: '#4d1014', roughness: 0.38 }),
  light_night: Object.freeze({ color: '#3f4850', roughness: 0.4 }),
  indicator_lf: Object.freeze({ color: '#5a3213', roughness: 0.42 }),
  indicator_rf: Object.freeze({ color: '#5a3213', roughness: 0.42 }),
  indicator_rr: Object.freeze({ color: '#5a3213', roughness: 0.42 }),
  indicator_lr: Object.freeze({ color: '#5a3213', roughness: 0.42 }),
  'satin_red.0': Object.freeze({ color: '#511116', roughness: 0.42 }),
  'light_pantulan.0': Object.freeze({ color: '#5a5e61', roughness: 0.42 }),
})

const METAL_PRESETS = Object.freeze({
  'movsteer_1.0.1': Object.freeze({ color: '#747b81', metalness: 0.72, roughness: 0.34 }),
  'chassis.0': Object.freeze({ color: '#30353a', metalness: 0.24, roughness: 0.68 }),
  'suspensi.0': Object.freeze({ color: '#555b60', metalness: 0.62, roughness: 0.46 }),
  'suspensi.1': Object.freeze({ color: '#4d5358', metalness: 0.58, roughness: 0.48 }),
  'mirror_inside.0': Object.freeze({ color: '#26313a', metalness: 0.82, roughness: 0.24 }),
  'wheels.0': Object.freeze({ color: '#686e72', metalness: 0.62, roughness: 0.44 }),
})

const LAMP_SHELL_PRESETS = Object.freeze({
  'black_lights.0': Object.freeze({ color: '#242a2f', metalness: 0.08, roughness: 0.52 }),
  'back_chrome_light.0': Object.freeze({ color: '#697177', metalness: 0.72, roughness: 0.36 }),
  'aluminium_light.0': Object.freeze({ color: '#767d82', metalness: 0.7, roughness: 0.36 }),
  'aluminium2.0': Object.freeze({ color: '#747b80', metalness: 0.7, roughness: 0.38 }),
})

const BLACK_PLASTIC_COLORS = Object.freeze({
  'primary.004': '#171a1c',
  'wheels.1': '#26292c',
})

function setEmissionOff(material) {
  if (!material.emissive) return
  material.emissive.set('#000000')
  material.emissiveIntensity = 0
}

function applySurfaceProfile(material, profile, envMapIntensity) {
  material.color.set(profile.color)
  material.metalness = profile.metalness ?? 0
  material.roughness = profile.roughness
  material.envMapIntensity = envMapIntensity
}

function createGlassMaterial(source, profile) {
  return new THREE.MeshPhysicalMaterial({
    name: source.name,
    color: profile.color,
    metalness: 0,
    roughness: profile.roughness,
    transparent: true,
    opacity: profile.opacity,
    transmission: profile.transmission,
    ior: 1.48,
    thickness: profile.thickness,
    envMapIntensity: profile.envMapIntensity,
    clearcoat: 0.08,
    clearcoatRoughness: 0.38,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: true,
  })
}

/**
 * Build the shared outer cover. Its authored 32×32 map is a uniform colour placeholder,
 * so retaining it would only multiply and darken the calibrated front/rear tint. The
 * detailed 1024×1024 atlas remains on the controlled lamp surfaces underneath.
 */
function createLensMaterial(source, profile) {
  const finish = LENS_FINISH[profile.kind]
  return new THREE.MeshPhysicalMaterial({
    name: source.name,
    color: profile.color,
    metalness: profile.metalness,
    roughness: profile.roughness,
    transmission: profile.transmission,
    thickness: finish.thickness,
    ior: finish.ior,
    clearcoat: finish.clearcoat,
    clearcoatRoughness: finish.clearcoatRoughness,
    envMapIntensity: profile.envMapIntensity,
    emissive: '#000000',
    emissiveIntensity: 0,
    side: THREE.FrontSide,
    toneMapped: true,
  })
}

/** Keep every authored lamp texture while upgrading only its physical finish. */
function createLampSurfaceMaterial(source, profile) {
  return new THREE.MeshPhysicalMaterial({
    name: source.name,
    color: profile.color,
    map: source.map,
    emissiveMap: source.emissiveMap ?? source.map,
    alphaMap: source.alphaMap,
    aoMap: source.aoMap,
    aoMapIntensity: source.aoMapIntensity,
    normalMap: source.normalMap,
    normalScale: source.normalScale,
    metalnessMap: source.metalnessMap,
    roughnessMap: source.roughnessMap,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    metalness: profile.metalness,
    roughness: profile.roughness,
    clearcoat: profile.clearcoat,
    clearcoatRoughness: profile.clearcoatRoughness,
    envMapIntensity: profile.envMapIntensity,
    emissive: '#000000',
    emissiveIntensity: 0,
    side: THREE.FrontSide,
    toneMapped: true,
  })
}

/**
 * Rewrite the authored materials into a display pipeline: a real lens for every lamp,
 * a smoked pane for the glazing, and tone-corrected surfaces everywhere else. The source
 * GLB stays untouched — every change lands on its runtime materials.
 *
 * Must run before `cloneMutableMaterials`: the lamp lenses this pass installs are the
 * materials the light groups have to end up holding.
 */
export function normalizeDisplayMaterials(vehicle) {
  const processed = new Set()
  const replacements = new Map()

  // The cover pass reads world-space bounds to tell the front lamps from the rear ones.
  vehicle.updateMatrixWorld(true)

  vehicle.traverse((node) => {
    if (!node.isMesh) return
    const wasArray = Array.isArray(node.material)
    const sourceMaterials = wasArray ? node.material : [node.material]
    const materials = sourceMaterials.map((material) => {
      if (!material) return material
      const role = getMaterialRole(material.name)
      if (role === 'glass') {
        if (!replacements.has(material)) replacements.set(material, createGlassMaterial(material, GLASS_PROFILES[material.name]))
        return replacements.get(material)
      }
      if (role === 'controlledEmitter') {
        if (!replacements.has(material)) {
          replacements.set(material, createLampSurfaceMaterial(material, LAMP_LENS_PROFILES[material.name]))
        }
        return replacements.get(material)
      }
      // One shared cover material serves both ends of the car, so the replacement is
      // cached per (material, family) and the family is tagged for the clone pass.
      const coverProfiles = LAMP_COVERS[material.name]
      if (coverProfiles) {
        const family = lampFamilyForNode(node)
        if (!family) return material
        const key = `${material.name}:${family}`
        if (!replacements.has(key)) {
          const lens = createLensMaterial(material, coverProfiles[family])
          lens.userData.lampCover = family
          replacements.set(key, lens)
        }
        return replacements.get(key)
      }
      return material
    })
    if (materials.some((material, index) => material !== sourceMaterials[index])) {
      node.material = wasArray ? materials : materials[0]
    }

    const glassMaterials = materials.filter((material) => getMaterialRole(material?.name) === 'glass')
    const lensMaterials = materials.filter((material) => getMaterialRole(material?.name) === 'controlledEmitter'
      || material?.userData?.lampCover)

    if (glassMaterials.length) {
      node.castShadow = false
      node.receiveShadow = false
      node.renderOrder = Math.max(...glassMaterials.map((material) => GLASS_PROFILES[material.name].renderOrder))
    }
    if (lensMaterials.length) {
      node.castShadow = false
      node.renderOrder = Math.max(...lensMaterials.map((material) => {
        const profile = material.userData.lampCover
          ? LAMP_COVERS[material.name][material.userData.lampCover]
          : LAMP_LENS_PROFILES[material.name]
        return material.userData.lampCover ? LENS_FINISH[profile.kind].renderOrder : profile.renderOrder
      }))
    }

    for (const material of materials) {
      if (!material || processed.has(material)) continue
      processed.add(material)
      const role = getMaterialRole(material.name)
      if (!role) throw new Error(`模型包含未分类材质：${material.name || '(未命名)'}`)
      material.userData.vehicleMaterialRole = role

      if (role === 'glass') {
        material.needsUpdate = true
        continue
      }

      // Lamp lenses and lamp covers were built by `createLensMaterial`, and the cover is
      // shared with the tail cluster, so the role branch must not repaint either of them.
      if (role === 'controlledEmitter' || material.userData?.lampCover) {
        material.needsUpdate = true
        continue
      }

      if (role === 'passiveReflector') {
        applySurfaceProfile(material, PASSIVE_EMISSIVE_PRESETS[material.name], 0.24)
        setEmissionOff(material)
        material.needsUpdate = true
        continue
      }

      if (role === 'lampShell') {
        applySurfaceProfile(material, LAMP_SHELL_PRESETS[material.name], 0.38)
        material.needsUpdate = true
        continue
      }

      if (role === 'metal') {
        applySurfaceProfile(material, METAL_PRESETS[material.name], material.name === 'mirror_inside.0' ? 0.46 : 0.4)
        material.needsUpdate = true
        continue
      }

      if (role === 'interior') {
        material.color.set('#2b3034')
        material.metalness = 0
        material.roughness = Math.max(material.roughness, 0.72)
        material.envMapIntensity = 0.16
        material.needsUpdate = true
        continue
      }

      if (role === 'tyre') {
        material.color.set('#292b2d')
        material.metalness = 0
        material.roughness = 0.94
        material.envMapIntensity = 0.18
        material.needsUpdate = true
        continue
      }

      if (role === 'rim') {
        material.envMapIntensity = 0.42
        material.needsUpdate = true
        continue
      }

      if (role === 'blackPlastic') {
        if (BLACK_PLASTIC_COLORS[material.name]) material.color.set(BLACK_PLASTIC_COLORS[material.name])
        material.metalness = Math.min(material.metalness, 0.12)
        material.roughness = Math.max(material.roughness, 0.56)
        material.envMapIntensity = 0.24
        material.needsUpdate = true
        continue
      }

      if (role === 'paint') {
        material.envMapIntensity = 0.52
        material.needsUpdate = true
        continue
      }

      if (role === 'screen') {
        material.emissiveIntensity = 0.14
        material.envMapIntensity = 0.15
        material.needsUpdate = true
      }
    }
  })
}

/**
 * Index the materials a model is actually rendering, keyed by their authored name.
 *
 * Built after cloning, so the index resolves to the per-mesh clones the meshes use —
 * addressing the pre-clone originals would repaint nothing.
 */
export function indexMaterialsByName(vehicle) {
  const byName = new Map()
  vehicle.traverse((node) => {
    if (!node.isMesh) return
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material?.name) continue
      if (!byName.has(material.name)) byName.set(material.name, [])
      if (!byName.get(material.name).includes(material)) byName.get(material.name).push(material)
    }
  })
  return byName
}

/**
 * Recolour the exterior trim that follows the body colour.
 *
 * Called whenever the paint changes. Handles take the selected paint colour while the
 * front intake and lower cladding are reset to a neutral graphite finish.
 */
export function applyPaintLinkedTrim(materialsByName, paintPreset) {
  if (!materialsByName?.size) return
  const paint = new THREE.Color(paintPreset.color)

  for (const name of PAINT_LINKED_TRIM.handles) {
    for (const material of materialsByName.get(name) ?? []) {
      if (!material?.color) continue
      material.color.copy(paint)
      material.metalness = Math.min(paintPreset.metalness, 0.55)
      material.roughness = Math.min(paintPreset.roughness + 0.08, 0.6)
      material.envMapIntensity = 0.38
      material.needsUpdate = true
    }
  }

  for (const name of PAINT_LINKED_TRIM.graphite) {
    for (const material of materialsByName.get(name) ?? []) {
      if (!material?.color) continue
      material.color.set(GRAPHITE_TRIM.color)
      material.metalness = GRAPHITE_TRIM.metalness
      material.roughness = GRAPHITE_TRIM.roughness
      material.envMapIntensity = GRAPHITE_TRIM.envMapIntensity
      material.needsUpdate = true
    }
  }
}

/** Every material the vehicle controller is allowed to mutate. */
export function collectMutableMaterialNames() {
  return new Set([
    PAINT_MATERIAL,
    ...RIM_MATERIALS,
    ...Object.values(LIGHT_MATERIALS).flat(),
    ...PAINT_LINKED_TRIM.handles,
    ...PAINT_LINKED_TRIM.graphite,
    ...LAMP_COVER_NAMES,
  ])
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
    trim: [],
    lampCovers: Object.fromEntries(LAMP_COVER_FAMILIES.map((family) => [family, []])),
    lights: Object.fromEntries(Object.keys(LIGHT_MATERIALS).map((id) => [id, []])),
  }
  const lightByMaterial = new Map()
  for (const [id, names] of Object.entries(LIGHT_MATERIALS)) {
    for (const name of names) lightByMaterial.set(name, id)
  }
  const trimNames = new Set([...PAINT_LINKED_TRIM.handles, ...PAINT_LINKED_TRIM.graphite])

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
      if (trimNames.has(name)) groups.trim.push(clone)
      const cover = clone.userData?.lampCover
      if (cover && groups.lampCovers[cover]) groups.lampCovers[cover].push(clone)
      const lightId = lightByMaterial.get(name)
      if (lightId) groups.lights[lightId].push(clone)
      return clone
    })
    if (replaced) node.material = Array.isArray(node.material) ? next : next[0]
  })

  return groups
}
