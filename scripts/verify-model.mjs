#!/usr/bin/env node
/**
 * Build-time check that the Tesla GLB still exposes every node and material the
 * vehicle controller drives.
 *
 * It reads the glTF JSON chunk directly, so it needs no browser APIs, no three.js
 * and no network access. Run it with `npm run verify:model`, or automatically via
 * the `prebuild` script.
 *
 * Exit code 0 = every required part resolved; 1 = at least one hard failure.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import {
  AXLE_PARTS,
  LIGHT_MATERIALS,
  PAINT_MATERIAL,
  REQUIRED_MATERIALS,
  REQUIRED_NODES,
  RIM_MATERIALS,
  UNSUPPORTED_NODE_HINTS,
  VEHICLE_MODEL_PATH,
  normalizePartName,
} from '../src/vehicleParts.js'
import {
  EXPECTED_MODEL_BASELINE,
  materialRoleEntries,
} from '../src/vehicleMaterialManifest.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelPath = path.resolve(projectRoot, process.argv[2] ?? VEHICLE_MODEL_PATH)

const failures = []
const notes = []

/** Read the JSON chunk out of a binary glTF container. */
function readGlb(file) {
  let buffer
  try {
    buffer = readFileSync(file)
  } catch (error) {
    throw new Error(`无法读取模型文件 ${file}：${error.message}`)
  }
  if (buffer.length < 12 || buffer.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`${file} 不是有效的 GLB 文件`)
  }
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset)
    const chunkType = buffer.readUInt32LE(offset + 4)
    const body = buffer.subarray(offset + 8, offset + 8 + chunkLength)
    if (chunkType === 0x4e4f534a) {
      return { buffer, json: JSON.parse(new TextDecoder().decode(body)) }
    }
    offset += 8 + chunkLength + ((4 - (chunkLength % 4)) % 4)
  }
  throw new Error(`${file} 缺少 glTF JSON 块`)
}

/* ------------------------------------------------------------------ matrices */

// glTF matrices are column-major: element (row r, column c) lives at m[c * 4 + r].
function multiply(a, b) {
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k]
      out[c * 4 + r] = sum
    }
  }
  return out
}

