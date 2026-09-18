# Tesla 3D 车模 Demo · 项目总览与进度盘点

盘点时间：2026-09-17。本文只做现状描述，不包含任何代码改动。

---

## 1. 项目定位

实习作业项目：用一个纯静态网页展示 Tesla 2018 Model 3，支持拖动旋转、点击控车与中文语音控车，并交付可运行 demo 与 Vibe Coding 过程证据。

| 项目 | 内容 |
|---|---|
| 仓库目录 | `D:\资料\myCV\思必驰` |
| 远端 | `git@github.com:Qiqi532/tesla-window-studio-demo.git`（SSH 可用） |
| 版本 | `1.0.0`，private |
| 技术栈 | Vite 8.3.0、原生 JavaScript（无框架）、Three.js 0.186.0、Node.js 24 |
| 部署形态 | 纯静态；GitHub Pages 工作流已就绪，Cloudflare Pages Direct Upload 为推荐方案 |
| 源码规模 | src 3,626 行 / tests 1,201 行 / scripts 313 行，合计 5,140 行 |
| 车模资产 | `public/assets/tesla-model-3-2018.glb`，22,671,680 字节（21.6 MiB），301 节点 / 176 网格 / 58 材质 / 0 内置动画 |

---

## 2. 架构

三层职责拆分，所有输入走同一个命令入口：

```text
按钮 / 车身点击 / 中文语音 / 文字输入
        ↓
parseCommand(text)          → 标准命令对象（8 种类型）
        ↓
CommandDispatcher           → 车辆控制器 + 环境控制器
        ↓
VehicleController.dispatch() / EnvironmentController.setWeather()
        ↓
Three.js 场景（车模节点、克隆材质、道路、雨粒子、灯光）
```

模块清单：

| 模块 | 职责 |
|---|---|
| `src/scene.js` | 渲染器、基础灯光、帧循环、资源生命周期 |
| `src/environment.js` | 影棚/道路双模式、HDR、道路对象、性能档位 |
| `src/weather.js` | 晴天/阴天/雨天状态与近摄影机雨粒子 |
| `src/cameraRig.js` | 六个镜头预设、600 ms 平滑过渡、自动环绕、拖动中断 |
| `src/vehicle.js` | GLB 加载、部件解析、材质克隆 |
| `src/vehicleParts.js` | 节点与材质映射的唯一来源（运行时与校验脚本共用） |
| `src/vehicleMaterials.js` | 按网格克隆可变材质，避免污染共享材质 |
| `src/vehicleController.js` | 711 行的核心状态机：门/箱铰链、档位互锁、灯光、轮轴、外观 |
| `src/windows.js` | 侧窗玻璃滑动与点击拾取 |
| `src/ui.js` | 场景/天气/摄影机面板 + 车辆控制面板 |
| `src/parseCommand.js` | 中文指令解析、同义词、位置与歧义处理 |
| `src/commandDispatcher.js` | 把标准命令分发到车辆或环境控制器 |
| `src/voice.js` | 语音状态机、权限、引擎选择、文本降级、中文播报 |
| `src/speech/*` | 原生识别探测、本地录音与重采样、Whisper Worker、转写规范化 |
| `scripts/verify-model.mjs` | 构建前解析 GLB，校验 16 个必需节点与 14 个必需材质 |
| `scripts/verify-static-deploy.mjs` | 检查 dist 每个文件是否满足 Cloudflare Pages 25 MiB 限制 |

---

## 3. 已实现功能

### 3.1 场景与镜头
- 影棚 / 道路双场景，影棚可切换"幕后设备"（柔光箱、灯架、三脚架摄影机，用基础几何体生成）。
- 晴天 / 阴天 / 雨天三档天气；雨天复用阴天 HDR，叠加局部雨粒子、轻雾与湿润道路。
- 六个摄影机预设（主视觉、正面、侧面、后方、俯视、细节），约 600 ms 平滑过渡，拖动画布立即中断。
- 低速自动环绕开关，便于录屏。
- 道路 HDR 与沥青纹理延迟加载（首次进入道路才请求），之后内存复用；雨粒子只分布在摄影机附近。
- 性能降级：连续两个采样窗口低于 45 FPS 时逐档降低粒子数与渲染像素比。

