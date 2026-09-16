# Tesla 3D 场景与车窗控制 Demo

实习作业：使用 Vite、原生 JavaScript 和 Three.js 展示 Tesla 2018 Model 3。Demo 提供影棚/循环道路双场景、晴天/阴天/雨天、六个摄影机预设、自动环绕和幕后灯光设备展示，并保留点击、中文语音或文字指令控制四扇侧窗。作业原始要求保存在 `task_image.png`。

## 本地运行

```powershell
npm ci
npm run dev
```

打开终端显示的本地地址。顶部可切换影棚、道路和天气；六个镜头使用约 600 ms 平滑过渡，拖动画布会立即中断过渡。“幕后设备”只控制柔光箱、灯架和三脚架的可见性，不改变布光结果。

道路 HDR 和路面纹理在第一次进入道路时才加载，之后在内存中复用。雨粒子只分布在摄影机附近，连续低于 45 FPS 时会逐档降低粒子数和渲染像素比。

拖动旋转、滚轮缩放；点击侧窗或右侧按钮控制单窗。说或输入“打开车窗”“关闭车窗”控制全部四窗，也可指定“驾驶位”“副驾驶”“左后”“右后”。语音识别不可用时，页面会切换到文字控车提示。

## 验证与静态部署

```powershell
npm test
npm run build
npm run preview
```

Vercel：构建命令 `npm run build`，输出目录 `dist`。GitHub Pages：在仓库设置中选择 GitHub Actions 作为 Pages 来源；推送到 `main` 后使用仓库内工作流部署。Vite 使用相对 `base`，GLB 与授权说明随 `dist/assets` 发布。部署站点需使用 HTTPS，浏览器原生语音识别也可能受浏览器、麦克风权限和识别服务可用性影响；文字输入始终可用。

## 模型授权

Tesla 2018 Model 3 车模由 [Ameer Studio](https://sketchfab.com/uchiha.321abc) 创作，来源为 [Sketchfab 原模型](https://sketchfab.com/3d-models/tesla-2018-model-3-5ef9b845aaf44203b6d04e2c677e444f)，采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可。原项目提供的授权说明保存在 `public/assets/TESLA-LICENSE.md`，页面一角也持续显示署名。本 Demo 没有将车模重新授权为 MIT。

Sunny Country Road、Fouriesburg Mountain Cloudy 和 Clean Asphalt 来自 [Poly Haven](https://polyhaven.com/)，采用 CC0。精确下载文件、字节数与校验值记录在 `public/assets/licenses/ASSET-LICENSES.md`。运行时所有模型、HDR 和纹理都从本地静态资源路径加载。

## 录屏建议

使用最新版 Edge，建议录制 1366×768 或更高分辨率。按“页面加载与授权角标 → 拖动旋转和缩放 → 点击驾驶位车窗往返 → 口令打开/关闭全部车窗 → 禁用语音后输入同样指令”的顺序展示；保留运行命令、测试结果及开发过程中的中间版本作为 Vibe Coding 过程证据。
