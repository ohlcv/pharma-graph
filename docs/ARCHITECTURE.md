# 药学知识图谱 · 架构文档（ARCHITECTURE）

> 更新日期：2026-10-29　·　基线：commit `7583780b`（`docs/宣发/`、`docs/DEVELOP.md` 等为工作树新增；`public/graph-data.json` 为已提交的构建产物）
>
> 本文件是项目的**结构地图**：每个目录、每个文件的路径、职责、大小与行数，以及最终汇总。它是活文档，`src/`、`tests/`、`scripts/`、`docs/` 有变动时应同步更新。
>
> **路径约定**：所有路径相对于项目根目录。

---

## 1. 项目定位

一个**内容驱动的药学知识图谱**：Markdown 是资产，图谱是视图。

- 数据源：`public/content/**/*.md`（frontmatter 承载节点元数据）
- 构建期：脚本把 Markdown 预生成为 `graph-data.json` + `content-manifest.json`
- 渲染：前端用 Cytoscape.js 渲染 **2,736 节点 / 3,184 边**的交互拓扑，附带漫游学习引擎

数据与视图分离，关系只在发起方（`edges_out`）单向定义。详见 [DEVELOP.md](./DEVELOP.md)。

---

## 2. 顶层目录总览

| 路径                                        | 类型 | 职责                                                                          | 大小 / 行数                                                   |
| ------------------------------------------- | ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/`                                      | 目录 | 全部 TypeScript 源码（解析 / 核心逻辑 / UI）—— **不含测试**                   | 92 文件 / 33,282 行                                           |
| `tests/`                                    | 目录 | **物理隔离于 `src/` 的测试树**（`unit/` `component/` `e2e/` 三层；详见 §3.7） | 51 文件 / 9,901 行                                            |
| `scripts/`                                  | 目录 | 构建与治理入口（构建链、校验、审计、发布预检）                                | 11 文件 / 2,559 行                                           |
| `build-content.ts`                          | 文件 | 构建期库代码，位于项目根目录（被 vite.config 与 scripts 入口共享）           | 1 文件 / 638 行                                               |
| `tools/`                                    | 目录 | 一次性修复 / 迁移 / 性能测量工具（用完归档）                                   | 23 文件 / 4,192 行                                            |
| `docs/`                                     | 目录 | 文档（架构、规范、ADR 决策记录、调试记录、审计报告）                          | 57 文件 / 128,749 行                                           |
| `public/`                                   | 目录 | 静态资产 + 内容 Markdown + 预生成数据（Vite 的 publicDir）                    | 2,806 文件 / 82,162 行                                        |
| `dist/`                                     | 目录 | Vite 构建产物，vercel 部署时自动构建，不入仓库                                | —                                                             |
| `examples/`                                 | 目录 | 功能演示页                                                                    | 1 文件 / 1,717 行                                             |
| `archive/`                                  | 目录 | 归档内容与一次性迁移脚本                                                      | 7 文件 / 3,005 行（根目录 2 个 + `archive/scripts/` 5 个 ts） |
| `index.html`                                | 文件 | 应用唯一 HTML 入口                                                            | 116,850 B / 2,975 行                                          |
| `vite.config.ts`                            | 文件 | Vite 配置 + content 构建插件                                                  | 1,812 B / 57 行                                               |
| `package.json`                              | 文件 | 项目清单与 npm scripts                                                        | 2,113 B / 63 行                                               |
| `package-lock.json`                         | 文件 | 锁文件                                                                        | 311,564 B / 8,895 行                                          |
| `tsconfig.json`                             | 文件 | TypeScript 配置                                                               | 490 B / 21 行                                                 |
| `vitest.config.ts`                          | 文件 | Vitest 配置                                                                   | 801 B / 30 行                                                 |
| `eslint.config.js`                          | 文件 | ESLint 配置                                                                   | 6,780 B / 208 行                                              |
| `.prettierrc.json`                          | 文件 | Prettier 配置                                                                 | 200 B / 11 行                                                 |
| `vercel.json`                               | 文件 | 部署配置                                                                      | 1,168 B / 55 行                                               |
| `.env.example`                              | 文件 | 环境变量模板                                                                  | 511 B / 18 行                                                 |
| `AGENTS.md`                                 | 文件 | AI 代理工作准则（持续生效，优先级见其文首）                                   | 18,134 B / 261 行                                             |
| `README.md`                                 | 文件 | 项目说明                                                                      | 17,767 B / 255 行                                             |
| `.editorconfig` / `.gitignore` / `.prettierignore` | 文件 | 编辑器 / Git / Prettier 忽略配置                                       | 240 / 682 / 88 B                                              |
| `.cursor/rules/frontmatter-conventions.mdc` | 文件 | Cursor 规则：frontmatter YAML 写作规范                                        | 2,093 B / 62 行                                               |

> **测试隔离约定**：测试文件**全部**放在 `tests/`（参见 AGENTS.md §2.4），不在 `src/` 下。`vite.config.ts` 通过 `build.rollupOptions.external` 把 `*.test.*` 路径排除出生产构建，ESLint `no-restricted-imports` 禁止业务源码 `import` 测试文件。

## 3. `src/` — 源码（92 个文件，33,282 行，约 1.26 MB，不含测试）

### 3.1 `src/parser/` — Markdown 解析层（3 文件 / 506 行 / 19,404 B）

| 路径                            | 职责                                         |     大小 | 行数 |
| ------------------------------- | -------------------------------------------- | -------: | ---: |
| `src/parser/content-manager.ts` | 扫描 content 目录、收集文件                  |    726 B |   21 |
| `src/parser/frontmatter.ts`     | frontmatter 解析 / 序列化 / 校验入口         | 17,195 B |  451 |
| `src/parser/schema.ts`          | fill 白名单（从 FILL_CONFIG 派生）与字段校验 |  1,483 B |   34 |

> 测试已迁出 `src/parser/`，见 §3.7 / §6。原 `frontmatter.test.ts`、`location-audit.test.ts` 现在位于 `tests/component/parser/`。

### 3.2 `src/core/` — 图谱核心逻辑（顶层 23 文件 + `spectacle/` 9 文件 / 11,953 行 / 476,781 B；测试见 §3.7）

**顶层（23 文件）**

| 路径                                   | 职责                                               |     大小 |  行数 |
| -------------------------------------- | -------------------------------------------------- | -------: | ----: |
| `src/core/build-graph.ts`              | 从 frontmatter 构建节点边 + BFS 深度 / 子树算法    | 12,719 B |   348 |
| `src/core/config.ts`                   | 全局配置：FILL_CONFIG / 布局 / 边类型映射 / 主题色 | 34,374 B |   859 |
| `src/core/content-loader.ts`           | 内容加载器                                         |  3,523 B |    80 |
| `src/core/device-capability.ts`        | 设备能力检测（移动端 / 大屏 / 能否逐帧动画）       |  5,133 B |   115 |
| `src/core/edge-builder.ts`             | 汇总 edges_out → 边数据                            |    970 B |    28 |
| `src/core/edge-types.ts`               | 边类型词汇表                                       |  1,795 B |    47 |
| `src/core/force-drag.ts`               | 力导向拖拽交互                                     | 10,922 B |   332 |
| `src/core/glow-overlay.ts`             | glow / flow 光效覆盖层（独立 canvas）              | 43,607 B |   967 |
| `src/core/graph-manager.ts`            | 图数据装配与缓存管理                               |  3,826 B |   110 |
| `src/core/graph.ts`                    | 节点 / 边数据结构定义                              |  4,321 B |    97 |
| `src/core/halton.ts`                   | Halton 低差异序列（预动画铺点）                    |    965 B |    25 |
| `src/core/layout-worker.ts`            | 布局 Web Worker 入口（euler 在 worker 内算）       |  2,700 B |    85 |
| `src/core/layout-worker-client.ts`     | Worker 客户端 + 等待预动画 + 入场插值              | 14,996 B |   404 |
| `src/core/node-builder.ts`             | frontmatter → 节点数据                             |  2,711 B |    73 |
| `src/core/node-shape-outline.ts`       | 节点形状描边渲染                                   |  8,089 B |   233 |
| `src/core/optimized-content-loader.ts` | 流式 .md 加载 fallback                             | 11,475 B |   372 |
| `src/core/prebuilt-loader.ts`          | 加载预生成 graph-data.json                         |  4,407 B |   110 |
| `src/core/renderer.ts`                 | Cytoscape 实例 + 样式表 + 布局入口                 | 53,304 B | 1,207 |
| `src/core/theme-colors.ts`             | 主题色读取与切换                                   |  1,392 B |    35 |
| `src/core/tour.ts`                     | 漫游引擎（DFS/拓扑序、档位、applyRootScope）       | 96,033 B | 2,238 |
| `src/core/element-visibility.ts`       | 真实可见性判定 `isElementShown()`（display + 尺寸；修复 opacity 命中盒被 `hidden()` 误判） |  2,382 B |    42 |
| `src/core/space-layout.ts`             | 空间切换的取景 / 排布支持                          |  4,415 B |   120 |
| `src/core/spaces.ts`                   | 空间系统：连通分量 + `UNIVERSE_ROOTS` 推导多重宇宙 |  6,703 B |   200 |
| `src/core/element-visibility.ts`       | 真实可见性判定 `isElementShown()`（display + 尺寸；修复 opacity 命中盒被 `hidden()` 误判） |  2,382 B |    42 |
| `src/core/space-layout.ts`             | 空间切换的取景 / 排布支持                          |  4,415 B |   120 |
| `src/core/spaces.ts`                   | 空间系统：连通分量 + `UNIVERSE_ROOTS` 推导多重宇宙 |  6,703 B |   200 |

**`src/core/spectacle/` — 奇观节点（9 文件 / 3,826 行 / 146,019 B）**

脱离知识层的空域装置：真实 cytoscape 节点 + 独立 canvas overlay 逐帧重绘。
打 `layer-parent` class 排除出检索 / 统计 / 漫游 / force-drag，但**参与 euler
斥力物理**（不 lock），本体样式被 `stripNodeChrome()` 压全透明，只留命中盒。

**命名规范**：文件名 = `<奇观>-overlay.ts`，后缀一律 `-overlay`（该文件产出的
是 canvas 覆盖层，不是节点本身）。前缀直接取奇观名，**不加 `celestial-`**——
E8 根系与太极八卦没有共同语义可共享前缀。几何内核等非 overlay 文件用
`-geometry.ts` 等其它后缀区分。

| 路径                                         | 奇观           | 节点 id              | 职责                             |     大小 |  行数 |
| -------------------------------------------- | -------------- | -------------------- | -------------------------------- | -------: | ----: |
| `src/core/spectacle/taiji-bagua-overlay.ts` | 太极八卦       | `celestial-emblem`   | 十二重同心环 + 中心太极 + 语义级 LOD | 30,044 B | 1,005 |
| `src/core/spectacle/tesseract-overlay.ts`   | 四维空间       | `tesseract-space`    | 4D 超立方体 16 顶点 / 32 棱     | 22,202 B |   551 |
| `src/core/spectacle/fractal-tree-overlay.ts`| 生命之树       | `tree-of-life`       | L-system 树 + 末梢光点（含几何内核） | 28,245 B |   809 |
| `src/core/spectacle/e8-overlay.ts`          | E8 根系        | `e8-root-system`     | 240 根 Coxeter 平面投影 / 6720 棱 | 23,282 B |   651 |
| `src/core/spectacle/portal-overlay.ts`      | 卡冈图雅        | `portal-gate`        | 引力透镜 + 多普勒蓝移/红移吸积盘；空间之间唯一通路 | 24,777 B |   636 |
| `src/core/spectacle/jade-capital-overlay.ts`| 白玉京          | `jade-capital`       | 仙凡双层撕裂：12 玉柱 + 5 城环 + 未完成的授箓循环 | 21,189 B |   533 |
| `src/core/spectacle/decor-content.ts`       | （共享）        | —                    | 奇观正文加载，路径自节点 `rel` 推导，404 静默降级 |  3,144 B |    73 |
| `src/core/spectacle/spectacle-size.ts`      | （共享）        | —                    | 统一视觉半径 SSoT：`V = clamp(spread 系数, 200, 300)`，按 `DRAWN_EXTENT[shape]` 反推参数 |  3,365 B |    80 |

> ⚠️ **两处单点维护**，加奇观时必须同步：
> ① `src/ui/main.ts` 的 `DECOR_KEYS`（`?decor=` 白名单）+ 调用点；
> ② `src/core/renderer.ts` 的 `DECOR_NODE_CLASSES`（样式表压透明的 class 列表）。
> 漏 ① → 开关关不掉；漏 ② → 节点在样式表兜底路径下露出 cytoscape 默认椭圆。
>
> 六份 overlay 的生命周期骨架（含传送门）（canvas / ResizeObserver / rAF / visibilitychange /
> `stripNodeChrome`）**刻意各自独立不抽基类**——画法毫无共性，抽出来只会得到
> 一个塞满互斥状态的上帝对象。这是已知技术债。

> 测试已迁出 `src/core/`，见 §3.7 / §6。原 `build-graph.test.ts`、`edge-types.test.ts`、`tour.test.ts`、`tour-engine.test.ts` 现在位于 `tests/unit/core/` 或 `tests/component/core/`。原 `src/core/__tests__/`（config-layouts / cytoscape-style-tokens）已**不存在**。

### 3.3 `src/data/` — 领域词汇（1 文件 / 1,189 行 / 37,805 B）

| 路径                     | 职责           |     大小 | 行数 |
| ------------------------ | -------------- | -------: | ---: |
| `src/data/vocabulary.ts` | 药学领域词汇表 | 37,805 B | 1,189 |

### 3.4 `src/types/` — 类型扩展（2 文件 / 42 行 / 1,457 B）

| 路径                                  | 职责                   |  大小 | 行数 |
| ------------------------------------- | ---------------------- | ----: | ---: |
| `src/types/cytoscape-extensions.d.ts` | Cytoscape 类型声明补充 | 270 B |   14 |
| `src/types/cytoscape-visibility.d.ts` | 可见性相关类型补充     | 1,187 B |   28 |
| `src/types/cytoscape-visibility.d.ts` | 可见性相关类型补充     | 1,187 B |   28 |

### 3.5 `src/ui/` — 浏览器层 UI（55 文件 / 20,125 行 / 743,789 B）

> 含根目录 35 个 `.ts` + `layout/` 7 个 + `stats/` 3 个 + `styles/` 8 个 `.css` + `styles/sidebar/` 2 个 `.css`（`src/` 树内另有 4 个 `.DS_Store`，为 macOS 元数据，不计入）；测试见 §3.7。

#### 入口与装配

| 路径                          | 职责                              |     大小 | 行数 |
| ----------------------------- | --------------------------------- | -------: | ---: |
| `src/ui/main.ts`              | 应用入口，组装所有模块            | 48,183 B | 1,060 |
| `src/ui/state.ts`             | 全局 UI 状态                      |  5,302 B |  138 |
| `src/ui/action-dispatcher.ts` | data-action 指令分发              |  3,693 B |  110 |
| `src/ui/action-handlers.ts`   | 注册全部 action 处理器            |  5,474 B |  171 |
| `src/ui/dom-cache.ts`         | DOM 引用缓存                      |  1,963 B |   54 |
| `src/ui/logger.ts`            | 日志工具（DEV 才输出）            |  1,583 B |   41 |
| `src/ui/debug-bridge.ts`      | 调试桥接                          |  3,017 B |   95 |
| `src/ui/ui-helpers.ts`        | 通用 UI 辅助（toast 等）          |  3,624 B |   84 |
| `src/ui/app-debug.ts`         | 应用调试面板（独立调试 UI）       | 41,234 B |  938 |

#### 图谱交互

| 路径                           | 职责                                     |     大小 |  行数 |
| ------------------------------ | ---------------------------------------- | -------: | ----: |
| `src/ui/graph-events.ts`       | Cytoscape 事件绑定（点击 / 悬停 / 缩放） | 12,525 B |   289 |
| `src/ui/drag-manager.ts`       | 侧栏 / 面板拖拽与吸附                    | 22,385 B |   624 |
| `src/ui/focus-node.ts`         | 节点聚焦                                 |  4,108 B |   113 |
| `src/ui/highlight-engine.ts`   | 高亮引擎                                 |  13,932 B |   379 |
| `src/ui/search.ts`             | 搜索逻辑                                 |  6,399 B |   173 |
| `src/ui/search-ui.ts`          | 搜索 UI                                  |  7,844 B |   196 |
| `src/ui/keyboard-shortcuts.ts` | 快捷键                                   |  3,491 B |   114 |
| `src/ui/detail-panel.ts`       | 节点详情面板（正文懒加载 / Markdown 分节） | 29,475 B |   673 |
| `src/ui/bigscreen.ts`          | 大屏模式                                 | 23,139 B |   555 |
| `src/ui/ui-toggle.ts`          | UI 开关                                  |  6,037 B |   170 |
| `src/ui/music-player.ts`       | 背景音乐                                 |  3,080 B |    93 |
| `src/ui/starfield.ts`          | 星空背景                                 | 10,763 B |   294 |
| `src/ui/tooltip.ts`            | 通用 tooltip（body 直属浮层）            |  4,961 B |   136 |
| `src/ui/carousel.ts`           | 品牌词轮播                               |  3,764 B |   133 |
| `src/ui/speech.ts`             | 语音播报                                 | 47,045 B | 1,168 |
| `src/ui/anim-pulse.ts`         | 脉冲动画                                 |  2,367 B |    60 |
| `src/ui/graph-stats.ts`        | 图谱统计                                 |    514 B |    10 |
| `src/ui/markdown.ts`           | Markdown 渲染（marked + DOMPurify）      |  4,195 B |   136 |

#### 漫游（Tour）

| 路径                        | 职责                           |     大小 |  行数 |
| --------------------------- | ------------------------------ | -------: | ----: |
| `src/ui/tour-controller.ts` | 漫游控制器（绑定引擎与 UI）    | 69,971 B | 1,585 |
| `src/ui/tour-settings.ts`   | 漫游设置（策略/间隔/深度/朗读） | 13,006 B |   327 |

#### 空间与传送门（2026-10 新增）

| 路径                          | 职责                                                         |     大小 | 行数 |
| ----------------------------- | ------------------------------------------------------------ | -------: | ---: |
| `src/ui/space-controller.ts`  | 空间控制器：传送门点击 → 空间菜单 → 飞行切换；启动即进初始空间；`parkPortal` 停靠传送门 | 22,234 B |  554 |
| `src/ui/space-state.ts`       | 当前激活空间的 UI 状态                                        |  1,923 B |   47 |


#### 布局子系统 `src/ui/layout/`

| 路径                                      | 职责                          |     大小 | 行数 |
| ----------------------------------------- | ----------------------------- | -------: | ---: |
| `src/ui/layout/layout-engine.ts`          | 布局运行器 + 参数类型还原     |  4,415 B |  114 |
| `src/ui/layout/layout-engine-reexport.ts` | 布局引擎再导出                |    483 B |    9 |
| `src/ui/layout/layout-params.ts`          | 布局参数面板逻辑              | 10,326 B |  261 |
| `src/ui/layout/layout-params-template.ts` | 参数模板                      |  5,901 B |  133 |
| `src/ui/layout/layout-store.ts`           | 布局参数持久化                |  3,681 B |  104 |
| `src/ui/layout/layout-switcher.ts`        | 布局切换器                    |  3,256 B |   88 |
| `src/ui/layout/toolbar-actions.ts`        | 工具栏动作（fit / randomize） |  1,690 B |   44 |

#### 图例与统计

| 路径                             | 职责              |     大小 | 行数 |
| -------------------------------- | ----------------- | -------: | ---: |
| `src/ui/legend-factory.ts`       | 图例生成          |  8,610 B |  201 |
| `src/ui/legend-manager.ts`       | 图例管理          | 12,334 B |  289 |
| `src/ui/layout-manager.ts`       | 布局管理          |  1,317 B |   37 |
| `src/ui/layout-menu.ts`          | 布局菜单          |    408 B |   11 |
| `src/ui/stats/stat-cards.ts`     | 统计卡片          |  3,243 B |   78 |
| `src/ui/stats/stat-animation.ts` | 统计动画          |  1,640 B |   59 |
| `src/ui/stats/perf-monitor.ts`   | 性能监控（UI 侧） |  5,117 B |  166 |

#### 样式 `src/ui/styles/`

| 路径                                       | 职责                         |     大小 | 行数 |
| ------------------------------------------ | ---------------------------- | -------: | ---: |
| `src/ui/styles/base.css`                   | 基础样式                     | 18,536 B |  437 |
| `src/ui/styles/components.css`             | 组件样式（最大）             |108,921 B |3,765 |
| `src/ui/styles/glass.css`                  | 液态玻璃皮肤（@layer glass） | 36,991 B |  952 |
| `src/ui/styles/space.css`                  | 空间系统样式（传送门/菜单）  |  6,124 B |  214 |
| `src/ui/styles/index.css`                  | 样式入口                     |  1,572 B |   24 |
| `src/ui/styles/layout.css`                 | 布局样式                     | 20,316 B |  672 |
| `src/ui/styles/shared.css`                 | 共享工具类                   | 10,589 B |  330 |
| `src/ui/styles/sidebar/sidebar-params.css` | 侧栏参数样式                 |  5,590 B |  210 |
| `src/ui/styles/sidebar/sidebar-stats.css`  | 侧栏统计样式                 |  2,886 B |  106 |
| `src/ui/styles/tour.css`                   | 漫游 UI 样式                 | 39,629 B |1,251 |

### 3.6 `src/` 文件数 / 行数小计

| 路径                                   | 文件数 |    行数 |      字节 |
| -------------------------------------- | -----: | ------: | --------: |
| `src/parser/`                          |      3 |     506 |    19,404 |
| `src/core/`（含 `spectacle/`）         |     32 |  11,953 |   476,781 |
| `src/data/`                            |      1 |   1,189 |    37,805 |
| `src/types/`                           |      2 |      42 |     1,457 |
| `src/ui/`（含 layout/ stats/ styles/） |     55 |  20,125 |   743,789 |
| **合计**                               | **92** |**33,282**|**1,258,047** |

> 不含 `*.test.ts`：测试全部位于 §3.7 的 `tests/` 树。`src/` 树内有 4 个 `.DS_Store`（macOS 元数据，已剔除）。

### 3.7 `tests/` — 测试树（顶层目录，物理隔离于 `src/`）

> 详见 [AGENTS.md §2.4](../AGENTS.md) — 物理安全 / dev server 启动快 / 审 PR 干净三层动机。各层另有 `README.md` 说明该层定位。

#### `tests/unit/` — 纯函数 / 数据变换（18 文件 / 2,694 行 / 102,964 B）

> 默认 `vitest` 配置 `environment: node`；无 DOM、无磁盘 fixture、无 mock。

| 路径                                             | 职责                   |     大小 | 行数 |
| ------------------------------------------------ | ---------------------- | -------: | ---: |
| `tests/unit/core/build-graph.test.ts`            | 构建图数据单元测试     |  4,230 B |  135 |
| `tests/unit/core/cytoscape-style-tokens.test.ts` | 样式 token 单元测试    |  2,710 B |   65 |
| `tests/unit/core/edge-types.test.ts`             | 边类型单元测试         |  2,537 B |   60 |
| `tests/unit/core/fractal-tree-geometry.test.ts`  | 分形树几何内核         | 11,860 B |  284 |
| `tests/unit/core/halton.test.ts`                 | Halton 低差异序列      |  2,121 B |   55 |
| `tests/unit/core/decor-content.test.ts`          | 奇观内容加载降级       |  3,752 B |  103 |
| `tests/unit/core/layout-worker-client.test.ts`   | Worker 客户端协议      | 11,524 B |  286 |
| `tests/unit/core/space-layout.test.ts`           | 空间布局纯函数         |  6,033 B |  161 |
| `tests/unit/core/spaces.test.ts`                 | 空间推导（连通分量）   |  6,527 B |  154 |
| `tests/unit/core/spectacle-size.test.ts`         | 奇观统一视觉半径       |  2,323 B |   57 |
| `tests/unit/core/renderer-format-label.test.ts`  | label 格式化           |  6,461 B |  159 |
| `tests/unit/core/tesseract-geometry.test.ts`     | 四维空间几何投影       |  4,895 B |  122 |
| `tests/unit/core/tour-depth-levels.test.ts`      | 漫游 5 档深度过滤      |  6,892 B |  190 |
| `tests/unit/core/tour.test.ts`                   | 漫游引擎单元测试       |  3,503 B |   93 |
| `tests/unit/ui/speech-browser-hint.test.ts`      | 浏览器语音支持提示     |  2,104 B |   63 |
| `tests/unit/ui/speech-granularity.test.ts`       | 朗读粒度计算           | 15,107 B |  385 |
| `tests/unit/ui/speech-settings.test.ts`          | 朗读设置持久化         | 10,060 B |  316 |
| `tests/unit/README.md`                           | 该层定位说明           |    325 B |    6 |

#### `tests/component/` — DOM 行为 / 准集成（32 文件 / 7,193 行 / 271,474 B）

> 文件顶部声明 `/** @vitest-environment jsdom */`；mock `cytoscape` / `document` / `localStorage`；部分扫盘读 `public/content/**/*.md` fixture。

| 路径                                                     | 职责                       |     大小 | 行数 |
| -------------------------------------------------------- | -------------------------- | -------: | ---: |
| `tests/component/core/config-layouts.test.ts`            | 配置布局组件测试           | 10,991 B |  241 |
| `tests/component/core/tour-engine.test.ts`               | 漫游引擎集成测试           | 51,919 B |1,325 |
| `tests/component/core/tour-engine-speech.test.ts`        | 漫游 + 语音联动            | 12,131 B |  350 |
| `tests/component/parser/frontmatter.test.ts`             | frontmatter 准集成（扫盘 + 分隔线硬校验） |  9,049 B |  311 |
| `tests/component/parser/location-audit.test.ts`          | location 审计扫盘          |  1,409 B |   37 |
| `tests/component/ui/action-dispatcher.test.ts`           | action 分发器 DOM 测试     |  6,688 B |  214 |
| `tests/component/ui/app-debug.test.ts`                   | 调试面板 DOM 测试          | 12,958 B |  343 |
| `tests/component/ui/bigscreen-sidebar-roundtrip.test.ts` | 大屏侧栏往返               |  8,835 B |  242 |
| `tests/component/ui/bigscreen.test.ts`                   | 大屏 DOM                   |  6,352 B |  185 |
| `tests/component/ui/bottom-sheet-easing.test.ts`          | 底部 sheet 缓动            |  3,702 B |   88 |
| `tests/component/ui/detail-panel-body-lazy.test.ts`      | 详情面板正文懒加载         |  6,781 B |  173 |
| `tests/component/ui/detail-panel-questions.test.ts`      | 详情面板正文分节（H2/intro） |  4,979 B |  121 |
| `tests/component/ui/focus-node.test.ts`                  | 节点聚焦                   |  2,948 B |   76 |
| `tests/component/ui/graph-events-helpers.test.ts`        | 图事件辅助                 |  6,883 B |  158 |
| `tests/component/ui/graph-events.test.ts`                | 图事件                     |  7,402 B |  207 |
| `tests/component/ui/layout-manager.test.ts`              | 布局管理 DOM               |  6,119 B |  171 |
| `tests/component/ui/layout-menu.test.ts`                 | 布局菜单                   |  5,511 B |  168 |
| `tests/component/ui/legend-factory.test.ts`              | 图例生成                   |  8,257 B |  210 |
| `tests/component/ui/legend-manager.test.ts`              | 图例管理                   |  6,156 B |  165 |
| `tests/component/ui/logger.test.ts`                      | 日志                       |    978 B |   29 |
| `tests/component/ui/mobile-accordion.test.ts`            | 移动端折叠                 |  5,599 B |  136 |
| `tests/component/ui/search-ui.test.ts`                   | 搜索 UI                    |  5,457 B |  143 |
| `tests/component/ui/search.test.ts`                      | 搜索逻辑                   |  4,724 B |  131 |
| `tests/component/ui/sidebar-transition.test.ts`          | 侧栏过渡                   |  8,582 B |  199 |
| `tests/component/ui/space-controller.test.ts`            | 空间控制器 DOM             | 13,089 B |  333 |
| `tests/component/ui/space-controller.test.ts`            | 空间控制器 DOM             | 13,089 B |  333 |
| `tests/component/ui/speech-button.test.ts`               | 语音按钮                   |  7,063 B |  187 |
| `tests/component/ui/speech.test.ts`                      | 语音                       |  4,393 B |  134 |
| `tests/component/ui/state.test.ts`                       | UI state DOM               |  4,517 B |  110 |
| `tests/component/ui/tour-controller.test.ts`             | 漫游控制器 DOM             | 28,771 B |  760 |
| `tests/component/ui/tour-depth-cache.test.ts`            | 漫游深度缓存               |  1,738 B |   47 |
| `tests/component/ui/ui-toggle.test.ts`                   | UI 开关                    |  7,076 B |  186 |
| `tests/component/README.md`                              | 该层定位说明               |    417 B |   13 |

#### `tests/e2e/` — 真实浏览器驱动（1 文件 / 14 行 / 536 B，占位）

| 路径                  | 职责                                    |  大小 | 行数 |
| --------------------- | --------------------------------------- | ----: | ---: |
| `tests/e2e/README.md` | 未来 Playwright / Cypress 的占位说明    | 536 B |   14 |

#### `tests/` 小计

| 子层               | 文件数 |    行数 |      字节 |
| ------------------ | -----: | ------: | --------: |
| `tests/unit/`      |     18 |   2,694 |   102,964 |
| `tests/component/` |     32 |   7,193 |   271,474 |
| `tests/e2e/`       |      1 |      14 |       536 |
| **合计**           | **51** |**9,901**|**374,974** |

> **判定准则（写新测试前自问）**：
>
> 1. 顶部有 `/** @vitest-environment jsdom */`？ → `component/`
> 2. 扫了 `public/content/**/*.md`？ → `component/`（准集成）
> 3. mock 了 `cytoscape` / `document` / `localStorage` / `setTimeout`？ → `component/`
> 4. 都不满足 → `unit/`

## 4. 构建与工具脚本

目录重组后，`scripts/` 只保留活跃的构建 / 治理入口，构建期共享库移到 `build/`，一次性修复 / 迁移 / 测量工具移到 `tools/`。

### 4.1 `scripts/` — 构建与治理入口（11 个文件，2,559 行，约 86 KB）

| 路径                                | 职责                                  |     大小 | 行数 |
| ----------------------------------- | ------------------------------------- | -------: | ---: |
| `scripts/workbuddy-deploy.ts`       | 发布到 WorkBuddy 沙箱的「保证最新」预检 + 发布配方生成  |  5,600 B |  118 |
| `scripts/audit-frontmatter.ts`      | 打分审计（永远 exit 0，输出报告）     | 23,803 B |  636 |
| `scripts/build-content-manifest.ts` | 生成 content-manifest.json（入口）    |    344 B |   13 |
| `scripts/build-graph-data.ts`       | 生成 graph-data.json（入口）          |    342 B |   13 |
| `scripts/check-graph-fresh.ts`      | 检查图数据是否新鲜（内容级比较 + maxBuffer 修复） |  3,853 B |  102 |
| `scripts/dev.sh`                    | 开发启动脚本                          |    253 B |   14 |
| `scripts/measure-overlap.ts`        | 重叠度测量（内容目录相对项目根解析）  | 24,860 B |  912 |
| `scripts/serve.ts`                  | 本地静态服务器                        |  2,672 B |   65 |
| `scripts/validate-graph-data.ts`    | 校验 graph-data.json                  | 12,276 B |  309 |
| `scripts/validate-graph-deep.ts`    | 深度校验                              |  4,482 B |  141 |
| `scripts/validate.ts`               | 严格 schema 校验（CI 门禁，非零退出；含正文标题层级校验） |  7,356 B |  236 |

### 4.2 根目录 `build-content.ts` — 构建期共享库（1 个文件，638 行，约 22 KB）

| 路径                     | 职责                                                                                                                |     大小 | 行数 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------: | ---: |
| `build-content.ts`       | 内容构建核心：frontmatter 解析 → graph-data.json / content-manifest / sitemap（被 vite.config 与 scripts 入口共享） | 22,659 B |  638 |

### 4.3 `tools/` — 一次性修复 / 迁移 / 测量工具（23 个文件，4,192 行，约 142 KB）

| 路径                                      | 类型 | 职责                                            |     大小 | 行数 |
| ----------------------------------------- | ---- | ----------------------------------------------- | -------: | ---: |
| `tools/add-dup-label-suffixes.mjs`        | 修复 | 给基名重名但 label 漏后缀的节点补后缀           |  5,197 B |  127 |
| `tools/audit-and-fix-ids.ts`              | 修复 | 审计并修复 id                                   |  9,317 B |  300 |
| `tools/audit-tags-reason.ts`              | 审计 | 审计 tags / `edges_out[].reason` 违规清单       | 14,054 B |  436 |
| `tools/fix-duplicate-labels.cjs`          | 修复 | 修复重名 label                                  |  4,132 B |  132 |
| `tools/fix-frontmatter.py`                | 修复 | frontmatter 修复                                |  5,893 B |  178 |
| `tools/fix-section-fields.py`             | 修复 | section 字段修复                                |  6,358 B |  183 |
| `tools/fix-y1-chapters.py`                | 修复 | 药一章节修复                                    |  5,700 B |  160 |
| `tools/fix-yaml-anchors.cjs`              | 修复 | YAML anchor 修复                                |  7,502 B |  216 |
| `tools/migrate-essence-to-fill.js`        | 迁移 | essence → fill 迁移                             |  8,692 B |  260 |
| `tools/migrate-full-to-body.mjs`          | 迁移 | 超长 `summary.full` 迁移到正文                  |  6,378 B |  133 |
| `tools/migrate-ids-to-rules.ts`           | 迁移 | id → rules 迁移                                 | 19,869 B |  533 |
| `tools/measure-decor-idle.mjs`            | 测量 | 测奇观**空闲期**帧率开销（Playwright）          |  4,713 B |  128 |
| `tools/measure-euler-quality.mjs`         | 测量 | 测布局期帧率与质量                              | 10,960 B |  316 |
| `tools/measure-phase.mjs`                 | 测量 | 分阶段测加载时序帧率                            |  3,350 B |  102 |
| `tools/measure-real.mjs`                  | 测量 | 有头 Chromium 测真实 GPU 帧率                   |  3,967 B |  107 |
| `tools/measure-tree-idle.mjs`             | 测量 | 测生命之树空闲开销                              |  2,862 B |   93 |
| `tools/profile-baseline.mjs`              | 测量 | 逐项关停定位基线 FPS 开销来源                   |  4,866 B |  154 |
| `tools/profile-decor.mjs`                 | 测量 | 用 CDP 抓各 overlay 的 ScriptDuration           |  3,761 B |  117 |
| `tools/probe-worker-feasibility.mjs`      | 探针 | 验证 euler 布局能否搬进 Web Worker              |  3,409 B |   83 |
| `tools/trace-frames.mjs`                  | 测量 | 抓真实帧构成，回答空闲期时间花在哪层            |  4,248 B |  120 |
| `tools/preview-fractal-tree.mjs`          | 预览 | 离线渲染分形树参数网格（contact sheet）         |  5,180 B |  164 |
| `tools/snap-euler.mjs`                    | 截图 | 截布局收敛后的画面                              |  1,950 B |   61 |
| `tools/snap-fractal-tree.mjs`             | 截图 | 截取生命之树在真实图谱里的观感                  |  2,764 B |   89 |

> 迁移说明：`build-content.ts` 原在 `scripts/`，因被 vite.config.ts 与多个 scripts 入口 import，属共享库，先移至 `build/`；2026-10-29 再移到项目**根目录**——WorkBuddy 发布上传会按目录名排除「构建产物」，`build/` 撞名导致整个目录被拦。一次性修复 / 迁移 / 测量 / 截图工具（`fix-*`、`migrate-*`、`audit-*`、`measure-*`、`profile-*`、`probe-*`、`snap-*`、`trace-*`、`preview-*`）不参与构建链，统一放 `tools/`。

## 5. `docs/` — 文档（57 个文件，38,507 行，约 19.01 MB）

### 5.1 架构与规范

| 路径                        | 职责                                                                          |      大小 |  行数 |
| --------------------------- | ----------------------------------------------------------------------------- | --------: | ----: |
| `docs/DEVELOP.md`           | 开发指南（快速开始 / 常用命令 / 调试手段 / 已知坑；2026-10-29 重写） | 4,934 B | 73 |
| `docs/CODE-WIKI.md`         | 代码维基（全文件级说明；2026-10-29 刷新：空间系统 / 奇观子系统 / 目录树） | 47,427 B | 728 |
| `docs/RULES.md`             | 规则汇总                                                                      |  25,526 B |   319 |
| `docs/SKILL.md`             | 技能 / 工作流说明                                                             |  60,615 B |   998 |
| `docs/frontmatter.md`       | frontmatter 模板与规范（新增正文标题层级 §3.8）                              |  17,733 B |   289 |
| `docs/frontmatter-audit.md` | 审计报告（生成物，由 `npm run audit` 生成；勿手改）                           |1,085,766 B | 6,987 |
| `docs/Cytoscape.md`         | Cytoscape.js v3 通用速查（不绑定项目）                                        |  12,423 B |   408 |
| `docs/布局参数清单.md`      | LAYOUTS 配置审计清单（cytoscape 扩展字段校对）                                |  64,024 B |   710 |
| `docs/ARCHITECTURE.md`      | 本文件（结构地图，活文档；自身大小会随编辑变动）                              |  53,288 B |   558 |

### 5.2 决策记录 `docs/ADR/`

> 所有决策记录均采用 ADR- 前缀（Architecture Decision Record）。目录命名统一为 `ADR/`。

| 路径                                                        | 职责                                                          |       大小 |  行数 |
| ----------------------------------------------------------- | ------------------------------------------------------------- | ---------: | ----: |
| `docs/ADR/ADR-0001-层级关系统一使用isa方向.md`              | 层级关系统一 isa（子→父）                                     |   12,200 B |   254 |
| `docs/ADR/ADR-0002-节点美化方案选型.md`                     | 节点美化选型                                                  |   15,808 B |   296 |
| `docs/ADR/ADR-0003-tour-universe-isolation.md`              | 漫游体系隔离                                                  |    9,186 B |   183 |
| `docs/ADR/ADR-0004-图数据从运行期解析迁移到构建期预生成.md` | 预生成图数据                                                  |   10,229 B |   164 |
| `docs/ADR/ADR-0005-tour-depth-levels.md`                    | 漫游 5 档深度过滤                                             |    3,628 B |   108 |
| `docs/ADR/ADR-0006-applyRootScope-子树漫游算法重写.md`      | 子树漫游算法重写 + 档位自动升级                               |   19,781 B |   378 |
| `docs/ADR/ADR-0007-visual-tokens.md`                        | 视觉令牌体系（颜色 / 形状 / 间距统一来源）                    |    7,485 B |   165 |
| `docs/ADR/ADR-0008-surface-shadow-transition-tokens.md`     | 表面 / 阴影 / 过渡令牌                                        |    4,943 B |   119 |
| `docs/ADR/ADR-0009-tour-scope-modes.md`                    | 漫游范围模式（单选子树 / 筛选集合）                           |    5,411 B |   126 |
| `docs/ADR/ADR-0010-ios-lockscreen-narration-local-tts.md`  | iOS 锁屏漫游旁白（本地 WASM TTS + 循环音频保活，无后端无增量费用） |   13,677 B |   247 |
| `docs/ADR/ADR-0011-layout-user-viewport-respect.md`        | 布局运行期尊重用户手动镜头操作（layoutstart 快照 + layoutstop 比较） |   10,154 B |   168 |
| `docs/ADR/ADR-0012-multiverse-render-isolation.md`        | 多重宇宙渲染隔离（cy 只装当前空间 + 切片缓存 + 删全图态 + 传送门常驻） |   17,399 B |   252 |
| `docs/ADR/ADR-0001-migration-report.md`                     | ADR-0001 迁移执行报告（217 文件 / 167 isa 转换 / 2026-07-14） |  105,338 B | 1,249 |

### 5.3 调试记录 `docs/DEBUG/`

> **仅保留活跃 / 未确认修复的问题**。已修复的全部归档到 `docs/archive/debug/`（见 §5.3a）。

| 路径                                                               | 职责                                       |    大小 | 行数 |
| ------------------------------------------------------------------ | ------------------------------------------ | ------: | ---: |
| `docs/DEBUG/debug-bigscreen-sidebar-offscreen.md`                  | 大屏往返后 sidebar 消失且切换按钮无响应（**未验证修复，保留跟踪**） | 8,232 B |  160 |
| `docs/DEBUG/debug-tour-reverse-mode-degenerate.md`                 | Reverse 漫游退化成 Forward（三个根因）     |10,139 B |  208 |
| `docs/DEBUG/debug-load-freeze-layout-worker.md`                    | 加载期 20s 界面冻结 → euler 布局搬进 Worker |17,284 B |  352 |
| `docs/DEBUG/debug-entrance-animation-start-position.md`            | 入场动画从原点炸开而非从星尘环接续         |10,432 B |  173 |
| `docs/DEBUG/debug-tesseract-perf-hypothesis-rejected.md`           | 四维空间装饰拖慢帧率（假设被否证）         | 9,907 B |  176 |

### 5.3a 调试归档 `docs/archive/debug/`

| 路径                                                         | 职责                                                     |     大小 | 行数 |
| ------------------------------------------------------------ | -------------------------------------------------------- | -------: | ---: |
| `docs/archive/debug/debug-bigscreen-exit-tour-viewport.md`   | 大屏退出漫游视口（已修复 2026-09-22，cy.stop + capture） |  4,548 B |  115 |
| `docs/archive/debug/debug-index.md`                          | 2026 年度修复问题索引                                    | 17,225 B |  443 |
| `docs/archive/debug/debug-initial-zoom-euler-fit.md`         | 初始缩放被 Euler fit 覆盖（已修复，commit a1b2c3d）      |  2,204 B |   76 |
| `docs/archive/debug/debug-log-2026-09-20.md`                 | 2026-09-20 单日调试日志（一次性）                        | 10,458 B |   97 |
| `docs/archive/debug/debug-sidebar-issues.md`                 | 侧栏问题（已修复）                                       | 15,677 B |  339 |
| `docs/archive/debug/debug-tour-depth-slider-restart.md`      | 深度滑块重启（已修复）                                   |  5,659 B |  180 |
| `docs/archive/debug/debug-tour-depth1-universe-isolation.md` | 深度 1 体系隔离（已修复）                                |  5,328 B |  121 |
| `docs/archive/debug/debug-tour-mob-slider-rendering.md`      | 移动端滑块渲染（已修复）                                 | 11,428 B |  269 |
| `docs/archive/debug/debug-tour-node-duplicate.md`            | 漫游节点重复（已修复）                                   |  6,405 B |  165 |
| `docs/archive/debug/debug-tour-stack-overflow-cycle.md`      | 漫游栈溢出循环（已修复，运行时护栏 + 测试夹具）          |  8,399 B |  218 |

### 5.4 归档 `docs/archive/`

| 路径                                        | 职责                                              |        大小 |  行数 |
| ------------------------------------------- | ------------------------------------------------- | ----------: | ----: |
| `docs/archive/OLD_RULES.md`                 | 旧规则                                            |    66,247 B | 1,237 |
| `docs/archive/OLD_SKILL.md`                 | 旧技能说明                                        |    11,898 B |   176 |
| `docs/archive/OLD_frontmatter.md`           | 旧 frontmatter 规范                               |    28,308 B |   952 |
| `docs/archive/REFACTOR-RULES.md`            | 重构规则                                          |    14,507 B |   273 |
| `docs/archive/SPLIT-RULES.md`               | 拆分规则                                          |    17,345 B |   302 |
| `docs/archive/all-frontmatter-extracted.md` | 全库 frontmatter 聚合（最大单文件）               |   630,671 B |13,765 |
| `docs/archive/content v1.0.zip`             | 内容 v1.0 打包（2.1 MB，二进制不计行）            | 2,136,627 B |     — |
| `docs/archive/debug/`                       | **调试归档目录**（10 个已修复调试记录，见 §5.3a） |  ≈ 87,331 B |≈ 2,023 |
| `docs/archive/frontmatter-audit.md`         | 归档审计                                          |   194,557 B | 1,130 |
| `docs/archive/old-frontmatter-audit.md`     | 旧审计报告                                        |     2,451 B |    79 |
| `docs/archive/old-frontmatter.md`           | 旧 frontmatter 规范（早期版本）                   |    37,844 B |   675 |
| `docs/archive/新版规则全文档重构计划.md`    | 重构计划                                          |   155,584 B |   665 |
| `docs/archive/施工单-布局设置重构-2026.md`  | 布局设置重构施工单（已实施）                      |     7,531 B |   194 |
| `docs/archive/问题清单.md`                  | 问题清单                                          |     5,009 B |    62 |

### 5.5 宣发素材 `docs/宣发/`（2026-10-29 新增）

> 对外宣发与投稿素材；正文口径统一见 `宣言与介绍.md`（双金句 / 多重宇宙不剧透）。

| 路径                                  | 职责                                         |     大小 |  行数 |
| ------------------------------------- | -------------------------------------------- | -------: | ---: |
| `docs/宣发/宣言与介绍.md`                  | 作品宣言与介绍（首发帖 / 签名 / 发帖组合建议） | 8,569 B | 101 |
| `docs/宣发/star-map-carousel.html`     | 小红书六页轮播（1080×1440，已定稿）          | 1,338,279 B | 1,207 |
| `docs/宣发/1024-投稿填写稿.md`             | WorkBuddy「1024 造物挑战」投稿填写稿       | 12,192 B | 236 |


## 6. 测试汇总

> 测试**全部位于 `tests/` 顶层目录**，**不在** `src/` 下。详见 §3.7。

| 路径                               |              文件数 |  行数合计 |
| ---------------------------------- | ------------------: | --------: |
| `tests/unit/`（纯函数）            |                  18 |     2,694 |
| `tests/component/`（DOM / 准集成） |                  32 |     7,193 |
| `tests/e2e/`（占位说明）           |                   1 |        14 |
| `src/**\/__.test__.ts`             | **0**（已全部迁出） |         0 |
| **合计**                           |              **51** | **9,901** |

> **安全网**（三道都已落地）：
>
> - **Vite 端**：`vite.config.ts` 的 `build.rollupOptions.external` 配 `(id) => /\.test\./.test(id)`——测试文件对 vite 不可见，物理阻断进 `dist/`。
> - **ESLint 端**：`eslint.config.js` 加 `no-restricted-imports` 规则，禁止业务源码 import 任何 `*.test.*` 文件（错误等级 `error`，PR 阶段就 fail）。
> - **vitest coverage**：`vitest.config.ts` 已把 `tests/**` 加进 `coverage.exclude`——测试自己不进覆盖率统计。
>
> **跑测试**：`npm test`（一次性）/ `npm run test:watch` / `npx vitest run tests/unit`（最快）/ `npx vitest run tests/component`（DOM）。

## 7. `public/` — 静态资产与内容（2,806 文件，82,162 行，约 13.6 MB）

| 路径                                                    | 内容                                          |        大小 |
| ------------------------------------------------------- | --------------------------------------------- | ----------: |
| `public/content/**/*.md`                                | 知识节点 Markdown（**2,736 个文件**）         | ≈ 3.0 MB |
| `public/graph-data.json`                                | 构建期预生成整图数据（单行 JSON，2,736 节点 / 3,184 边） | 3,498,276 B |
| `public/content-manifest.json`                          | 节点索引（构建生成，不提交）                  |   327,070 B |
| `public/sitemap.xml`                                    | SEO 站点地图（构建生成，不提交）              | 1,266,481 B |
| `public/audio/Echoes of the Eye - Travelers Encore.mp3` | 背景音乐                                      |     3.3 MB |
| `public/images/`（2 张 PNG：目录图 / 拓扑图）           | 目录与拓扑图                                  |   1,777,594 B |
| `public/diagnose.js`                                    | 诊断脚本                                      |     1,572 B |
| `public/full-diagnose.js`                               | 完整诊断脚本                                  |     1,559 B |
| `public/favicon.svg`                                    | 图标                                          |     1,082 B |
| `public/robots.txt`                                     | 爬虫协议                                      |       525 B |

> `public/content/` 按学科分目录：`药学专业知识二`（2,454 个 `.md`）、`个人成长与生存策略`（175，辅助体系）、`药学综合知识与技能`（70）、`药学专业知识一`（15）、`药事管理与法规`（12）、`装饰奇观`（5，奇观节点正文）；另有 5 个科目级 `.md`（`药学专业知识一/二/综合知识与技能.md`、`药事管理与法规.md`、`执业药师考试体系.md`）。节点目录结构：`{科目}/{章}/{节}/{考点}.md`。另有 17 个无扩展名的说明文档（如 `00 阅读指南`、`…_节点说明总结`），**不入图**、不参与解析。

---

## 8. 其他目录

| 路径                                        | 内容                                                         |
| ------------------------------------------- | ------------------------------------------------------------ |
| `dist/`                                     | Vite 构建产物（`index.html` + assets + 复制的内容），CI 生成 |
| `examples/cytoscape-example.html`           | 独立演示页（60,357 B / 1,717 行）                            |
| `archive/pharma_v3.html`                    | 旧版 HTML 入口（73,838 B / 2,009 行）                        |
| `archive/vercel.json`                       | 旧版部署配置（84 B）                                         |
| `archive/scripts/`                          | 5 个一次性迁移脚本（约 38.8 KB）                             |
| `.vscode/settings.json`                     | 编辑器设置                                                   |
| `.cursor/rules/frontmatter-conventions.mdc` | Cursor 规则：frontmatter YAML 写作规范                       |

---

## 9. 全项目汇总表

| 区域                                                                                          |      文件数 |          行数 |             字节 |
| --------------------------------------------------------------------------------------------- | ----------: | ------------: | ---------------: |
| `src/`（源码，不含测试）                                                                      |          92 |        33,282 |        1,258,047 |
| `tests/`（顶层测试树）                                                                        |          51 |         9,901 |          374,974 |
| `scripts/`                                                                                    |          11 |         2,559 |           85,841 |
| 根目录 `build-content.ts`                                                                     |           1 |           638 |           22,659 |
| `tools/`                                                                                      |          24 |         4,307 |          150,399 |
| `docs/`（不含 archive 子目录）                                                                |          47 |        126,686 |        18,926,498 |
| `docs/archive/`（不含 zip）                                                                   |          9 |        2,023 |        -2,049,296 |
| `docs/archive/content v1.0.zip`（二进制）                                                     |           1 |             — |        2,136,627 |
| `public/`（含 content）                                                                       |       2,806 |        82,162 |       13,622,467 |
| `examples/`                                                                                   |           1 |         1,717 |           60,357 |
| `archive/`（根目录：HTML 1 + vercel.json + scripts/ 5 个 ts）                                 |           7 |         2,010 |          73,838 |
| **小计（非二进制，不含 zip）**                                                                | **3,048** |  **265,167** |   **34,656,811** |
| 根配置文件（package*.json、tsconfig、vite、vitest、eslint、prettier、vercel、env、editorconfig、gitignore、prettierignore、AGENTS、README、`.cursor/rules/*.mdc` 等） | 15 | 10,019 | 364,946 |
| 二进制 / 大文件（graph-data.json 3.3MB、sitemap.xml 1.3MB、content-manifest.json 327KB、音频 3.3MB、PNG 1.8MB、zip 2.1MB） | 6 | — | ≈ 11,700,000 |
| **总计**                                                                                      | **3,063** |  **275,186** |   **≈ 35,021,757** |

> 说明：
>
> - 行数为 `wc -l` 等价统计（换行符 \n 计数），字节为文件字节数（含换行）；`public/` 行数不含音频 / PNG 等二进制。
> - `docs/archive/content v1.0.zip` 为二进制，不计行，故不计入「小计」。
> - 汇总不含 `dist/`（CI 生成）。
> - **「二进制 / 大文件」行与 `public/` 行存在重复计入**（那 6 项本就在 `public/` 内），沿用原文口径仅作体积提示；因此「总计」的字节数偏高。**仓库实际体积 ≈ 17,913,965 + 479,633 ≈ 18.4 MB（不含 `.git`）**。
> - 决策记录（ADR）全部位于 `docs/ADR/` 单一目录下。
> - `tests/` 与 `src/` 物理分离（AGENTS.md §2.4）；业务源码 import 测试文件会被 ESLint 拒绝。
> - 全库另有 37 个 `.DS_Store`（macOS 元数据），各表统计均已剔除。

---

## 10. 维护提示

1. **新增 / 删除文件**：更新对应目录的表格，保持"路径 ↔ 职责 ↔ 大小 / 行数"一致。新增测试时必须放进 `tests/{unit,component,e2e}/`，**不放回 `src/`**。
2. **大文件预警**（≥ 30KB）：
   - 源码：`src/ui/styles/components.css`（109KB / 3,765 行）、`src/core/tour.ts`（94KB / 2,238 行）、`src/ui/tour-controller.ts`（68KB）、`src/core/renderer.ts`（53KB）、`src/ui/speech.ts`（46KB）、`src/ui/main.ts`（48KB）、`src/core/glow-overlay.ts`（43KB）、`src/ui/app-debug.ts`（40KB）、`src/core/config.ts`（34KB）—— 接近拆分阈值，**改之前先看是否该沿职责切分**。
   - 样式：`src/ui/styles/tour.css`（39KB）、`glass.css`（36KB）。
   - 文档：`docs/archive/all-frontmatter-extracted.md`（630KB）为生成物，勿手改；`docs/布局参数清单.md`（64KB）为审计产物。
   - 数据：`public/graph-data.json`（3.3MB）随节点数膨胀，每次内容改动都会重建。
3. **决策记录位置**：新决策统一写 `docs/ADR/` 目录下，文件前缀 `ADR-000N-` 续号，并在此登记。
4. **重建本表的命令**（macOS 15+ / BSD `stat`）：
   ```bash
   # 文件数 + 行数（每个目录一行）
   for d in src tests scripts build tools docs public; do
     echo "=== $d ==="
     find "$d" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.d.ts" -o -name "*.md" -o -name "*.json" -o -name "*.css" \) -exec wc -l {} + | tail -1
   done
   # 字节数（macOS BSD stat 用 -f%z）
   find src tests scripts build tools docs public -type f -exec stat -f%z {} + | awk '{s+=$1} END {print s}'
   # 注意：提交前请 `git status --short` 确认是否还有未提交的构建产物（public/graph-data.json 常态 dirty 是正常的）
   ```
