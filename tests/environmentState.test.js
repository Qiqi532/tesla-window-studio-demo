import test from 'node:test'
import assert from 'node:assert/strict'
import { CAMERA_PRESETS } from '../src/cameraRig.js'
import { createEnvironmentState } from '../src/environment.js'
import {
  createPerformanceMonitor,
  getInitialPerformanceTier,
  RAIN_PARTICLE_BUDGETS,
} from '../src/weather.js'

test('环境状态以影棚启动，天气切换会进入道路并保留已选天气', () => {
  const state = createEnvironmentState()
  assert.deepEqual(state.getState(), {
    mode: 'studio',
    weather: 'sunny',
    equipmentVisible: false,
    roadAssetsLoaded: false,
    roadAssetsLoading: false,
  })

  state.setWeather('rain')
  assert.equal(state.getState().mode, 'road')
  assert.equal(state.getState().weather, 'rain')
  state.setMode('studio')
  state.setMode('road')
  assert.equal(state.getState().weather, 'rain')
})

test('环境状态拒绝未知模式和天气', () => {
  const state = createEnvironmentState()
  assert.throws(() => state.setMode('garage'), /未知场景/)
  assert.throws(() => state.setWeather('snow'), /未知天气/)
})

test('六个摄影机预设都含位置、目标和视野角', () => {
  assert.deepEqual(Object.keys(CAMERA_PRESETS), ['hero', 'front', 'side', 'rear', 'top', 'detail'])
  for (const preset of Object.values(CAMERA_PRESETS)) {
    assert.equal(preset.position.length, 3)
    assert.equal(preset.target.length, 3)
    assert.ok(preset.fov >= 25 && preset.fov <= 50)
  }
})

test('性能档位考虑减少动画、内存和 CPU 能力', () => {
  assert.equal(getInitialPerformanceTier({ reducedMotion: true, deviceMemory: 16, hardwareConcurrency: 16 }), 'low')
  assert.equal(getInitialPerformanceTier({ reducedMotion: false, deviceMemory: 4, hardwareConcurrency: 8 }), 'medium')
  assert.equal(getInitialPerformanceTier({ reducedMotion: false, deviceMemory: 8, hardwareConcurrency: 12 }), 'high')
  assert.ok(RAIN_PARTICLE_BUDGETS.high > RAIN_PARTICLE_BUDGETS.medium)
  assert.ok(RAIN_PARTICLE_BUDGETS.medium > RAIN_PARTICLE_BUDGETS.low)
})

test('连续两个低于 45 FPS 的采样窗口只下降一档', () => {
  const monitor = createPerformanceMonitor('high', { sampleSeconds: 1, minimumFps: 45 })
  for (let i = 0; i < 60; i += 1) monitor.recordFrame(1 / 30)
  assert.equal(monitor.getTier(), 'medium')

  for (let i = 0; i < 60; i += 1) monitor.recordFrame(1 / 60)
  assert.equal(monitor.getTier(), 'medium')
})
