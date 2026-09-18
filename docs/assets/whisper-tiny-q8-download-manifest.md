# Whisper Tiny Q8 下载审批清单

状态：**已下载、已校验、已部署到 R2 并通过浏览器端到端加载验证**（2026-09-17）。

模型：`Xenova/whisper-tiny`

固定 revision：`5332fcc35e32a33b86612b9a57a89be7906102b1`

许可证：Apache-2.0

上游仓库：https://huggingface.co/Xenova/whisper-tiny/tree/5332fcc35e32a33b86612b9a57a89be7906102b1

R2 路径前缀：`asr/Xenova/whisper-tiny/5332fcc35e32a33b86612b9a57a89be7906102b1/`

## 下载通道说明

本机 `C:\Windows\System32\drivers\etc\hosts` 存在 `127.0.0.1 huggingface.co`，`huggingface.co` 在本机不可达。实际下载改走同一 revision 的镜像 `https://hf-mirror.com`（文件路径与上游完全一致）。两个 ONNX 权重的 SHA-256 与上游登记值逐字节一致，可确认镜像未改动内容。

## 已下载文件（实测）

本地暂存目录（已 gitignore）：`.workbuddy/asr-model/asr/Xenova/whisper-tiny/<revision>/`

| 文件 | 实际字节数 | SHA-256 | R2 状态 |
|---|---:|---|---|
| `config.json` | 2,248 | `2b2e4e519084e0ea028b19b153f95202735a971870d6844aa26e559edd292e94` | 已上传 |
| `generation_config.json` | 3,716 | `68ac791fcb4999461a313472125042934656240ba1cba7d1c2627fcbb19ac24c` | 已上传 |
| `preprocessor_config.json` | 339 | `a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d` | 已上传 |
| `tokenizer.json` | 2,480,466 | `27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566` | 已上传 |
| `tokenizer_config.json` | 282,683 | `2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce` | 已上传 |
| `special_tokens_map.json` | 2,194 | `e67ae3a0aaa99abcd9f187138e12db1f65c16a14761c50ef10ef2c174a7a691` | 已上传 |
| `added_tokens.json` | 2,082 | `ce949fe720c14311cb6c446e69cfe340dc669d7b006077a6feed6ae571dd7e88` | 已上传 |
| `merges.txt` | 493,869 | `2df2990a395e35e8dfbc7511e08c12d56018d8d04691e0133e5d63b21e154dc6` | 已上传 |
| `normalizer.json` | 52,666 | `bf1c507dc8724ca9cf9903640dacfb69dae2f00edee4f21ceba106a7392f26dd` | 已上传 |
| `vocab.json` | 1,036,584 | `50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a` | 已上传 |
| `onnx/encoder_model_quantized.onnx` | 10,124,910 | `fd9d995b9dcb0520f0dbf6cf68651af639fc385f594d9d876e69ca2802dc438e` | 已上传（与上游登记值一致） |
| `onnx/decoder_model_merged_quantized.onnx` | 30,727,765 | `6c0c125986b007d2e3734bec84c18bda0152071b90b87fadac6d7764499927a0` | 已上传（与上游登记值一致） |
| `Apache-2.0.txt`（许可证） | 11,358 | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` | **未上传（R2 返回 404）** |

合计 13 个文件 / 43.1 MiB。运行时实际按需下载的只有上表 12 个模型文件；许可证文件不影响运行。

## 不需要的文件

上游仓库还存在 `quant_config.json`、`quantize_config.json`。已核对 `@huggingface/transformers@3.8.1` 源码：库中没有任何位置引用这两个文件名（`DEFAULT_DTYPE_SUFFIX_MAPPING` 把 `q8` 映射为 `_quantized` 后缀，编码器/解码器会话名为 `encoder_model` 与 `decoder_model_merged`）。因此清单文件集完整，无需追加下载。

## 运行时路径契约

`src/speech/asr.worker.js` 使用：

```js
env.remoteHost = config.modelBaseUrl                      // https://<R2 域名>/asr/
env.remotePathTemplate = '{model}/{revision}/'            // 注意：以斜杠结尾，且不含 {file}
```

库内部按 `remoteHost + 模板(替换 model/revision) + 文件名` 拼接，所以模板末尾必须保留斜杠。写成 `'{model}/{revision}/{file}'` 会得到包含字面量 `{file}` 的 URL 并全部 404（2026-09-17 修复）。

## R2 验证结果（2026-09-17）

- 12 个模型文件全部 200，`Content-Length` 与本表一致，ETag(MD5) 与本地文件 MD5 一致。
- CORS 预检 204，`Access-Control-Allow-Origin` 正确回显 `http://localhost:5173`，允许 `GET, HEAD`，`max-age=7200`。
- `Cache-Control: public, max-age=31536000, immutable`；`Range` 请求返回 206。
- 浏览器端：worker 从 R2 拉取全部 12 个文件并写入 `transformers-cache`，模型在 2.3 s 内进入 ready（缓存命中时）。
- 唯一缺口：`licenses/Apache-2.0.txt` 404，R2 上缺少许可证副本。
