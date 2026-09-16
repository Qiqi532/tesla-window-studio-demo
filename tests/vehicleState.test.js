import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import {
  COMMAND_TYPES,
  TOGGLEABLE_LIGHTS,
  createVehicleController,
  createVehicleState,
  describeCommand,
} from '../src/vehicleController.js'
import { cloneMutableMaterials, collectMutableMaterialNames } from '../src/vehicleMaterials.js'
import {
  DOOR_IDS,
  LIGHT_IDS,
  PAINT_MATERIAL,
  PAINT_PRESETS,
  RIM_MATERIALS,
  SCENE_UNITS_PER_KMH,
  TRUNK_IDS,
  WHEEL_PRESETS,
  WINDOW_IDS,
} from '../src/vehicleParts.js'

const FRAME = 1 / 60

function advanceFor(state, seconds, step = FRAME) {
  const frames = Math.max(1, Math.round(seconds / step))
  let snapshot = state.getState()
  for (let index = 0; index < frames; index += 1) snapshot = state.advance(step)
  return snapshot
}

/* ------------------------------------------------------ state machine ------ */

test('标准命令类型固定为八种', () => {
  assert.deepEqual([...COMMAND_TYPES], [
    'set-window', 'set-door', 'set-trunk', 'set-light', 'set-gear', 'set-speed', 'set-paint', 'set-wheel-style',
  ])
})

test('车辆初始为 P 档、部件全关、灯光全灭、使用默认车漆与轮毂', () => {
  const snapshot = createVehicleState().getState()
  assert.equal(snapshot.gear, 'P')
  assert.equal(snapshot.speed, 0)
  assert.equal(snapshot.targetSpeed, 0)
  assert.equal(snapshot.driving, false)
  assert.deepEqual(snapshot.opened, [])
  assert.deepEqual(Object.keys(snapshot.doors), [...DOOR_IDS])
  assert.deepEqual(Object.keys(snapshot.trunks), [...TRUNK_IDS])
  for (const entry of [...Object.values(snapshot.doors), ...Object.values(snapshot.trunks)]) {
    assert.deepEqual(entry, { current: 0, target: 0 })
  }
  for (const level of Object.values(snapshot.illumination)) assert.equal(level, 0)
  assert.equal(snapshot.paint, 'obsidian')
  assert.equal(snapshot.wheelStyle, 'turbine')
})

test('未知命令、未知部件与无效取值都被拒绝并给出可读原因', () => {
  const state = createVehicleState()

  const unknownType = state.dispatch({ type: 'launch-rocket' })
  assert.equal(unknownType.ok, false)
  assert.equal(unknownType.code, 'unknown-command')
  assert.match(describeCommand(unknownType), /未识别的车辆命令/)

  const unknownPart = state.dispatch({ type: 'set-door', targets: ['left'], value: 1 })
  assert.equal(unknownPart.code, 'invalid-target')

  const missingPart = state.dispatch({ type: 'set-trunk', targets: [], value: 1 })
  assert.equal(missingPart.code, 'invalid-target')
  assert.match(describeCommand(missingPart), /没有指定要操作的部件/)

  const badValue = state.dispatch({ type: 'set-gear', value: 'X' })
  assert.equal(badValue.code, 'invalid-value')

  assert.equal(state.dispatch({ type: 'set-paint', value: 'neon' }).code, 'invalid-value')
  assert.equal(state.dispatch({ type: 'set-wheel-style', value: 'steel' }).code, 'invalid-value')
})

test('开关车门与备箱，重复命令不产生重复变更', () => {
  const state = createVehicleState()

  const opened = state.dispatch({ type: 'set-door', targets: ['FL', 'RR'], value: 1 })
  assert.equal(opened.ok, true)
  assert.deepEqual(opened.changed, ['FL', 'RR'])
  assert.deepEqual(state.getState().opened, ['FL', 'RR'])

  const again = state.dispatch({ type: 'set-door', targets: ['FL'], value: 1 })
  assert.deepEqual(again.changed, [])
  assert.match(describeCommand(again), /已经打开/)

  const trunk = state.dispatch({ type: 'set-trunk', targets: ['frunk'], value: 'open' })
  assert.deepEqual(trunk.changed, ['frunk'])

  const closed = state.dispatch({ type: 'set-door', targets: ['FL', 'RR'], value: 0 })
  assert.deepEqual(closed.changed, ['FL', 'RR'])
  assert.deepEqual(state.getState().opened, ['frunk'])
})

