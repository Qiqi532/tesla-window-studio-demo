import test from 'node:test'
import assert from 'node:assert/strict'
import { CAMERA_PRESETS } from '../src/cameraRig.js'
import { createEnvironmentState, SEASON_LABELS, WEATHER_LABELS } from '../src/environment.js'
import { RENDER_PROFILE, resolveRoadProfile } from '../src/renderProfile.js'
import {
  createPerformanceMonitor,
  getInitialPerformanceTier,
  RAIN_PARTICLE_BUDGETS,
  SNOW_PARTICLE_BUDGETS,
  LEAF_PARTICLE_BUDGETS,
} from '../src/weather.js'

test('环境状态以影棚启动，季节与天气切换都会进入道路并保留选择', () => {
  const state = createEnvironmentState()
  assert.deepEqual(state.getState(), {
    mode: 'studio',
    season: 'summer',
    weather: 'sunny',
    roadAssetsLoaded: false,
    roadAssetsLoading: false,
  })

  state.setWeather('rain')
  assert.equal(state.getState().mode, 'road')
  assert.equal(state.getState().weather, 'rain')
  state.setMode('studio')
  state.setMode('road')
  assert.equal(state.getState().weather, 'rain')
  assert.equal(state.getState().season, 'summer')

  state.setSeason('winter')
  assert.equal(state.getState().mode, 'road')
  assert.equal(state.getState().season, 'winter')
  state.setMode('studio')
  state.setMode('road')
  assert.equal(state.getState().season, 'winter')
})

test('环境状态拒绝未知场景、季节和天气', () => {
  const state = createEnvironmentState()
  assert.throws(() => state.setMode('garage'), /未知场景/)
  assert.throws(() => state.setSeason('monsoon'), /未知季节/)
  assert.throws(() => state.setWeather('hail'), /未知天气/)
})

test('夜晚是独立的道路天气，并成为唯一允许泛光的暗场景', () => {
  const state = createEnvironmentState()
  state.setWeather('night')
  assert.equal(state.getState().mode, 'road')
  assert.equal(state.getState().weather, 'night')
  assert.equal(WEATHER_LABELS.night, '夜晚')
  for (const weather of ['sunny', 'cloudy', 'rain', 'snow', 'night']) {
    assert.equal(typeof WEATHER_LABELS[weather], 'string')
  }
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    assert.equal(typeof SEASON_LABELS[season], 'string')
  }

  const night = resolveRoadProfile('summer', 'night')
  assert.ok(night.environmentIntensity <= 0.15, 'night keeps almost no environment light')
  assert.ok(night.hemisphereIntensity < resolveRoadProfile('summer', 'rain').hemisphereIntensity,
    'night is darker than every daylight weather')
  assert.ok(night.shadowIntensity < resolveRoadProfile('summer', 'rain').shadowIntensity)
  assert.equal(typeof night.fogColor, 'string')
  assert.ok(RENDER_PROFILE.bloom.strength > 0 && RENDER_PROFILE.bloom.strength <= 0.35)
  assert.ok(RENDER_PROFILE.bloom.radius <= 0.4)
  assert.ok(RENDER_PROFILE.bloom.threshold >= 0.82, 'bloom only picks up the brightest lamp pixels')
})

test('四季每个季节都有独立的天空、路面、地面与植被配色', () => {
  const skies = new Set()
  const roads = new Set()
  const foliage = new Set()
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    const profile = resolveRoadProfile(season, 'sunny')
    assert.ok(profile.skyHdr.endsWith('.hdr'))
    skies.add(profile.skyHdr)
    roads.add(profile.roadTexture)
    foliage.add(profile.foliageColor)
    assert.equal(typeof profile.groundColor, 'string')
    assert.equal(typeof profile.hemisphereColor, 'string')
  }
  assert.equal(skies.size, 4, '每个季节使用不同的天空 HDR')
  assert.equal(roads.size, 3, '春夏共用沥青，秋季落叶路面，冬季雪地路面')
  assert.equal(foliage.size, 4, '每个季节的树木配色都不同')
})

test('天气覆盖层在四季基础上叠加，夜晚与雨天拥有独立天空', () => {
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    const sunny = resolveRoadProfile(season, 'sunny')
    const cloudy = resolveRoadProfile(season, 'cloudy')
    const rain = resolveRoadProfile(season, 'rain')
    const snow = resolveRoadProfile(season, 'snow')
    const night = resolveRoadProfile(season, 'night')

    assert.equal(cloudy.skyHdr, 'fouriesburg-cloudy-2k.hdr')
    assert.equal(rain.skyHdr, 'cloudy-cliffside-road-2k.hdr')
    assert.equal(night.skyHdr, 'qwantani-night-2k.hdr')
    assert.equal(snow.skyHdr, sunny.skyHdr, '雪天沿用季节天空并叠加雪地路面与雾')
    assert.equal(snow.roadTexture, 'snow-road')
    assert.equal(sunny.roadTexture, RENDER_PROFILE.seasons[season].roadTexture)

    assert.equal(rain.fogMode, 'exp2')
    assert.equal(snow.fogMode, 'exp2')
    assert.equal(cloudy.fogMode, 'linear')
    assert.ok(rain.roadRoughness < sunny.roadRoughness, '雨天路面更光滑以反射环境')
    assert.ok(rain.roadEnvMapIntensity > sunny.roadEnvMapIntensity)
  }
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
  assert.ok(SNOW_PARTICLE_BUDGETS.high > SNOW_PARTICLE_BUDGETS.medium)
  assert.ok(SNOW_PARTICLE_BUDGETS.medium > SNOW_PARTICLE_BUDGETS.low)
  assert.ok(LEAF_PARTICLE_BUDGETS.high > LEAF_PARTICLE_BUDGETS.medium)
  assert.ok(LEAF_PARTICLE_BUDGETS.medium > LEAF_PARTICLE_BUDGETS.low)
})

test('连续两个低于 45 FPS 的采样窗口只下降一档', () => {
  const monitor = createPerformanceMonitor('high', { sampleSeconds: 1, minimumFps: 45 })
  for (let i = 0; i < 60; i += 1) monitor.recordFrame(1 / 30)
  assert.equal(monitor.getTier(), 'medium')

  for (let i = 0; i < 60; i += 1) monitor.recordFrame(1 / 60)
  assert.equal(monitor.getTier(), 'medium')
})

test('集中渲染配置限制影棚与道路环境的高光能量', () => {
  assert.equal(RENDER_PROFILE.renderer.toneMapping, 'agx')
  assert.ok(RENDER_PROFILE.renderer.exposure <= 1)
  assert.ok(RENDER_PROFILE.studio.environmentIntensity <= 0.6)
  assert.ok(RENDER_PROFILE.studio.key.intensity < 5)
  assert.ok(RENDER_PROFILE.studio.fill.intensity < RENDER_PROFILE.studio.key.intensity)
  assert.ok(RENDER_PROFILE.studio.rim.intensity < RENDER_PROFILE.studio.key.intensity)
  assert.ok(RENDER_PROFILE.studio.shadow.intensity < 1)

  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    for (const weather of ['sunny', 'cloudy', 'rain', 'snow', 'night']) {
      const profile = resolveRoadProfile(season, weather)
      assert.ok(profile.environmentIntensity <= 0.9)
      assert.ok(profile.hemisphereIntensity <= 1.2)
      assert.ok(profile.shadowIntensity <= 2)
      assert.ok(profile.backgroundIntensity >= 0, '背景强度非负')
    }
  }
})
