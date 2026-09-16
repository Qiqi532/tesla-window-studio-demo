import * as THREE from 'three'

export const WINDOW_LABELS = {
  FL: '驾驶位 · 左前',
  FR: '副驾驶 · 右前',
  RL: '左后车窗',
  RR: '右后车窗',
}

const WINDOW_IDS = Object.keys(WINDOW_LABELS)

export function createWindowState() {
  const entries = Object.fromEntries(WINDOW_IDS.map((id) => [id, { current: 0, target: 0 }]))
  const subscribers = new Set()
  const notify = () => subscribers.forEach((listener) => listener(getState()))
  const getState = () => Object.fromEntries(WINDOW_IDS.map((id) => [id, { ...entries[id] }]))

  return {
    getState,
    subscribe(listener) {
      subscribers.add(listener)
      listener(getState())
      return () => subscribers.delete(listener)
    },
    setWindow(id, open) {
      if (!Object.hasOwn(entries, id)) throw new Error(`未知车窗：${id}`)
      const target = open ? 1 : 0
      if (entries[id].target === target) return false
      entries[id].target = target
      notify()
      return true
    },
    setAllWindows(open) {
      const target = open ? 1 : 0
      let changed = false
      for (const id of WINDOW_IDS) {
        if (entries[id].target === target) continue
        entries[id].target = target
        changed = true
      }
      if (changed) notify()
      return changed
    },
    advance(delta) {
      for (const id of WINDOW_IDS) {
        const entry = entries[id]
        const next = THREE.MathUtils.damp(entry.current, entry.target, 3.4, delta)
        entry.current = Math.abs(next - entry.target) < 0.002 ? entry.target : next
      }
      return getState()
    },
  }
}

function easeMask(progress) {
  return 1 - THREE.MathUtils.smootherstep(progress, 0.16, 0.82)
}

function createGlassMotion(node) {
  const bounds = new THREE.Box3().setFromObject(node)
  const height = bounds.getSize(new THREE.Vector3()).y
  const travelDistance = Math.max(0.32, height + 0.08)
  const worldStart = node.getWorldPosition(new THREE.Vector3())
  const localStart = node.parent.worldToLocal(worldStart.clone())
  const localEnd = node.parent.worldToLocal(worldStart.clone().add(new THREE.Vector3(0, -travelDistance, 0)))
  const travel = localEnd.sub(localStart)
  const base = node.position.clone()

  const originals = Array.isArray(node.material) ? node.material : [node.material]
  const materialStates = originals.map((original) => {
    const material = original.clone()
    return {
      material,
      opacity: material.opacity,
      transparent: material.transparent,
      depthWrite: material.depthWrite,
    }
  })
  node.material = Array.isArray(node.material)
    ? materialStates.map(({ material }) => material)
    : materialStates[0].material

  return {
    node, bounds, base, travel, materialStates,
    update(progress) {
      node.position.copy(base).addScaledVector(travel, progress)
      node.visible = progress < 0.995
      const mask = easeMask(progress)
      for (const state of materialStates) {
        const { material } = state
        const transparent = state.transparent || mask < 0.995
        if (material.transparent !== transparent) {
          material.transparent = transparent
          material.needsUpdate = true
        }
        material.opacity = state.opacity * mask
        material.depthWrite = mask > 0.995 ? state.depthWrite : false
      }
    },
  }
}

export function createWindowController({ scene, camera, canvas, windows, feedback }) {
  const state = createWindowState()
  const motions = Object.fromEntries(WINDOW_IDS.map((id) => [id, createGlassMotion(windows[id])]))
  const hitTargets = WINDOW_IDS.map((id) => {
    const { bounds } = motions[id]
    const size = bounds.getSize(new THREE.Vector3()).add(new THREE.Vector3(0.09, 0.12, 0.1))
    size.z = Math.max(size.z, 0.16)
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 }),
    )
    hit.position.copy(bounds.getCenter(new THREE.Vector3()))
    hit.userData.windowId = id
    scene.add(hit)
    return hit
  })

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const pick = (event) => {
    const rect = canvas.getBoundingClientRect()
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    return raycaster.intersectObjects(hitTargets, false)[0]?.object.userData.windowId ?? null
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
    const id = pick(event)
    if (!id) return
    const open = !state.getState()[id].target
    state.setWindow(id, open)
    feedback(`${WINDOW_LABELS[id]}已${open ? '打开' : '关闭'}。`)
  }
  const onPointerMove = (event) => {
    if (pointerDown) return
    canvas.style.cursor = pick(event) ? 'pointer' : 'grab'
  }
  const onPointerCancel = () => { pointerDown = null }
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointercancel', onPointerCancel)

  return {
    ...state,
    update(delta) {
      const entries = state.advance(delta)
      for (const id of WINDOW_IDS) motions[id].update(entries[id].current)
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      for (const hit of hitTargets) {
        scene.remove(hit)
        hit.geometry.dispose()
        hit.material.dispose()
      }
      for (const motion of Object.values(motions)) motion.materialStates.forEach(({ material }) => material.dispose())
    },
  }
}
