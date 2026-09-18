# Vehicle Rendering Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore authored lamp detail, create restrained OEM-style illumination, and render body handles and the front intake with physically plausible finishes without changing the GLB.

**Architecture:** `vehicleMaterials.js` owns static runtime material construction and role-safe cloning; `vehicleController.js` only animates state-dependent emission and light effects; `vehicleParts.js` and `renderProfile.js` contain declarative appearance values. Existing controller interfaces and the immutable GLB remain unchanged.

**Tech Stack:** JavaScript ES modules, Three.js 0.186, Node test runner, Vite, Cloudflare Pages Direct Upload.

---

### Task 1: Preserve Authored Lamp Detail

**Files:**
- Modify: `src/vehicleMaterials.js`
- Test: `tests/vehicleState.test.js`

- [ ] **Step 1: Change the lamp material test to require authored textures**

Update the lamp assertions so `frontLens.map === lightMap`, `frontLens.emissiveMap === emissiveMap`, and unlit `emissiveIntensity === 0`. Add equivalent rear-lamp texture assertions.

- [ ] **Step 2: Run the focused test and verify the current pure-colour lens implementation fails**

Run: `node --test --test-isolation=none --test-name-pattern="显示材质管线" tests/vehicleState.test.js`

Expected: FAIL because the current `createLensMaterial()` drops `map` and `emissiveMap` and adds an unlit glow.

- [ ] **Step 3: Clone authored lamp materials into physical lenses**

Implement `createLampSurfaceMaterial(source, profile)` by copying the source map channels into a new `MeshPhysicalMaterial`:

```js
return new THREE.MeshPhysicalMaterial({
  name: source.name,
  color: profile.color,
  map: source.map,
  emissiveMap: source.emissiveMap,
  alphaMap: source.alphaMap,
  normalMap: source.normalMap,
  metalnessMap: source.metalnessMap,
  roughnessMap: source.roughnessMap,
  transparent: source.transparent,
  opacity: source.opacity,
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
```

Keep `createLensMaterial()` only for the shared outer cover, because that cover needs a front/rear split. Preserve the existing per-family cache and render-order handling.

- [ ] **Step 4: Run the focused test**

Run: `node --test --test-isolation=none --test-name-pattern="显示材质管线|灯组持有" tests/vehicleState.test.js`

Expected: both focused tests PASS.

### Task 2: Separate Handles from Neutral Lower Trim

**Files:**
- Modify: `src/vehicleParts.js`
- Modify: `src/vehicleMaterials.js`
- Modify: `src/vehicleController.js`
- Test: `tests/vehicleState.test.js`

- [ ] **Step 1: Replace the existing paint-tinted intake test**

Require body-linked handles to equal the paint colour with slightly higher roughness and lower environment intensity. Require `front_black.0`, `dvorright.0`, `hitam.0`, and `wheels.1` to remain the same neutral graphite colour after switching between burgundy, blue, and silver.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test --test-isolation=none --test-name-pattern="门把手与前脸" tests/vehicleState.test.js`

Expected: FAIL because the current `dark` trim mixes every paint colour into the intake.

- [ ] **Step 3: Split declarative trim roles**

Replace the `body`/`dark` colour-mixing model with:

```js
export const PAINT_LINKED_TRIM = Object.freeze({
  handles: Object.freeze(['primary.004']),
  graphite: Object.freeze(['front_black.0', 'dvorright.0', 'hitam.0', 'wheels.1']),
})

export const GRAPHITE_TRIM = Object.freeze({
  color: '#17191c', metalness: 0.08, roughness: 0.58, envMapIntensity: 0.22,
})
```

Do not classify `door_lf.0` or `door_lf.5` as exterior handles; they are authored dark door/interior surfaces and remain under their material role.

- [ ] **Step 4: Apply role-specific finishes**

Rename the runtime helper to `applyExteriorTrim()`. Copy the paint colour only to `handles`, setting roughness to `min(paint roughness + 0.08, 0.6)` and environment intensity below the body. Apply the fixed graphite profile to the other names while preserving their source maps.

- [ ] **Step 5: Run the focused test**

Run: `node --test --test-isolation=none --test-name-pattern="门把手与前脸" tests/vehicleState.test.js`

Expected: PASS for every paint preset.

### Task 3: Restrain Night Light Effects

**Files:**
- Modify: `src/vehicleParts.js`
- Modify: `src/renderProfile.js`
- Modify: `src/vehicleController.js`
- Test: `tests/environmentState.test.js`
- Test: `tests/vehicleState.test.js`

- [ ] **Step 1: Add numeric guard tests**

Require Bloom strength at or below `0.35`, radius at or below `0.4`, and threshold at or above `0.82`. Require headlight/fog beam opacity at or below `0.16`/`0.1`, and confirm beam visibility remains restricted to a dark scene with the corresponding lamp enabled.

- [ ] **Step 2: Run the focused tests and verify current values fail**

Run: `node --test --test-isolation=none --test-name-pattern="泛光|光束|夜晚" tests/environmentState.test.js tests/vehicleState.test.js`

Expected: FAIL on the current Bloom and beam strength values.

- [ ] **Step 3: Centralize restrained values**

Set Bloom to `{ strength: 0.3, radius: 0.35, threshold: 0.84 }`. Reduce beam opacity and radius while keeping the existing SpotLight ground pools. Keep beam meshes visible only when `darkScene` is true and the matching illumination exceeds `0.35`.

- [ ] **Step 4: Prevent outer covers from becoming flat emissive panels**

Reduce outer-cover emission to a small fraction of its associated lamp and keep its base colour unchanged. Internal textured surfaces carry the primary emission; front/rear covers only add a restrained halo.

- [ ] **Step 5: Run focused tests**

Run: `node --test --test-isolation=none --test-name-pattern="泛光|光束|夜晚|灯组" tests/environmentState.test.js tests/vehicleState.test.js`

Expected: focused tests PASS.

### Task 4: Basic Regression and Preview Release

**Files:**
- Verify: `public/assets/tesla-model-3-2018.glb`
- Verify: `dist/**`

- [ ] **Step 1: Run the model integrity checks**

Run: `npm run verify:model`

Expected: 301 nodes, 176 meshes, 58 materials, 16/16 control nodes, 14/14 required materials, and 58/58 classified materials.

- [ ] **Step 2: Run the existing test suite**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 3: Build the production bundle**

Run: `npm run build`

Expected: Vite exits 0 and produces hashed JS under `dist/assets/`; the known chunk-size warning is non-blocking.

- [ ] **Step 4: Check whitespace and review scoped changes**

Run: `git diff --check`

Expected: exit 0; line-ending conversion notices are acceptable, whitespace errors are not.

- [ ] **Step 5: Publish only the Cloudflare preview branch**

Run: `npx wrangler@4 pages deploy dist --project-name tesla-window-studio-demo --branch render-audit --commit-dirty=true`

Expected: a unique `*.tesla-window-studio-demo.pages.dev` preview URL. Do not deploy the production branch yet.

- [ ] **Step 6: Verify static deployment**

Run: `npm run verify:deploy -- <preview-url>`

Expected: HTML, hashed JavaScript, GLB, license and static assets return valid status and the deployed GLB SHA-256 remains `D6D78C9BD1BD9C7CA87A07509A2E7B6585995FCBDEC054F297167BA7C15CD878`.

- [ ] **Step 7: Request user visual acceptance**

Provide the preview URL and ask the user to inspect six camera presets plus studio/sunny/cloudy/rain/night and lamp off/on states. Only after explicit acceptance, deploy `dist` to the actual Pages production branch without using GitHub.