test('动画中反向折返保持单调、不跳变', () => {
  const state = createVehicleState()
  state.dispatch({ type: 'set-door', targets: ['FL'], value: 1 })
  advanceFor(state, 0.09)

  const mid = state.getState().doors.FL.current
  assert.ok(mid > 0.03 && mid < 0.97, `半开进度应在 (0,1) 区间，实际 ${mid}`)

  state.dispatch({ type: 'set-door', targets: ['FL'], value: 0 })
  let previous = mid
  let largestStep = 0
  for (let frame = 0; frame < 300; frame += 1) {
    const current = state.advance(FRAME).doors.FL.current
    assert.ok(current <= previous + 1e-9, '折返过程中进度必须单调下降')
    largestStep = Math.max(largestStep, Math.abs(current - previous))
    previous = current
  }
  assert.equal(previous, 0)
  assert.ok(largestStep < 0.2, `单帧最大变化应小于 0.2，实际 ${largestStep}`)
})

test('任一车门或备箱未关闭时拒绝进入 D 与 R，并指出未关闭的部件', () => {
  const state = createVehicleState()
  state.dispatch({ type: 'set-door', targets: ['RL'], value: 1 })
  state.dispatch({ type: 'set-trunk', targets: ['trunk'], value: 1 })

  for (const gear of ['D', 'R']) {
    const blocked = state.dispatch({ type: 'set-gear', value: gear })
    assert.equal(blocked.ok, false)
    assert.equal(blocked.code, 'gear-blocked-open-parts')
    assert.deepEqual(blocked.detail.parts.sort(), ['RL', 'trunk'])
    assert.match(describeCommand(blocked), /尚未关闭/)
  }
  assert.equal(state.getState().gear, 'P')

  state.dispatch({ type: 'set-door', targets: ['RL'], value: 0 })
  state.dispatch({ type: 'set-trunk', targets: ['trunk'], value: 0 })
  assert.equal(state.dispatch({ type: 'set-gear', value: 'D' }).ok, true)
  assert.equal(state.getState().gear, 'D')
})

test('行驶期间车门与备箱被锁定，但车灯仍可操作', () => {
  const state = createVehicleState()
  state.dispatch({ type: 'set-gear', value: 'D' })

  const door = state.dispatch({ type: 'set-door', targets: ['FR'], value: 1 })
  assert.equal(door.code, 'door-locked-while-driving')
  assert.deepEqual(door.changed, [])

  const trunk = state.dispatch({ type: 'set-trunk', targets: ['frunk'], value: 1 })
  assert.equal(trunk.code, 'trunk-locked-while-driving')

  // Closing stays available, and lights are never locked out.
  assert.equal(state.dispatch({ type: 'set-door', targets: ['FR'], value: 0 }).ok, true)
  assert.equal(state.dispatch({ type: 'set-light', targets: ['headlight'], value: 1 }).ok, true)
  assert.equal(state.getState().switches.headlight, 1)
})

test('D 与 R 之间切换需要先停车', () => {
  const state = createVehicleState()
  state.dispatch({ type: 'set-gear', value: 'D' })
  advanceFor(state, 4)
  assert.ok(state.getState().speed > 1)

  const blocked = state.dispatch({ type: 'set-gear', value: 'R' })
  assert.equal(blocked.code, 'gear-blocked-moving')
  assert.equal(state.getState().gear, 'D')

  const parked = state.dispatch({ type: 'set-gear', value: 'P' })
  assert.equal(state.getState().speed, 0)
  assert.equal(state.getState().targetSpeed, 0)
  assert.match(describeCommand(parked), /车辆已停止/)
  assert.equal(state.dispatch({ type: 'set-gear', value: 'R' }).ok, true)
  assert.equal(state.getState().gear, 'R')
})

