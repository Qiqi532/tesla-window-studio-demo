import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import {
  EXPECTED_MODEL_BASELINE,
  MATERIAL_ROLES,
  materialRoleEntries,
} from '../src/vehicleMaterialManifest.js'

const modelBuffer = readFileSync('public/assets/tesla-model-3-2018.glb')

function readGlbJson(buffer) {
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset)
    const chunkType = buffer.readUInt32LE(offset + 4)
    if (chunkType === 0x4e4f534a) {
      return JSON.parse(new TextDecoder().decode(buffer.subarray(offset + 8, offset + 8 + chunkLength)))
    }
    offset += 8 + chunkLength + ((4 - (chunkLength % 4)) % 4)
  }
  throw new Error('GLB 缺少 JSON 块')
}

const model = readGlbJson(modelBuffer)

test('车模二进制、节点、网格与材质数量保持在已审查基线', () => {
  assert.equal(modelBuffer.length, EXPECTED_MODEL_BASELINE.bytes)
  assert.equal(createHash('sha256').update(modelBuffer).digest('hex').toUpperCase(), EXPECTED_MODEL_BASELINE.sha256)
  assert.equal(model.nodes.length, EXPECTED_MODEL_BASELINE.nodes)
  assert.equal(model.meshes.length, EXPECTED_MODEL_BASELINE.meshes)
  assert.equal(model.materials.length, EXPECTED_MODEL_BASELINE.materials)
})

test('58 个模型材质全部且仅归入一个渲染角色', () => {
  const entries = materialRoleEntries()
  const names = entries.map(([name]) => name)
  const modelNames = model.materials.map((material) => material.name)

  assert.equal(Object.keys(MATERIAL_ROLES).length, 12)
  assert.equal(entries.length, EXPECTED_MODEL_BASELINE.materials)
  assert.equal(new Set(names).size, names.length)
  assert.deepEqual([...names].sort(), [...modelNames].sort())
})

test('每个三角形图元都有有效位置、法线和有限包围盒', () => {
  for (const [meshIndex, mesh] of model.meshes.entries()) {
    assert.ok(mesh.primitives.length > 0, `mesh ${meshIndex} 缺少图元`)
    for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
      const label = `mesh ${meshIndex} primitive ${primitiveIndex}`
      assert.equal(primitive.mode ?? 4, 4, `${label} 不是三角形`)
      assert.ok(Number.isInteger(primitive.attributes.POSITION), `${label} 缺少 POSITION`)
      assert.ok(Number.isInteger(primitive.attributes.NORMAL), `${label} 缺少 NORMAL`)
      const accessor = model.accessors[primitive.attributes.POSITION]
      assert.equal(accessor.min.length, 3, `${label} 缺少最小包围盒`)
      assert.equal(accessor.max.length, 3, `${label} 缺少最大包围盒`)
      assert.ok([...accessor.min, ...accessor.max].every(Number.isFinite), `${label} 包围盒包含非有限值`)
    }
  }
})
