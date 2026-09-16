# Tesla 3D 车模 Demo 后续优化 Implementation Plan

> **For agentic workers:** 按本文档的阶段顺序实施。每个阶段应在独立任务和独立 `codex/` 功能分支中完成；先测试和人工验收，再创建 PR，禁止跨阶段顺手重构。

**Goal:** 将当前 Tesla 车窗交互 Demo 扩展为具有影棚和道路场景、天气系统、完整车辆控制、中文语音控制及 GitHub Pages 在线展示能力的 3D 车模作品。

**Architecture:** 保留 Vite、原生 JavaScript 和 Three.js 架构，通过环境控制器、车辆控制器和统一命令分发层拆分职责。模型、HDR、纹理及许可证全部本地托管，生产版本保持纯静态部署，不依赖自建后端。

**Tech Stack:** Vite 8.3.0、Three.js 0.186.0、Node.js 24、Web Speech API、Node Test Runner、GitHub Actions、GitHub Pages。

---

## 1. 当前工程事实

- Tesla GLB 约 22.7 MB，包含 301 个节点、176 个网格、58 个材质，没有内置动画。
- 可直接控制的独立节点包括四扇车门、四扇侧窗、前备箱、后备箱、多组车灯和前后轮轴。
- 左右车轮合并在前后轮轴网格中，可以实现滚动，但不能直接实现左右轮独立转向或悬挂。
- 充电口和雨刷没有独立节点。如需动画，应另开 Blender 资产处理任务，不纳入本轮网页功能。
- 当前代码已经接入 `SpeechRecognition`/`webkitSpeechRecognition`、中文识别和文本降级，但只覆盖车窗，尚未完成 Edge 和 Chrome 实机验收。
- 当前 Git 仓库没有远端；工作区包含未提交项目文件以及历史文档的修改和删除状态，首次发布时必须逐项整理。

## 2. 固定技术决策