test('速度受档位上限约束，P 档拒绝调整速度', () => {
  const state = createVehicleState()
  assert.equal(state.dispatch({ type: 'set-speed', value: 40 }).code, 'speed-needs-gear')

  state.dispatch({ type: 'set-gear', value: 'D' })
  assert.equal(state.getState().targetSpeed, 30)

  const tooFast = state.dispatch({ type: 'set-speed', value: 200 })
  assert.equal(tooFast.ok, true)
  assert.equal(tooFast.detail.clamped, true)
  assert.equal(state.getState().targetSpeed, 80)
  assert.match(describeCommand(tooFast), /上限为 80 km\/h/)

  state.dispatch({ type: 'set-gear', value: 'P' })
  advanceFor(state, 12)
  state.dispatch({ type: 'set-gear', value: 'R' })
  assert.equal(state.getState().targetSpeed, 8)
  state.dispatch({ type: 'set-speed', value: 15 })
  assert.equal(state.getState().targetSpeed, 15)
  assert.equal(state.dispatch({ type: 'set-speed', value: 60 }).detail.clamped, true)
  assert.equal(state.getState().targetSpeed, 15)
})

test('R 档自动打开倒车灯，减速与制动打开刹车灯', () => {
  const state = createVehicleState()
  state.dispatch({ type: 'set-gear', value: 'D' })
  advanceFor(state, 12)
  assert.equal(state.getState().speed, 30)
  assert.equal(state.getState().illumination.reverse, 0)
  assert.equal(state.getState().illumination.brake, 0)

  // Slowing down lights the brake lamps.
  state.dispatch({ type: 'set-speed', value: 0 })
  assert.equal(state.advance(FRAME).illumination.brake, 1)
  advanceFor(state, 12)
  assert.equal(state.getState().speed, 0)
  assert.equal(state.getState().illumination.brake, 1)

  state.dispatch({ type: 'set-gear', value: 'R' })
  const reversing = state.advance(FRAME)
  assert.equal(reversing.illumination.reverse, 1)

  state.dispatch({ type: 'set-gear', value: 'P' })
  assert.equal(state.advance(FRAME).illumination.reverse, 0)
})

test('刹车灯与倒车灯不接受手动开关', () => {
  const state = createVehicleState()
  const result = state.dispatch({ type: 'set-light', targets: ['brake'], value: 1 })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'light-is-automatic')
  assert.match(describeCommand(result), /自动控制/)

  assert.equal(state.dispatch({ type: 'set-light', targets: ['reverse'], value: 1 }).code, 'light-is-automatic')
})

test('只保留模型中可见的三组手动灯光', () => {
  assert.deepEqual([...TOGGLEABLE_LIGHTS], ['headlight', 'fog', 'tail'])
  const state = createVehicleState()
  for (const removed of ['interior', 'indicatorLeft', 'indicatorRight', 'hazard']) {
    assert.equal(state.dispatch({ type: 'set-light', targets: [removed], value: 1 }).code, 'invalid-target')
  }
})

test('车漆与轮毂预设只在取值变化时切换', () => {
  const state = createVehicleState()
  const changed = state.dispatch({ type: 'set-paint', value: 'blue' })
  assert.deepEqual(changed.changed, ['blue'])
  assert.match(describeCommand(changed), new RegExp(PAINT_PRESETS.blue.label))

  const repeated = state.dispatch({ type: 'set-paint', value: 'blue' })
  assert.deepEqual(repeated.changed, [])
  assert.equal(repeated.code, 'paint-unchanged')

  const wheels = state.dispatch({ type: 'set-wheel-style', value: 'carbon' })
  assert.deepEqual(wheels.changed, ['carbon'])
  assert.equal(state.getState().wheelStyle, 'carbon')
  assert.match(describeCommand(wheels), new RegExp(WHEEL_PRESETS.carbon.label))
})

test('状态变化会通知订阅者', () => {
  const state = createVehicleState()
  const seen = []
  const unsubscribe = state.subscribe((snapshot) => seen.push(snapshot.gear))
  state.dispatch({ type: 'set-gear', value: 'D' })
  state.dispatch({ type: 'set-gear', value: 'P' })
  unsubscribe()
  state.dispatch({ type: 'set-gear', value: 'D' })
  assert.deepEqual(seen, ['P', 'D', 'P'])
})

/* -------------------------------------------------- material cloning ------- */