### 3.2 车辆控制（统一 `dispatch()` 入口）
- **车窗**：四扇侧窗独立开合，动画中反向操作不跳变。
- **车门与备箱**：四门绕本地 Z 轴（左前 −1.08、左后 −1.02、右前 +1.08、右后 +1.02 弧度），前备箱绕本地 X 轴 +0.58、后备箱 −0.82；车身对应区域可直接点击。
- **灯光**：保留模型中可清楚辨认的前大灯、雾灯、尾灯手动开关；大灯与雾灯同时点亮克隆材质的自发光与附着灯锥；刹车灯与倒车灯由档位与车速自动控制，不接受手动开关。
- **档位与速度**：P/D/R；D 档 0–80 km/h（默认 30），R 档上限 15 km/h，P 档归零。任一车门或备箱未关闭时拒绝进入 D/R 并显示原因；行驶中车门与备箱锁定，车窗与灯光仍可用；D↔R 需先停车。
- **道路联动**：道路纹理、循环标线与前后轮轴共用同一视觉速度；R 档时轮轴与道路一起反向。
- **外观**：五种车漆 + 三种轮毂预设，材质按网格克隆，不污染镀铬、玻璃、内饰。

### 3.3 中文语音与文字控制
- 三引擎：自动模式优先浏览器本机中文语言包 → 浏览器厂商服务 → 用户确认后按需加载浏览器端 Whisper tiny（q8，WASM 单线程 Worker）。
- 识别模式可手动选择"自动 / 浏览器 / 本地"；统一错误码覆盖权限拒绝、无设备、无语音、服务不可用、模型加载失败等。
- 指令覆盖车窗、车门、前后备箱、灯光（大灯/雾灯/尾灯）与天气；天气指令在影棚中会自动进入道路场景。
- 歧义保护：把打开与关闭混在一句、说"打开车门"不给位置、多个候选映射到不同命令时，都不猜测执行。
- 文字输入始终可用，是识别失败时的正式降级路径；中文播报默认关闭，偏好只存浏览器本地；不保存录音与转写历史。

### 3.4 工程与质量
- 49 个单元测试（命令解析、语音引擎与转写、环境状态、车辆状态机与控制器联动、拾取隔离）。
- 模型检查脚本挂在 `prebuild`，节点或材质缺失、轮轴 z 位置漂移时构建直接失败。
- 署名与许可：页面常驻显示 Ameer Studio + Sketchfab 来源 + CC BY 4.0；环境素材（Poly Haven CC0）的来源、字节数与校验值记录在 `public/assets/licenses/ASSET-LICENSES.md`。

---

## 4. 当前验证状态（本次实测）

| 命令 | 结果 |
|---|---|
| `node --test --test-isolation=none tests/*.test.js` | **49 通过 / 0 失败**（Node v24.15.0，约 1.28 s） |
| `node scripts/verify-model.mjs` | **通过**：必需节点 16/16、必需材质 14/14；前轴 z 中心 −175.68、后轴 144.72 |
| 浏览器端（CDP 直驱 headless Chrome，09-16 记录） | 阶段三 58/58 通过；布局 1366×768 / 1440×900 / 1100×800 三档通过 |

尚未留存的验证证据：阶段四（语音）没有对应的浏览器验收截图与报告脚本产物，最新验证产物时间停在 09-16 16:16（阶段三）。

---

## 5. 仓库与分支状态

```
0930e19  codex/voice-controls    feat(voice): add resilient local speech recognition     09-16 23:27
642ee10                          feat(voice): add Chinese vehicle command controls         09-16 18:27
faa779b  codex/vehicle-controls  test(vehicle): cover every model click target            09-16 17:30
d9432a7                          fix(vehicle): unify model picking and control state
f5cdf8a                          feat: drive the control deck and the road from the vehicle controller
807ad9c                          feat: unify vehicle controls behind a single controller
f4b93eb                          feat: add a vehicle part map and a build-time model check
aab60de  codex/scene-weather     feat: add studio and road environments with weather      09-16 14:13
6f9b404  main                    feat: establish Tesla window demo baseline                09-16 12:57
```

