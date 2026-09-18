# Comprehensive Voice Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend deterministic Chinese voice and text commands to cover all manual lights, paint, wheel presets, gear direction, absolute speed, and relative speed while preserving the vehicle safety interlocks.

**Architecture:** Keep `VehicleController` as the authority for state transitions and limits. Expand `parseCommand` into a deterministic vocabulary/number parser, then let `commandDispatcher` resolve state-dependent driving intents and compound gear-plus-speed operations before calling the existing controller in sequence.

**Tech Stack:** Vite, native JavaScript ES modules, Node test runner, Three.js vehicle state, Cloudflare Pages Direct Upload.

---

### Task 1: Expand deterministic command parsing

**Files:**
- Modify: `src/parseCommand.js`
- Test: `tests/commands.test.js`

- [ ] **Step 1: Add failing vocabulary and number tests**

Add table-driven assertions for:

```js
[
  ['打开所有灯光', 'set-light', ['headlight', 'fog', 'tail'], 1],
  ['把车灯都关掉', 'set-light', ['headlight', 'fog', 'tail'], 0],
  ['换成红色车漆', 'set-paint', ['vehicle'], 'burgundy'],
  ['选择午夜蓝', 'set-paint', ['vehicle'], 'blue'],
  ['换成碳黑轮毂', 'set-wheel-style', ['vehicle'], 'carbon'],
  ['前进', 'set-gear', ['vehicle'], 'D'],
  ['倒车到十公里', 'set-gear', ['vehicle'], 'R'],
  ['停车', 'set-gear', ['vehicle'], 'P'],
  ['速度调到五十', 'set-speed', ['vehicle'], 50],
  ['快一点', 'adjust-speed', ['vehicle'], 10],
  ['降低二十公里', 'adjust-speed', ['vehicle'], -20],
]
```

Also assert that the compound direction commands carry `speed`, for example `倒车到十公里` yields `{ type: 'set-gear', value: 'R', speed: 10 }`, and unknown paint/wheel targets return `missing-target` rather than guessing.

- [ ] **Step 2: Run the focused test and confirm red state**

Run: `node --test tests/commands.test.js`

Expected: failures showing all-light, paint, wheel, gear, speed, and relative-speed expressions are currently unsupported.

- [ ] **Step 3: Implement centralized vocabularies and Chinese number parsing**

Add immutable target tables and helpers in `src/parseCommand.js`:

```js
const ALL_MANUAL_LIGHTS = Object.freeze(['headlight', 'fog', 'tail'])
const PAINT_TARGETS = Object.freeze([
  ['obsidian', /(曜石黑|纯黑|黑色|黑漆)/],
  ['silver', /(液态银|银灰|银色|灰色)/],
  ['burgundy', /(勃艮第红|酒红|深红|红色)/],
  ['ivory', /(象牙白|米白|白色|白漆)/],
  ['blue', /(午夜蓝|藏蓝|深蓝|蓝色)/],
])
const WHEEL_TARGETS = Object.freeze([
  ['turbine', /(涡流|涡轮|21寸|二十一寸)/],
  ['monoblock', /(单体|银色轮毂|20寸|二十寸)/],
  ['carbon', /(碳黑|黑色轮毂|22寸|二十二寸)/],
])
```

Implement `parseChineseNumber(text)` for `零/〇/一/二/两/三/四/五/六/七/八/九/十` combinations up to 99 and prefer an Arabic-number match when present. Add parser branches in this order: weather, window/trunk/door, light, paint, wheel, compound direction/gear, absolute speed, relative speed, unsupported.

For generic light nouns plus an open/close action, return all three manual lights. Explicit brake/reverse light requests must remain automatic-light commands so the controller can explain the restriction.

- [ ] **Step 4: Run focused tests and confirm green state**

Run: `node --test tests/commands.test.js`

Expected: all parser tests pass, including the pre-existing single and multi-command cases.

### Task 2: Resolve state-dependent driving commands safely

**Files:**
- Modify: `src/commandDispatcher.js`
- Test: `tests/commands.test.js`
- Test: `tests/vehicleState.test.js`

- [ ] **Step 1: Add failing dispatcher tests**

Use a stateful vehicle stub exposing `getState()` and `dispatch()` to prove:

