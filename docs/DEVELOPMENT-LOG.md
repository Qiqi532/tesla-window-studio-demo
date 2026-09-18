# 开发记录与命令

更新时间：2026-09-17。本文件把 Git 历史、现有项目文档和本地工作记忆汇总为可复现记录；不包含密钥、令牌或 `.env.local` 的实际值。

## 阶段记录

### 2026-09-15：需求研究与可行性分析

- `8beb624 docs: initialize project research`
- 保存原始作业图片 `task_image.png`。
- 建立 3D 车模 Demo 作战手册和可行性分析。

### 2026-09-16：基线版本

- `39e2153 docs: archive initial project research`
- `6f9b404 feat: establish Tesla window demo baseline`
- 完成 Vite + Three.js 基线、Tesla GLB 加载、四侧窗交互、中文车窗指令、测试和 GitHub Pages 工作流。

### 2026-09-16：场景、天气与摄影机

- `aab60de feat: add studio and road environments with weather`
- 完成影棚/道路场景、晴天/阴天/雨天、六个镜头、道路 HDR/纹理、性能降级和环境状态测试。
- 引入的 Poly Haven 资产来源及校验值记录在 `public/assets/licenses/ASSET-LICENSES.md`。

### 2026-09-16：车辆控制

- `f4b93eb feat: add a vehicle part map and a build-time model check`
- `807ad9c feat: unify vehicle controls behind a single controller`
- `f5cdf8a feat: drive the control deck and the road from the vehicle controller`
- `d9432a7 fix(vehicle): unify model picking and control state`
- `faa779b test(vehicle): cover every model click target`
- 完成四门、前后备箱、灯光、P/D/R、速度、轮轴、车漆、轮毂、互锁和统一控制器。

### 2026-09-16：中文语音控制

- `642ee10 feat(voice): add Chinese vehicle command controls`
- `0930e19 feat(voice): add resilient local speech recognition`
- 完成浏览器语音、本地 Whisper、文字降级、播报开关、错误归一化和歧义保护。

### 2026-09-17：设计补充、本地模型与渲染收尾

- `7a14b48 docs: define vehicle rendering finish design`
- `fd6506b docs: define comprehensive voice controls`
- Whisper tiny q8 的 13 个文件已下载到本地忽略目录并核对校验值；R2 运行时文件已完成可用性、CORS、缓存与 Range 检查。
- 修复 Whisper Worker 远程路径模板，完成模型就绪验证。
- 重做灯罩、灯片、夜间光束、泛光和随车漆变化的饰件。
- 扩展到春夏秋冬与晴天/阴天/雨天/雪天/夜晚组合，并编写多指令解析/分发计划。
- 以上大量成果仍在工作区中，尚未形成新的本地提交。

## 当前 Git 状态要点

- 当前分支：`codex/voice-controls`。
- `main` 仍停在基线提交 `6f9b404`。
- 当前工作区相对 `HEAD` 有 26 个已跟踪文件发生变化，统计约为 6,080 行新增、800 行删除。
- 另有环境资产、纹理、测试、计划和配置等未跟踪文件；清理时必须全部视为开发成果，而不是垃圾文件。
- `.git` 是当前唯一完整本地历史，禁止清理、压缩、重建或手工修改。

## 标准开发命令

### 安装与运行

```powershell
npm ci
npm run dev
```

`npm ci` 会依据 `package-lock.json` 重建 `node_modules`；开发服务器地址以终端输出为准。

### 测试与模型校验

```powershell
npm test
npm run verify:gltf
npm run verify:model
```

底层等价命令：

```powershell
node --test --test-isolation=none tests/*.test.js
node scripts/verify-model.mjs
```

### 构建与静态部署校验

```powershell
npm run build
npm run verify:deploy
npm run preview
```

`npm run build` 会自动通过 `prebuild` 依次运行 GLB 与模型节点检查；产物写入可再生成的 `dist/`。

### 带本地识别配置的构建

不要把真实地址或凭据写入 Git。仅在当前 PowerShell 会话中设置：

```powershell
$env:VITE_ASR_MODEL_BASE_URL = 'https://<模型静态域名>/asr/'
npm run build
npm run verify:deploy
```

### Cloudflare Pages Direct Upload

```powershell
npx wrangler@4 pages deploy dist --project-name <项目名>
```

执行前必须确认账户、项目名、构建时模型地址及部署授权。

### Git 只读检查

```powershell
git status --short --branch
git diff --stat
git diff --name-status
git log --oneline --decorate --all
```

当前 GitHub 账号/API 状态异常；提交、推送、建 PR 或改分支前必须单独确认。

## 已记录的验证结果

- 2026-09-17 早期盘点：49 个测试通过、0 失败；模型必需节点 16/16、材质 14/14。
- 车灯与渲染收尾后：本地工作记忆记录为 57 个测试通过。
- 2026-09-17 文件清理后：73 个测试通过、0 失败；模型必需节点 16/16、材质 14/14；生产构建通过；27 个静态文件全部低于 Cloudflare Pages 25 MiB 单文件限制。
- Vite 构建在沙箱内曾因 Windows 路径解析需要创建子进程而报 `spawn EPERM`；同一命令在获准的沙箱外环境成功，确认不是项目代码或依赖缺失。
- `.workbuddy/tmp` 中保留浏览器验证脚本、JSON 报告与多组截图；未归档前不得整目录删除。

## 2026-09-17 文件整理与清理

- 新增 `docs/README.md`、`docs/DEVELOPMENT-LOG.md`、`docs/PROJECT-CLEANUP-AUDIT.md` 和本清理计划。
- 创建 `.workbuddy/backups/pre-cleanup-2026-09-17.zip`，包含 989 个关键条目，SHA-256 为 `453265A5400F148A4A24033AF2EE418C24CFC6321D30DBBC218AD1CCD818AE54`。
- 删除三个 Chromium 临时 profile、可再生成的 `dist/` 和空 `.wrangler/`，净释放约 1.32 GiB。
- 保留 `node_modules/` 供继续开发；保留 `_reference/`、本地模型和验证截图/脚本，避免在 GitHub 不可用时失去唯一资料。
- 最终核验时发现根目录录屏已被外部/人工操作移入 D 盘回收站；同尺寸文件仍可恢复，本轮未擅自还原或永久删除。

## 本机执行注意事项

- 优先使用 PowerShell/Node 命令；既往 Bash 环境缺少常见工具且对非 ASCII 路径不稳定。
- 浏览器可视化验证时需避免窗口被遮挡或最小化，否则 `requestAnimationFrame` 可能暂停并导致假超时。
- 状态与截图应在同一验证脚本、同一时刻采集，避免固定文件名被后续运行覆盖。
- 同一页面不要并发执行两个浏览器验证脚本，验证期间不要修改源码触发 Vite HMR。
