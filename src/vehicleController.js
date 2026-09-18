import * as THREE from 'three'
import {
  DOOR_IDS,
  DOOR_PARTS,
  GEARS,
  GEAR_DEFAULT_SPEED,
  GEAR_SPEED_LIMITS,
  LIGHT_APPEARANCE,
  LIGHT_BEAMS,
  LIGHT_CONES,
  LIGHT_IDS,
  LIGHT_LABELS,
  MANUAL_LIGHT_IDS,
  PAINT_PRESETS,
  SCENE_UNITS_PER_KMH,
  TRUNK_IDS,
  TRUNK_PARTS,
  WHEEL_PRESETS,
  WINDOW_IDS,
} from './vehicleParts.js'
import { applyPaintLinkedTrim } from './vehicleMaterials.js'

/**
 * Command types accepted by `VehicleController.dispatch()`. Buttons, model clicks and
 * the (future) voice layer all funnel through these, so behaviour can never diverge
 * between input methods.
 */
export const COMMAND_TYPES = Object.freeze([
  'set-window', 'set-door', 'set-trunk', 'set-light', 'set-gear', 'set-speed', 'set-paint', 'set-wheel-style',
])

/** Lights the driver toggles directly. Brake and reverse follow the gear and the speed. */
export const TOGGLEABLE_LIGHTS = Object.freeze([
  ...MANUAL_LIGHT_IDS,
])
export const AUTOMATIC_LIGHTS = Object.freeze(['brake', 'reverse'])

const HINGE_DAMPING = 5.6
const SPEED_DAMPING = 0.95
const LIGHT_RAMP_UP = 6.2
const LIGHT_RAMP_DOWN = 10.5
const SETTLE_EPSILON = 0.002
const MOVING_TOLERANCE_KMH = 1
const MAX_STEP_SECONDS = 0.1

export const PART_LABELS = Object.freeze({
  ...Object.fromEntries(Object.entries(DOOR_PARTS).map(([id, part]) => [id, part.label])),
  ...Object.fromEntries(Object.entries(TRUNK_PARTS).map(([id, part]) => [id, part.label])),
})