```js
await dispatcher.execute('速度调到五十')
// P -> set-gear D -> set-speed 50

await dispatcher.execute('快一点')
// D targetSpeed 30 -> set-speed 40

await dispatcher.execute('倒车到十公里')
// set-gear R succeeds -> set-speed 10
```

Add a failure case where `set-gear(D)` returns `gear-blocked-open-parts`; assert the dependent `set-speed` is not dispatched. Add a long sentence case for “关闭所有车门，然后前进到五十，再打开全部灯光” and assert strict dispatch order.

- [ ] **Step 2: Run the focused test and confirm red state**

Run: `node --test tests/commands.test.js tests/vehicleState.test.js`

Expected: dispatcher lacks `adjust-speed`, P-to-D auto transition, and dependent compound execution.

- [ ] **Step 3: Implement intent resolution in the dispatcher**

Add focused helpers:

```js
function commandSucceeded(result) {
  return result?.ok !== false
}

function currentTargetSpeed(vehicle) {
  const state = vehicle.getState?.()
  return Number(state?.targetSpeed ?? state?.speed ?? 0)
}
```

Before an absolute or relative speed command, inspect `vehicle.getState()`; when gear is P, dispatch `set-gear(D)` and stop the dependent operation if it fails. Convert `adjust-speed` into a bounded numeric target and send the existing `set-speed`. For a gear command with optional `speed`, only send `set-speed` when gear dispatch succeeds. Continue merging feedback once per full utterance.

- [ ] **Step 4: Run focused tests and confirm green state**

Run: `node --test tests/commands.test.js tests/vehicleState.test.js`

Expected: parser, order, dependency, speed limits, and existing interlocks pass.

### Task 3: Improve speech normalization and showcase copy

**Files:**
- Modify: `src/speech/transcript.js`
- Modify: `index.html`
- Modify: `README.md`
- Test: `tests/transcript.test.js`
- Test: `tests/voice.test.js`

- [ ] **Step 1: Add failing normalization and voice-path tests**

Cover common recognition variants without broad fuzzy matching, including `D挡 -> D档`, `R挡 -> R档`, `车漆/车其`, and spacing around Arabic speed numbers. Verify a recognized long utterance reaches `execute()` once and produces one feedback message.

- [ ] **Step 2: Run speech tests and confirm red state**

Run: `node --test tests/transcript.test.js tests/voice.test.js`

Expected: new conservative replacements fail while existing confidence and ambiguity tests remain green.

- [ ] **Step 3: Implement conservative replacements and update examples**

Add only exact known substitutions to `KNOWN_REPLACEMENTS`; do not add edit-distance or AI guessing. Update the voice badge, input placeholder, privacy/help line, and README with examples for all lights, paint, direction, and speed. State clearly that the vehicle motion is a visual demo and safety interlocks still apply.

- [ ] **Step 4: Run speech tests and confirm green state**

Run: `node --test tests/transcript.test.js tests/voice.test.js`

Expected: normalization and single-feedback voice behavior pass.

### Task 4: Full verification and Cloudflare deployment

**Files:**
- Verify all modified source, test, documentation, and static files
- Build output: `dist/`

- [ ] **Step 1: Run complete verification**

Run:

```powershell
npm test
npm run build
git diff --check
```

Expected: all tests pass; glTF reports 0 errors and 0 warnings; model audit reports 301 nodes, 176 meshes, 58 materials; Vite exits 0; no whitespace errors.

- [ ] **Step 2: Deploy and verify an immutable Cloudflare build**

Run:

```powershell
npx wrangler@4 pages deploy dist --project-name tesla-window-studio-demo --branch codex/voice-controls --commit-dirty=true
```

Copy the exact immutable URL printed by Wrangler and pass it to `npm run verify:deploy --`. Expected: deployment succeeds and all Pages static files are below 25 MiB.

- [ ] **Step 3: Verify production content identity**

Download the entry JS from the immutable deployment and `https://tesla-window-studio-demo.pages.dev`, then compare both SHA-256 values with the built `dist/assets/index-*.js`. All three hashes must match before reporting the web synchronization complete.

- [ ] **Step 4: Report manual test phrases**

Provide the production URL and a compact matrix including all lights, each paint, each wheel, forward/reverse/park, absolute speed, relative speed, safety rejection, and a mixed long sentence. Do not push or merge GitHub.
