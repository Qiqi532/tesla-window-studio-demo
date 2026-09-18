/**
 * Single source of truth for the Tesla Model 3 node and material mapping.
 *
 * This module intentionally has no imports: both the runtime (`vehicle.js`) and the
 * build-time model check (`scripts/verify-model.mjs`) read it, so the required parts
 * cannot drift apart from the code that drives them.
 *
 * Node names below are the raw glTF names. `GLTFLoader` strips `.`, `:`, `/`, `[` and
 * `]` from node names, so every lookup goes through `normalizePartName()`.
 */

export function normalizePartName(value) {
  return String(value ?? '').replace(/[^a-z0-9_-]/gi, '').toLowerCase()
}

export const VEHICLE_MODEL_PATH = 'public/assets/tesla-model-3-2018.glb'

/** Root group of the vehicle hierarchy inside the GLB. */
export const VEHICLE_ROOT_NODE = 'Tesla Model 3'

export const WINDOW_IDS = Object.freeze(['FL', 'FR', 'RL', 'RR'])
export const DOOR_IDS = Object.freeze(['FL', 'FR', 'RL', 'RR'])
export const TRUNK_IDS = Object.freeze(['frunk', 'trunk'])

export const WINDOW_LABELS = Object.freeze({
  FL: '驾驶位 · 左前',
  FR: '副驾驶 · 右前',
  RL: '左后车窗',
  RR: '右后车窗',
})

/**
 * Sliding glass panes. Each pane belongs to exactly one door, which lets the door
 * click target leave the glass area to the window picker.
 */
export const WINDOW_NODES = Object.freeze({
  FL: 'door_lf_glass.0_0',
  FR: 'door_rf_glass.0_0',
  RL: 'door_lr_glass.0_0',
  RR: 'door_rr_glass.0_0',
})

/**
 * Door pivots. Each dummy sits on the door hinge line (front edge, mid height) and
 * its local Z axis points along the world vertical, so a Z rotation swings the door.
 * Angles come from the model author's own dummy orientation.
 */
export const DOOR_PARTS = Object.freeze({
  FL: { node: 'door_lf_dummy', label: '左前车门', axis: 'z', angle: -1.08 },
  RL: { node: 'door_lr_dummy', label: '左后车门', axis: 'z', angle: -1.02 },
  FR: { node: 'door_rf_dummy', label: '右前车门', axis: 'z', angle: 1.08 },
  RR: { node: 'door_rr_dummy', label: '右后车门', axis: 'z', angle: 1.02 },
})

/**
 * Front and rear lids. Both hinge on the local X axis: the frunk pivots at its rear
 * edge and the trunk at its top edge, hence the opposite sign.
 */
export const TRUNK_PARTS = Object.freeze({
  frunk: { node: 'bonnet_dummy', label: '前备箱', axis: 'x', angle: 0.58 },
  trunk: { node: 'boot_dummy', label: '后备箱', axis: 'x', angle: -0.82 },
})

/**
 * The model only exposes one whole-axle group per end, so wheels roll as complete
 * axles. There is no left/right wheel pivot, no steering knuckle and no suspension
 * link, and this project does not pretend otherwise.
 */
export const AXLE_PARTS = Object.freeze({
  front: { node: 'wheels', label: '前轮轴', zRange: [-215, -135] },
  rear: { node: 'wheels.001', label: '后轮轴', zRange: [105, 185] },
})

/**
 * Emissive light-cone rigs. Anchor positions are measured from the real light meshes
 * at runtime and parented to the vehicle group, so the cones never float loose.
 *
 * `split: true` means a single node spans both headlights, so two cones are placed at
 * the left and right ends of its bounds. `split: false` means one node per side.
 */
export const LIGHT_CONES = Object.freeze({
  headlight: Object.freeze({
    nodes: Object.freeze(['chrome_Lights_head_l']),
    split: true,
    color: '#fff2cf',
    intensity: 105,
    angle: 0.42,
    penumbra: 0.5,
    distance: 17,
    decay: 1.65,
    drop: 0.045,
  }),
  fog: Object.freeze({
    nodes: Object.freeze(['foglights_l', 'foglights_r']),
    split: false,
    color: '#ffcf94',
    intensity: 34,
    angle: 0.55,
    penumbra: 0.62,
    distance: 9,
    decay: 1.9,
    drop: 0.12,
  }),
})

/**
 * Additive light shafts drawn from the lamp meshes. They only appear in the dark scenes,
 * where a beam through the air is what actually sells the lamps; in daylight they would
 * read as grey cones.
 */
export const LIGHT_BEAMS = Object.freeze({
  headlight: Object.freeze({
    color: '#fff0cd',
    length: 14,
    radius: 1.5,
    opacity: 0.14,
    drop: 0.03,
  }),
  fog: Object.freeze({
    color: '#ffd9a6',
    length: 6.5,
    radius: 1.1,
    opacity: 0.09,
    drop: 0.1,
  }),
})

/** Materials that make up the rim assembly, keyed by the light they belong to. */
export const LIGHT_MATERIALS = Object.freeze({
  headlight: Object.freeze(['left_front_light', 'right_front_light']),
  fog: Object.freeze(['foglight_l', 'foglight_r']),
  tail: Object.freeze(['left_rear_light', 'right_rear_light']),
  brake: Object.freeze(['breaklight_l']),
  reverse: Object.freeze(['revlight_L']),
})

