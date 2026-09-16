# Whisper Tiny Q8 下载审批清单

状态：**等待用户确认，尚未下载或上传任何模型文件。**

模型：`Xenova/whisper-tiny`

固定 revision：`5332fcc35e32a33b86612b9a57a89be7906102b1`

许可证：Apache-2.0

上游仓库：https://huggingface.co/Xenova/whisper-tiny/tree/5332fcc35e32a33b86612b9a57a89be7906102b1

R2 前缀：`asr/Xenova/whisper-tiny/5332fcc35e32a33b86612b9a57a89be7906102b1/`

## 待批准文件

所有直接地址都锁定到同一个 revision，禁止改用 `main`。表中的“上游大小”来自 Hugging Face 文件页；“本地实测”只有在批准下载、完成 SHA-256 校验后填写。

| 文件 | 直接下载地址 | 上游大小 | 上游 SHA-256 | R2 目标路径 | 本地实测 |
|---|---|---:|---|---|---|
| `config.json` | `https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/config.json?download=true` | 2.25 kB | 下载后计算 | `…/config.json` | 未下载 |
| `generation_config.json` | `https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/generation_config.json?download=true` | 3.72 kB | 下载后计算 | `…/generation_config.json` | 未下载 |
| `preprocessor_config.json` | `https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/preprocessor_config.json?download=true` | 339 bytes | 下载后计算 | `…/preprocessor_config.json` | 未下载 |
| `tokenizer.json` | `https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/tokenizer.json?download=true` | 2.48 MB | 下载后计算 | `…/tokenizer.json` | 未下载 |
| `tokenizer_config.json` | `https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/tokenizer_config.json?download=true` | 283 kB | 下载后计算 | `…/tokenizer_config.json` | 未下载 |
| `special_tokens_map.json` | `https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/special_tokens_map.json?download=true` | 2.19 kB | 下载后计算 | `…/special_tokens_map.json` | 未下载 |
| `added_tokens.json` | `https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/added_tokens.json?download=true` | 2.08 kB | 下载后计算 | `…/added_tokens.json` | 未下载 |
| `merges.txt` | `https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/merges.txt?download=true` | 494 kB | 下载后计算 | `…/merges.txt` | 未下载 |
| `normalizer.json` | `https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/normalizer.json?download=true` | 52.7 kB | 下载后计算 | `…/normalizer.json` | 未下载 |
| `vocab.json` | `https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/vocab.json?download=true` | 1.04 MB | 下载后计算 | `…/vocab.json` | 未下载 |
| `onnx/encoder_model_quantized.onnx` | `https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/onnx/encoder_model_quantized.onnx?download=true` | 10,124,910 bytes | `fd9d995b9dcb0520f0dbf6cf68651af639fc385f594d9d876e69ca2802dc438e` | `…/onnx/encoder_model_quantized.onnx` | 未下载 |
| `onnx/decoder_model_merged_quantized.onnx` | `https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/onnx/decoder_model_merged_quantized.onnx?download=true` | 30,727,765 bytes | `6c0c125986b007d2e3734bec84c18bda0152071b90b87fadac6d7764499927a0` | `…/onnx/decoder_model_merged_quantized.onnx` | 未下载 |
| `Apache-2.0.txt` | `https://www.apache.org/licenses/LICENSE-2.0.txt` | 下载后记录 | 下载后计算 | `asr/licenses/Apache-2.0.txt` | 未下载 |

## 下载后的强制检查

1. 逐文件记录实际字节数与 `Get-FileHash -Algorithm SHA256`。
2. 两个 ONNX 文件必须与上表 SHA-256 完全一致；小文件的哈希写回本表。
3. 仅上传本表文件，不下载整个 1.87 GB 仓库。
4. 上传后以 `HEAD` 检查 R2 的 `Content-Length`、`ETag`、CORS 和缓存响应头。
5. 全部验证通过后才配置 `VITE_ASR_MODEL_BASE_URL=https://models.<用户域名>/asr/`。
