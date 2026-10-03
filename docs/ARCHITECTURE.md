# 药学知识图谱 · 架构文档（ARCHITECTURE）

> 更新日期：2026-09-27　·　基线：commit `a346a5e`（本次刷新后工作树 dirty：`public/graph-data.json` 重建产物未提交）
>
> 本文件是项目的**结构地图**：每个目录、每个文件的路径、职责、大小与行数，以及最终汇总。它是活文档，`src/`、`tests/`、`scripts/`、`docs/` 有变动时应同步更新。
>
> **路径约定**：所有路径相对于项目根目录。

---

## 1. 项目定位

一个**内容驱动的药学知识图谱**：Markdown 是资产，图谱是视图。

- 数据源：`public/content/**/*.md`（frontmatter 承载节点元数据）
- 构建期：脚本把 Markdown 预生成为 `graph-data.json` + `content-manifest.json`
- 渲染：前端用 Cytoscape.js 渲染 1100+ 节点的交互拓扑，附带漫游学习引擎

数据与视图分离，关系只在发起方（`edges_out`）单向定义。详见 [DEVELOP.md](./DEVELOP.md)。

---

## 2. 顶层目录总览

| 路径                                        | 类型 | 职责                                                                          | 大小 / 行数                                                   |
| ------------------------------------------- | ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/`                                      | 目录 | 全部 TypeScript 源码（解析 / 核心逻辑 / UI）—— **不含测试**                   | 64 文件 / 17,129 行                                           |
| `tests/`                                    | 目录 | **物理隔离于 `src/` 的测试树**（`unit/` `component/` `e2e/` 三层；详见 §3.7） | 30 文件 / 5,510 行                                            |
| `scripts/`                                  | 目录 | 构建与治理入口（构建链、校验、审计）                                          | 10 文件 / 2,324 行                                            |
| `build/`                                    | 目录 | 构建期库代码（被 vite.config 与 scripts 入口共享）                            | 1 文件 / 602 行                                               |
| `tools/`                                    | 目录 | 一次性修复 / 迁移工具（用完归档）                                             | 7 文件 / 1,633 行                                             |
| `docs/`                                     | 目录 | 文档（架构、规范、ADR 决策记录、调试记录）                                    | 43 文件 / 34,651 行                                           |
| `public/`                                   | 目录 | 静态资产 + 内容 Markdown + 预生成数据（Vite 的 publicDir）                    | 1,221 文件 / 56,720 行                                        |
| `dist/`                                     | 目录 | Vite 构建产物，vercel 部署时自动构建，不入仓库                                | —                                                             |
| `examples/`                                 | 目录 | 功能演示页                                                                    | 1 文件 / 1,348 行                                             |
| `archive/`                                  | 目录 | 归档内容与一次性迁移脚本                                                      | 7 文件 / 2,014 行（根目录 2 个 + `archive/scripts/` 5 个 ts） |
| `index.html`                                | 文件 | 应用唯一 HTML 入口                                                            | 73,934 B / 1,086 行                                           |
| `vite.config.ts`                            | 文件 | Vite 配置 + content 构建插件                                                  | 1,568 B / 59 行                                               |
| `package.json`                              | 文件 | 项目清单与 npm scripts                                                        | 2,084 B / 62 行                                               |
| `package-lock.json`                         | 文件 | 锁文件                                                                        | 310,596 B / 8,865 行                                          |
| `tsconfig.json`                             | 文件 | TypeScript 配置                                                               | 490 B / 21 行                                                 |
| `vitest.config.ts`                          | 文件 | Vitest 配置                                                                   | 506 B / 20 行                                                 |
| `eslint.config.js`                          | 文件 | ESLint 配置                                                                   | 3,341 B / 125 行                                              |
| `.prettierrc.json`                          | 文件 | Prettier 配置                                                                 | 200 B / 11 行                                                 |
| `vercel.json`                               | 文件 | 部署配置                                                                      | 1,168 B / 55 行                                               |
| `.env.example`                              | 文件 | 环境变量模板                                                                  | 511 B / 18 行                                                 |
| `.cursor/rules/frontmatter-conventions.mdc` | 文件 | Cursor 规则：frontmatter YAML 写作规范                                        | 2,093 B / 62 行                                               |

> **测试隔离约定**：测试文件**全部**放在 `tests/`（参见 AGENTS.md §2.4），不在 `src/` 下。`vite.config.ts` 通过 `build.rollupOptions.external` 把 `*.test.*` 路径排除出生产构建，ESLint `no-restricted-imports` 禁止业务源码 `import` 测试文件。

## 3. `src/` — 源码（64 个文件，17,129 行，约 0.81 MB，不含测试）

### 3.1 `src/parser/` — Markdown 解析层（3 文件 / 477 行 / 17,210 B）

| 路径                            | 职责                                         |     大小 | 行数 |
| ------------------------------- | -------------------------------------------- | -------: | ---: |
| `src/parser/content-manager.ts` | 扫描 content 目录、收集文件                  |    726 B |   21 |
| `src/parser/frontmatter.ts`     | frontmatter 解析 / 序列化 / 校验入口         | 16,001 B |  412 |
| `src/parser/schema.ts`          | fill 白名单（从 FILL_CONFIG 派生）与字段校验 |  1,483 B |   44 |

> 测试已迁出 `src/parser/`，见 §3.7 / §6。原 `frontmatter.test.ts`、`location-audit.test.ts` 现在位于 `tests/component/parser/`。

### 3.2 `src/core/` — 图谱核心逻辑（20 文件 + 5 spectacle / 10,416 行 / 413,921 B；测试见 §3.7）

**顶层（20 文件）**

| 路径                                   | 职责                                               |     大小 |  行数 |
| -------------------------------------- | -------------------------------------------------- | -------: | ----: |
| `src/core/build-graph.ts`              | 从 frontmatter 构建节点边 + BFS 深度 / 子树算法    | 12,584 B |   344 |
| `src/core/config.ts`                   | 全局配置：FILL_CONFIG / 布局 / 边类型映射 / 主题色 | 34,374 B |   859 |
| `src/core/content-loader.ts`           | 内容加载器                                         |  3,523 B |    80 |
| `src/core/device-capability.ts`        | 设备能力检测（移动端 / 大屏 / 能否逐帧动画）      |  5,133 B |   115 |
| `src/core/edge-builder.ts`             | 汇总 edges_out → 边数据                            |    970 B |    28 |
| `src/core/edge-types.ts`               | 边类型词汇表                                       |  1,795 B |    47 |
| `src/core/force-drag.ts`               | 力导向拖拽交互                                     | 10,922 B |   332 |
| `src/core/glow-overlay.ts`             | glow / flow 光效覆盖层（独立 canvas）              | 44,021 B |   987 |
| `src/core/graph-manager.ts`            | 图数据装配与缓存管理                               |  3,826 B |   110 |
| `src/core/graph.ts`                    | 节点 / 边数据结构定义                              |  4,193 B |    95 |
| `src/core/halton.ts`                   | Halton 低差异序列（预动画铺点）                    |    965 B |    25 |
| `src/core/layout-worker.ts`            | 布局 Web Worker 入口（euler 在 worker 内算）       |  2,700 B |    85 |
| `src/core/layout-worker-client.ts`     | Worker 客户端 + 等待预动画 + 入场插值              | 19,954 B |   470 |
| `src/core/node-builder.ts`             | frontmatter → 节点数据                             |  2,711 B |    73 |
| `src/core/node-shape-outline.ts`       | 节点形状描边渲染                                   |  8,089 B |   233 |
| `src/core/optimized-content-loader.ts` | 流式 .md 加载 fallback                             | 11,475 B |   372 |
| `src/core/prebuilt-loader.ts`          | 加载预生成 graph-data.json                         |  4,413 B |   110 |
| `src/core/renderer.ts`                 | Cytoscape 实例 + 样式表 + 布局入口                 | 52,621 B | 1,193 |
| `src/core/theme-colors.ts`             | 主题色读取与切换                                   |  1,392 B |    35 |
| `src/core/tour.ts`                     | 漫游引擎（DFS/拓扑序、档位、applyRootScope）       | 83,684 B | 2,007 |

**`src/core/spectacle/` — 奇观节点（5 文件 / 2,772 行 / 104,952 B）**

脱离知识层的空域装置：真实 cytoscape 节点 + 独立 canvas overlay 逐帧重绘。
打 `layer-parent` class 排除出检索 / 统计 / 漫游 / force-drag，但**参与 euler
斥力物理**（不 lock），本体样式被 `stripNodeChrome()` 压全透明，只留命中盒。

**命名规范**：文件名 = `<奇观>-overlay.ts`，后缀一律 `-overlay`（该文件产出的
是 canvas 覆盖层，不是节点本身）。前缀直接取奇观名，**不加 `celestial-`**——
E8 根系与太极八卦没有共同语义可共享前缀。几何内核等非 overlay 文件用
`-geometry.ts` 等其它后缀区分。

| 路径                                         | 奇观           | 职责                             |     大小 |  行数 |
| -------------------------------------------- | -------------- | -------------------------------- | -------: | ----: |
| `src/core/spectacle/emblem-overlay.ts`     | 太极八卦       | 十二重同心环 + 中心太极          | 28,209 B |   876 |
| `src/core/spectacle/tesseract-overlay.ts`   | 四维空间       | 4D 超立方体 16 顶点 / 32 棱     | 22,202 B |   551 |
| `src/core/spectacle/fractal-tree-overlay.ts`| 生命之树       | L-system 树 + 末梢光点           | 26,816 B |   650 |
| `src/core/spectacle/fractal-tree-geometry.ts`| （树的共享几何）| 纯函数几何内核，可脱 canvas 测试  | 11,398 B |   271 |
| `src/core/spectacle/e8-overlay.ts`         | E8 根系        | 240 根 Coxeter 平面投影 / 6720 棱 | 15,951 B |   468 |

> ⚠️ **两处单点维护**，加奇观时必须同步：
> ① `src/ui/main.ts` 的 `DECOR_KEYS`（`?decor=` 白名单）+ 调用点；
> ② `src/core/renderer.ts` 的 `DECOR_NODE_CLASSES`（样式表压透明的 class 列表）。
> 漏 ① → 开关关不掉；漏 ② → 节点在样式表兜底路径下露出 cytoscape 默认椭圆。
>
> 四份 overlay 的生命周期骨架（canvas / ResizeObserver / rAF / visibilitychange /
> `stripNodeChrome`）**刻意各自独立不抽基类**——画法毫无共性，抽出来只会得到
> 一个塞满互斥状态的上帝对象。这是已知技术债。

> 测试已迁出 `src/core/`，见 §3.7 / §6。原 `build-graph.test.ts`、`edge-types.test.ts`、`tour.test.ts`、`tour-engine.test.ts` 现在位于 `tests/unit/core/` 或 `tests/component/core/`。原 `src/core/__tests__/`（config-layouts / cytoscape-style-tokens）已**不存在**。

### 3.3 `src/data/` — 领域词汇（1 文件 / 575 行 / 31,828 B）

| 路径                     | 职责           |     大小 | 行数 |
| ------------------------ | -------------- | -------: | ---: |
| `src/data/vocabulary.ts` | 药学领域词汇表 | 31,828 B |  575 |

### 3.4 `src/types/` — 类型扩展（1 文件 / 14 行 / 270 B）

| 路径                                  | 职责                   |  大小 | 行数 |
| ------------------------------------- | ---------------------- | ----: | ---: |
| `src/types/cytoscape-extensions.d.ts` | Cytoscape 类型声明补充 | 270 B |   14 |

### 3.5 `src/ui/` — 浏览器层 UI（60 文件 / 8,981 行 / 411,886 B）

> 含根目录 41 个 `.ts` + `layout/` 7 个 + `stats/` 3 个 + `styles/` 9 个（含 1 个 `.DS_Store`）；测试见 §3.7。

#### 入口与装配

| 路径                          | 职责                              |     大小 | 行数 |
| ----------------------------- | --------------------------------- | -------: | ---: |
| `src/ui/main.ts`              | 应用入口，组装所有模块            | 34,344 B |  840 |
| `src/ui/state.ts`             | 全局 UI 状态                      |  4,740 B |  128 |
| `src/ui/action-dispatcher.ts` | data-action 指令分发              |  3,693 B |  110 |
| `src/ui/action-handlers.ts`   | 注册全部 action 处理器            |  5,474 B |  171 |
| `src/ui/dom-cache.ts`         | DOM 引用缓存                      |  1,969 B |   57 |
| `src/ui/logger.ts`            | 日志工具（DEV 才输出）            |  1,583 B |   41 |
| `src/ui/debug-bridge.ts`      | 调试桥接                          |  2,914 B |   86 |
| `src/ui/ui-helpers.ts`        | 通用 UI 辅助（toast 等）          |  3,578 B |   76 |
| `src/ui/app-debug.ts`         | 应用调试面板（40KB，独立调试 UI） | 40,863 B |  940 |

#### 图谱交互

| 路径                           | 职责                                     |     大小 | 行数 |
| ------------------------------ | ---------------------------------------- | -------: | ---: |
| `src/ui/graph-events.ts`       | Cytoscape 事件绑定（点击 / 悬停 / 缩放） | 11,490 B |  267 |
| `src/ui/drag-manager.ts`       | 侧栏 / 面板拖拽与吸附                    | 22,385 B |  624 |
| `src/ui/focus-node.ts`         | 节点聚焦                                 |  4,108 B |  113 |
| `src/ui/highlight-engine.ts`   | 高亮引擎                                 |  7,782 B |  222 |
| `src/ui/search.ts`             | 搜索逻辑                                 |  6,078 B |  167 |
| `src/ui/search-ui.ts`          | 搜索 UI                                  |  7,844 B |  196 |
| `src/ui/keyboard-shortcuts.ts` | 快捷键                                   |  3,433 B |  106 |
| `src/ui/detail-panel.ts`       | 节点详情面板                             | 23,029 B |  530 |
| `src/ui/bigscreen.ts`          | 大屏模式                                 | 23,138 B |  555 |
| `src/ui/ui-toggle.ts`          | UI 开关                                  |  6,036 B |  170 |
| `src/ui/music-player.ts`       | 背景音乐                                 |  3,053 B |   90 |
| `src/ui/starfield.ts`          | 星空背景                                 | 10,677 B |  270 |
| `src/ui/carousel.ts`           | 品牌词轮播                               |  3,727 B |  129 |
| `src/ui/speech.ts`             | 语音播报                                 | 17,290 B |  421 |
| `src/ui/anim-pulse.ts`         | 脉冲动画                                 |  2,341 B |   56 |
| `src/ui/graph-stats.ts`        | 图谱统计                                 |    518 B |   13 |
| `src/ui/markdown.ts`           | Markdown 渲染（marked + DOMPurify）      |  4,166 B |  124 |

#### 漫游（Tour）

| 路径                        | 职责                        |     大小 |  行数 |
| --------------------------- | --------------------------- | -------: | ----: |
| `src/ui/tour-controller.ts` | 漫游控制器（绑定引擎与 UI） | 48,279 B | 1,039 |

#### 布局子系统 `src/ui/layout/`

| 路径                                      | 职责                          |     大小 | 行数 |
| ----------------------------------------- | ----------------------------- | -------: | ---: |
| `src/ui/layout/layout-engine.ts`          | 布局运行器 + 参数类型还原     |  4,414 B |  114 |
| `src/ui/layout/layout-engine-reexport.ts` | 布局引擎再导出                |    483 B |    9 |
| `src/ui/layout/layout-params.ts`          | 布局参数面板逻辑              | 10,324 B |  253 |
| `src/ui/layout/layout-params-template.ts` | 参数模板                      |  5,892 B |  129 |
| `src/ui/layout/layout-store.ts`           | 布局参数持久化                |  2,698 B |   82 |
| `src/ui/layout/layout-switcher.ts`        | 布局切换器                    |  3,256 B |   88 |
| `src/ui/layout/toolbar-actions.ts`        | 工具栏动作（fit / randomize） |  1,690 B |   44 |

#### 图例与统计

| 路径                             | 职责              |     大小 | 行数 |
| -------------------------------- | ----------------- | -------: | ---: |
| `src/ui/legend-factory.ts`       | 图例生成          |  8,642 B |  208 |
| `src/ui/legend-manager.ts`       | 图例管理          | 11,032 B |  259 |
| `src/ui/layout-manager.ts`       | 布局管理          |  1,324 B |   41 |
| `src/ui/layout-menu.ts`          | 布局菜单          |    408 B |   11 |
| `src/ui/stats/stat-cards.ts`     | 统计卡片          |  2,541 B |   62 |
| `src/ui/stats/stat-animation.ts` | 统计动画          |  1,640 B |   59 |
| `src/ui/stats/perf-monitor.ts`   | 性能监控（UI 侧） |  5,117 B |  166 |

#### 样式 `src/ui/styles/`

| 路径                                       | 职责                         |     大小 |  行数 |
| ------------------------------------------ | ---------------------------- | -------: | ----: |
| `src/ui/styles/base.css`                   | 基础样式                     | 14,065 B |   304 |
| `src/ui/styles/components.css`             | 组件样式（最大）             | 85,996 B | 1,396 |
| `src/ui/styles/glass.css`                  | 液态玻璃皮肤（@layer glass） | 29,962 B |   608 |
| `src/ui/styles/index.css`                  | 样式入口                     |    594 B |    13 |
| `src/ui/styles/layout.css`                 | 布局样式                     | 18,032 B |   352 |
| `src/ui/styles/shared.css`                 | 共享工具类                   |  9,330 B |   221 |
| `src/ui/styles/sidebar/sidebar-params.css` | 侧栏参数样式                 |  2,738 B |    28 |
| `src/ui/styles/sidebar/sidebar-stats.css`  | 侧栏统计样式                 |  2,544 B |    30 |
| `src/ui/styles/tour.css`                   | 漫游 UI 样式                 | 35,199 B |   636 |

### 3.6 `src/` 文件数 / 行数小计

| 路径                                   |                          文件数 |       行数 |          字节 |
| -------------------------------------- | ------------------------------: | ---------: | ------------: |
| `src/parser/`                          |                               3 |        477 |        18,210 |
| `src/core/`                            |                              18 |      7,082 |       320,298 |
| `src/data/`                            |                               1 |        575 |        31,828 |
| `src/types/`                           |                               1 |         14 |           270 |
| `src/ui/`（含 layout/ stats/ styles/） | 41 .ts + 19 css/子目录文件 = 60 |      8,981 |     ≈ 412,000 |
| **合计**                               |                          **64** | **17,129** | **≈ 782,600** |

> 不含 `*.test.ts`：测试全部位于 §3.7 的 `tests/` 树。`src/ui/styles/` 内有 1 个 `.DS_Store`（macOS 元数据，已剔除）。

### 3.7 `tests/` — 测试树（顶层目录，物理隔离于 `src/`）

> 详见 [AGENTS.md §2.4](../AGENTS.md) — 物理安全 / dev server 启动快 / 审 PR 干净三层动机。

#### `tests/unit/` — 纯函数 / 数据变换（4 文件 / 361 行 / 14,500 B）

> 默认 `vitest` 配置 `environment: node`；无 DOM、无磁盘 fixture、无 mock。

| 路径                                             | 职责                |    大小 | 行数 |
| ------------------------------------------------ | ------------------- | ------: | ---: |
| `tests/unit/core/build-graph.test.ts`            | 构建图数据单元测试  | 4,400 B |  147 |
| `tests/unit/core/edge-types.test.ts`             | 边类型单元测试      | 1,800 B |   60 |
| `tests/unit/core/tour.test.ts`                   | 漫游引擎单元测试    | 3,500 B |   93 |
| `tests/unit/core/cytoscape-style-tokens.test.ts` | 样式 token 单元测试 | 2,700 B |   61 |

#### `tests/component/` — DOM 行为 / 准集成（26 文件 / 5,149 行 / 195,000 B）

> 文件顶部声明 `/** @vitest-environment jsdom */`；mock `cytoscape` / `document` / `localStorage`；部分扫盘读 `public/content/**/*.md` fixture。

| 路径                                                     | 职责                       |     大小 | 行数 |
| -------------------------------------------------------- | -------------------------- | -------: | ---: |
| `tests/component/core/config-layouts.test.ts`            | 配置布局组件测试           | 11,000 B |  241 |
| `tests/component/core/tour-engine.test.ts`               | 漫游引擎集成测试           | 28,000 B |  709 |
| `tests/component/parser/frontmatter.test.ts`             | frontmatter 准集成（扫盘） |  8,500 B |  295 |
| `tests/component/parser/location-audit.test.ts`          | location 审计扫盘          |  2,100 B |   35 |
| `tests/component/ui/action-dispatcher.test.ts`           | action 分发器 DOM 测试     |  6,700 B |  214 |
| `tests/component/ui/app-debug.test.ts`                   | 调试面板 DOM 测试          | 12,900 B |  333 |
| `tests/component/ui/bigscreen-sidebar-roundtrip.test.ts` | 大屏侧栏往返               |  8,800 B |  236 |
| `tests/component/ui/bigscreen.test.ts`                   | 大屏 DOM                   |  6,200 B |  160 |
| `tests/component/ui/bottom-sheet-easing.test.ts`         | 底部 sheet 缓动            |  3,700 B |   88 |
| `tests/component/ui/detail-panel-questions.test.ts`      | 详情面板问答               |  3,300 B |   88 |
| `tests/component/ui/focus-node.test.ts`                  | 节点聚焦                   |  2,900 B |   76 |
| `tests/component/ui/graph-events-helpers.test.ts`        | 图事件辅助                 |  4,400 B |  145 |
| `tests/component/ui/graph-events.test.ts`                | 图事件                     |  7,300 B |  202 |
| `tests/component/ui/layout-manager.test.ts`              | 布局管理 DOM               |  6,100 B |  164 |
| `tests/component/ui/layout-menu.test.ts`                 | 布局菜单                   |  5,500 B |  168 |
| `tests/component/ui/legend-factory.test.ts`              | 图例生成                   |  8,200 B |  208 |
| `tests/component/ui/legend-manager.test.ts`              | 图例管理                   |  6,200 B |  165 |
| `tests/component/ui/logger.test.ts`                      | 日志                       |  1,000 B |   29 |
| `tests/component/ui/mobile-accordion.test.ts`            | 移动端折叠                 |  5,600 B |  136 |
| `tests/component/ui/search-ui.test.ts`                   | 搜索 UI                    |  5,500 B |  141 |
| `tests/component/ui/search.test.ts`                      | 搜索逻辑                   |  4,700 B |  131 |
| `tests/component/ui/sidebar-transition.test.ts`          | 侧栏过渡                   |  8,600 B |  202 |
| `tests/component/ui/speech-button.test.ts`               | 语音按钮                   |  4,500 B |  164 |
| `tests/component/ui/speech.test.ts`                      | 语音                       |  5,000 B |  130 |
| `tests/component/ui/state.test.ts`                       | UI state DOM               |  4,500 B |  110 |
| `tests/component/ui/tour-controller.test.ts`             | 漫游控制器 DOM             | 14,200 B |  396 |
| `tests/component/ui/ui-toggle.test.ts`                   | UI 开关                    |  7,000 B |  183 |

#### `tests/e2e/` — 真实浏览器驱动（空目录占位）

未来 Playwright / Cypress 用。

#### `tests/` 小计

| 子层               | 文件数 |      行数 |
| ------------------ | -----: | --------: |
| `tests/unit/`      |      4 |       361 |
| `tests/component/` |     26 |     5,149 |
| `tests/e2e/`       |      0 |         0 |
| **合计**           | **30** | **5,510** |

> **判定准则（写新测试前自问）**：
>
> 1. 顶部有 `/** @vitest-environment jsdom */`？ → `component/`
> 2. 扫了 `public/content/**/*.md`？ → `component/`（准集成）
> 3. mock 了 `cytoscape` / `document` / `localStorage` / `setTimeout`？ → `component/`
> 4. 都不满足 → `unit/`

## 4. 构建与工具脚本

目录重组后，`scripts/` 只保留活跃的构建 / 治理入口，构建期共享库移到 `build/`，一次性修复 / 迁移工具移到 `tools/`。

### 4.1 `scripts/` — 构建与治理入口（10 个文件，2,324 行，约 77 KB）

| 路径                                | 职责                                  |     大小 | 行数 |
| ----------------------------------- | ------------------------------------- | -------: | ---: |
| `scripts/audit-frontmatter.ts`      | 打分审计（永远 exit 0，输出报告）     | 23,624 B |  598 |
| `scripts/build-content-manifest.ts` | 生成 content-manifest.json（入口）    |    344 B |   13 |
| `scripts/build-graph-data.ts`       | 生成 graph-data.json（入口）          |    342 B |   13 |
| `scripts/check-graph-fresh.ts`      | 检查图数据是否新鲜                    |  3,167 B |   94 |
| `scripts/dev.sh`                    | 开发启动脚本                          |    253 B |   14 |
| `scripts/measure-overlap.ts`        | 重叠度测量                            | 24,815 B |  911 |
| `scripts/serve.ts`                  | 本地静态服务器                        |  2,672 B |   70 |
| `scripts/validate-graph-data.ts`    | 校验 graph-data.json                  | 12,276 B |  309 |
| `scripts/validate-graph-deep.ts`    | 深度校验                              |  4,482 B |  141 |
| `scripts/validate.ts`               | 严格 schema 校验（CI 门禁，非零退出） |  5,228 B |  166 |

### 4.2 `build/` — 构建期共享库（1 个文件，602 行，约 21 KB）

| 路径                     | 职责                                                                                                                |     大小 | 行数 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------: | ---: |
| `build/build-content.ts` | 内容构建核心：frontmatter 解析 → graph-data.json / content-manifest / sitemap（被 vite.config 与 scripts 入口共享） | 21,945 B |  602 |

### 4.3 `tools/` — 一次性修复 / 迁移工具（7 个文件，1,633 行，约 62 KB）

| 路径                               | 职责                |     大小 | 行数 |
| ---------------------------------- | ------------------- | -------: | ---: |
| `tools/audit-and-fix-ids.ts`       | 审计并修复 id       |  9,211 B |  275 |
| `tools/fix-frontmatter.py`         | frontmatter 修复    |  5,893 B |  178 |
| `tools/fix-section-fields.py`      | section 字段修复    |  6,358 B |  183 |
| `tools/fix-y1-chapters.py`         | 药一章节修复        |  5,700 B |  160 |
| `tools/fix-yaml-anchors.cjs`       | YAML anchor 修复    |  7,300 B |  190 |
| `tools/migrate-essence-to-fill.js` | essence → fill 迁移 |  8,746 B |  259 |
| `tools/migrate-ids-to-rules.ts`    | id → rules 迁移     | 19,170 B |  388 |

> 迁移说明：`build-content.ts` 原在 `scripts/`，因被 vite.config.ts 与多个 scripts 入口 import，属共享库，移至 `build/`。6 个一次性修复 / 迁移工具（fix-_、migrate-_、audit-and-fix-ids）不参与构建链，移至 `tools/`。

## 5. `docs/` — 文档（43 个文件，34,651 行，约 3.93 MB）

### 5.1 架构与规范

| 路径                        | 职责                                                                          |      大小 |  行数 |
| --------------------------- | ----------------------------------------------------------------------------- | --------: | ----: |
| `docs/DEVELOP.md`           | 开发文档（数据模型、关系类型、目录设计）                                      |         — |   393 |
| `docs/CODE-WIKI.md`         | 代码维基（全文件级说明；2026-08 后未刷新，部分行级说明可能漂移 → 待 refresh） |  37,131 B |   649 |
| `docs/RULES.md`             | 规则汇总                                                                      |  14,920 B |   223 |
| `docs/SKILL.md`             | 技能 / 工作流说明                                                             |  37,981 B |   798 |
| `docs/frontmatter.md`       | frontmatter 模板与规范                                                        |  17,551 B |   404 |
| `docs/frontmatter-audit.md` | 审计报告（生成物，由 `npm run audit` 生成；勿手改）                           | 254,750 B | 1,720 |
| `docs/Cytoscape.md`         | Cytoscape.js v3 通用速查（不绑定项目）                                        |  10,136 B |   376 |
| `docs/布局参数清单.md`      | LAYOUTS 配置审计清单（cytoscape 扩展字段校对，2026-07-27）                    |  64,023 B | 1,180 |

### 5.2 决策记录 `docs/ADR/`

> 所有决策记录均采用 ADR- 前缀（Architecture Decision Record）。目录命名统一为 `ADR/`。

| 路径                                                        | 职责                                                          |     大小 |  行数 |
| ----------------------------------------------------------- | ------------------------------------------------------------- | -------: | ----: |
| `docs/ADR/ADR-0001-层级关系统一使用isa方向.md`              | 层级关系统一 isa（子→父）                                     | 10,810 B |   254 |
| `docs/ADR/ADR-0002-节点美化方案选型.md`                     | 节点美化选型                                                  | 12,304 B |   294 |
| `docs/ADR/ADR-0003-tour-universe-isolation.md`              | 漫游体系隔离                                                  |  7,063 B |   166 |
| `docs/ADR/ADR-0004-图数据从运行期解析迁移到构建期预生成.md` | 预生成图数据                                                  |  8,912 B |   161 |
| `docs/ADR/ADR-0005-tour-depth-levels.md`                    | 漫游 5 档深度过滤                                             |  3,121 B |    98 |
| `docs/ADR/ADR-0006-applyRootScope-子树漫游算法重写.md`      | 子树漫游算法重写 + 档位自动升级                               | 16,512 B |   373 |
| `docs/ADR/ADR-0007-visual-tokens.md`                        | 视觉令牌体系（颜色 / 形状 / 间距统一来源）                    |  6,557 B |   175 |
| `docs/ADR/ADR-0008-surface-shadow-transition-tokens.md`     | 表面 / 阴影 / 过渡令牌                                        |  4,555 B |   110 |
| `docs/ADR/ADR-0009-tour-scope-modes.md`                    | 漫游范围模式（单选子树 / 筛选集合）                           |  5,411 B |   126 |
| `docs/ADR/migration-report-ADR-0001-APPLY.md`               | ADR-0001 迁移执行报告（217 文件 / 167 isa 转换 / 2026-07-14） | 90,810 B | 1,251 |

### 5.3 调试记录 `docs/DEBUG/`

> **仅保留活跃 / 未确认修复的问题**。已修复的全部归档到 `docs/archive/debug/`（见 §5.4）。

| 路径                                              | 职责                                     |    大小 | 行数 |
| ------------------------------------------------- | ---------------------------------------- | ------: | ---: |
| `docs/DEBUG/debug-bigscreen-sidebar-offscreen.md` | 大屏侧栏出屏（**未验证修复，保留跟踪**） | 8,223 B |  156 |

### 5.3a 调试归档 `docs/archive/debug/`

| 路径                                                         | 职责                                                     |     大小 | 行数 |
| ------------------------------------------------------------ | -------------------------------------------------------- | -------: | ---: |
| `docs/archive/debug/debug-bigscreen-exit-tour-viewport.md`   | 大屏退出漫游视口（已修复 2026-09-22，cy.stop + capture） |  4,164 B |  113 |
| `docs/archive/debug/debug-index.md`                          | 2026 年度修复问题索引                                    | 15,802 B |  427 |
| `docs/archive/debug/debug-initial-zoom-euler-fit.md`         | 初始缩放被 Euler fit 覆盖（已修复，commit a1b2c3d）      |  2,204 B |   76 |
| `docs/archive/debug/debug-log-2026-09-20.md`                 | 2026-09-20 单日调试日志（一次性）                        | 10,458 B |   97 |
| `docs/archive/debug/debug-sidebar-issues.md`                 | 侧栏问题（已修复）                                       | 15,677 B |  339 |
| `docs/archive/debug/debug-tour-depth-slider-restart.md`      | 深度滑块重启（已修复）                                   |  5,659 B |  180 |
| `docs/archive/debug/debug-tour-depth1-universe-isolation.md` | 深度 1 体系隔离（已修复）                                |  5,328 B |  121 |
| `docs/archive/debug/debug-tour-mob-slider-rendering.md`      | 移动端滑块渲染（已修复）                                 | 11,428 B |  269 |
| `docs/archive/debug/debug-tour-node-duplicate.md`            | 漫游节点重复（已修复）                                   |  6,405 B |  165 |
| `docs/archive/debug/debug-tour-stack-overflow-cycle.md`      | 漫游栈溢出循环（已修复，运行时护栏 + 测试夹具）          |  8,399 B |  218 |

### 5.4 归档 `docs/archive/`

| 路径                                        | 职责                                              |        大小 |    行数 |
| ------------------------------------------- | ------------------------------------------------- | ----------: | ------: |
| `docs/archive/OLD_RULES.md`                 | 旧规则                                            |    66,247 B |   1,237 |
| `docs/archive/OLD_SKILL.md`                 | 旧技能说明                                        |    11,898 B |     176 |
| `docs/archive/OLD_frontmatter.md`           | 旧 frontmatter 规范                               |    28,308 B |     952 |
| `docs/archive/REFACTOR-RULES.md`            | 重构规则                                          |    14,507 B |     273 |
| `docs/archive/SPLIT-RULES.md`               | 拆分规则                                          |    17,345 B |     302 |
| `docs/archive/all-frontmatter-extracted.md` | 全库 frontmatter 聚合（最大单文件）               |   630,671 B |  13,765 |
| `docs/archive/content v1.0.zip`             | 内容 v1.0 打包（2.1 MB，二进制不计行）            | 2,136,627 B |   4,823 |
| `docs/archive/debug/`                       | **调试归档目录**（10 个已修复调试记录，见 §5.3a） |  ≈ 82,964 B | ≈ 1,985 |
| `docs/archive/frontmatter-audit.md`         | 归档审计                                          |   194,557 B |   1,130 |
| `docs/archive/old-frontmatter-audit.md`     | 旧审计报告                                        |     2,451 B |      79 |
| `docs/archive/old-frontmatter.md`           | 旧 frontmatter 规范（早期版本）                   |    37,844 B |     675 |
| `docs/archive/新版规则全文档重构计划.md`    | 重构计划                                          |   155,584 B |     665 |
| `docs/archive/施工单-布局设置重构-2026.md`  | 布局设置重构施工单（已实施）                      |     7,153 B |     190 |
| `docs/archive/问题清单.md`                  | 问题清单                                          |     5,009 B |      62 |

## 6. 测试汇总

> 测试**全部位于 `tests/` 顶层目录**，**不在** `src/` 下。详见 §3.7。

| 路径                               |              文件数 |  行数合计 |
| ---------------------------------- | ------------------: | --------: |
| `tests/unit/`（纯函数）            |                   4 |       361 |
| `tests/component/`（DOM / 准集成） |                  26 |     5,149 |
| `tests/e2e/`（空占位）             |                   0 |         0 |
| `src/**\/__.test__.ts`             | **0**（已全部迁出） |         0 |
| **合计**                           |              **30** | **5,510** |

> **安全网**（三道都已落地）：
>
> - **Vite 端**：`vite.config.ts` 的 `build.rollupOptions.external` 配 `(id) => /\.test\./.test(id)`——测试文件对 vite 不可见，物理阻断进 `dist/`。
> - **ESLint 端**：`eslint.config.js` 加 `no-restricted-imports` 规则，禁止业务源码 import 任何 `*.test.*` 文件（错误等级 `error`，PR 阶段就 fail）。
> - **vitest coverage**：`vitest.config.ts` 已把 `tests/**` 加进 `coverage.exclude`——测试自己不进覆盖率统计。
>
> **跑测试**：`npm test`（一次性）/ `npm run test:watch` / `npx vitest run tests/unit`（最快）/ `npx vitest run tests/component`（DOM）。

## 7. `public/` — 静态资产与内容（1,221 文件，56,720 行，约 8.9 MB）

| 路径                                                    | 内容                                         |        大小 |
| ------------------------------------------------------- | -------------------------------------------- | ----------: |
| `public/content/**/*.md`                                | 知识节点 Markdown（1,186 个文件，27,826 行） |   约 4.9 MB |
| `public/graph-data.json`                                | 构建期预生成整图数据（单行 JSON）            | 1,438,229 B |
| `public/content-manifest.json`                          | 节点索引                                     |   135,983 B |
| `public/sitemap.xml`                                    | SEO 站点地图（构建生成）                     |   532,537 B |
| `public/audio/Echoes of the Eye - Travelers Encore.mp3` | 背景音乐                                     |      3.1 MB |
| `public/images/药一二综目录.png`                        | 目录图                                       |      1.4 MB |
| `public/images/药学知识拓扑.png`                        | 拓扑图                                       |      271 KB |
| `public/diagnose.js`                                    | 诊断脚本                                     |     1,572 B |
| `public/full-diagnose.js`                               | 完整诊断脚本                                 |     1,559 B |
| `public/favicon.svg`                                    | 图标                                         |     1,082 B |
| `public/robots.txt`                                     | 爬虫协议                                     |       525 B |

> `public/content/` 按学科分目录：`药学专业知识一`、`药学专业知识二`、`药学综合知识与技能`、`个人成长与生存策略`（辅助体系）。节点目录结构：`{科目}/{章}/{节}/{考点}.md`。

---

## 8. 其他目录

| 路径                                        | 内容                                                         |
| ------------------------------------------- | ------------------------------------------------------------ |
| `dist/`                                     | Vite 构建产物（`index.html` + assets + 复制的内容），CI 生成 |
| `examples/cytoscape-example.html`           | 独立演示页（51 KB / 1,348 行）                               |
| `archive/pharma_v3.html`                    | 旧版 HTML 入口                                               |
| `archive/vercel.json`                       | 旧版部署配置                                                 |
| `archive/scripts/`                          | 5 个一次性迁移脚本（112 KB）                                 |
| `.vscode/settings.json`                     | 编辑器设置                                                   |
| `.cursor/rules/frontmatter-conventions.mdc` | Cursor 规则：frontmatter YAML 写作规范                       |

---

## 9. 全项目汇总表

| 区域                                                                                          |      文件数 |          行数 |             字节 |
| --------------------------------------------------------------------------------------------- | ----------: | ------------: | ---------------: |
| `src/`（源码，不含测试）                                                                      |          64 |        17,129 |        ≈ 782,600 |
| `tests/`（顶层测试树）                                                                        |          30 |         5,510 |        ≈ 210,000 |
| `scripts/`                                                                                    |          10 |         2,324 |           77,203 |
| `build/`                                                                                      |           1 |           602 |           21,945 |
| `tools/`                                                                                      |           7 |         1,633 |           62,378 |
| `docs/`（不含 archive 子目录）                                                                |          14 |         6,300 |        ≈ 530,000 |
| `docs/archive/`（不含 zip）                                                                   |          24 |      ≈ 28,000 |      ≈ 1,470,000 |
| `docs/archive/content v1.0.zip`（二进制）                                                     |           1 |             — |        2,136,627 |
| `public/`（含 content）                                                                       |       1,221 |        56,720 |      ≈ 8,900,000 |
| `examples/`                                                                                   |           1 |         1,348 |           51,187 |
| `archive/`（根目录：HTML 1 + vercel.json + scripts/ 5 个 ts）                                 |           7 |         2,014 |         ≈ 53,000 |
| **小计（非二进制）**                                                                          | **≈ 1,375** | **≈ 122,580** | **≈ 12,160,000** |
| 根配置文件（package*.json、tsconfig、vite、eslint、prettier、vercel、env、editorconfig 等）   |          13 |        10,329 |          398,214 |
| 二进制 / 大文件（graph-data.json 1.4MB、sitemap.xml 533KB、音频 3.1MB、PNG 1.7MB、zip 2.1MB） |           5 |             — |         ≈ 8.8 MB |
| **总计**                                                                                      | **≈ 1,393** | **≈ 132,909** |    **≈ 22.0 MB** |

> 说明：
>
> - 行数为 `wc -l` 等价统计（换行符 \n 计数），字节为文件字节数（含换行）。
> - `docs/archive/content v1.0.zip` 为二进制，不计行。
> - 汇总不含 `dist/`（CI 生成）。
> - 决策记录（ADR）全部位于 `docs/ADR/` 单一目录下。
> - `tests/` 与 `src/` 物理分离（AGENTS.md §2.4）；业务源码 import 测试文件会被 ESLint 拒绝。

---

## 10. 维护提示

1. **新增 / 删除文件**：更新对应目录的表格，保持"路径 ↔ 职责 ↔ 大小 / 行数"一致。新增测试时必须放进 `tests/{unit,component,e2e}/`，**不放回 `src/`**。
2. **大文件预警**（≥ 30KB）：
   - 源码：`src/ui/styles/components.css`（106KB）、`src/core/tour.ts`（82KB）、`src/ui/tour-controller.ts`（52KB）、`src/core/renderer.ts`（51KB）、`src/ui/main.ts`（46KB）、`src/core/glow-overlay.ts`（43KB）、`src/ui/app-debug.ts`（40KB）、`src/core/config.ts`（34KB）—— 接近拆分阈值，**改之前先看是否该沿职责切分**。
   - 样式：`src/ui/styles/tour.css`（39KB）、`glass.css`（33KB）。
   - 文档：`docs/archive/all-frontmatter-extracted.md`（630KB）为生成物，勿手改；`docs/布局参数清单.md`（64KB）为审计产物。
   - 数据：`public/graph-data.json`（1.4MB）随节点数膨胀，每次内容改动都会重建。
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
