# Project Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本地为唯一副本的前提下，整理项目文档、保留开发记录，并仅在用户逐项确认后删除可重建或无价值文件。

**Architecture:** 清理分为“只读审计、证据归档、用户确认、分批删除、全量验证”五层。源码与历史永不混入自动清理；每个删除批次都有独立清单、预计释放空间和恢复方式。

**Tech Stack:** PowerShell、Git、Node.js 24、npm、Vite、Node Test Runner。

---

### Task 1: 建立文档入口

**Files:**
- Create: `docs/README.md`

- [x] **Step 1: 分类现有文档**

按项目总览、开发日志、清理审计、设计计划、历史资料和资产许可证建立索引。

- [x] **Step 2: 写入维护规则**

明确命令统一记录、临时证据先审计、敏感值不入文档、删除需确认。

### Task 2: 汇总开发记录与命令

**Files:**
- Create: `docs/DEVELOPMENT-LOG.md`

- [x] **Step 1: 从 Git 历史整理阶段**

记录 2026-09-15 至 2026-09-17 的研究、基线、场景、车辆、语音和渲染收尾阶段及提交号。

- [x] **Step 2: 记录可复现命令**

```powershell
npm ci
npm run dev
npm test
npm run verify:model
npm run build
npm run verify:deploy
npm run preview
```

- [x] **Step 3: 记录当前未提交风险**

写明当前分支、相对 HEAD 的变更规模、未跟踪资产和 `.git` 的唯一副本地位。

### Task 3: 建立清理审计

**Files:**
- Create: `docs/PROJECT-CLEANUP-AUDIT.md`

- [x] **Step 1: 记录根目录和 `.workbuddy` 占用**

列出每类文件的文件数、大小、用途和当前结论。

- [x] **Step 2: 校验参考资产**

生产 Tesla GLB 和许可证分别与参考副本比较 SHA-256；记录 Mustang/Concept 未被生产代码引用。

- [x] **Step 3: 分批列出候选清理项**

按浏览器 profile、构建产物、依赖、参考工程和验证证据分组，不执行删除。

### Task 4: 等待用户逐项确认

**Files:**
- Modify after confirmation: `docs/PROJECT-CLEANUP-AUDIT.md`

- [x] **Step 1: 用户选择清理批次**

用户确认继续清理；本轮按最保守范围执行 A、B，C、D、E 保持原样。

- [x] **Step 2: 删除前再次核对绝对路径**

```powershell
Resolve-Path .workbuddy\tmp\cdp-profile
Resolve-Path .workbuddy\tmp\cdp-profile2
Resolve-Path .workbuddy\tmp\cdp-profile3
Resolve-Path dist
Resolve-Path node_modules
Resolve-Path _reference\FormDrive
```

预期：所有路径都位于当前项目 `D:\资料\myCV\思必驰` 内。

### Task 5: 分批执行与验证

**Files:**
- Modify: `docs/PROJECT-CLEANUP-AUDIT.md`
- Build output: `dist/`

- [x] **Step 1: 仅删除用户确认的精确路径**

不得使用未解析变量、通配符、项目根目录或跨 shell 拼接的递归删除命令。

- [x] **Step 2: 使用现有锁定依赖验证**

```powershell
npm test
npm run verify:model
npm run build
npm run verify:deploy
```

结果：全部命令退出码为 0；由于 `node_modules/` 本轮保留，未重复运行 `npm ci`。

- [x] **Step 3: 核对最终 Git 状态**

```powershell
git status --short --branch
git diff --stat
```

预期：源码开发改动、未跟踪生产资产和新增文档全部仍在；只有用户确认的忽略目录被清理。

- [x] **Step 4: 更新审计结果**

在 `docs/PROJECT-CLEANUP-AUDIT.md` 记录实际删除路径、释放空间、恢复方式和验证结果。