test('可变材质按网格克隆，未列入的共享材质保持原样', () => {
  const paintOriginal = new THREE.MeshStandardMaterial({ name: PAINT_MATERIAL })
  const trimOriginal = new THREE.MeshStandardMaterial({ name: 'movsteer_1.0.1' })
  const fogOriginal = new THREE.MeshStandardMaterial({ name: 'foglight_l' })
  const rimOriginal = new THREE.MeshStandardMaterial({ name: RIM_MATERIALS[0] })

  const body = new THREE.Mesh(new THREE.BoxGeometry(), paintOriginal)
  const door = new THREE.Mesh(new THREE.BoxGeometry(), paintOriginal)
  const trim = new THREE.Mesh(new THREE.BoxGeometry(), trimOriginal)
  const fog = new THREE.Mesh(new THREE.BoxGeometry(), fogOriginal)
  const rim = new THREE.Mesh(new THREE.BoxGeometry(), rimOriginal)
  const root = new THREE.Group()
  root.add(body, door, trim, fog, rim)

  const groups = cloneMutableMaterials(root)

  assert.equal(groups.paint.length, 2, '车漆材质应按网格分别克隆')
  assert.equal(groups.rims.length, 1)
  assert.equal(groups.lights.fog.length, 1)

  assert.notEqual(body.material, paintOriginal)
  assert.notEqual(door.material, paintOriginal)
  assert.notEqual(body.material, door.material, '同一原材质的两个网格必须各持克隆')
  assert.equal(trim.material, trimOriginal, '未列入可变集合的材质不应被克隆')
  assert.equal(fog.material, groups.lights.fog[0])

  groups.paint.forEach((material) => material.color.set('#ff0000'))
  assert.notEqual(paintOriginal.color.getHex(), 0xff0000, '修改克隆不得污染原材质')
  assert.equal(trimOriginal.color.getHex(), new THREE.Color('#ffffff').getHex())

  const names = collectMutableMaterialNames()
  assert.ok(names.has(PAINT_MATERIAL) && names.has(RIM_MATERIALS[0]) && names.has('foglight_l'))
  assert.ok(!names.has('light_night'))
  assert.ok(!names.has('movsteer_1.0.1'))
})

/* ------------------------------------------------- controller wiring ------- */

function createFixture() {
  const scene = new THREE.Scene()
  const listeners = new Map()
  const root = new THREE.Group()
  root.rotation.y = Math.PI
  root.scale.setScalar(0.01)
  scene.add(root)

  const makeNode = (size = 1) => {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(new THREE.BoxGeometry(size, size, size)))
    return group
  }

  const doors = Object.fromEntries(DOOR_IDS.map((id) => [id, {
    id, node: makeNode(), label: id, axis: 'z', angle: id.endsWith('L') ? -0.6 : 0.6, base: 0,
  }]))
  const trunks = Object.fromEntries(TRUNK_IDS.map((id) => [id, {
    id, node: makeNode(), label: id, axis: 'x', angle: id === 'frunk' ? 0.5 : -0.6, base: 0,
  }]))
  const axles = {
    front: { id: 'front', node: makeNode(2), label: 'front', base: 0, angle: 0 },
    rear: { id: 'rear', node: makeNode(2), label: 'rear', base: 0, angle: 0 },
  }
  const windows = Object.fromEntries(WINDOW_IDS.map((id) => [id, makeNode(0.2)]))
  const lightRig = { headlight: [makeNode(0.6)], fog: [makeNode(0.2), makeNode(0.2)] }
  const materials = {
    paint: [new THREE.MeshStandardMaterial({ name: PAINT_MATERIAL })],
    rims: [new THREE.MeshStandardMaterial({ name: RIM_MATERIALS[0] })],
    lights: Object.fromEntries(LIGHT_IDS.map((id) => [id, [new THREE.MeshStandardMaterial({ name: id })]])),
  }

  const windowState = Object.fromEntries(WINDOW_IDS.map((id) => [id, { current: 0, target: 0 }]))
  const windowController = {
    getState: () => Object.fromEntries(Object.entries(windowState).map(([id, entry]) => [id, { ...entry }])),
    getHitTargets: () => [],
    setWindow(id, open) {
      const target = open ? 1 : 0
      if (windowState[id].target === target) return false
      windowState[id].target = target
      return true
    },
    setAllWindows(open) {
      let changed = false
      for (const id of WINDOW_IDS) {
        const target = open ? 1 : 0
        if (windowState[id].target === target) continue
        windowState[id].target = target
        changed = true
      }
      return changed
    },
    update() {},
  }

  const canvas = {
    style: {},
    addEventListener(type, listener) { listeners.set(type, listener) },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type)
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 200 }),
  }

  const vehicle = { root, windows, doors, trunks, axles, lightRig, materials, wheelRadius: 0.4 }
  return { vehicle, scene, canvas, listeners, windowController, windowState, materials }
}

