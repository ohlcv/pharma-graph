# 药学知识图谱 · 开发指南（DEVELOP）

> 更新日期：2026-10-29　·　本文档曾被 commit `be4e0764` 清空，2026-10-29 重写。
> 定位：日常开发模式与调试技巧。结构地图见 [ARCHITECTURE.md](./ARCHITECTURE.md)，
> 代码速查见 [CODE-WIKI.md](./CODE-WIKI.md)，工作准则见 [AGENTS.md](../AGENTS.md)。

---

## 1. 快速开始

```bash
npm install          # Node.js ≥ 20, npm ≥ 10
npm run dev          # 开发服务器 → http://localhost:5173（或 bash scripts/dev.sh）
npm run build        # 生产构建（prebuild 自动重生成 graph-data.json + manifest + 校验）
npm run preview      # 本地预览构建产物
```

改任何 `public/content/**/*.md` 后，Vite dev server 的 `contentManifestPlugin`
会自动重建 `public/graph-data.json` 与 `public/content-manifest.json`——**刷新浏览器即可**，
不要手动编辑这两个文件（构建产物；`graph-data.json` 需提交，`manifest` / `sitemap.xml` 不提交）。

## 2. 常用命令

| 命令                              | 作用                                           |
| --------------------------------- | ---------------------------------------------- |
| `npm run validate`                | 校验全部 Markdown frontmatter（CI 门禁）       |
| `npm run audit`                   | frontmatter 打分审计（永远 exit 0，只出报告）  |
| `npm run check:graph`             | 检查 graph-data.json 是否与 Markdown 同步      |
| `npm run measure-overlap`         | 三科目知识点重叠度                             |
| `npm test`                        | 全量测试（`tests/` 树，48 文件 / 591 用例）    |
| `npx vitest run tests/unit`       | 只跑纯函数层（最快）                           |
| `npx vitest run tests/component`  | 只跑 DOM / 准集成层                            |
| `npx vitest run <file>`           | 单文件调试                                     |
| `npm run lint` / `lint:fix`       | ESLint 检查 / 自动修复                         |
| `npm run build:graph`             | 单独重生成 graph-data.json                     |

> 测试放哪一层？见 AGENTS.md §2.4 的四问判定准则；**测试永远不放 `src/` 下**。

## 3. 环境变量

- 源码里**禁止** `process.env.X` 直读，一律用 `import.meta.env`（Vite 注入）。
- 可用变量见 `.env.example`。

## 4. 调试手段

| 手段                       | 说明                                                       |
| -------------------------- | ---------------------------------------------------------- |
| 应用内调试面板             | `src/ui/app-debug.ts` 提供独立调试 UI                      |
| `debug-bridge.ts`          | 控制台桥接，可在 DevTools 里直接调内部状态                 |
| `logger.ts`                | 仅 DEV 构建输出，生产零噪音                                |
| `public/diagnose.js`       | 独立诊断脚本（图数据完整性）                               |
| 帧率 / 性能                | `src/ui/stats/perf-monitor.ts` + `tools/measure-*.mjs` 系列 |

## 5. 本项目已知的坑（踩过一次就别再踩）

1. **YAML frontmatter 极其敏感**：带 `**`、跨行裸值、`|`/`>`/`@`/`%`/反引号开头的值必须双引号包裹；
   文件第一行必须是顶格 `---`。`npm run validate` 是门禁，报错先修 YAML 再继续。
2. **`hidden` 属性会被作者样式覆盖**：任何 `position:fixed; display:flex` 的浮层，
   `hidden` 属性的 UA `display:none` 会被盖掉——必须写 `.xxx[hidden] { display: none !important; }`。
3. **cytoscape 的 `ele.hidden()` 不是 display 判据**：本项目奇观节点本体全是 `opacity:0` 命中盒，
   `hidden()` 恒真。判断"是否真的显示"用 `src/core/element-visibility.ts` 的 `isElementShown()`。
4. **加新奇观的两处单点**：`src/ui/main.ts` 的 `DECOR_KEYS` + `src/core/renderer.ts` 的
   `DECOR_NODE_CLASSES`，漏一处要么开关关不掉、要么节点露出默认椭圆（详见 ARCHITECTURE §3.2）。
5. **空间系统**：空间归属是**推导**的（连通分量 + `UNIVERSE_ROOTS`），不存 frontmatter；
   改图结构后空间划分会自动变化，`src/core/spaces.ts` 有对应单元测试。
6. **大文件阈值**：`components.css`（109KB）、`tour.ts`（94KB）等已超阈值——改之前先看是否该沿职责切分（清单见 ARCHITECTURE §10）。
7. **漫游深度档位**：5 档（结构 · 概览 · 重点 · 全面 · 全部）定义在 `src/core/tour.ts` 的
   `TOUR_DEPTH_CONFIG`，UI 文案与测试均以它为准，不要在别处硬编码档名。

## 6. 排查记录

活跃问题在 `docs/DEBUG/`（仅保留未确认修复的）；已修复的归档在 `docs/archive/debug/`，
索引见 `docs/archive/debug/debug-index.md`。新问题先写 `docs/DEBUG/`，确认修复后移入归档。