- 工作区干净（`git status` 无输出）。
- **`main` 仍停在最初的基线**，阶段二、三、四都还没有合并进去。
- 磁盘占用：`node_modules` 431.9 MiB、`.workbuddy` 476.0 MiB（主要是 CDP 浏览器 profile 缓存）、`dist` 86.3 MiB、`public/assets` 43.2 MiB、`_reference/FormDrive` 41.7 MiB。

---

## 6. 待开发 / 未完成项

### 6.1 阻塞中（外部原因）
1. **GitHub 账号 Qiqi532 被 API 层封禁**（`HTTP 403 Sorry. Your account was suspended`）。影响：无法创建 PR、无法查看 Actions、无法用 `gh` 做任何仓库操作。SSH 推送不受影响。
2. **部署从未在线上跑通**。`main` 只有基线，GitHub Pages 线上版本 = 最初的车窗 Demo。Cloudflare Pages Direct Upload 也尚未执行（缺账户、项目名、正式域名与用户授权）。
3. **Whisper 本地模型未下载**。`docs/assets/whisper-tiny-q8-download-manifest.md` 仍是"等待用户确认，尚未下载或上传"，`VITE_ASR_MODEL_BASE_URL` 未配置。因此"本地识别"这条引擎在当前构建中不可用；另外本地权重约 45.5 MB，其中解码器超过 Pages 25 MiB 单文件限制，必须走 R2 自定义域名。

### 6.2 尚未开始的阶段
- **阶段五：工作区整理**（`codex/workspace-cleanup`），完全未开始：
  - 清理可重新生成的 `dist`、Vite 缓存与日志。
  - 提取 `_reference/FormDrive`（41.7 MiB，47 个文件）中仍需要的节点/角度/材质/许可信息，输出拟删除清单 + 总大小 + 保留清单，**经用户明确确认后才允许删除**。
  - 对生产 GLB 与参考副本做哈希比对；确认 Mustang 与 Concept 未被生产代码引用。
  - 从全新 `npm ci` 重新跑测试、构建与本地预览。

### 6.3 建议补做（非路线图强制）
- **阶段四的浏览器验收矩阵**：最新版 Edge / Chrome × localhost / HTTPS × 麦克风允许/拒绝/无设备/服务不可用，以及文本降级、播报开关、歧义候选不执行、24 条支持指令成功率 ≥20/24。这是路线图第 5 节的验收项，目前没有留存证据。
- **合并与 PR 流程**：阶段二、三、四的合并策略待定（原计划阶段二先合并、阶段三 PR base 指向 `codex/scene-weather`，阶段四基于 `codex/vehicle-controls`）。
- `favicon.ico` 404 控制台噪声（阶段二遗留，一直未处理）。
- 录屏素材：README 里写了完整录制顺序，但仓库中没有任何演示视频（`.gitignore` 也排除了 `*.mp4/*.mov/*.webm`）。

### 6.4 明确不做（有意收窄的范围）
- 左右轮独立转向、悬挂动画、充电口、雨刷：模型中无可用独立节点，不虚构节点。
- 转向灯 / 双闪 / 车内灯的手动开关：模型上不易辨认，语音与按钮都返回 `unavailable-light` 提示，只保留大灯、雾灯、尾灯。
- 行驶控制（档位、速度）不进语音范围，只用页面按钮。
- 不接入云语音服务、后端、遥测或运行时密钥；不引入 React 或动画库。

---

## 7. 一句话总结

**功能层面四个阶段（基线、场景天气、车辆控制、中文语音）代码都已完成并且单元测试 / 模型校验全绿；项目卡在"合并 + 上线"与"收尾清理"两件事上——前者被 GitHub 账号封禁和 Cloudflare 部署授权挡住，后者（阶段五）还没动工。**