test('统一拾取只切换最近的重叠部件，并在销毁时移除监听器', () => {
  const fixture = createFixture()
  const windowHit = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.4))
  windowHit.position.z = 2
  windowHit.userData.windowId = 'FL'
  fixture.scene.add(windowHit)
  fixture.windowController.getHitTargets = () => [windowHit]

  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 20)
  camera.position.set(0, 0, 5)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)

  const feedbackMessages = []
  const controller = createVehicleController({
    vehicle: fixture.vehicle,
    scene: fixture.scene,
    camera,
    canvas: fixture.canvas,
    windowController: fixture.windowController,
    feedback: (message) => feedbackMessages.push(message),
  })
  fixture.scene.updateMatrixWorld(true)

  assert.deepEqual(
    controller.getHitTargets().map((target) => `${target.userData.partGroup}:${target.userData.partId}`).sort(),
    ['door:FL', 'door:FR', 'door:RL', 'door:RR', 'trunk:frunk', 'trunk:trunk'],
  )
  assert.equal(controller.pickAt(160, 100).windowId, 'FL')
  fixture.listeners.get('pointerdown')({ button: 0, clientX: 160, clientY: 100, pointerId: 1 })
  fixture.listeners.get('pointerup')({ clientX: 160, clientY: 100, pointerId: 1 })

  assert.equal(fixture.windowState.FL.target, 1)
  assert.equal(controller.getState().doors.FL.target, 0, '重叠的车门不得同时打开')
  assert.equal(feedbackMessages.length, 1, '一次点击只应产生一次操作反馈')

  assert.deepEqual([...fixture.listeners.keys()].sort(), [
    'pointercancel', 'pointerdown', 'pointermove', 'pointerup',
  ])
  controller.dispose()
  assert.equal(fixture.listeners.size, 0)
})

test('控制器更新让车门转角、轮轴滚动与道路速度保持联动', () => {
  const fixture = createFixture()
  const controller = createVehicleController({
    vehicle: fixture.vehicle,
    scene: fixture.scene,
    camera: new THREE.PerspectiveCamera(),
    canvas: fixture.canvas,
    windowController: fixture.windowController,
    feedback: () => {},
  })

  // Doors stay shut and wheels stand still while parked.
  assert.equal(fixture.vehicle.doors.FL.node.rotation.z, 0)
  controller.update(FRAME)
  assert.equal(fixture.vehicle.axles.front.node.rotation.x, 0)
  assert.equal(controller.getState().roadSpeed, 0)

  controller.dispatch({ type: 'set-door', targets: ['FL'], value: 1 })
  for (let frame = 0; frame < 60; frame += 1) controller.update(FRAME)
  const doorAngle = fixture.vehicle.doors.FL.node.rotation.z
  assert.ok(doorAngle < -0.4, `左前车门应向外摆开，实际 ${doorAngle}`)
  assert.equal(fixture.vehicle.doors.FR.node.rotation.z, 0, '未操作的车门不应移动')

  controller.dispatch({ type: 'set-door', targets: ['FL'], value: 0 })
  for (let frame = 0; frame < 120; frame += 1) controller.update(FRAME)
  assert.equal(fixture.vehicle.doors.FL.node.rotation.z, 0)

  // Driving turns the wheels and moves the road at the same visual speed.
  controller.dispatch({ type: 'set-gear', value: 'D' })
  for (let frame = 0; frame < 60; frame += 1) controller.update(FRAME)
  const frontSpin = fixture.vehicle.axles.front.node.rotation.x
  const rearSpin = fixture.vehicle.axles.rear.node.rotation.x
  assert.ok(Math.abs(frontSpin) > 0.1, `前轮轴应滚动，实际 ${frontSpin}`)
  assert.equal(frontSpin.toFixed(6), rearSpin.toFixed(6), '前后轮轴必须同速滚动')

  const { speed, roadSpeed } = controller.getState()
  assert.ok(speed > 0)
  assert.equal(roadSpeed.toFixed(6), (speed * SCENE_UNITS_PER_KMH).toFixed(6))

  // Rolling back to a stop parks the wheels again.
  controller.dispatch({ type: 'set-gear', value: 'P' })
  for (let frame = 0; frame < 900; frame += 1) controller.update(FRAME)
  const parkedSpin = fixture.vehicle.axles.front.node.rotation.x
  assert.equal(controller.getState().roadSpeed, 0)
  for (let frame = 0; frame < 60; frame += 1) controller.update(FRAME)
  assert.equal(fixture.vehicle.axles.front.node.rotation.x, parkedSpin, '停车后轮轴不应继续滚动')

  // Reverse turns both axles and the road the other way.
  controller.dispatch({ type: 'set-gear', value: 'R' })
  for (let frame = 0; frame < 90; frame += 1) controller.update(FRAME)
  assert.ok(controller.getState().roadSpeed < 0, `R 档的视觉速度应为负值，实际 ${controller.getState().roadSpeed}`)
  assert.ok(fixture.vehicle.axles.front.node.rotation.x > parkedSpin,
    'R 档轮轴应朝相反方向滚动')
  assert.equal(fixture.vehicle.axles.front.node.rotation.x, fixture.vehicle.axles.rear.node.rotation.x,
    '倒车时前后轮轴仍须同速')
})

