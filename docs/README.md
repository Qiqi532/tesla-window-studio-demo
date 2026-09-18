# 项目文档索引

本目录保存 Tesla 3D 车模 Demo 的需求、设计、开发过程、验证结果和清理审计。源码的使用说明仍以根目录 `README.md` 为准。

## 当前状态

- 项目总览与进度：`PROJECT-OVERVIEW.md`
- 开发阶段、提交与命令：`DEVELOPMENT-LOG.md`
- 文件保留/清理审计：`PROJECT-CLEANUP-AUDIT.md`
- 当前工作区含大量未提交开发成果；GitHub 暂不可作为备份，清理前必须先得到用户逐项确认。

## 文档分类

### 开发计划与设计

- `2026-09-17-语音多指令开发计划.md`
- `2026-09-17-本地验证与上线评审.md`
- `superpowers/specs/`：已经确认的功能设计。
- `superpowers/plans/`：各阶段实现与验收计划。

### 历史资料

- `history/3D车模Demo_Codex作战手册.md`
- `history/feasibility.md`

### 资产与部署记录

- `assets/whisper-tiny-q8-download-manifest.md`：Whisper 模型文件、校验值与部署状态。
- `../public/assets/licenses/ASSET-LICENSES.md`：HDR、纹理等公开资产的来源和许可证。
- `../public/assets/TESLA-LICENSE.md`：Tesla 车模许可证。

## 文档维护规则

1. 可复现的命令统一补充到 `DEVELOPMENT-LOG.md`。
2. 临时调查脚本、截图和报告先进入清理审计，不直接删除。
3. 设计文档与实现计划不与运行说明混写；运行方式只在根目录 `README.md` 维护。
4. 不在文档中记录 `.env.local` 的实际值、令牌、Cookie 或账户凭据。
5. 删除任何文件前，先更新 `PROJECT-CLEANUP-AUDIT.md` 并取得用户明确确认。
