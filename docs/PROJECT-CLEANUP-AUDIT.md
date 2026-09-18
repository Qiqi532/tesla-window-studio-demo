# 项目文件清理审计

审计时间：2026-09-17
当前状态：**安全快照已建立；批次 A、B 已清理并验证，批次 C、D、E 保留。**

## 安全前提

- GitHub 当前不可用，本地目录是唯一副本。
- 当前分支包含大量未提交、未跟踪开发成果。
- 在用户明确确认前，不删除、不移动、不覆盖任何现有文件。
- `.git/`、源码、测试、生产资产、许可证、计划、工作日志和本地运行配置均不进入删除范围。

## 根目录盘点

大小为 2026-09-17 的近似值，后续构建或验证可能改变。

| 路径 | 文件数 | 大小 | 当前结论 |
|---|---:|---:|---|
| `.workbuddy/` | 3,361 | 1,601.97 MiB | 混合内容，拆分审计，暂不删除 |
| `屏幕录制 2026-09-17 224312.mp4` | 1 | 815.77 MiB | 开发/演示证据，保留 |
| `node_modules/` | 8,525 | 488.89 MiB | 可由锁文件重建，但当前仍用于开发，待确认 |
| `dist/` | 27 | 139.66 MiB | 构建产物，可重建，候选清理 |
| `public/` | 19 | 96.58 MiB | 生产资产与许可证，保留 |
| `.git/` | 344 | 73.01 MiB | 唯一本地版本历史，绝对保留 |
| `_reference/` | 47 | 41.70 MiB | 外部参考工程，完成核对后仍需单独确认 |
| 其余源码、测试、脚本、文档与配置 | - | 小于 1 MiB（锁文件除外） | 保留 |

## `.workbuddy/` 拆分

| 路径 | 文件数 | 大小 | 当前结论 |
|---|---:|---:|---|
| `.workbuddy/tmp/cdp-profile3/` | 1,558 | 1,029.58 MiB | 浏览器临时 profile，高优先级候选清理 |
| `.workbuddy/tmp/cdp-profile/` | 859 | 256.07 MiB | 浏览器临时 profile，高优先级候选清理 |
| `.workbuddy/tmp/cdp-profile2/` | 729 | 210.15 MiB | 浏览器临时 profile，高优先级候选清理 |
| `.workbuddy/tmp/shots*` | 多组 | 约 44 MiB | 含阶段二至渲染收尾截图，先精选归档 |
| `.workbuddy/tmp/*.mjs`、报告与调查结果 | 数十个 | 小于 1 MiB | 开发命令/验证依据，先归档 |
| `.workbuddy/asr-model/` | 14 | 43.13 MiB | Whisper 本地源文件与校验依据，保留 |
| `.workbuddy/env-shots/` | 33 | 18.61 MiB | 四季×天气验证截图，保留或精选归档 |
| `.workbuddy/memory/` | 3 | 0.02 MiB | 开发过程记录，保留 |

三个 `cdp-profile*` 合计约 **1,495.80 MiB**，主要是 Chromium 缓存、语言包、优化模型、Safe Browsing 数据和扩展缓存；已在安全快照验证后删除。

## `_reference/FormDrive` 核对结果

- 参考目录共 47 个文件，约 41.70 MiB。
- 生产 Tesla GLB 与参考副本 SHA-256 完全一致：`D6D78C9BD1BD9C7CA87A07509A2E7B6585995FCBDEC054F297167BA7C15CD878`。
- 生产 Tesla 许可证与参考副本 SHA-256 完全一致：`332A6CCBED2C9A80E49A6953EF3D540C10F0EF20CBD372A0C34C93BC18D09278`。
- Mustang、Concept 模型和参考 React 源码未被生产代码引用。
- 当前项目的模型节点、铰链角度、材质、灯光与许可证信息已经进入源码、校验脚本和开发文档。
- 技术上可列为后续清理候选；由于它仍是外部参考的唯一本地副本，GitHub 恢复或另行备份前建议继续保留。

## 保留清单

### 项目必须文件

- `.git/`、`.github/`
- `src/`、`tests/`、`scripts/`
- `public/`、`cloudflare/`
- `package.json`、`package-lock.json`、`vite.config.js`、`index.html`
- `.gitignore`、`.env.example`、`README.md`
- `docs/`、`task_image.png`

### 本地唯一资料

- `.env.local`：本地运行配置；保留且不得输出实际值。
- `.workbuddy/asr-model/`：本地模型源文件。
- `.workbuddy/memory/`：开发过程记录。
- `.workbuddy/env-shots/` 与 `.workbuddy/tmp` 中尚未精选的验证证据。
- 原根目录录屏：README 将其视为 Vibe Coding/演示证据；当前位于 D 盘回收站，可按需恢复。
- `_reference/FormDrive/`：在用户再次确认前保留。

