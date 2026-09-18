const light = (color, intensity, extra = {}) => Object.freeze({ color, intensity, ...extra })

export const RENDER_PROFILE = Object.freeze({
  renderer: Object.freeze({ toneMapping: 'agx', exposure: 0.92 }),
  studio: Object.freeze({
    environmentIntensity: 0.56,
    hemisphere: light('#c6dcff', 0.5, { groundColor: '#172334' }),
    key: light('#eaf5ff', 4.4, { width: 4.2, height: 2.6, position: [-4.2, 5.3, 4.7] }),
    fill: light('#8db9e6', 1.7, { width: 3.3, height: 2.1, position: [5.1, 3.4, 3.1] }),
    rim: light('#ffb985', 2.35, { width: 2.5, height: 1.6, position: [-2.8, 3.5, -4.8] }),
    shadow: light('#f4f8ff', 0.72, { position: [-4, 8, 5] }),
  }),

  /**
   * Seasonal base identity of the loop road: which HDR sky, which road surface, and
   * which colours the roadside ground, tree trunks and foliage take. Every weather
   * overlay is applied on top of one of these four bases, so the same weather still
   * reads differently across the year.
   */
  seasons: Object.freeze({
    spring: Object.freeze({
      skyHdr: 'flower-road-2k.hdr',
      roadTexture: 'asphalt',
      groundColor: '#5f8f42',
      groundRoughness: 1,
      trunkColor: '#6a513a',
      foliageColor: '#7cb342',
      hemisphereColor: '#d3eaff',
      hemisphereGround: '#3f5c37',
      hemisphereIntensity: 1,
      shadowColor: '#fff2d6',
      shadowIntensity: 1.75,
      environmentIntensity: 0.86,
      backgroundIntensity: 0.92,
      backgroundBlurriness: 0.03,
      fogColor: '#bfd3bb',
      fogNear: 34,
      fogFar: 115,
      roadRoughness: 0.86,
      roadMetalness: 0.03,
      roadEnvMapIntensity: 0.78,
    }),
    summer: Object.freeze({
      skyHdr: 'sunny-country-road-2k.hdr',
      roadTexture: 'asphalt',
      groundColor: '#7a9b4c',
      groundRoughness: 1,
      trunkColor: '#5d4a35',
      foliageColor: '#3f7d32',
      hemisphereColor: '#cfe4ff',
      hemisphereGround: '#526049',
      hemisphereIntensity: 1,
      shadowColor: '#fff1d1',
      shadowIntensity: 1.85,
      environmentIntensity: 0.86,
      backgroundIntensity: 0.9,
      backgroundBlurriness: 0.03,
      fogColor: '#c9d8dd',
      fogNear: 34,
      fogFar: 115,
      roadRoughness: 0.86,
      roadMetalness: 0.03,
      roadEnvMapIntensity: 0.78,
    }),
    autumn: Object.freeze({
      skyHdr: 'autumn-road-2k.hdr',
      roadTexture: 'autumn-road',
      groundColor: '#a5873f',
      groundRoughness: 1,
      trunkColor: '#5d4532',
      foliageColor: '#c96a2b',
      hemisphereColor: '#d6cdb8',
      hemisphereGround: '#4a3f2c',
      hemisphereIntensity: 1,
      shadowColor: '#f7e6c4',
      shadowIntensity: 1.5,
      environmentIntensity: 0.8,
      backgroundIntensity: 0.85,
      backgroundBlurriness: 0.05,
      fogColor: '#c8bfa8',
      fogNear: 32,
      fogFar: 105,
      roadRoughness: 0.82,
      roadMetalness: 0.04,
      roadEnvMapIntensity: 0.8,
    }),
    winter: Object.freeze({
      skyHdr: 'horn-koppe-snow-2k.hdr',
      roadTexture: 'snow-road',
      groundColor: '#e9eef4',
      groundRoughness: 0.9,
      trunkColor: '#4c3f33',
      foliageColor: '#dce6ee',
      hemisphereColor: '#cfe4f2',
      hemisphereGround: '#b9c8d4',
      hemisphereIntensity: 1.15,
      shadowColor: '#eaf4ff',
      shadowIntensity: 1.5,
      environmentIntensity: 0.9,
      backgroundIntensity: 0.95,
      backgroundBlurriness: 0.02,
      fogColor: '#c9d4dc',
      fogNear: 36,
      fogFar: 120,
      roadRoughness: 0.95,
      roadMetalness: 0.02,
      roadEnvMapIntensity: 0.65,
    }),
  }),

  /**
   * Weather overlays applied on top of the season base. A missing field inherits from
   * the season; `skyHdr` and `roadTexture` replace the sky / road surface entirely
   * (night gets its own starry sky, snow weather coats the road in snow).
   */
  weathers: Object.freeze({
    sunny: Object.freeze({}),
    cloudy: Object.freeze({
      skyHdr: 'fouriesburg-cloudy-2k.hdr',
      hemisphereColor: '#a8b9c7',
      hemisphereGround: '#354047',
      hemisphereIntensity: 1.12,
      shadowColor: '#c7d4df',
      shadowIntensity: 0.62,
      environmentIntensity: 0.68,
      backgroundIntensity: 0.66,
      backgroundBlurriness: 0.12,
      fogColor: '#a9b4ba',
      fogNear: 34,
      fogFar: 115,
      roadRoughness: 0.7,
    }),
    rain: Object.freeze({
      skyHdr: 'cloudy-cliffside-road-2k.hdr',
      hemisphereColor: '#9eafbc',
      hemisphereGround: '#303b42',
      hemisphereIntensity: 1.08,
      shadowColor: '#bccbd7',
      shadowIntensity: 0.38,
      environmentIntensity: 0.84,
      backgroundIntensity: 0.64,
      backgroundBlurriness: 0.16,
      fogMode: 'exp2',
      fogColor: '#7e8d98',
      fogDensity: 0.022,
      roadRoughness: 0.24,
      roadMetalness: 0.18,
      roadEnvMapIntensity: 1.05,
    }),
    snow: Object.freeze({
      roadTexture: 'snow-road',
      foliageColor: '#dce6ee',
      hemisphereColor: '#cddce8',
      hemisphereGround: '#b7c6d2',
      hemisphereIntensity: 1.15,
      shadowColor: '#e8f1fa',
      shadowIntensity: 0.55,
      environmentIntensity: 0.8,
      backgroundIntensity: 0.72,
      backgroundBlurriness: 0.14,
      fogMode: 'exp2',
      fogColor: '#c3d1da',
      fogDensity: 0.02,
      roadRoughness: 0.92,
      roadMetalness: 0.02,
      roadEnvMapIntensity: 0.6,
    }),
    /**
     * Night exists to show the lamps: ambient and sky light are pulled almost to zero so
     * the headlight beams, the light pools on the tarmac and the glowing lenses are the
     * only things lighting the scene. The sky swaps to a starry night HDRI.
     */
    night: Object.freeze({
      skyHdr: 'qwantani-night-2k.hdr',
      hemisphereColor: '#33465e',
      hemisphereGround: '#05070a',
      hemisphereIntensity: 0.2,
      shadowColor: '#8ea8cc',
      shadowIntensity: 0.04,
      environmentIntensity: 0.12,
      backgroundIntensity: 0.55,
      backgroundBlurriness: 0,
      fogMode: 'linear',
      fogColor: '#05070c',
      fogNear: 26,
      fogFar: 96,
      roadRoughness: 0.42,
      roadMetalness: 0.12,
      roadEnvMapIntensity: 0.3,
    }),
  }),

  /**
   * Additive bloom for the night pass. Only dark scenes turn it on, so the studio and
   * the daylight road keep the cheaper single-pass renderer path. Kept deliberately
   * restrained: the lamps need a halo, not a haze over the whole frame.
   */
  bloom: Object.freeze({ strength: 0.3, radius: 0.35, threshold: 0.84 }),
})

