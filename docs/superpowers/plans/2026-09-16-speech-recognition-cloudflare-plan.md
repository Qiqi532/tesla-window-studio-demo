# 中文语音识别与 Cloudflare 静态部署 Implementation Plan

> **For agentic workers:** 逐项执行并保留下载审批门；不得跳过模型清单确认、不得写入明文密钥、不得自动推送或合并。

**Goal:** 在现有中文控车指令基础上增加浏览器原生识别与本地 Whisper 的纯静态双引擎，并为 Cloudflare Pages + R2 部署做好可验证配置。

**Architecture:** `voice.js` 只协调 UI、权限和引擎选择；浏览器原生识别、本地录音/Worker 推理、转写规范化分别独立。应用和 ONNX Runtime 随 Pages 发布，超过 Pages 25 MiB 单文件限制的模型权重使用带 revision 的 R2 静态路径。

**Tech Stack:** Vite 8.3.0、vanilla JavaScript、Three.js 0.186.0、Node.js 24、Web Speech API、Transformers.js 3.8.1、Whisper tiny q8、Cloudflare Pages/R2。

---

## 1. 固定决策

- 保持 `codex/voice-controls` 分支和纯静态部署，不增加 React、Pages Functions、Worker 后端、云语音 API、遥测或运行时密钥。
- 默认“自动”模式：浏览器本机中文包 → 浏览器厂商服务 → 用户明确同意后的本地 Whisper。
- “浏览器”和“本地”模式可手动选择；文字输入始终可用，中文播报继续默认关闭。
- 原生服务失败后只切换后续识别，不并行录制同一句音频；用户需重新说一次。
- 行驶控制仍只允许页面按钮，已删除的无效灯组不恢复。

## 2. 模块与接口

- `src/speech/nativeRecognition.js`：探测 `available/install/processLocally`，输出 `{ candidates, engine }`，将浏览器错误映射为统一错误码。
- `src/speech/localRecognition.js`：最长 6 秒录音、静音提前停止、16 kHz 单声道重采样、Worker 请求生命周期和缓存清理。
- `src/speech/asr.worker.js`：固定加载 `Xenova/whisper-tiny@5332fcc…` 的 q8 权重，以 WASM 单线程推理，避免阻塞 Three.js 主线程。
- `src/speech/transcript.js`：保守修正常见同音词，按置信度去重候选；多个不同有效命令必须反馈歧义。
- `src/voice.js`：统一 `idle/requesting-permission/listening/transcribing/downloading-model/ready/error` 状态，协调 UI、文本降级和播报。

统一结果：

```js
{ text: '打开左前车门', engine: 'native-local' | 'native-service' | 'whisper', confidence: 0.92 }
```

统一错误码：

```text
insecure-context, permission-denied, device-not-found, device-busy,
no-speech, native-service-unavailable, language-pack-unavailable,
model-download-failed, model-load-failed, recognition-timeout,
unsupported-browser
```

## 3. 本地模型与下载审批

- 依赖固定为 `@huggingface/transformers@3.8.1`。
- 模型固定为 `Xenova/whisper-tiny`，revision `5332fcc35e32a33b86612b9a57a89be7906102b1`，q8，Apache-2.0。
- 精确下载候选、来源、R2 路径及权重 SHA-256 记录在 `docs/assets/whisper-tiny-q8-download-manifest.md`。
- **在用户确认该清单前，不下载模型文件、不上传 R2。** 下载后把实际字节数和全部 SHA-256 写回清单。
- Transformers.js WASM 从已锁定 npm 包构建到 Pages，运行时不得回退到公共 CDN。

## 4. Cloudflare 部署

- Vite 构建生成 `_headers`，限制麦克风、iframe、模型连接源、Worker 和 WASM；模型域名由公开构建变量 `VITE_ASR_MODEL_BASE_URL` 提供。
- `cloudflare/r2-cors.example.json` 只允许正式站点、localhost 和 127.0.0.1 的 `GET/HEAD`；正式应用前替换示例域名。
- R2 使用自定义生产域名和不可变 revision 路径；`r2.dev` 只用于临时验证。
- Pages 通过 Direct Upload 发布，不依赖 GitHub：

```powershell
npm ci
npm test
npm run build
npm run verify:deploy
npx wrangler@4 login
npx wrangler@4 pages deploy dist --project-name <项目名>
```

- 令牌只能来自 Wrangler OAuth 或进程环境变量；不得提交 `.env`、API token 或 R2 密钥。
- Direct Upload 项目不能原地转为 Git 集成；GitHub 恢复后如需自动部署，应另建 Git 集成项目。

## 5. 测试与验收

自动验证：

```powershell
npm test
npm run verify:model
npm run build
npm run verify:deploy
```

浏览器验证矩阵：

- 最新 Chrome、Edge；分别验证 localhost 和 Cloudflare HTTPS。
- 麦克风允许、拒绝、无设备、设备占用、无语音、原生服务不可用。
- 原生本机语言包、浏览器服务、本地模型首次下载、缓存命中、缓存清除和断网复用。
- 文本降级、中文播报开关、歧义候选不执行、Three.js 在转写期间仍可交互。
- 24 条支持指令至少成功 20 条；8 条歧义/不支持指令不得误执行。
- 验证 Pages 文件均小于 25 MiB，R2 返回正确的 CORS、`Content-Length`、`ETag` 和长期缓存头。

## 6. 执行边界与交付

- 当前 GitHub 账户暂停，只创建本地提交，不推送、不创建 PR、不自动合并。
- 没有 Cloudflare 账户、项目名、正式域名和用户授权时，不执行外部部署或 R2 写入。
- 最终报告包含修改文件、命令结果、浏览器矩阵、已知限制、分支、提交，以及 Pages/R2/PR 地址；未执行项必须明确说明原因。
