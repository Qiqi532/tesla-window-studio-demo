# Tesla 3D Demo 后续任务调用 Prompts

本文件用于在新的 Codex 工作任务中调用单个优化阶段。推荐按 `GITHUB-BASELINE → SCENE-WEATHER → VEHICLE-CONTROLS → VOICE-CONTROLS → WORKSPACE-CLEANUP` 的顺序执行。

## 通用 Prompt

复制以下内容，并把末尾的任务卡替换为本文件中的对应任务卡：

```text
请在 D:\资料\myCV\思必驰 中实施下方任务卡。

开始前先读取：
1. 项目内的 AGENTS.md（如存在）和 README.md；
2. docs/superpowers/plans/2026-09-16-tesla-demo-optimization-roadmap.md；
3. package.json、git status、当前分支及与任务有关的源码。

保留用户已有修改和历史资料，不覆盖不属于本任务的内容。编辑前先用 3–6 个要点说明将修改的文件和实施步骤。

固定技术栈为 Vite 8.3.0、vanilla JavaScript、Three.js 0.186.0、Node.js 24。保持纯静态部署能力，不引入 React、云端后端、分析服务、遥测或明文密钥。

除 GITHUB-BASELINE 外，从最新 main 创建任务卡指定的 codex/ 功能分支。只实现当前任务卡范围；不要顺带实施后续任务，也不要删除或重置现有用户修改。

完成必要的单元测试、模型检查、npm run build 和浏览器人工验证。完成后整理变更，创建小而清晰的提交，推送功能分支并创建 PR，但不要自动合并。

如果任务需要下载素材，先列出准确来源、直接下载地址、实际字节数、目标路径和许可证，再下载路线图中已授权的文件。不得额外下载未授权素材。

最终报告必须包含：完成内容、修改文件、执行的验证命令及结果、已知限制、分支名、提交、PR 或 Pages 地址。

任务卡：
【将对应任务卡粘贴到这里】
```

## 任务卡 1：GitHub 基线发布

```text
[GITHUB-BASELINE]

整理当前 staged、unstaged 和 untracked 内容，恢复并归档历史文档，建立当前可用 Demo 的基线提交。

创建公开仓库 Qiqi532/tesla-window-studio-demo，配置 origin、GitHub Actions 和 GitHub Pages。PR 执行测试与构建；main 推送成功后部署 dist。

推送 main 后等待工作流完成，并验证 Pages 中的 HTML、CSS、JavaScript、Tesla GLB、授权信息和相对资源路径。不得提交 node_modules、dist、缓存、日志或 _reference。
```

## 任务卡 2：场景、天气和道路

```text
[SCENE-WEATHER]
目标分支：codex/scene-weather

实现影棚/道路双场景、可切换幕后灯光设备、六个摄影机预设、平滑镜头、自动环绕、循环道路以及晴天、阴天、雨天。

按路线图既定清单下载并本地保存 Sunny Country Road 2K HDR、Fouriesburg Mountain Cloudy 2K HDR，以及 Clean Asphalt 的 2K Diffuse、Normal GL 和 Roughness 贴图。下载前先报告直接地址、实际大小、目标路径和 CC0 许可证，并补充资产来源文档。

道路资源必须延迟加载。雨粒子限制在摄影机附近并支持性能降级。验证场景切换、资源释放、1366×768 录屏性能和 GitHub Pages 相对路径。
```

## 任务卡 3：车辆控制与行驶

```text
[VEHICLE-CONTROLS]
目标分支：codex/vehicle-controls

建立统一 VehicleController 和标准命令对象，扩展四车门、前后备箱、前后灯、雾灯、转向灯、双闪、刹车灯、倒车灯、车内灯、P/D/R、速度、道路与轮轴联动、档位互锁、车漆和轮毂预设。

增加车门和备箱的模型点击区域、动画中反向折返、共享材质克隆、模型节点检查脚本及车辆状态测试。

模型只支持前后轮轴整体滚动；不得虚构左右轮独立转向、悬挂、充电口或雨刷节点。完成后验证所有按钮、模型点击、动画互锁和道路联动。
```

## 任务卡 4：中文语音控制

```text
[VOICE-CONTROLS]
目标分支：codex/voice-controls

在现有 voice.js 和 parseCommand.js 基础上扩展车窗、车门、灯光、前后备箱和天气指令。行驶控制保持按钮操作。

实现统一命令格式、中文同义词、位置解析、歧义反馈、最终结果去重、浏览器错误分类、永久可用的文本输入，以及默认关闭的可选中文语音播报。天气命令在影棚模式下自动进入道路场景。

不接入云语音服务或 API 密钥。分别在最新版 Edge 和 Chrome 验证 localhost/HTTPS、允许麦克风、拒绝权限、服务不可用和文本降级路径，并补齐命令解析测试。
```

## 任务卡 5：工作区整理

```text
[WORKSPACE-CLEANUP]
目标分支：codex/workspace-cleanup

扫描并整理工作区，保留生产资产、许可证、package-lock.json、源码、测试、部署工作流和历史资料；清理 dist、Vite 缓存、日志及确认无引用的临时文件。

提取 _reference\FormDrive 中仍需要的节点、角度、材质和授权信息；对生产 Tesla GLB 与参考副本计算哈希；确认 Mustang 和 Concept 未被生产代码引用。

输出 _reference\FormDrive 的拟删除清单、总大小和保留清单。在用户明确确认最终清单后才允许删除该目录。清理完成后从全新 npm ci 开始重新测试、构建和预览。
```

## 最短调用示例

如果新的工作任务已经能访问当前目录，也可以使用以下简短 Prompt：

```text
请读取 docs/superpowers/plans/2026-09-16-tesla-demo-optimization-roadmap.md 和 docs/superpowers/plans/2026-09-16-task-prompts.md，严格实施其中的【SCENE-WEATHER】任务卡。只做这一阶段，按文档创建分支、验证、提交、推送并创建 PR，不自动合并。
```