const FOG_LINEAR = 'linear'

/**
 * Merge one season base with one weather overlay into the flat profile the
 * environment controller applies. Pure and deterministic, so tests can pin the
 * 4 × 5 combination matrix without touching WebGL.
 */
export function resolveRoadProfile(season, weather) {
  const base = RENDER_PROFILE.seasons[season]
  const overlay = RENDER_PROFILE.weathers[weather]
  if (!base) throw new Error(`未知季节：${season}`)
  if (!overlay) throw new Error(`未知天气：${weather}`)
  return Object.freeze({
    season,
    weather,
    skyHdr: overlay.skyHdr ?? base.skyHdr,
    roadTexture: overlay.roadTexture ?? base.roadTexture,
    groundColor: overlay.groundColor ?? base.groundColor,
    groundRoughness: overlay.groundRoughness ?? base.groundRoughness,
    trunkColor: overlay.trunkColor ?? base.trunkColor,
    foliageColor: overlay.foliageColor ?? base.foliageColor,
    hemisphereColor: overlay.hemisphereColor ?? base.hemisphereColor,
    hemisphereGround: overlay.hemisphereGround ?? base.hemisphereGround,
    hemisphereIntensity: overlay.hemisphereIntensity ?? base.hemisphereIntensity,
    shadowColor: overlay.shadowColor ?? base.shadowColor,
    shadowIntensity: overlay.shadowIntensity ?? base.shadowIntensity,
    environmentIntensity: overlay.environmentIntensity ?? base.environmentIntensity,
    backgroundIntensity: overlay.backgroundIntensity ?? base.backgroundIntensity,
    backgroundBlurriness: overlay.backgroundBlurriness ?? base.backgroundBlurriness,
    fogMode: overlay.fogMode ?? FOG_LINEAR,
    fogColor: overlay.fogColor ?? base.fogColor,
    fogNear: overlay.fogNear ?? base.fogNear,
    fogFar: overlay.fogFar ?? base.fogFar,
    fogDensity: overlay.fogDensity ?? 0,
    roadRoughness: overlay.roadRoughness ?? base.roadRoughness,
    roadMetalness: overlay.roadMetalness ?? base.roadMetalness,
    roadEnvMapIntensity: overlay.roadEnvMapIntensity ?? base.roadEnvMapIntensity,
  })
}