function localMatrix(node) {
  if (node.matrix) return node.matrix.slice()
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

function applyMatrix(m, point) {
  return [
    m[0] * point[0] + m[4] * point[1] + m[8] * point[2] + m[12],
    m[1] * point[0] + m[5] * point[1] + m[9] * point[2] + m[13],
    m[2] * point[0] + m[6] * point[1] + m[10] * point[2] + m[14],
  ]
}

/* -------------------------------------------------------------------- report */

function buildIndex(json) {
  const nodes = json.nodes ?? []
  const parents = new Map()
  nodes.forEach((node, index) => (node.children ?? []).forEach((child) => parents.set(child, index)))
  const worldCache = new Map()
  const worldMatrix = (index) => {
    if (worldCache.has(index)) return worldCache.get(index)
    const parent = parents.get(index)
    const matrix = parent === undefined
      ? localMatrix(nodes[index] ?? {})
      : multiply(worldMatrix(parent), localMatrix(nodes[index] ?? {}))
    worldCache.set(index, matrix)
    return matrix
  }
  const byNormalized = new Map()
  nodes.forEach((node, index) => {
    const key = normalizePartName(node.name)
    if (!byNormalized.has(key)) byNormalized.set(key, [])
    byNormalized.get(key).push(index)
  })
  const materials = json.materials ?? []
  const materialByName = new Map()
  materials.forEach((material) => materialByName.set(material.name, material))
  return { nodes, parents, worldMatrix, byNormalized, materials, materialByName }
}

/** Axis-aligned box of a subtree, built from accessor min/max so no vertex data is decoded. */
function subtreeBounds(json, index, indexer) {
  const { nodes, worldMatrix } = indexer
  let box = null
  const expand = (min, max) => {
    if (!box) box = { min: [...min], max: [...max] }
    else for (let axis = 0; axis < 3; axis += 1) {
      box.min[axis] = Math.min(box.min[axis], min[axis])
      box.max[axis] = Math.max(box.max[axis], max[axis])
    }
  }
  const walk = (current) => {
    const node = nodes[current]
    if (node?.mesh !== undefined) {
      const matrix = worldMatrix(current)
      for (const primitive of json.meshes[node.mesh].primitives) {
        const accessor = json.accessors[primitive.attributes.POSITION]
        const corners = []
        for (const x of [accessor.min[0], accessor.max[0]]) {
          for (const y of [accessor.min[1], accessor.max[1]]) {
            for (const z of [accessor.min[2], accessor.max[2]]) corners.push(applyMatrix(matrix, [x, y, z]))
          }
        }
        expand(
          [0, 1, 2].map((axis) => Math.min(...corners.map((corner) => corner[axis]))),
          [0, 1, 2].map((axis) => Math.max(...corners.map((corner) => corner[axis]))),
        )
      }
    }
    ;(node?.children ?? []).forEach(walk)
  }
  walk(index)
  return box
}

function main() {
  const { buffer, json } = readGlb(modelPath)
  const indexer = buildIndex(json)
  const round = (value) => Number(value.toFixed(2))
  const digest = createHash('sha256').update(buffer).digest('hex').toUpperCase()

  console.log(`模型检查：${path.relative(projectRoot, modelPath)}`)
  console.log(
    `结构：${indexer.nodes.length} 节点 / ${(json.meshes ?? []).length} 网格 / ${indexer.materials.length} 材质 / ${(json.animations ?? []).length} 内置动画\n`,
  )

  if (buffer.length !== EXPECTED_MODEL_BASELINE.bytes) {
    failures.push(`模型字节数 ${buffer.length} 与基线 ${EXPECTED_MODEL_BASELINE.bytes} 不一致`)
  }
  if (digest !== EXPECTED_MODEL_BASELINE.sha256) {
    failures.push(`模型 SHA-256 ${digest} 与已审查基线不一致`)
  }
  for (const [key, actual] of Object.entries({
    nodes: indexer.nodes.length,
    meshes: (json.meshes ?? []).length,
    materials: indexer.materials.length,
  })) {
    if (actual !== EXPECTED_MODEL_BASELINE[key]) {
      failures.push(`模型 ${key} 数量 ${actual} 与基线 ${EXPECTED_MODEL_BASELINE[key]} 不一致`)
    }
  }

  // --- glTF geometry integrity ---------------------------------------------
  for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) {
    if (!mesh.primitives?.length) {
      failures.push(`网格 #${meshIndex} 缺少图元`)
      continue
    }
    for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
      const label = `网格 #${meshIndex} 图元 #${primitiveIndex}`
      if ((primitive.mode ?? 4) !== 4) failures.push(`${label} 不是三角形图元`)
      if (!Number.isInteger(primitive.attributes?.POSITION)) failures.push(`${label} 缺少 POSITION`)
      if (!Number.isInteger(primitive.attributes?.NORMAL)) failures.push(`${label} 缺少 NORMAL`)
      const accessor = json.accessors?.[primitive.attributes?.POSITION]
      const bounds = [...(accessor?.min ?? []), ...(accessor?.max ?? [])]
      if (bounds.length !== 6 || !bounds.every(Number.isFinite)) failures.push(`${label} 包围盒无效`)
    }
  }

  // --- complete material-role coverage -------------------------------------
  const assignments = materialRoleEntries()
  const assignedNames = assignments.map(([name]) => name)
  const duplicates = assignedNames.filter((name, index) => assignedNames.indexOf(name) !== index)
  const modelMaterialNames = indexer.materials.map((material) => material.name)
  const unclassified = modelMaterialNames.filter((name) => !assignedNames.includes(name))
  const unknown = assignedNames.filter((name) => !modelMaterialNames.includes(name))
  if (duplicates.length) failures.push(`材质角色重复：${[...new Set(duplicates)].join('、')}`)
  if (unclassified.length) failures.push(`材质未分类：${unclassified.join('、')}`)
  if (unknown.length) failures.push(`材质清单包含模型中不存在的名称：${unknown.join('、')}`)

  // --- required nodes -------------------------------------------------------
  const resolvedNodes = new Map()
  for (const name of REQUIRED_NODES) {
    const matches = indexer.byNormalized.get(normalizePartName(name)) ?? []
    if (!matches.length) {
      failures.push(`缺少必需节点：${name}`)
      continue
    }
    resolvedNodes.set(name, matches[0])
    const [primary] = matches
    const rawName = indexer.nodes[primary].name
    if (rawName !== name) notes.push(`节点 ${name} 在模型中记为 “${rawName}”`)
  }

  const missingRequiredNodes = REQUIRED_NODES.filter((name) => !resolvedNodes.has(name))
  console.log(
    missingRequiredNodes.length
      ? `✗ 必需节点：${REQUIRED_NODES.length - missingRequiredNodes.length}/${REQUIRED_NODES.length} 已解析`
      : `✓ 必需节点：${REQUIRED_NODES.length}/${REQUIRED_NODES.length} 已解析`,
  )

  for (const [name, nodeIndex] of resolvedNodes) {
    if (!subtreeBounds(json, nodeIndex, indexer)) failures.push(`必需节点 ${name} 的子树不含几何体`)
  }

  // --- required materials ---------------------------------------------------
  const missingMaterials = REQUIRED_MATERIALS.filter((name) => !indexer.materialByName.has(name))
  for (const name of missingMaterials) failures.push(`缺少必需材质：${name}`)
  console.log(
    missingMaterials.length
      ? `✗ 必需材质：${REQUIRED_MATERIALS.length - missingMaterials.length}/${REQUIRED_MATERIALS.length} 已解析`
      : `✓ 必需材质：${REQUIRED_MATERIALS.length}/${REQUIRED_MATERIALS.length} 已解析`,
  )

  // --- axle sanity: two whole axles, front negative Z / rear positive Z -----
  const axleReports = []
  for (const [id, part] of Object.entries(AXLE_PARTS)) {
    const nodeIndex = resolvedNodes.get(part.node)
    if (nodeIndex === undefined) continue
    const bounds = subtreeBounds(json, nodeIndex, indexer)
    const centerZ = round((bounds.min[2] + bounds.max[2]) / 2)
    axleReports.push({ id, node: part.node, nodeIndex, centerZ, bounds })
    if (!(bounds.max[2] - bounds.min[2] > 1)) {
      failures.push(`轮轴 ${part.node} 没有几何体，无法滚动`)
      continue
    }
    const [expectedMin, expectedMax] = part.zRange
    if (centerZ < expectedMin || centerZ > expectedMax) {
      failures.push(`轮轴 ${part.node} 位于 z=${centerZ}，不在预期的 ${expectedMin}..${expectedMax} 区间，前后轴映射需要复核`)
    }
  }
  const distinctAxles = new Set(axleReports.map((report) => report.nodeIndex)).size
  if (axleReports.length !== 2 || distinctAxles !== 2) {
    failures.push(`预期恰好两条独立轮轴，实际解析到 ${axleReports.length} 条（去重后 ${distinctAxles} 条）`)
  }
  if (!failures.length) {
    for (const report of axleReports) {
      console.log(`✓ 轮轴 ${report.id}（${report.node}）：z 中心 ${report.centerZ}，宽度 ${round(report.bounds.max[0] - report.bounds.min[0])}`)
    }
  }

  // --- informational: parts this project deliberately does not animate ------
  const hints = []
  for (const [key, indices] of indexer.byNormalized) {
    if (!UNSUPPORTED_NODE_HINTS.some((hint) => key.includes(normalizePartName(hint)))) continue
    indices.forEach((index) => hints.push(`${indexer.nodes[index].name} (#${index})`))
  }
  console.log(`\nℹ 模型只提供整体前后轮轴滚动。未实现左右轮独立转向、悬挂、充电口和雨刷。`)
  console.log(
    hints.length
      ? `ℹ 与上述限制相关的现有节点（仅供复核，不影响检查结果）：${hints.join('、')}`
      : 'ℹ 模型中没有出现与左右轮/转向/悬挂/充电口/雨刷相关的节点名',
  )

  // --- paint & rim coverage -------------------------------------------------
  const paintMaterial = indexer.materialByName.get(PAINT_MATERIAL)
  const paintUsers = indexer.nodes.filter((node) => node.mesh !== undefined
    && json.meshes[node.mesh].primitives.some((p) => json.materials[p.material]?.name === PAINT_MATERIAL))
  console.log(`ℹ 车漆材质 ${PAINT_MATERIAL}${paintMaterial ? '' : '（缺失）'} 覆盖 ${paintUsers.length} 个车身网格`)
  console.log(`ℹ 材质角色清单覆盖 ${assignments.length}/${indexer.materials.length} 个材质`)
  console.log(`ℹ 轮毂材质：${RIM_MATERIALS.join('、')}`)
  const lightSummary = Object.entries(LIGHT_MATERIALS)
    .map(([id, names]) => `${id}=${names.length}`)
    .join(' ')
  console.log(`ℹ 灯光材质：${lightSummary}`)

  if (notes.length) {
    console.log('\n说明：')
    for (const note of notes) console.log(`  · ${note}`)
  }

  if (failures.length) {
    console.error('\n模型检查未通过：')
    for (const failure of failures) console.error(`  ✗ ${failure}`)
    console.error(`\n共 ${failures.length} 项失败。请先修正 src/vehicleParts.js 的映射或替换模型。`)
    process.exitCode = 1
    return
  }
  console.log('\n模型检查通过：车辆控制器所需的全部节点与材质都存在。')
}

try {
  main()
} catch (error) {
  console.error(`模型检查失败：${error.message}`)
  process.exitCode = 1
}