- 渲染使用 `WebGLRenderer`、ACES 色调映射、PMREM 环境反射和受控设备像素比。
- 模型继续使用 `GLTFLoader`；HDR 使用 `RGBELoader + PMREMGenerator`。
- 摄影机使用 `PerspectiveCamera + OrbitControls`，在其外增加平滑镜头预设控制器。
- 影棚使用 `RectAreaLight` 表现柔光反射，同时保留 `DirectionalLight` 产生阴影。区域灯本身不投射阴影，不能单独替代阴影灯。[Three.js RectAreaLight](https://threejs.org/docs/pages/RectAreaLight.html)
- 动画使用基于 `deltaTime` 的插值和状态机，不增加 GSAP 或其他动画库。
- 语音识别使用浏览器 Web Speech API，不接入需要密钥或服务端代理的云语音服务。
- 所有运行时资产从 `public/assets` 本地加载，不新增分析、遥测或第三方运行时请求。
- Vite 保持相对基路径，以兼容 GitHub Pages 仓库子路径和本地静态预览。
- 原创网页代码暂不额外授予开源许可证；Tesla 模型继续单独遵守 CC BY 4.0。

## 3. 目标项目结构

```text
D:\资料\myCV\思必驰\
├─ .github/workflows/
│  └─ deploy.yml
├─ docs/
│  ├─ history/
│  └─ superpowers/plans/
├─ public/assets/
│  ├─ vehicles/
│  │  ├─ tesla-model-3-2018.glb
│  │  └─ TESLA-LICENSE.md
│  ├─ environments/
│  │  ├─ sunny-country-road-2k.hdr
│  │  └─ fouriesburg-cloudy-2k.hdr
│  ├─ textures/asphalt/
│  │  ├─ diffuse-2k.jpg
│  │  ├─ normal-gl-2k.jpg
│  │  └─ roughness-2k.jpg
│  └─ licenses/
│     └─ ASSET-LICENSES.md
├─ scripts/
│  └─ verify-model.mjs
├─ src/
│  ├─ main.js
│  ├─ scene.js
│  ├─ environment.js
│  ├─ weather.js
│  ├─ cameraRig.js
│  ├─ vehicle.js
│  ├─ vehicleController.js
│  ├─ driving.js
│  ├─ windows.js
│  ├─ voice.js
│  ├─ parseCommand.js
│  ├─ ui.js
│  └─ style.css
├─ tests/
│  ├─ commands.test.js
│  ├─ voice.test.js
│  ├─ vehicleState.test.js
│  └─ environmentState.test.js
├─ index.html
├─ package.json
├─ package-lock.json
└─ vite.config.js
```

## 4. 阶段一：GitHub 基线发布

**目标分支：** 首次基线直接整理并推送 `main`。

### 工作内容

- [ ] 检查 staged、unstaged 和 untracked 文件，分别确认来源和保留方式。
- [ ] 恢复并归档原有作战手册、可行性分析及有用截图，避免基线提交误删历史资料。
- [ ] 校验 `.gitignore`，确保 `node_modules`、`dist`、缓存、日志和 `_reference` 不进入仓库。
- [ ] 扫描仓库中的密钥、环境变量值和本地绝对路径。
- [ ] 运行 `npm ci`、`npm test`、模型节点检查和 `npm run build`。
- [ ] 创建公开仓库 `Qiqi532/tesla-window-studio-demo` 并设置 `origin`。
- [ ] 配置 GitHub Actions：PR 只测试和构建，`main` 推送后部署 Pages。
- [ ] 在 GitHub Pages 中选择 GitHub Actions 作为发布来源。
- [ ] 验证线上 GLB、授权信息、CSS、模块和相对资源路径。

GitHub Pages 的部署任务需要 `pages: write` 和 `id-token: write` 权限，并使用 `github-pages` 环境。[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

### Git 同步规则

- 基线发布后，所有功能从最新 `main` 创建独立分支。
- 预定分支：`codex/scene-weather`、`codex/vehicle-controls`、`codex/voice-controls`、`codex/workspace-cleanup`。
- 每个任务完成测试后提交、推送并创建 PR，不自动合并。
- `dist` 和 `node_modules` 永不提交。
- 22.7 MB GLB 继续作为普通 Git 文件管理，不增加 Git LFS。

### 风险与验证

| 风险 | 处理方式 | 验证方式 |
|---|---|---|
| 当前工作区历史状态混杂 | 逐项查看差异，不使用未检查的全量提交 | 基线提交不包含意外删除或无关文件 |
| GitHub Pages 子路径导致 404 | 保持相对 `base`，资产使用 `BASE_URL` | Pages 网络面板没有本地资源 404 |
| CLI 无权推送工作流 | 只补充 GitHub `workflow` 授权范围 | 工作流文件成功推送且 Actions 启动 |
| 模型首屏加载较慢 | 保留进度和失败反馈 | 弱网下页面不会长期空白 |

## 5. 阶段二：场景、灯光、摄影机、天气和道路

**目标分支：** `codex/scene-weather`

### 文件职责

- `src/scene.js`：渲染器、基础灯光、帧循环和资源生命周期。
- `src/environment.js`：影棚/道路模式、HDR 环境和道路对象。
- `src/weather.js`：晴天、阴天、雨天状态及雨粒子。
- `src/cameraRig.js`：镜头预设、平滑过渡、自动环绕和用户中断。
- `src/ui.js`：场景、天气、摄影机和幕后设备控件。

### 影棚设计

- [ ] 保留深色新能源中控风格和 RoomEnvironment 反射。
- [ ] 建立主光、补光、轮廓光和低强度阴影灯。
- [ ] 用 Three.js 基础几何体生成柔光箱、灯架和三脚架摄影机，不依赖额外模型素材。
- [ ] 默认隐藏设备，开启“幕后设备”后显示，但不改变最终灯光效果。
- [ ] 提供主视觉、正面、侧面、后方、俯视和细节六个镜头预设。
- [ ] 镜头约 600 ms 平滑移动；用户拖动时立即停止自动过渡。
- [ ] 提供低速自动环绕开关，方便录屏展示。

### 道路和天气设计

- [ ] 以循环道路块、车道线和简化护栏组成道路，车辆保持为画面主体。
- [ ] 晴天使用暖色方向光、高对比阴影和干燥道路。
- [ ] 阴天使用冷色漫射环境、弱阴影和低对比度。
- [ ] 雨天复用阴天 HDR，并增加局部雨粒子、轻雾和湿润高反射道路。
- [ ] 雨粒子只在摄影机附近循环，并根据性能档位减少数量。
- [ ] HDR 和道路纹理只在首次进入道路场景时加载，随后在内存中复用。

### 已授权素材清单

| 素材 | 目标规格 | 用途 | 许可证 |
|---|---|---|---|
| [Sunny Country Road](https://polyhaven.com/a/sunny_country_road) | 2K HDR | 晴天环境与车漆反射 | CC0 |
| [Fouriesburg Mountain Cloudy](https://polyhaven.com/a/fouriesburg_mountain_cloudy) | 2K HDR | 阴天和雨天环境 | CC0 |
| [Clean Asphalt](https://polyhaven.com/a/clean_asphalt) | 2K JPG：Diffuse、Normal GL、Roughness | 道路材质 | CC0 |

下载前必须报告每个文件的直接地址、实际字节数、目标路径和许可证。上述三个素材已获授权；替换或增加素材需要另行确认。Poly Haven 素材许可说明见[官方 CC0 页面](https://polyhaven.com/license)。

### 风险与验证

| 风险 | 处理方式 | 验证方式 |
|---|---|---|
| 新资产增加首屏流量 | 道路资源延迟加载并缓存 | 首屏只请求 Tesla；切换道路后才请求环境资源 |
| 区域灯不投射阴影 | 区域灯负责反射，方向光负责阴影 | 地面有稳定接触阴影，车漆不过曝 |
| 雨粒子影响帧率 | 限制粒子范围和数量，动态降低 DPR | 1366×768 目标录屏设备稳定在 45 FPS 以上 |
| 场景切换资源泄漏 | 缓存共享纹理，销毁临时材质和几何体 | 连续切换天气 20 次，绘制调用不持续上涨 |
| HDR 与道路方向错位 | 调整背景旋转和地平线遮挡 | 道路和背景无明显方向冲突或接缝 |

## 6. 阶段三：车辆控制与行驶

**目标分支：** `codex/vehicle-controls`

### 公共接口

通过 JSDoc 固定控制接口，按钮、点击和语音都调用同一入口：

```text
VehicleController.dispatch(command)
VehicleController.getState()
VehicleController.update(deltaTime)
```

标准命令类型为 `set-window`、`set-door`、`set-trunk`、`set-light`、`set-gear`、`set-speed`、`set-paint` 和 `set-wheel-style`。

### 功能范围

- [ ] 保留四车窗独立控制、点击拾取和动画折返。
- [ ] 四车门使用模型 dummy 节点和本地轴动画：左前约 −1.08、左后约 −1.02、右前约 1.08、右后约 1.02 弧度。
- [ ] 前备箱绕本地 X 轴约 0.58 弧度，后备箱绕本地 X 轴约 −0.82 弧度。
- [ ] 为车门和前后备箱增加不可见点击区域。
- [ ] 灯光覆盖前大灯、尾灯、雾灯、左右转向灯、双闪、刹车灯、倒车灯和车内灯。
- [ ] 大灯和雾灯同时修改克隆材质的自发光，并打开附着于车身的灯光锥。
- [ ] 转向灯和双闪共享 500 ms 闪烁时钟。
- [ ] 提供 `P/D/R` 档；D 档视觉速度 0–80 km/h、默认 30 km/h，R 档最高 15 km/h。
- [ ] R 档自动打开倒车灯；减速和制动状态打开刹车灯。
- [ ] 道路纹理、循环标线和前后轮轴按照同一视觉速度更新。
- [ ] 任一车门或前后备箱未关闭时拒绝进入 D/R，并显示原因。
- [ ] 行驶期间锁定车门和备箱；车窗和车灯保持可用。
- [ ] 增加五种车漆和三种轮毂材质预设，并复制可变材质，避免污染共享材质。
- [ ] 增加 `scripts/verify-model.mjs`，构建前校验必需节点和材质。

### 明确限制

- 只实现前后轮轴滚动，不模拟左右轮独立转向和悬挂。
- 不实现没有独立节点的充电口和雨刷。
- 不将道路效果描述为真实车辆物理模拟；速度为视觉展示值。

### 风险与验证

| 风险 | 处理方式 | 验证方式 |
|---|---|---|
| 节点名称改变导致无响应 | 精确映射并运行模型检查脚本 | 缺少必需节点时检查命令明确失败 |
| 共享材质导致整车错误变色 | 可变材质全部单独克隆 | 开灯和换轮毂不会影响无关部件 |
| 车门旋转轴错误 | 使用 dummy 的本地坐标系和关闭基准 | 四门关闭后无漂移或错位 |
| 多动画互相覆盖 | 单一车辆状态机保存目标进度 | 动画中连续反向操作没有跳变 |
| 驾驶状态与开启部件冲突 | 统一档位互锁 | 任一门或备箱打开时不能进入 D/R |

## 7. 阶段四：中文语音控制

**目标分支：** `codex/voice-controls`

### 模块边界

```text
SpeechRecognitionAdapter
        ↓ 最终识别文本
parseCommand(text)
        ↓ 标准命令对象
CommandDispatcher
        ↓
VehicleController / EnvironmentController
```

`parseCommand()` 成功时返回 `{ type, targets, value, originalText }`，失败时返回 `{ error, originalText }`。

### 指令范围

- [ ] 车窗：“打开全部车窗”“关闭驾驶位车窗”“降下右后车窗”。
- [ ] 车门：“打开左前车门”“关闭全部车门”；单说“打开车门”时要求补充位置。
- [ ] 备箱：“打开前备箱”“关闭后备箱”。
- [ ] 灯光：“打开大灯”“关闭雾灯”“打开左转向灯”“打开双闪”“关闭车内灯”。
- [ ] 天气：“切换晴天”“切换阴天”“切换雨天”；在影棚中执行天气指令时自动进入道路场景。
- [ ] 行驶控制不加入语音范围，继续使用页面按钮。

### 浏览器行为

- [ ] 使用 `window.SpeechRecognition || window.webkitSpeechRecognition`。
- [ ] 设置 `lang = 'zh-CN'`、`continuous = false`、`interimResults = false`，只消费最终结果。
- [ ] 只允许用户点击后启动识别，不自动监听麦克风。
- [ ] 对不支持、权限拒绝、无麦克风、无语音和服务错误分别显示可理解的状态。
- [ ] 文本输入始终可以展开，在识别失败时自动显示，并复用同一命令解析器。
- [ ] 每个命令始终产生文字反馈。
- [ ] 语音播报默认关闭；开启后通过 `speechSynthesis` 播报，并用 `localStorage` 记住偏好。
- [ ] 播报前取消旧队列，优先选择 `zh-CN` 声音。
- [ ] 不保存录音和识别历史；页面说明浏览器可能使用厂商在线识别服务。

Chrome 等浏览器的语音识别可能依赖服务器处理，因此不能保证离线可用。[MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) GitHub Pages 的 HTTPS 和本地 `localhost` 均满足麦克风安全上下文要求。[MDN getUserMedia 安全上下文](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

### 风险与验证

| 风险 | 处理方式 | 验证方式 |
|---|---|---|
| 浏览器不支持识别 | 自动进入文本模式 | 移除 API 后所有文本命令仍可工作 |
| 用户拒绝麦克风 | 显示原因和权限指引 | Edge、Chrome 分别验证拒绝和重新授权 |
| 最终事件重复触发 | 使用会话编号和最终结果去重 | 同一事件只改变一次状态 |
| 指令歧义 | 分层解析动作、部件、位置和取值 | “打开车门”不会误开全部车门 |
| 播报队列堆积 | 新播报前调用 `cancel()` | 快速执行五条命令不产生过期播报 |
| 浏览器服务离线 | 文本输入为正式降级路径 | 服务错误后不刷新即可继续控制 |

## 8. 阶段五：工作区整理

**目标分支：** `codex/workspace-cleanup`

### 保留内容

- Tesla 生产 GLB、CC BY 4.0 授权和页面署名。
- 新增 HDR、道路纹理和 CC0 来源记录。
- `package-lock.json`、源码、测试和部署工作流。
- 原有作战手册、可行性分析及有价值截图，统一放入 `docs/history`。
- `task_image.png` 若被 README 或历史文档引用则保留；否则归档而不是直接删除。

### 清理内容

- [ ] 删除可重新生成的 `dist`。
- [ ] 清理 `node_modules/.vite` 等 Vite 缓存、日志和临时测试产物。
- [ ] 扫描无引用截图和临时文件，先列清单再处理。
- [ ] 保留 `node_modules` 供日常 `npm run dev` 使用；它不是源码缓存。
- [ ] 提取 `_reference\FormDrive` 中仍需要的节点、角度、材质和许可证信息。
- [ ] 对生产 Tesla GLB 与参考副本计算哈希，确认复制完整。
- [ ] 确认 Mustang 和 Concept 未被生产代码引用。
- [ ] 输出 `_reference\FormDrive` 拟删除清单、总大小及保留清单。
- [ ] 只有在用户明确确认最终清单后，才删除 `_reference\FormDrive`。
- [ ] 从全新 `npm ci` 开始重新运行测试、构建和本地预览。

### 风险与验证

| 风险 | 处理方式 | 验证方式 |
|---|---|---|
| 删除唯一许可证或映射资料 | 先复制、哈希比对和建立清单 | 页面授权和模型检查都通过 |
| 历史文档存在索引/工作区混合状态 | 比较 HEAD、索引和工作区版本 | `docs/history` 保留信息最完整版本 |
| 清理后依赖无法恢复 | 保留锁文件和依赖声明 | 全新 `npm ci && npm test && npm run build` 通过 |
| 误删有价值资产 | 引用扫描加人工清单 | 只处理明确列入清单的文件 |

## 9. 推荐实施顺序

1. GitHub 基线发布。
2. 场景、灯光、摄影机、天气和道路。
3. 车辆控制与行驶。
4. 中文语音控制。
5. 工作区整理。

车辆行驶依赖道路控制器，语音依赖车辆和环境的公共命令接口，因此不应交换第二至第四阶段的顺序。

## 10. 最终验收标准

- [ ] `npm run dev` 后无需额外服务即可使用。
- [ ] `npm test`、模型节点检查和 `npm run build` 全部通过。
- [ ] 影棚、道路及晴天、阴天、雨天可以稳定切换。
- [ ] 六个镜头、拖动旋转、滚轮缩放和自动环绕互不冲突。
- [ ] 四窗、四门、前后备箱和全部可识别灯组均可控制。
- [ ] 道路循环、车轮滚动、档位、速度和灯光状态一致。
- [ ] Edge 和 Chrome 在允许麦克风时可以执行中文语音。
- [ ] 识别不可用时，文本输入可以完成同范围控制。
- [ ] GitHub Pages 没有模型、脚本、样式或环境资源 404。
- [ ] 页面持续显示 Tesla 模型作者、来源和 CC BY 4.0 授权。
- [ ] 清理后项目可以从全新依赖安装重新构建。

## 11. 已确认决策与剩余确认点

已确认：

- 影棚和道路双场景，幕后设备可切换显示。
- 道路采用循环行驶展示。
- 使用本文列出的 Poly Haven CC0 素材并本地托管。
- 创建 `Qiqi532/tesla-window-studio-demo` 公开仓库。
- 先发布当前基线，后续采用功能分支和 PR。
- 原创网页代码暂不增加开源许可证。
- 语音使用 Web Speech API、文本降级和默认关闭的可选播报。
- 语音覆盖车窗、车门、灯光、前后备箱和天气，行驶保留按钮操作。
- 保留历史开发资料。

后续仅需再次确认：

- 使用本文清单以外的新素材或替代素材。
- 删除 `_reference\FormDrive` 前的最终删除清单。

## 12. 后续任务调用方式

后续新建工作任务时，复制同目录的 `2026-09-16-task-prompts.md` 中“通用 Prompt”，再附上对应任务卡。每次只执行一张任务卡，以便控制差异和独立验收。