/** Exponential smoothing, matching `THREE.MathUtils.damp` without depending on three. */
function damp(current, target, lambda, delta) {
  return target + (current - target) * Math.exp(-lambda * delta)
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function toLevel(value) {
  if (value === true || value === 1 || value === 'open' || value === 'on') return 1
  if (value === false || value === 0 || value === 'close' || value === 'off') return 0
  return null
}

function normalizeTargets(targets, allowed) {
  const list = Array.isArray(targets) ? targets : targets === undefined || targets === null ? [] : [targets]
  const valid = []
  const invalid = []
  for (const target of list) {
    if (allowed.includes(target)) {
      if (!valid.includes(target)) valid.push(target)
    } else {
      invalid.push(String(target))
    }
  }
  return { valid, invalid }
}

/* ------------------------------------------------------------------ state --- */

/**
 * Pure vehicle state machine. Holds no three.js object, so the interlocks and the
 * animation stepping can be exercised in plain Node tests.
 */
export function createVehicleState() {
  const hingeGroup = (ids) => Object.fromEntries(ids.map((id) => [id, { current: 0, target: 0 }]))
  const state = {
    doors: hingeGroup(DOOR_IDS),
    trunks: hingeGroup(TRUNK_IDS),
    switches: Object.fromEntries(TOGGLEABLE_LIGHTS.map((id) => [id, 0])),
    illumination: Object.fromEntries(LIGHT_IDS.map((id) => [id, 0])),
    gear: 'P',
    speed: 0,
    targetSpeed: 0,
    paint: 'obsidian',
    wheelStyle: 'turbine',
  }
  const subscribers = new Set()

  const openPartIds = () => Object.entries({ ...state.doors, ...state.trunks })
    .filter(([, entry]) => entry.target !== 0 || entry.current > SETTLE_EPSILON)
    .map(([id]) => id)

  const driveLocked = () => state.gear !== 'P'

  const getState = () => ({
    doors: Object.fromEntries(Object.entries(state.doors).map(([id, entry]) => [id, { ...entry }])),
    trunks: Object.fromEntries(Object.entries(state.trunks).map(([id, entry]) => [id, { ...entry }])),
    switches: { ...state.switches },
    illumination: { ...state.illumination },
    gear: state.gear,
    speed: state.speed,
    targetSpeed: state.targetSpeed,
    paint: state.paint,
    wheelStyle: state.wheelStyle,
    driving: driveLocked(),
    opened: Object.entries({ ...state.doors, ...state.trunks })
      .filter(([, entry]) => entry.target === 1)
      .map(([id]) => id),
    openParts: openPartIds(),
  })

  const notify = () => {
    const snapshot = getState()
    subscribers.forEach((listener) => listener(snapshot))
  }

  const fail = (code, detail) => ({ ok: false, changed: [], code, detail })
  const done = (changed, code, detail) => ({ ok: true, changed, code, detail })

  const setHinge = (group, targets, open) => {
    const changed = []
    for (const id of targets) {
      if (group[id].target === open) continue
      group[id].target = open
      changed.push(id)
    }
    return changed
  }

  return {
    getState,
    subscribe(listener) {
      subscribers.add(listener)
      listener(getState())
      return () => subscribers.delete(listener)
    },

    /** Apply one standard command object. Returns a structured result, never throws. */
    dispatch(command) {
      const type = command?.type
      if (!COMMAND_TYPES.includes(type) || type === 'set-window') return fail('unknown-command', { type: String(type) })

      if (type === 'set-door' || type === 'set-trunk') {
        const isDoor = type === 'set-door'
        const group = isDoor ? state.doors : state.trunks
        const { valid, invalid } = normalizeTargets(command.targets, isDoor ? DOOR_IDS : TRUNK_IDS)
        if (invalid.length) return fail('invalid-target', { targets: invalid })
        if (!valid.length) return fail('invalid-target', { targets: [] })
        const open = toLevel(command.value)
        if (open === null) return fail('invalid-value', { value: command.value })
        if (open === 1 && driveLocked()) {
          return fail(isDoor ? 'door-locked-while-driving' : 'trunk-locked-while-driving', { gear: state.gear })
        }
        const changed = setHinge(group, valid, open)
        if (changed.length) notify()
        return done(changed, open ? 'opened' : 'closed', { targets: valid })
      }

      if (type === 'set-light') {
        const { valid, invalid } = normalizeTargets(command.targets, [...TOGGLEABLE_LIGHTS, ...AUTOMATIC_LIGHTS])
        if (invalid.length) return fail('invalid-target', { targets: invalid })
        if (!valid.length) return fail('invalid-target', { targets: [] })
        const automatic = valid.filter((id) => AUTOMATIC_LIGHTS.includes(id))
        if (automatic.length) return fail('light-is-automatic', { targets: automatic })
        const level = toLevel(command.value)
        if (level === null) return fail('invalid-value', { value: command.value })
        const changed = valid.filter((id) => {
          if (state.switches[id] === level) return false
          state.switches[id] = level
          return true
        })
        if (changed.length) notify()
        return done(changed, level ? 'lights-on' : 'lights-off', { targets: valid })
      }

      if (type === 'set-gear') {
        const gear = typeof command.value === 'string' ? command.value.toUpperCase() : command.value
        if (!GEARS.includes(gear)) return fail('invalid-value', { value: command.value })
        if (gear === state.gear) return done([], 'gear-unchanged', { gear })

        if (gear !== 'P') {
          const open = openPartIds()
          if (open.length) return fail('gear-blocked-open-parts', { gear, parts: open })
          if (state.gear !== 'P' && state.speed > MOVING_TOLERANCE_KMH) {
            return fail('gear-blocked-moving', { gear, from: state.gear, speed: state.speed })
          }
        }

        const previous = state.gear
        state.gear = gear
        state.targetSpeed = GEAR_DEFAULT_SPEED[gear]
        if (gear === 'P') state.speed = 0
        notify()
        return done([gear], 'gear-changed', { gear, from: previous, speed: state.targetSpeed })
      }

      if (type === 'set-speed') {
        if (state.gear === 'P') return fail('speed-needs-gear', { gear: state.gear })
        const numeric = Number(command.value)
        if (!Number.isFinite(numeric)) return fail('invalid-value', { value: command.value })
        const limit = GEAR_SPEED_LIMITS[state.gear]
        const next = clamp(numeric, 0, limit)
        const clamped = next !== numeric
        if (state.targetSpeed === next) return done([], 'speed-unchanged', { speed: next, gear: state.gear, limit, clamped })
        state.targetSpeed = next
        notify()
        return done([next], 'speed-changed', { speed: next, gear: state.gear, limit, clamped: next !== numeric })
      }

      if (type === 'set-paint') {
        if (!Object.hasOwn(PAINT_PRESETS, command.value)) return fail('invalid-value', { value: command.value })
        if (state.paint === command.value) return done([], 'paint-unchanged', { paint: command.value })
        state.paint = command.value
        notify()
        return done([command.value], 'paint-changed', { paint: command.value })
      }

      if (type === 'set-wheel-style') {
        if (!Object.hasOwn(WHEEL_PRESETS, command.value)) return fail('invalid-value', { value: command.value })
        if (state.wheelStyle === command.value) return done([], 'wheel-unchanged', { wheelStyle: command.value })
        state.wheelStyle = command.value
        notify()
        return done([command.value], 'wheel-changed', { wheelStyle: command.value })
      }

      return fail('unknown-command', { type: String(type) })
    },

    /** Step the hinge animation, speed model and automatic lamps. */
    advance(delta) {
      const step = clamp(Number.isFinite(delta) ? delta : 0, 0, MAX_STEP_SECONDS)

      for (const group of [state.doors, state.trunks]) {
        for (const entry of Object.values(group)) {
          const next = damp(entry.current, entry.target, HINGE_DAMPING, step)
          entry.current = Math.abs(next - entry.target) < SETTLE_EPSILON ? entry.target : next
        }
      }

      if (state.gear === 'P') state.targetSpeed = 0
      state.targetSpeed = clamp(state.targetSpeed, 0, GEAR_SPEED_LIMITS[state.gear])
      const nextSpeed = damp(state.speed, state.targetSpeed, SPEED_DAMPING, step)
      state.speed = Math.abs(nextSpeed - state.targetSpeed) < 0.05 ? state.targetSpeed : nextSpeed

      const decelerating = state.speed - state.targetSpeed > 0.05
      const gearActive = state.gear !== 'P'
      state.illumination = {
        headlight: state.switches.headlight,
        fog: state.switches.fog,
        tail: state.switches.tail,
        brake: gearActive && (decelerating || state.targetSpeed === 0) ? 1 : 0,
        reverse: state.gear === 'R' ? 1 : 0,
      }

      return getState()
    },

    dispose() {
      subscribers.clear()
    },
  }
}

/* -------------------------------------------------------------- messages --- */

const MESSAGE_BY_CODE = {
  'unknown-command': (detail) => `未识别的车辆命令：${detail.type ?? '未知'}。`,
  'invalid-target': (detail) => (detail.targets?.length
    ? `无法识别的部件：${detail.targets.join('、')}。`
    : '没有指定要操作的部件，请补充位置，例如“左前车门”。'),
  'invalid-value': () => '操作取值无效，请重试。',
  'door-locked-while-driving': (detail) => `${detail.gear} 档行驶中车门已锁定，请先切回 P 档。`,
  'trunk-locked-while-driving': (detail) => `${detail.gear} 档行驶中备箱已锁定，请先切回 P 档。`,
  'light-is-automatic': (detail) => `${detail.targets.map((id) => LIGHT_LABELS[id]).join('、')}由档位与车速自动控制，不需要手动开关。`,
  'gear-blocked-open-parts': (detail) => `${detail.parts.map((id) => PART_LABELS[id]).join('、')}尚未关闭，无法进入 ${detail.gear} 档。`,
  'gear-blocked-moving': (detail) => `当前 ${detail.speed.toFixed(0)} km/h 仍在移动，请先停车再切换 ${detail.from} → ${detail.gear} 档。`,
  'speed-needs-gear': () => '请先挂入 D 或 R 档再调整速度。',
  'window-unavailable': () => '车窗控制尚未就绪。',
}

export function describeCommand(result) {
  if (!result.ok) return MESSAGE_BY_CODE[result.code]?.(result.detail ?? {}) ?? '操作未执行。'
  const { code, detail, changed } = result

  switch (code) {
    case 'opened':
    case 'closed': {
      const subject = detail.targets.map((id) => PART_LABELS[id]).join('、')
      const verb = code === 'opened' ? '打开' : '关闭'
      return changed.length ? `${subject}已${verb}。` : `${subject}已经${verb}。`
    }
    case 'lights-on':
    case 'lights-off': {
      const subject = detail.targets.map((id) => LIGHT_LABELS[id]).join('、')
      const verb = code === 'lights-on' ? '打开' : '关闭'
      return changed.length ? `已${verb}${subject}。` : `${subject}已经${verb}。`
    }
    case 'gear-changed':
      return detail.gear === 'P'
        ? '已挂入 P 档，车辆已停止。'
        : `已挂入 ${detail.gear} 档，视觉速度 ${GEAR_DEFAULT_SPEED[detail.gear]} km/h。`
    case 'gear-unchanged':
      return `已经在 ${detail.gear} 档。`
    case 'speed-changed':
      return detail.clamped
        ? `${detail.gear} 档上限为 ${detail.limit} km/h，已调整到 ${detail.speed} km/h。`
        : `视觉速度已设为 ${detail.speed} km/h。`
    case 'speed-unchanged':
      return `视觉速度已经是 ${detail.speed} km/h。`
    case 'paint-changed':
      return `车漆已切换为${PAINT_PRESETS[detail.paint].label}。`
    case 'paint-unchanged':
      return `车漆已经是${PAINT_PRESETS[detail.paint].label}。`
    case 'wheel-changed':
      return `轮毂已切换为${WHEEL_PRESETS[detail.wheelStyle].label}。`
    case 'wheel-unchanged':
      return `轮毂已经是${WHEEL_PRESETS[detail.wheelStyle].label}。`
    default:
      return '操作已完成。'
  }
}

/* ----------------------------------------------------------- click targets --- */

/**
 * Invisible box that follows a hinged part, so clicking an opened door closes it.
 * For doors the box stops below the glass line: that area belongs to the window
 * picker, and overlapping targets would toggle both parts at once.
 */
function createHingeHitTarget(part, glassNode) {
  const { node } = part
  const worldBox = new THREE.Box3().setFromObject(node)
  if (worldBox.isEmpty()) return null

  if (glassNode) {
    const glassBox = new THREE.Box3().setFromObject(glassNode)
    const height = worldBox.max.y - worldBox.min.y
    if (glassBox.min.y > worldBox.min.y + height * 0.1) worldBox.max.y = glassBox.min.y - height * 0.02
  }

  const toLocal = node.matrixWorld.clone().invert()
  const localBox = new THREE.Box3()
  const corner = new THREE.Vector3()
  for (const x of [worldBox.min.x, worldBox.max.x]) {
    for (const y of [worldBox.min.y, worldBox.max.y]) {
      for (const z of [worldBox.min.z, worldBox.max.z]) {
        localBox.expandByPoint(corner.set(x, y, z).applyMatrix4(toLocal))
      }
    }
  }
  const size = localBox.getSize(new THREE.Vector3())
  if (!(size.x > 0 && size.y > 0 && size.z > 0)) return null

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 }),
  )
  hit.name = `hit-${part.group}-${part.id}`
  hit.position.copy(localBox.getCenter(new THREE.Vector3()))
  hit.castShadow = false
  hit.receiveShadow = false
  hit.userData.partGroup = part.group
  hit.userData.partId = part.id
  node.add(hit)
  return hit
}