## 清理前安全快照

- 路径：`.workbuddy/backups/pre-cleanup-2026-09-17.zip`
- 大小：286.50 MiB
- 条目数：989
- SHA-256：`453265A5400F148A4A24033AF2EE418C24CFC6321D30DBBC218AD1CCD818AE54`
- 已确认包含：`.git`、源码、测试、生产资产、参考工程、本地 Whisper 模型、工作记忆、验证脚本与截图。
- 已确认排除：`node_modules/`、`dist/`、三个 `cdp-profile*`、录屏及备份目录本身。
- 录屏未进入压缩包。最终核验时发现它已于 2026-09-17 22:55:03 被外部/人工操作移入 D 盘回收站；本轮删除命令未以它为目标。回收站副本大小仍为 855,397,533 字节，可恢复，但为尊重并发改动未主动还原。

## 清理批次与状态

### A. 明确临时缓存（已完成，释放约 1.46 GiB）

- `.workbuddy/tmp/cdp-profile/`
- `.workbuddy/tmp/cdp-profile2/`
- `.workbuddy/tmp/cdp-profile3/`

执行结果：三个路径均经过绝对路径边界核验后删除；项目验证脚本与截图不在这些目录内，仍完整保留。

### B. 可再生成产物（已完成，释放约 139.66 MiB）

- `dist/`
- 空目录 `.wrangler/`

执行结果：`dist/` 删除后已成功重建并通过部署检查，随后再次删除；空 `.wrangler/` 已删除。恢复方式为重新设置需要的构建环境变量后执行 `npm run build`。

### C. 可再安装依赖（预计释放约 488.89 MiB）

- `node_modules/`

恢复方式：`npm ci`。由于当前仍在本地开发，建议最后处理或继续保留。

### D. 参考工程（预计释放约 41.70 MiB）

- `_reference/FormDrive/`

只在用户确认参考源码不再需要，且生产 GLB/许可证仍通过哈希复核后处理。

### E. 验证证据去重（预计释放量待精选后计算）

- `.workbuddy/tmp/shots/`
- `.workbuddy/tmp/shots-render/`
- `.workbuddy/tmp/shots-paint/`
- `.workbuddy/tmp/shots-light-lamp/`
- `.workbuddy/tmp/shots-car/`
- `.workbuddy/tmp/shots-lamp/`
- `.workbuddy/tmp/shots-settle/`
- `.workbuddy/tmp/shots-zoom/`

这些目录包含不同阶段和不同断言的证据，不能整批当缓存删除。应先保留每个功能的最终截图、对应 JSON 报告和生成脚本，再删除被新版本覆盖的重复截图。

## 后续确认顺序

1. 决定是否保留 C：开发期间通常保留 `node_modules/`，本次未删除。
2. GitHub 或其他外部备份恢复后，再决定 D：参考工程，本次未删除。
3. 最后人工精选 E：验证截图与脚本，不做自动批量删除，本次全部保留。

## 本轮实际结果

- 删除：三个 Chromium 临时 profile、旧 `dist/`、空 `.wrangler/`。
- 保留：`node_modules/`、`_reference/`、`.git/`、`.env.local`、本地模型、工作记忆、全部验证脚本/截图及项目开发成果。
- 录屏异常：最终核验时已不在项目根目录，但在 D 盘回收站找到同尺寸文件；未计入本轮清理释放量，也未擅自恢复。
- 删除内容合计约 1,635.46 MiB；新增安全快照 286.50 MiB；净释放约 **1,348.96 MiB（约 1.32 GiB）**。
- `npm test`：73 通过、0 失败。
- `npm run verify:model`：必需节点 16/16、必需材质 14/14，检查通过。
- `npm run build`：通过；沙箱内首次因 Vite 创建子进程被系统拒绝（`spawn EPERM`），同一命令在获准的沙箱外环境成功。
- `npm run verify:deploy`：27 个静态文件全部低于 25 MiB，检查通过。
- 最终状态：验证后生成的 `dist/` 已再次删除，保持工作区精简。

## 清理后验收命令

后续清理批次完成后可再次运行：

```powershell
npm ci
npm test
npm run verify:model
npm run build
npm run verify:deploy
git status --short --branch
```

验收标准：依赖可恢复、测试通过、模型校验通过、构建和部署检查通过，且 Git 状态只包含预期的开发改动与新增审计文档。