test('控制器把车窗命令转发给车窗控制器，行驶中车窗仍然可用', () => {
  const fixture = createFixture()
  const controller = createVehicleController({
    vehicle: fixture.vehicle,
    scene: fixture.scene,
    camera: new THREE.PerspectiveCamera(),
    canvas: fixture.canvas,
    windowController: fixture.windowController,
    feedback: () => {},
  })
  const observedWindowTargets = []
  const unsubscribe = controller.subscribe((snapshot) => observedWindowTargets.push(snapshot.windows.FL.target))

  const opened = controller.dispatch({ type: 'set-window', targets: ['FL'], value: 1 })
  assert.equal(opened.ok, true)
  assert.equal(controller.getState().windows.FL.target, 1)
  assert.deepEqual(observedWindowTargets, [0, 1], '统一控制器订阅者应立即收到车窗状态变化')

  const all = controller.dispatch({ type: 'set-window', targets: [...WINDOW_IDS], value: 1 })
  assert.equal(all.ok, true)
  assert.deepEqual(Object.values(controller.getState().windows).map((entry) => entry.target), [1, 1, 1, 1])

  assert.equal(controller.dispatch({ type: 'set-window', targets: ['XX'], value: 1 }).code, 'invalid-target')

  controller.dispatch({ type: 'set-gear', value: 'D' })
  // Door and lid commands are locked while driving, windows are not.
  assert.equal(controller.dispatch({ type: 'set-door', targets: ['FL'], value: 1 }).code, 'door-locked-while-driving')
  assert.equal(controller.dispatch({ type: 'set-window', targets: ['FL'], value: 0 }).ok, true)
  unsubscribe()
})

test('控制器把车漆、轮毂与灯光应用到克隆材质上', () => {
  const fixture = createFixture()
  const controller = createVehicleController({
    vehicle: fixture.vehicle,
    scene: fixture.scene,
    camera: new THREE.PerspectiveCamera(),
    canvas: fixture.canvas,
    windowController: fixture.windowController,
    feedback: () => {},
  })

  const paint = fixture.materials.paint[0]
  const rim = fixture.materials.rims[0]
  const headlight = fixture.materials.lights.headlight[0]

  assert.equal(paint.color.getHex(), new THREE.Color(PAINT_PRESETS.obsidian.color).getHex())
  assert.equal(rim.color.getHex(), new THREE.Color(WHEEL_PRESETS.turbine.color).getHex())
  assert.equal(headlight.emissiveIntensity, 0)

  controller.dispatch({ type: 'set-paint', value: 'ivory' })
  controller.update(FRAME)
  assert.equal(paint.color.getHex(), new THREE.Color(PAINT_PRESETS.ivory.color).getHex())

  controller.dispatch({ type: 'set-wheel-style', value: 'monoblock' })
  controller.update(FRAME)
  assert.equal(rim.color.getHex(), new THREE.Color(WHEEL_PRESETS.monoblock.color).getHex())
  assert.equal(rim.metalness, WHEEL_PRESETS.monoblock.metalness)

  controller.dispatch({ type: 'set-light', targets: ['headlight'], value: 1 })
  for (let frame = 0; frame < 60; frame += 1) controller.update(FRAME)
  assert.ok(headlight.emissiveIntensity > 1, `前大灯应点亮，实际 ${headlight.emissiveIntensity}`)

  controller.dispatch({ type: 'set-light', targets: ['headlight'], value: 0 })
  for (let frame = 0; frame < 120; frame += 1) controller.update(FRAME)
  assert.equal(headlight.emissiveIntensity, 0)
})