/* ------------------------------------------------------------- controller --- */

export function createVehicleController({
  vehicle,
  scene,
  camera,
  canvas,
  windowController = null,
  feedback = () => {},
}) {
  const state = createVehicleState()
  const root = vehicle.root
  root.updateMatrixWorld(true)

  const hinges = [
    ...Object.values(vehicle.doors).map((part) => ({ ...part, group: 'door' })),
    ...Object.values(vehicle.trunks).map((part) => ({ ...part, group: 'trunk' })),
  ]

  const hitTargets = hinges
    .map((part) => createHingeHitTarget(part, part.group === 'door' ? vehicle.windows[part.id] : null))
    .filter(Boolean)

  /**
   * Every pickable part in one list. A single closest-hit raycaster then decides what a
   * click means, so overlapping parts can never both react to the same click.
   */
  const pickTargets = [...hitTargets, ...(windowController?.getHitTargets?.() ?? [])]

  /* --- emissive light cones anchored on the real light meshes --- */
  const coneGroup = new THREE.Group()
  coneGroup.name = 'vehicle-light-cones'
  root.add(coneGroup)
  const cones = {}
  const coneAnchors = {}
  for (const [id, entry] of Object.entries(LIGHT_CONES)) {
    const sources = vehicle.lightRig[id] ?? []
    const positions = []
    if (entry.split && sources.length === 1) {
      const box = new THREE.Box3().setFromObject(sources[0])
      const inset = (box.max.x - box.min.x) * 0.16
      const midY = (box.min.y + box.max.y) / 2
      const midZ = (box.min.z + box.max.z) / 2
      positions.push(new THREE.Vector3(box.min.x + inset, midY, midZ), new THREE.Vector3(box.max.x - inset, midY, midZ))
    } else {
      for (const source of sources) positions.push(new THREE.Box3().setFromObject(source).getCenter(new THREE.Vector3()))
    }
    coneAnchors[id] = positions
    cones[id] = positions.map((worldPosition) => {
      const localPosition = root.worldToLocal(worldPosition.clone())
      const light = new THREE.SpotLight(
        entry.color, entry.intensity, entry.distance, entry.angle, entry.penumbra, entry.decay,
      )
      light.position.copy(localPosition)
      light.castShadow = false
      light.visible = false
      // The car faces -Z inside the vehicle group, so the cone aims forward and slightly down.
      const target = new THREE.Object3D()
      target.position.copy(localPosition).add(new THREE.Vector3(0, -entry.drop * entry.distance, -entry.distance))
      coneGroup.add(light, target)
      light.target = target
      return light
    })
  }

  /**
   * Additive shafts that make the beams visible in air. A cone whose vertex colours fade
   * to black towards the far end reads as a soft falloff under additive blending, so no
   * custom shader is needed. They are only switched on in the dark scenes.
   */
  const beams = {}
  const beamGeometryCache = new Map()
  for (const [id, entry] of Object.entries(LIGHT_BEAMS)) {
    const anchors = coneAnchors[id]
    if (!anchors?.length) continue
    const key = `${entry.length}:${entry.radius}`
    if (!beamGeometryCache.has(key)) {
      const geometry = new THREE.CylinderGeometry(entry.radius * 0.1, entry.radius, entry.length, 20, 1, true)
      geometry.translate(0, -entry.length / 2, 0)
      const position = geometry.attributes.position
      const colors = new Float32Array(position.count * 3)
      for (let index = 0; index < position.count; index += 1) {
        const along = THREE.MathUtils.clamp(-position.getY(index) / entry.length, 0, 1)
        const value = (1 - along) ** 1.4
        colors[index * 3] = value
        colors[index * 3 + 1] = value
        colors[index * 3 + 2] = value
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      beamGeometryCache.set(key, geometry)
    }
    const geometry = beamGeometryCache.get(key)
    const direction = new THREE.Vector3(0, -entry.drop * entry.length, -entry.length).normalize()
    beams[id] = anchors.map((worldPosition) => {
      const localPosition = root.worldToLocal(worldPosition.clone())
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: entry.color,
        vertexColors: true,
        transparent: true,
        opacity: entry.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }))
      mesh.position.copy(localPosition)
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction)
      mesh.visible = false
      mesh.frustumCulled = false
      coneGroup.add(mesh)
      return mesh
    })
  }

  /* --- material presets (all targets are per-mesh clones) --- */
  const applyPaint = () => {
    const preset = PAINT_PRESETS[state.getState().paint]
    for (const material of vehicle.materials.paint) {
      material.color.set(preset.color)
      material.metalness = preset.metalness
      material.roughness = preset.roughness
    }
    // Handles follow the body colour; lower trim is refreshed to its neutral graphite
    // finish here so every paint preset keeps the same exterior-material contract.
    applyPaintLinkedTrim(vehicle.materialsByName, preset)
  }
  const applyWheelStyle = () => {
    const preset = WHEEL_PRESETS[state.getState().wheelStyle]
    for (const material of vehicle.materials.rims) {
      material.color.set(preset.color)
      material.metalness = preset.metalness
      material.roughness = preset.roughness
    }
  }
  applyPaint()
  applyWheelStyle()
  let lastPaint = state.getState().paint
  let lastWheelStyle = state.getState().wheelStyle

  /* --- frame stepping --- */
  const glow = Object.fromEntries(LIGHT_IDS.map((id) => [id, 0]))
  const applied = Object.fromEntries(LIGHT_IDS.map((id) => [id, -1]))
  let wheelAngle = 0
  let lastSignature = ''
  let darkScene = false

  const applyIllumination = (illumination, delta) => {
    for (const id of LIGHT_IDS) {
      const target = illumination[id]
      glow[id] = damp(glow[id], target, target > glow[id] ? LIGHT_RAMP_UP : LIGHT_RAMP_DOWN, delta)
      if (Math.abs(glow[id] - target) < 0.004) glow[id] = target
      if (Math.abs(glow[id] - applied[id]) < 0.004) continue
      applied[id] = glow[id]
      const appearance = LIGHT_APPEARANCE[id]
      for (const material of vehicle.materials.lights[id] ?? []) {
        material.emissive.set(appearance.color)
        material.emissiveIntensity = appearance.intensity * glow[id]
      }
    }
    for (const [id, group] of Object.entries(cones)) {
      const visible = (illumination[id] ?? 0) > 0.35
      for (const light of group) light.visible = visible
    }
    for (const [id, group] of Object.entries(beams)) {
      // A shaft through the air only reads in the dark; in daylight it looks like fog.
      const visible = darkScene && (illumination[id] ?? 0) > 0.35
      for (const mesh of group) mesh.visible = visible
    }
    applyLampCovers()
  }

  /**
   * The big translucent covers over the lamp clusters carry most of the lamp's visible
   * area, so they glow along with the emitter inside. The rear cover follows whichever of
   * tail / brake is currently brighter, which keeps the brake flash readable.
   */
  const applyLampCovers = () => {
    const covers = vehicle.materials.lampCovers
    if (!covers) return
    const headlight = LIGHT_APPEARANCE.headlight
    for (const material of covers.front) {
      material.emissive.set(headlight.color)
      material.emissiveIntensity = headlight.intensity * glow.headlight * 0.18
    }
    const braking = glow.brake > glow.tail
    const rear = braking ? LIGHT_APPEARANCE.brake : LIGHT_APPEARANCE.tail
    const rearGlow = Math.max(glow.tail, glow.brake)
    for (const material of covers.rear) {
      material.emissive.set(rear.color)
      material.emissiveIntensity = rear.intensity * rearGlow * 0.18
    }
  }

  const applyHinges = () => {
    const snapshot = state.getState()
    for (const part of hinges) {
      const entry = part.group === 'door' ? snapshot.doors[part.id] : snapshot.trunks[part.id]
      part.node.rotation[part.axis] = part.base + entry.current * part.angle
    }
  }

  /**
   * Scene units per second along the car's own forward axis. Negative in reverse, so
   * the wheel spin and the looped road both turn around when the gear does.
   */
  const roadSpeed = () => {
    const { gear, speed } = state.getState()
    return speed * SCENE_UNITS_PER_KMH * (gear === 'R' ? -1 : 1)
  }

  /* --- subscription plumbing: state changes and frame changes both notify --- */
  const stateSubscribers = new Set()

  const controller = {
    getState() {
      const snapshot = state.getState()
      return {
        ...snapshot,
        windows: windowController ? windowController.getState() : null,
        roadSpeed: roadSpeed(),
        wheelRadius: vehicle.wheelRadius,
      }
    },

    subscribe(listener) {
      stateSubscribers.add(listener)
      listener(controller.getState())
      return () => stateSubscribers.delete(listener)
    },

    /** Invisible part hit boxes, exposed so click targets can be inspected in tests. */
    getHitTargets() {
      return [...hitTargets]
    },

    /** Resolve a screen position to the single part a real click would toggle. */
    pickAt(clientX, clientY) {
      return resolvePick(clientX, clientY)
    },

    /**
     * Tell the controller whether the scene is dark enough for in-air light shafts.
     * The environment owns the lighting, so it is the one that decides; the controller
     * only reacts. Called every frame, so the guard keeps it free.
     */
    setDarkScene(enabled) {
      const next = Boolean(enabled)
      if (next === darkScene) return
      darkScene = next
      // Force the next illumination pass to re-evaluate beam visibility.
      for (const id of LIGHT_IDS) applied[id] = -1
    },

    /**
     * Lamp effects actually rendered right now: how many spot lights and in-air shafts
     * are switched on per light group. Exposed for the browser verification pass, which
     * cannot see the scene graph otherwise.
     */
    getLightEffectInfo() {
      const count = (groups) => Object.fromEntries(
        Object.entries(groups).map(([id, group]) => [id, group.filter((entry) => entry.visible).length]),
      )
      return { spots: count(cones), beams: count(beams), darkScene }
    },

    /**
     * Single entry point for buttons, model clicks and (later) voice commands.
     * Window commands forward to the window controller, so all four panes keep their
     * existing independent control and reverse-during-animation.
     */
    dispatch(command) {
      if (command?.type === 'set-window') {
        const fail = (code, detail) => {
          const result = { ok: false, changed: [], code, detail }
          return { ...result, message: describeCommand(result) }
        }
        if (!windowController) return fail('window-unavailable', {})
        const { valid, invalid } = normalizeTargets(command.targets, WINDOW_IDS)
        if (invalid.length || !valid.length) return fail('invalid-target', { targets: invalid })
        const open = toLevel(command.value)
        if (open === null) return fail('invalid-value', { value: command.value })

        const all = valid.length === WINDOW_IDS.length
        const changed = all
          ? windowController.setAllWindows(open === 1)
          : valid.filter((id) => windowController.setWindow(id, open === 1)).length > 0
        if (changed) emit()
        return {
          ok: true,
          changed: changed ? valid : [],
          code: changed ? 'windows-changed' : 'windows-unchanged',
          message: changed
            ? `已${open === 1 ? '打开' : '关闭'}${all ? '全部车窗' : '指定车窗'}。`
            : '车窗已经处于该状态。',
        }
      }

      const result = state.dispatch(command)
      return { ...result, message: describeCommand(result) }
    },

    update(delta) {
      windowController?.update(delta)
      const snapshot = state.advance(delta)
      applyHinges()

      if (snapshot.paint !== lastPaint) {
        lastPaint = snapshot.paint
        applyPaint()
      }
      if (snapshot.wheelStyle !== lastWheelStyle) {
        lastWheelStyle = snapshot.wheelStyle
        applyWheelStyle()
      }

      wheelAngle = -((roadSpeed() * delta) / vehicle.wheelRadius)
      for (const axle of Object.values(vehicle.axles)) {
        axle.angle += wheelAngle
        axle.node.rotation.x = axle.base + axle.angle
      }

      applyIllumination(snapshot.illumination, delta)

      const signature = [
        Math.round(snapshot.speed),
        snapshot.gear,
        snapshot.illumination.brake,
        snapshot.illumination.reverse,
        snapshot.opened.length,
      ].join('|')
      if (signature !== lastSignature) {
        lastSignature = signature
        emit()
      }
    },

    dispose() {
      stateSubscribers.clear()
      for (const hit of hitTargets) {
        hit.parent?.remove(hit)
        hit.geometry.dispose()
        hit.material.dispose()
      }
      for (const group of Object.values(cones)) {
        for (const light of group) {
          light.target?.removeFromParent()
          light.removeFromParent()
        }
      }
      root.remove(coneGroup)
      state.dispose()
    },
  }

  const emit = () => {
    const snapshot = controller.getState()
    stateSubscribers.forEach((listener) => listener(snapshot))
  }

  // Dispatch changes are reflected immediately: paint and rim presets must not wait
  // for the next animation frame, and UI subscribers are told about every change.
  state.subscribe((snapshot) => {
    if (snapshot.paint !== lastPaint) {
      lastPaint = snapshot.paint
      applyPaint()
    }
    if (snapshot.wheelStyle !== lastWheelStyle) {
      lastWheelStyle = snapshot.wheelStyle
      applyWheelStyle()
    }
    emit()
  })

  applyHinges()
  applyIllumination(state.advance(0).illumination, 0)

  /* --- pointer picking: one raycaster arbitrates windows, doors and lids --- */
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const resolvePick = (clientX, clientY) => {
    if (!pickTargets.length) return null
    const rect = canvas.getBoundingClientRect()
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObjects(pickTargets, false)[0]
    return hit ? { ...hit.object.userData, distance: Number(hit.distance.toFixed(4)) } : null
  }

  let pointerDown = null
  const onPointerDown = (event) => {
    if (event.button !== 0) return
    pointerDown = { x: event.clientX, y: event.clientY, id: event.pointerId }
  }
  const onPointerUp = (event) => {
    if (!pointerDown || pointerDown.id !== event.pointerId) return
    const movement = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
    pointerDown = null
    if (movement > 6) return
    const target = resolvePick(event.clientX, event.clientY)
    if (!target) return

    if (target.windowId) {
      const open = controller.getState().windows[target.windowId].target === 1 ? 0 : 1
      feedback(controller.dispatch({ type: 'set-window', targets: [target.windowId], value: open }).message)
      return
    }

    const snapshot = controller.getState()
    const group = target.partGroup === 'door' ? snapshot.doors : snapshot.trunks
    const open = group[target.partId].target === 1 ? 0 : 1
    feedback(controller.dispatch({
      type: target.partGroup === 'door' ? 'set-door' : 'set-trunk',
      targets: [target.partId],
      value: open,
    }).message)
  }
  const onPointerMove = (event) => {
    if (pointerDown) return
    canvas.style.cursor = resolvePick(event.clientX, event.clientY) ? 'pointer' : 'grab'
  }
  const onPointerCancel = () => { pointerDown = null }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointercancel', onPointerCancel)

  const baseDispose = controller.dispose
  controller.dispose = () => {
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointercancel', onPointerCancel)
    baseDispose()
  }

  return controller
}