export const LIGHT_IDS = Object.freeze([
  'headlight', 'fog', 'tail', 'brake', 'reverse',
])

/** Lights the driver switches directly; brake and reverse follow the gear and speed. */
export const MANUAL_LIGHT_IDS = Object.freeze(['headlight', 'fog', 'tail'])

export const LIGHT_LABELS = Object.freeze({
  headlight: '前大灯',
  fog: '雾灯',
  tail: '尾灯',
  brake: '刹车灯',
  reverse: '倒车灯',
})

/** Emissive tint and peak intensity per light, applied to cloned materials. */
export const LIGHT_APPEARANCE = Object.freeze({
  headlight: { color: '#fff3d4', intensity: 2.9 },
  fog: { color: '#ffd9a0', intensity: 2.1 },
  tail: { color: '#ff2f34', intensity: 1.9 },
  brake: { color: '#ff1d28', intensity: 4.2 },
  reverse: { color: '#f4f8ff', intensity: 2.6 },
})

/**
 * Exterior trim with finishes derived from its real-world role.
 *
 * `handles` keeps the selected body colour. `graphite` covers the front intake and lower
 * cladding, which remain neutral rather than inheriting red, blue or silver paint hues.
 *
 * Every name here is cloned per mesh before recolouring, exactly like paint and rims,
 * so the shared originals elsewhere in the model are never repainted.
 */
export const PAINT_LINKED_TRIM = Object.freeze({
  handles: Object.freeze(['primary.002', 'primary.004']),
  graphite: Object.freeze(['front_black.0', 'dvorright.0', 'hitam.0', 'wheels.1']),
})

/** Neutral lower-body finish; it never inherits the selected paint hue. */
export const GRAPHITE_TRIM = Object.freeze({
  color: '#18191a',
  metalness: 0.08,
  roughness: 0.58,
  envMapIntensity: 0.22,
})

/** Body paint. `primary` is the only untextured body-colour material on the shell. */
export const PAINT_MATERIAL = 'primary'

/**
 * Rim materials, derived from the model geometry: the front tyre disc measures
 * ~74.6 units, `wheels.4` (~41.1) and `wheels.6` (~58.3) sit inside it, and the
 * `hub_*` materials cover the centre caps. Tyre materials stay untouched so a rim
 * preset never turns the rubber grey.
 */
export const RIM_MATERIALS = Object.freeze(['wheels.4', 'wheels.6', 'hub_rb.0', 'hub_rf.0', 'hub_rf.1'])

export const PAINT_PRESETS = Object.freeze({
  obsidian: { label: '曜石黑', color: '#171615', metalness: 0.62, roughness: 0.24 },
  silver: { label: '液态银', color: '#b9bbb6', metalness: 0.78, roughness: 0.16 },
  burgundy: { label: '勃艮第红', color: '#651f2a', metalness: 0.5, roughness: 0.22 },
  ivory: { label: '象牙白', color: '#e5dcc4', metalness: 0.42, roughness: 0.2 },
  blue: { label: '午夜蓝', color: '#102b54', metalness: 0.68, roughness: 0.18 },
})

export const WHEEL_PRESETS = Object.freeze({
  turbine: { label: '涡流 21"', color: '#6f706d', metalness: 0.72, roughness: 0.28 },
  monoblock: { label: '单体 20"', color: '#b7b8b5', metalness: 0.86, roughness: 0.16 },
  carbon: { label: '碳黑 22"', color: '#171817', metalness: 0.55, roughness: 0.42 },
})

export const GEARS = Object.freeze(['P', 'D', 'R'])

/** Visual speed limits in km/h. These are display values, not vehicle physics. */
export const GEAR_SPEED_LIMITS = Object.freeze({ P: 0, D: 80, R: 15 })
export const GEAR_DEFAULT_SPEED = Object.freeze({ P: 0, D: 30, R: 8 })

/** Scene units travelled per km/h of visual speed, kept from the daylight road tuning. */
export const SCENE_UNITS_PER_KMH = 0.18

/** Nodes the runtime resolves. Missing any of these is a hard failure. */
export const REQUIRED_NODES = Object.freeze([
  VEHICLE_ROOT_NODE,
  ...Object.values(DOOR_PARTS).map((part) => part.node),
  ...Object.values(TRUNK_PARTS).map((part) => part.node),
  ...Object.values(AXLE_PARTS).map((part) => part.node),
  ...Object.values(WINDOW_NODES),
  ...Object.values(LIGHT_CONES).flatMap((entry) => entry.nodes),
])

/** Materials the runtime requires for paint, rims and every light group. */
export const REQUIRED_MATERIALS = Object.freeze([
  PAINT_MATERIAL,
  ...RIM_MATERIALS,
  ...Object.values(LIGHT_MATERIALS).flat(),
])

/**
 * Node name fragments that would indicate independent wheel / steering geometry.
 * The check reports them instead of failing, so a future model swap forces a
 * conscious decision rather than a silent behaviour change.
 */
export const UNSUPPORTED_NODE_HINTS = Object.freeze([
  'wheel_lf', 'wheel_lr', 'wheel_rr', 'charge', 'wiper', 'charging', 'suspens',
])
