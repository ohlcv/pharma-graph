# Pharma-Graph Code Wiki

> 本文档是 `pharma-graph` 仓库的结构化代码 Wiki，覆盖项目整体架构、模块职责、关键类与函数、依赖关系与运行方式。面向开发者，便于快速理解代码组织与维护边界。
>
> 配套阅读：[README.md](./README.md)（产品视角）、[DEVELOP.md](./DEVELOP.md)（开发指南）、[ADR-0001](./ARD/ADR-0001-层级关系统一使用isa方向.md)（关系方向决策）。

---

## 目录

1. [项目概览](#1-项目概览)
2. [整体架构](#2-整体架构)
3. [目录结构](#3-目录结构)
4. [数据流转与渲染管道](#4-数据流转与渲染管道)
5. [模块职责详解](#5-模块职责详解)
   - 5.1 [parser 解析层](#51-parser-解析层)
   - 5.2 [core 核心层](#52-core-核心层)
   - 5.3 [ui 交互层](#53-ui-交互层)
   - 5.4 [data 数据层](#54-data-数据层)
   - 5.5 [scripts 工具脚本](#55-scripts-工具脚本)
6. [关键类与函数索引](#6-关键类与函数索引)
7. [依赖关系](#7-依赖关系)
8. [项目运行方式](#8-项目运行方式)
9. [构建与测试](#9-构建与测试)
10. [约定与设计原则](#10-约定与设计原则)

---

## 1. 项目概览

**pharma-graph**（药学知识图谱）是一个**内容驱动**的 Web 应用：学习者用 Markdown 写笔记，图谱从笔记的 frontmatter 自动生成。

- **核心思路**：节点即知识点，边即知识关联；用 Markdown 写笔记，用图谱看知识。
- **技术栈**：TypeScript + Vite + Cytoscape.js（无 React/Vue 等框架），原生 HTML + 模块化 TS。
- **内容格式**：Markdown + YAML frontmatter，所有节点元数据集中在 `data:` 块下。
- **当前状态**：已完成 ISA 边迁移（2026-07-14，详见 [migration-report.md](./archive/migration-report.md)），所有层级关系统一使用 `isa`（子→父）方向。

---

## 2. 整体架构

项目采用**严格分层**的架构，遵循"数据与视图分离"原则：

```
┌──────────────────────────────────────────────────────────┐
│  内容层（Content）                                          │
│  public/content/**/*.md — Markdown + frontmatter          │
└───────────────────────┬──────────────────────────────────┘
                        │ (vite 插件生成 manifest)
                        ▼
┌──────────────────────────────────────────────────────────┐
│  解析层（src/parser）                                       │
│  content-manager.ts → frontmatter.ts → schema.ts         │
│  · 扫描目录、解析 YAML、校验白名单                          │
└───────────────────────┬──────────────────────────────────┘
                        │ ParsedFrontmatter Map
                        ▼
┌──────────────────────────────────────────────────────────┐
│  核心层（src/core）                                         │
│  build-graph.ts → graph.ts → config.ts → renderer.ts      │
│  · 构建节点/边、去重、悬空边检测、视觉配置、Cytoscape 实例  │
└───────────────────────┬──────────────────────────────────┘
                        │ GraphData + Renderer
                        ▼
┌──────────────────────────────────────────────────────────┐
│  交互层（src/ui）                                           │
│  main.ts → state.ts → action-dispatcher.ts → 各 UI 模块   │
│  · 入口组装、状态管理、事件分发、面板/搜索/漫游/布局         │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
                   浏览器 DOM
```

**关键设计**：
- **数据优先**：图谱展示的所有信息必须先在 frontmatter 中定义，视觉是数据的下游。
- **单向边定义**：关系只在发起方节点写 `edges_out`，不需要两边都写。
- **单一真相源（SSoT）**：颜色/形状/线型等视觉配置集中在 `core/config.ts`；edge-type 词汇表集中在 `core/edge-types.ts`；frontmatter 白名单集中在 `parser/schema.ts`。

---

## 3. 目录结构

```
pharma-graph/
├── public/
│   ├── content/                # Markdown 知识内容（核心资产）
│   │   ├── 药学专业知识一/      # 按教材科目分目录
│   │   └── 药学专业知识二/
│   ├── audio/                  # 背景音乐资源
│   ├── images/                 # 静态图片
│   └── content-manifest.json  # vite 构建期生成的内容清单
│
├── src/
│   ├── parser/                # Markdown/frontmatter 解析层
│   │   ├── content-manager.ts # 扫描 content 目录
│   │   ├── frontmatter.ts     # YAML frontmatter 解析器
│   │   └── schema.ts          # 字段白名单（essence/field/tier/edge）
│   │
│   ├── core/                  # 图谱核心逻辑（与浏览器无强耦合）
│   │   ├── graph.ts           # GraphData/NodeData/EdgeData 类型定义
│   │   ├── build-graph.ts     # 纯函数：ParsedFrontmatter → GraphData
│   │   ├── graph-manager.ts   # 浏览器入口：组装解析+构建
│   │   ├── content-loader.ts  # fetch manifest + 并行加载 .md
│   │   ├── node-builder.ts    # CLI 节点构建入口
│   │   ├── edge-builder.ts    # CLI 边构建入口
│   │   ├── config.ts          # 视觉配置 SSoT（形状/颜色/线型/布局）
│   │   ├── edge-types.ts      # 边类型词汇表 SSoT
│   │   ├── renderer.ts        # Cytoscape 实例封装 + 样式表
│   │   └── tour.ts            # 自动导览引擎（Strategy 模式）
│   │
│   ├── data/
│   │   └── vocabulary.ts      # 学科分类/词汇数据
│   │
│   ├── types/
│   │   └── cytoscape-extensions.d.ts  # Cytoscape 扩展类型声明
│   │
│   └── ui/                    # 浏览器 UI 交互层
│       ├── main.ts            # 应用入口（组装+接线）
│       ├── state.ts           # 集中临时状态（uiState 单例）
│       ├── action-dispatcher.ts  # data-action 委托分发器
│       ├── action-handlers.ts    # 所有 data-action 处理器注册
│       ├── graph-events.ts       # Cytoscape 事件绑定
│       ├── detail-panel.ts      # 节点详情面板
│       ├── bigscreen.ts         # 影院/大屏模式
│       ├── tour-controller.ts   # 漫游 UI 控制器
│       ├── layout-manager.ts    # 布局切换/参数管理
│       ├── layout-menu.ts       # 布局下拉菜单
│       ├── search.ts / search-ui.ts  # 搜索引擎 + 输入 UI
│       ├── highlight-engine.ts  # 节点高亮/dim 引擎
│       ├── legend-manager.ts / legend-factory.ts  # 图例
│       ├── focus-node.ts        # 相机聚焦动画
│       ├── music-player.ts      # 背景音乐
│       ├── carousel.ts          # 顶栏品牌轮播
│       ├── markdown.ts         # Markdown 渲染（marked + DOMPurify）
│       ├── ui-toggle.ts         # 双态切换抽象（pin/collapse）
│       ├── ui-helpers.ts        # tooltip/ripple/toast 等
│       ├── drag-manager.ts      # 面板/底部条拖拽
│       ├── dom-cache.ts         # DOM 查询缓存
│       ├── keyboard-shortcuts.ts # 键盘快捷键
│       ├── graph-stats.ts       # 节点/边计数同步
│       ├── anim-pulse.ts        # 节点脉冲动画
│       ├── logger.ts            # DEV 门控日志
│       ├── debug-bridge.ts / app-debug.ts  # 调试桥与取证面板
│       └── styles/              # CSS（base/components/layout/shared/tour）
│
├── scripts/                   # 独立工具脚本（npm run 调用）
│   ├── validate.ts            # frontmatter 严格校验（CI 门禁）
│   ├── audit-frontmatter.ts  # 评分 + ADR 合规报告
│   ├── measure-overlap.ts    # 布局重叠度量
│   └── serve.ts              # 静态开发服务器
│
├── archive/scripts/           # 归档的一次性脚本
├── docs/                      # 文档目录（本文件所在）
├── examples/                  # Cytoscape 示例
├── index.html                 # 应用 HTML 入口
├── vite.config.ts             # Vite 构建配置（含 manifest 插件）
├── tsconfig.json              # TypeScript 配置
├── vitest.config.ts           # Vitest 测试配置
├── eslint.config.js           # ESLint 配置
└── package.json              # 依赖与 npm scripts
```

---

## 4. 数据流转与渲染管道

完整的数据流（来自 [README.md §5](./README.md) 与 [DEVELOP.md §8](./DEVELOP.md)）：

```
编写 Markdown 笔记（public/content/**/*.md）
        ↓ frontmatter (data: 块) 定义节点元数据 + edges_out 定义关系
vite buildStart → contentManifestPlugin 生成 content-manifest.json
        ↓
浏览器 fetch manifest → 并行 fetch 每个 .md 文件
        ↓ content-loader.ts
GraphManager 调用 parseFrontmatterWithWarnings → 得到 ParsedFrontmatter Map
        ↓
buildGraph() 构建节点/边、去重、悬空边检测、度计算、sourcePath 规范化
        ↓ GraphData { nodes[], edges[] }
Renderer 注入 config.ts 的样式表 + 布局配置 → Cytoscape 实例
        ↓
Cytoscape.js 渲染到 #cy 容器
        ↓
graph-events/highlight-engine/detail-panel/search 等模块接管交互
```

**关键点**：
- Markdown 不进 JS bundle，运行时 fetch（节省 ~600KB bundle 体积，代价是冷启动多一次往返）。
- 浏览器与 CLI 共享同一个 `buildGraph` 纯函数，行为一致。
- Parser warnings 同时输出到浏览器 console 与 CLI 报告（issue #14）。

---

## 5. 模块职责详解

### 5.1 parser 解析层

负责把 Markdown 文件转换为结构化元数据，是浏览器与 CLI 共用的底层模块。

#### [content-manager.ts](../src/parser/content-manager.ts)
- **职责**：扫描项目 `public/content/` 目录，递归收集所有 `.md` 文件（过滤 `dist/`），返回排序后的绝对路径列表。
- **关键导出**：`scanContentDir(dir)` — Node CLI 入口。
- **依赖**：`node:fs/promises`、`path`。

#### [frontmatter.ts](../src/parser/frontmatter.ts)
- **职责**：纯 JS frontmatter 解析器，浏览器兼容。从 Markdown 文件顶部的 `---` YAML 块提取节点元数据，校验必填字段（`id` 等），转换 `edges_out` / `tags` / `location` / `body`，并向 caller 报告结构化 warning（issue #14）。
- **关键类型**：
  - `NodeMeta` — 节点元数据（id/label/essence/field/tier/summary/location）
  - `EdgeDef` — 边定义（target/type/reason）
  - `ParsedFrontmatter extends NodeMeta` — 加上 `edges_out`/`tags`/`body`
  - `ParseWarning` — 非致命问题（file/field/message/severity）
  - `ParseResult` — `{ fm, warnings }`
- **关键导出**：
  - `parseFrontmatterWithWarnings(raw, filePath)` — 带 warning 收集的入口
  - `parseFrontmatter(raw, filePath)` — 旧 API（无 warning）
- **依赖**：`yaml`（YAML 解析）、`core/edge-types.ts`（`DEFAULT_EDGE_TYPE`）。

#### [schema.ts](../src/parser/schema.ts)
- **职责**：frontmatter **值列表白名单**的唯一真相源（issue #20）。集中定义 `VALID_ESSENCE`、`VALID_FIELD`、`VALID_TIER`，并 re-export `VALID_EDGE_TYPES`（来自 `core/edge-types.ts`）。提供 `isValidEssence/isValidField/isValidTier/isValidEdgeType` 谓词。
- **设计要点**：
  - parser 自身接受任意字符串，白名单是 warning 级校验，不是 parse error。
  - 保留历史值（`part`、`bridge`、`life_sciences`、`biopharmaceutical`）以兼容旧内容，删除前需先审计语料。

### 5.2 core 核心层

负责从解析结果构建图谱数据，封装 Cytoscape 实例与视觉配置。与浏览器无强耦合（CLI 也可用）。

#### [graph.ts](../src/core/graph.ts)
- **职责**：图谱数据类型定义，对应 Cytoscape.js 的 data 字段。
- **关键类型**：
  - `NodeLocation` — 教材位置（book/part/chapter/section/subsection/item）
  - `NodeData` — 节点数据（id/label/type/category/essence/field/tier/layer/summary/location/tags/body/sourcePath/weight）
  - `EdgeData` — 边数据（id/source/target/type/reason）
  - `GraphData` — `{ nodes: NodeData[], edges: EdgeData[] }`

#### [build-graph.ts](../src/core/build-graph.ts)
- **职责**：纯函数 `buildGraph(frontmatters, options)` — 从 `Map<filePath, ParsedFrontmatter>` 构建 `GraphData`。负责节点 ID 收集、`edges_out` 转边、悬空边检测、边去重、度计算（节点 weight）、`sourcePath` 规范化。
- **关键导出**：
  - `buildGraph(frontmatters, options)` — 纯函数，无 I/O
  - `BuildOptions` — `{ knownNodeIds?, onDanglingEdges? }`
  - `DanglingEdge`、`BuildResult extends GraphData`
- **设计要点**：浏览器（Vite glob → strings）与 Node CLI（fs.readFile）共用此函数，确保行为一致。

#### [graph-manager.ts](../src/core/graph-manager.ts)
- **职责**：浏览器端入口。接收 `{ filePath: rawText }` map，对每个文件调用 `parseFrontmatterWithWarnings`，收集 warnings，再调 `buildGraph` 生成图谱数据。缓存构建结果。
- **关键导出**：`GraphManager` 类（`build()`、`getData()`、`warnings: ParseWarning[]`）。

#### [content-loader.ts](../src/core/content-loader.ts)
- **职责**：替代旧 `import.meta.glob` 方案。`fetch('/content-manifest.json')` 拿到文件列表，并行 `fetch` 每个 `.md`，key 仍按旧 glob 路径 shape（`../../content/<rel>`）以便 `GraphManager` 不变。
- **关键导出**：`loadContent()` → `{ files: Record<string,string>, count }`。
- **设计要点**：对每个路径段单独 `encodeURIComponent`，避免 nginx 把 `+` 解码成空格破坏文件名。

#### [node-builder.ts](../src/core/node-builder.ts) / [edge-builder.ts](../src/core/edge-builder.ts)
- **职责**：Node CLI 构建入口。读取文件路径、解析 frontmatter、从路径推导 `NodeLocation`、调 `buildGraph` 生成节点/边数据，并对 `knownNodeIds` 外的悬空边输出 stderr 报告。供 `scripts/` 调用。

#### [config.ts](../src/core/config.ts)
- **职责**：视觉配置的单一真相源（SSoT）。定义：
  - `NODE_TYPE_SHAPE` — essence → 形状（concept=octagon、medication=ellipse、illness=diamond…）
  - `NODE_TYPE_COLOR` / `NODE_TYPE_COLOR_DARK` — essence → 颜色
  - `ESSENCE_LABEL` — essence → 中文标签
  - `FIELD_COLOR` — 学科 → 边框色（pharmaceutics=橙、pharmacology=紫…）
  - `NODE_TIER_STYLE` — tier → 填充色
  - `EDGE_TYPE_STYLE` / `EDGE_TYPE_LABEL` — 边类型 → 线型/箭头/颜色 + 中文标签
  - `LAYOUTS` / `DEFAULT_LAYOUT` — 布局配置与默认布局（**Euler**，2026-07 §12.4 由 COSE 切换）
- **设计原则**：视觉维度与知识语义一一对应——essence→形状（"这是什么"）、field→边框色（"哪门学科"）、tier→填充色（"在哪一层"）。

#### [edge-types.ts](../src/core/edge-types.ts)
- **职责**：边类型词汇表的 SSoT（issue #9）。导出 `EDGE_TYPES` readonly tuple（has/isa/activates/inhibits/mechanism/metabolizes/treats/causes/interacts/contraindicates/prerequisite/relates/sibling/contains/part_of/specializes）、`EdgeType` 类型、`DEFAULT_EDGE_TYPE`（`'relates'`）、`isEdgeType()` 类型守卫。
- **设计要点**：新增边类型只需改这一个文件，validator/legend/renderer 全部派生自此。

#### [renderer.ts](../src/core/renderer.ts)
- **职责**：Cytoscape 实例管理 + 样式表生成。注册 `cose-bilkent`/`dagre`/`euler` 扩展；从 `config.ts` 编译节点形状/边框色/填充色/边样式为 Cytoscape stylesheet；定义 `Renderer` 类封装实例化、layout、canvas renderer、zoom/selection 配置。
- **关键导出**：
  - `CLASSES` — CSS class 常量（`SELECTED_NODE`、`DIMMED`、`HIGHLIGHTED`、`PULSE`、`TOUR_PATH_PREVIEW`…）
  - `RendererOptions` 接口
  - `Renderer` 类（`getCy()` 等）
- **样式层级**：① 节点基础 → ② field 边框色 → ③ essence 形状 → ④ tier 填充 → ⑤ 边与交互状态。

#### [tour.ts](../src/core/tour.ts)
- **职责**：自动导览引擎，Strategy 模式，2 种内置策略。
- **关键类型/导出**：
  - `TourStrategy` = `'has-dfs' | 'topo-prereq'`
  - `TOUR_STRATEGY_LABELS` — 策略中文标签
  - `TourStrategyImpl` 接口（`id`/`label`/`buildSequence(cy)`）
  - `TourOptions`、`TourStepInfo`、`TourCompleteReason`
  - `HasDfsStrategy` — 按 `location` 字段全局排序生成教材顺序序列（比 has 边 DFS 更可靠）
  - `TopoPrereqStrategy` — 基于 `prerequisite` 边构建依赖图，Kahn 拓扑排序，按 tier/location 排序
  - `ALL_STRATEGIES`、`getStrategy(id)`
  - `TourEngine` — 引擎本体，`start()` 用策略生成序列后逐节点推进

### 5.3 ui 交互层

负责浏览器端的视觉呈现与交互。按职责分组：

#### 入口与组装
- **[main.ts](../src/ui/main.ts)** — 应用入口。`boot()` 异步函数：加载内容 → `GraphManager.build()` → 创建 `Renderer`/`HighlightEngine`/`DetailPanel`/`Search` → 构造 `TourController`（必须在 `initGraphEvents` 之前，issue #11 修复的竞态）→ `initGraphEvents` → 注册 action handlers / shortcuts / search UI / music player / bigscreen / debug bridge → 显示 onboarding tip。
- **[state.ts](../src/ui/state.ts)** — 集中临时状态。`uiState` 单例持有 renderer/highlight/detailPanel/search/tour/sectionState/activeTab 等引用。`isPanelPinned`/`tourBarCollapsed` 改为通过 `UiToggle` 代理读取（issue #6，消除双源写入）。提供 `registerPinToggle`/`registerTourBarToggle`。

#### 事件与动作分发
- **[action-dispatcher.ts](../src/ui/action-dispatcher.ts)** — 替代 inline `onclick` 的委托分发器。HTML 用 `data-action="..."` + `data-arg`/`data-args` 声明动作，TS 用 `registerAction(name, handler)` 注册。一个 document 级 click listener，未注册动作静默 no-op。`dispatchAction(name, args)` 供编程式触发（快捷键/测试）。
- **[action-handlers.ts](../src/ui/action-handlers.ts)** — 所有 `data-action` 注册入口。toolbar/bottom sheet/layout picker/sidebar collapse/legend filter/bigscreen 等动作到业务函数的映射表。
- **[graph-events.ts](../src/ui/graph-events.ts)** — Cytoscape 事件绑定。node/edge/canvas tap、dblclick：节点点击开 detailPanel、边点击高亮、空白点击关 panel/停 tour、双击退出 bigscreen。`GraphEventDeps` 列出依赖。

#### 面板与视图
- **[detail-panel.ts](../src/ui/detail-panel.ts)** — 节点详情面板。构造时查找 DOM、初始化 pin toggle（`UiToggle`）、绑定 tab/pin/节点点击/section collapse 事件。
- **[bigscreen.ts](../src/ui/bigscreen.ts)** — 影院/大屏模式。隐藏 UI 并全屏，ESC/双击画布退出。提供 `registerFitFn`/`registerTourController`/`registerCyAccessor`/`isBigscreen`。
- **[focus-node.ts](../src/ui/focus-node.ts)** — 相机聚焦动画。`focusOnNode(cy, nodeId, opts)` 支持只移动相机不重置 highlight 的 "preview" 模式（搜索自动居中用）。

#### 搜索
- **[search.ts](../src/ui/search.ts)** — `Search` 类。`search()` 调 `HighlightEngine.highlightSearch()`，重置导航光标，更新屏幕阅读器提示。`navigateNext/Prev/commit/clear` 维护结果列表与焦点。
- **[search-ui.ts](../src/ui/search-ui.ts)** — `initSearchUI()` 将 desktop/mobile 两个搜索输入接入 `Search + HighlightEngine + DetailPanel` 管线，同步两输入框。`input` 触发搜索、`ArrowUp/Down` 导航、`Enter` commit、`Escape` 清除。

#### 高亮与图例
- **[highlight-engine.ts](../src/ui/highlight-engine.ts)** — `HighlightEngine`。清除旧状态、选中目标节点、高亮邻居节点和边、dim 无关元素。`highlightSearch(query)` 按 label 匹配并返回匹配节点 ID 列表。
- **[legend-manager.ts](../src/ui/legend-manager.ts)** — 图例主动态管理。四个 legend axis（essence/field/tier/edge）共享 active filter 状态。`clearShapeFilter()` 清除所有 filter。`populateEssenceLegend/FieldLegend/TierLegend` 入口。
- **[legend-factory.ts](../src/ui/legend-factory.ts)** — `LegendAxisDescriptor` 类型 + `buildLegend()` 幂等构建 legend DOM，绑定 delegated click/keyboard handler，按 key 更新计数。

#### 漫游与布局
- **[tour-controller.ts](../src/ui/tour-controller.ts)** — 漫游 UI 控制器。挂载桌面/移动两套控件，管理 engine 生命周期与 running/paused 标志，写回 `uiState.tour.strategy/pathHistory`。
- **[layout-manager.ts](../src/ui/layout-manager.ts)** — 布局切换/参数管理。`fitGraph`/`randomize`/`runLayout`/`syncLayoutDisplay`/`setCurrentLayout`。
- **[layout-menu.ts](../src/ui/layout-menu.ts)** — 布局下拉菜单开关。

#### 辅助与工具
- **[markdown.ts](../src/ui/markdown.ts)** — Markdown 渲染，marked + DOMPurify sanitize。
- **[music-player.ts](../src/ui/music-player.ts)** — 背景音乐播放控制。
- **[carousel.ts](../src/ui/carousel.ts)** — 顶栏品牌轮播（"信息熵"等文案）。
- **[ui-toggle.ts](../src/ui/ui-toggle.ts)** — 双态切换抽象（pin/collapse），单一写入点 + 可选 localStorage 持久化。
- **[ui-helpers.ts](../src/ui/ui-helpers.ts)** — `initEdgeTooltip`/`showEdgeTooltip`/`hideEdgeTooltip`/`spawnNodeRipple`/`showZoomIndicator`/`showToast`。
- **[drag-manager.ts](../src/ui/drag-manager.ts)** — 底部 sheet / 节点面板拖拽与 resize、漫游条位置同步。
- **[dom-cache.ts](../src/ui/dom-cache.ts)** — DOM 查询缓存。
- **[keyboard-shortcuts.ts](../src/ui/keyboard-shortcuts.ts)** — F/R/Esc/Del/Ctrl+A/T/P 等快捷键。
- **[graph-stats.ts](../src/ui/graph-stats.ts)** — `updateStats`/`syncBottomSheetStats` 同步节点/边计数到 DOM。
- **[anim-pulse.ts](../src/ui/anim-pulse.ts)** — 节点脉冲动画。
- **[logger.ts](../src/ui/logger.ts)** — DEV 门控日志（`logInfo` 等），生产环境不输出。
- **[debug-bridge.ts](../src/ui/debug-bridge.ts)** — Console-only 调试桥，暴露 `window._dbg`。
- **[app-debug.ts](../src/ui/app-debug.ts)** — 调试覆盖层与取证面板。

### 5.4 data 数据层

#### [vocabulary.ts](../src/data/vocabulary.ts)
- **职责**：定义词汇/分类数据结构：`Term`、`DisciplineNode`、`DisciplineLayer`，用于结构化学科分类。

### 5.5 scripts 工具脚本

| 命令 | 脚本 | 用途 | 退出码 |
|---|---|---|---|
| `npm run validate` | [validate.ts](../scripts/validate.ts) | 严格 schema/类型校验 + 跨文件 id 引用检查；**CI 必跑** | 0=通过，非0=有 ❌ |
| `npm run audit` | [audit-frontmatter.ts](../scripts/audit-frontmatter.ts) | 0/1/2/3 评分 + ADR-0001 关系方向 + 双向配对；输出 `docs/frontmatter-audit.md` | 永远 0（人工修正用） |
| `npm run view` | [serve.ts](../scripts/serve.ts) | 启动静态开发服务器（无 HMR）+ `/api/graph` 端点 | — |
| `npm run measure-overlap` | [measure-overlap.ts](../scripts/measure-overlap.ts) | 布局重叠度量（N=10 mean/worst overlap） | — |

**`validate` vs `audit` 差异**（来自 [DEVELOP.md](./DEVELOP.md)）：
- `validate` 是**门禁**：缺失必填、值非法、跨文件引用 id 不存在会让进程退出非零。CI 硬约束。
- `audit` 是**度量**：给每篇 markdown 打分并按目录分组输出报告。永远 exit 0，因为字段缺失是增量写作常态。

**归档脚本**（`archive/scripts/`，不在 npm scripts 里）：
- `migrate-frontmatter.ts` — 统一 frontmatter schema 迁移（已完成）
- `migrate-isa.ts` — 按 ADR-0001 把 has 边迁为 isa（已落地）
- `extract-all-frontmatter.ts` — 全库 frontmatter 聚合为 markdown
- `fix-duplicate-id.ts` / `batch-fix.ts` — 历史遗留修复工具

跑法：`npx tsx archive/scripts/<name>.ts [--flags]`。

---

## 6. 关键类与函数索引

| 模块 | 符号 | 类型 | 说明 |
|---|---|---|---|
| `parser/frontmatter.ts` | `parseFrontmatterWithWarnings` | 函数 | 带 warning 收集的解析入口 |
| `parser/frontmatter.ts` | `ParsedFrontmatter` | 接口 | 解析结果（含 edges_out/tags/body） |
| `parser/schema.ts` | `VALID_ESSENCE/FIELD/TIER` | 常量 | 字段白名单 |
| `parser/content-manager.ts` | `scanContentDir` | 函数 | 扫描 content 目录返回路径列表 |
| `core/graph.ts` | `GraphData/NodeData/EdgeData` | 接口 | 图谱数据契约 |
| `core/build-graph.ts` | `buildGraph` | 函数 | 纯函数：ParsedFrontmatter Map → GraphData |
| `core/graph-manager.ts` | `GraphManager` | 类 | 浏览器入口（解析+构建+缓存） |
| `core/content-loader.ts` | `loadContent` | 函数 | fetch manifest + 并行加载 .md |
| `core/config.ts` | `NODE_TYPE_SHAPE/COLOR` | 常量 | essence → 形状/颜色 |
| `core/config.ts` | `FIELD_COLOR` | 常量 | 学科 → 边框色 |
| `core/config.ts` | `EDGE_TYPE_STYLE` | 常量 | 边类型 → 线型/箭头/颜色 |
| `core/config.ts` | `LAYOUTS/DEFAULT_LAYOUT` | 常量 | 布局配置 + 默认布局（Euler） |
| `core/edge-types.ts` | `EDGE_TYPES` | 常量 | 边类型词汇表 SSoT |
| `core/renderer.ts` | `Renderer` | 类 | Cytoscape 实例封装 |
| `core/renderer.ts` | `CLASSES` | 常量 | CSS class 常量集 |
| `core/tour.ts` | `TourEngine` | 类 | 漫游引擎本体 |
| `core/tour.ts` | `HasDfsStrategy` / `TopoPrereqStrategy` | 类 | 两种导览策略 |
| `ui/main.ts` | `boot` | 函数 | 应用入口（异步组装+接线） |
| `ui/state.ts` | `uiState` | 对象 | 集中临时状态单例 |
| `ui/action-dispatcher.ts` | `registerAction` / `dispatchAction` / `installDispatcher` | 函数 | data-action 委托分发 |
| `ui/detail-panel.ts` | `DetailPanel` | 类 | 节点详情面板 |
| `ui/search.ts` | `Search` | 类 | 搜索引擎 |
| `ui/highlight-engine.ts` | `HighlightEngine` | 类 | 节点高亮/dim 引擎 |
| `ui/tour-controller.ts` | `TourController` | 类 | 漫游 UI 控制器 |
| `ui/layout-manager.ts` | `fitGraph` / `runLayout` / `setCurrentLayout` | 函数 | 布局操作 |
| `ui/focus-node.ts` | `focusOnNode` | 函数 | 相机聚焦动画 |
| `ui/ui-toggle.ts` | `UiToggle` | 类 | 双态切换抽象 |

---

## 7. 依赖关系

### 7.1 生产依赖（package.json `dependencies`）

| 依赖 | 版本 | 用途 |
|---|---|---|
| `cytoscape` | ^3.34.0 | 图论可视化核心引擎 |
| `dompurify` | ^3.4.13 | Markdown HTML 输出 sanitize |
| `glob` | ^11.0.0 | 文件路径匹配（CLI 脚本） |
| `marked` | ^18.0.9 | Markdown → HTML 渲染（detail-panel） |
| `yaml` | ^2.9.0 | frontmatter YAML 解析 |

### 7.2 开发依赖（关键）

| 依赖 | 用途 |
|---|---|
| `vite` ^8.0.16 | 构建+开发服务器 |
| `vitest` ^2.1.9 + `@vitest/coverage-v8` | 测试框架 + 覆盖率 |
| `tsx` ^4.22.4 | 直接运行 TS 脚本（scripts/） |
| `typescript` ^5.5.0 | 类型系统 |
| `eslint` ^9.39.5 + `prettier` ^3.9.6 | 代码风格 |
| `jsdom` ^25.0.1 | DOM 测试环境 |
| `cytoscape-cose-bilkent` / `cytoscape-dagre` / `cytoscape-euler` | 布局扩展 |
| `cytoscape-popper` | tooltip 扩展 |
| `@types/node` ^22 | Node 类型 |

### 7.3 模块内依赖图（关键路径）

```
index.html
  └─ src/ui/main.ts
       ├─ src/core/content-loader.ts → fetch manifest + .md
       ├─ src/core/graph-manager.ts
       │    ├─ src/parser/frontmatter.ts (parseFrontmatterWithWarnings)
       │    │    └─ src/core/edge-types.ts (DEFAULT_EDGE_TYPE)
       │    └─ src/core/build-graph.ts (buildGraph)
       │         └─ src/core/graph.ts (GraphData 类型)
       ├─ src/core/renderer.ts
       │    ├─ src/core/config.ts (NODE_TYPE_*/FIELD_COLOR/EDGE_TYPE_STYLE/LAYOUTS)
       │    │    └─ src/core/edge-types.ts (EDGE_TYPES)
       │    └─ cytoscape + cose-bilkent/dagre/euler 扩展
       ├─ src/ui/state.ts (uiState 单例)
       ├─ src/ui/action-dispatcher.ts + action-handlers.ts
       ├─ src/ui/graph-events.ts
       ├─ src/ui/highlight-engine.ts
       ├─ src/ui/detail-panel.ts (用 ui-toggle.ts)
       ├─ src/ui/search.ts + search-ui.ts
       ├─ src/ui/tour-controller.ts → src/core/tour.ts (TourEngine + 策略)
       ├─ src/ui/layout-manager.ts + layout-menu.ts
       ├─ src/ui/legend-manager.ts + legend-factory.ts
       ├─ src/ui/bigscreen.ts / focus-node.ts / drag-manager.ts
       ├─ src/ui/music-player.ts / carousel.ts / markdown.ts
       └─ src/ui/keyboard-shortcuts.ts / logger.ts / debug-bridge.ts
```

**CLI 脚本**（`scripts/`）复用 `src/parser` 与 `src/core/build-graph`，不依赖 `src/ui`。

---

## 8. 项目运行方式

### 8.1 安装

```bash
npm install
```

### 8.2 开发服务器（带 HMR）

```bash
npm run dev        # 或 npm start
```

- Vite 启动开发服务器，热更新 Markdown 文件（`handleHotUpdate` 重新生成 manifest）。
- 默认布局 **Euler**（`config.ts` `DEFAULT_LAYOUT`，2026-07 §12.4 由 COSE 切换）。

### 8.3 静态服务器（无 HMR，含 `/api/graph`）

```bash
npm run view      # node --import tsx scripts/serve.ts
```

### 8.4 生产构建与预览

```bash
npm run build     # vite build → dist/
npm run preview   # vite preview
```

### 8.5 测试

```bash
npm test              # vitest run（单次）
npm run test:watch    # vitest watch
npm run test:coverage # vitest run --coverage
```

测试配置见 `vitest.config.ts`，DOM 测试用 `jsdom`。

### 8.6 校验与审计

```bash
npm run validate           # CI 门禁：frontmatter 严格校验
npm run audit              # 度量：评分 + ADR 合规报告
npm run measure-overlap    # 布局重叠度量
```

**工作流建议**（来自 [DEVELOP.md](./DEVELOP.md)）：
- 改了 markdown → 先 `npm run validate`（防 schema 回归）
- 集中批量修一批 → 中途用 `npm run audit` 看进度
- 修完提交前 → 再 `npm run validate`（兜底）

### 8.7 代码风格

```bash
npm run lint         # eslint .
npm run lint:fix     # eslint . --fix
npm run format       # prettier --write .
npm run format:check # prettier --check .
```

### 8.8 环境变量

参考 `.env.example`（记录需要配置的环境变量，如 content 路径、输出格式等）。

---

## 9. 构建与测试

### 9.1 Vite 配置（[vite.config.ts](../vite.config.ts)）

- **`contentManifestPlugin`**：`buildStart` 时遍历 `public/content/` 递归收集所有 `.md` 文件，写入 `public/content-manifest.json`（`{ files: [...], generatedAt }`）。`handleHotUpdate` 在 `.md` 文件变更时重新生成 manifest，保持 dev 同步。
- **`publicDir`**：`public`
- **`build.outDir`**：`dist`（`emptyOutDir: true`）
- **`optimizeDeps.include`**：`cytoscape`、`cytoscape-cose-bilkent`、`cytoscape-dagre`、`cytoscape-euler`

### 9.2 测试配置（[vitest.config.ts](../vitest.config.ts)）

- 环境：`jsdom`（DOM 测试）
- 覆盖率：`@vitest/coverage-v8`

### 9.3 TypeScript 配置（[tsconfig.json](../tsconfig.json)）

- `type: module`（ESM）
- 路径别名与严格模式（详见文件）

### 9.4 测试覆盖范围

测试文件与源文件同目录（`*.test.ts`），覆盖：
- `core/`：`build-graph`、`edge-types`、`tour`/`tour-engine`、`config-layouts`、`cytoscape-style-tokens`
- `parser/`：`frontmatter`
- `ui/`：`action-dispatcher`、`app-debug`、`bigscreen`/`bigscreen-sidebar-roundtrip`、`detail-panel-questions`、`focus-node`、`graph-events`/`graph-events-helpers`、`layout-manager`、`layout-menu`、`logger`、`search`/`search-ui`、`state`、`tour-controller`、`ui-toggle`

---

## 10. 约定与设计原则

### 10.1 规则手册（来自 [README.md §0](./README.md)）

| 规则 | 适用范围 | 文档 |
|---|---|---|
| 节点拆分 | 把手绘思维导图转写为新增节点 | [SPLIT-RULES.md](./SPLIT-RULES.md) |
| 节点合并/重构 | 清理零入度节点、补骨架边、修 schema | [REFACTOR-RULES.md](./REFACTOR-RULES.md) |
| 层级关系方向 | isa/prerequisite/mechanism 等边的方向约定 | [ADR-0001](./ARD/ADR-0001-层级关系统一使用isa方向.md) |

### 10.2 关系类型（13 种 + 结构语义扩展）

详见 [README.md §3](./README.md) 与 [DEVELOP.md §5](./DEVELOP.md)。核心规则：

- **层级关系一律用 `isa`（子→父）**，不要用 `has` 表达"属于"。
- **`has` 只用于物理/组合组成**（整体→部分），当前无用例，保留以备后用。
- **禁止双向书写同一对层级关系**（不要同时写 `A isa B` 和 `B isa A`）。

边类型词汇表的 SSoT 在 [edge-types.ts](../src/core/edge-types.ts)（issue #9），新增边类型是单文件改动。

### 10.3 视觉维度与语义一一对应

| 维度 | 回答的问题 | 配置位置 |
|---|---|---|
| Essence（本质）→ 形状 | "这是什么"（药/病/概念/机制） | `config.ts` `NODE_TYPE_SHAPE` |
| Field（学科）→ 边框色 | "属于哪门学科" | `config.ts` `FIELD_COLOR` |
| Tier（层次）→ 填充色 | "在哪一层"（基础→高层） | `config.ts` `NODE_TIER_STYLE` |
| Edge type → 线型/箭头/颜色 | 关系语义 | `config.ts` `EDGE_TYPE_STYLE` |

### 10.4 单一真相源（SSoT）原则

代码中多处强调 SSoT，避免手抄多份列表失同步：
- **边类型词汇表**：`core/edge-types.ts`（issue #9，原分散在 validate.ts/config.ts 三处）
- **frontmatter 白名单**：`parser/schema.ts`（issue #20，原 validate.ts 与 audit-frontmatter.ts 各持一份且已 drift）
- **视觉配置**：`core/config.ts`
- **临时 UI 状态**：`ui/state.ts` `uiState`（issue #6，原 `isPanelPinned` 双源写入）
- **默认布局文案**：`config.ts` `DEFAULT_LAYOUT='euler'`，由 `config-layouts.test.ts` 守护与 HTML 同步

### 10.5 数据与视图分离

- 内容（Markdown）与渲染（Cytoscape）完全解耦。
- 同一套数据可接不同可视化引擎。
- 视觉表现（颜色/形状）是数据的下游，不反向定义数据。

### 10.6 单向边定义

关系只在**发起方**节点的 `edges_out` 中定义，不需要两边都写。例如 `A isa B` 只在 A 的文件里写。

### 10.7 frontmatter 数据格式

统一放在 `data:` 块下（迁移后 schema），样本见 [public/content/药学专业知识二/.../卡马西平.md](../public/content/药学专业知识二/第一章%20精神与中枢神经系统用药/第二节%20抗癫痫发作药物/卡马西平.md)：

```yaml
---
data:
  id: carbamazepine
  label: 卡马西平
  essence: medication
  field: pharmacology
  tier: drug
  location:
    book: 药学专业知识二
    chapter: 第一章 精神与中枢神经系统用药
    section: 第二节 抗癫痫发作药物
    item: 卡马西平
  tags: [...]
  summary:
    short: 一句话定义
    full: 详细解释
  edges_out:
    - target: <nodeId>
      type: isa           # 关系类型，见 edge-types.ts
      reason: 为什么指向
---

# 卡马西平
正文（Markdown）...
```

完整字段参考见 [frontmatter.md](./frontmatter.md)。

---

## 附录：相关文档索引

- [README.md](./README.md) — 产品文档（用户视角）
- [DEVELOP.md](./DEVELOP.md) — 开发者指南
- [frontmatter.md](./frontmatter.md) — frontmatter 完整字段参考
- [ADR-0001](./ARD/ADR-0001-层级关系统一使用isa方向.md) — 层级关系改为 isa 的决策记录
- [Cytoscape.md](./Cytoscape.md) — Cytoscape.js 渲染层笔记
- [REFACTOR-RULES.md](./REFACTOR-RULES.md) — 节点合并/重构规则
- [SPLIT-RULES.md](./SPLIT-RULES.md) — 节点拆分规则
- [布局参数清单.md](./布局参数清单.md) — 布局参数清单
- [all-frontmatter-extracted.md](./all-frontmatter-extracted.md) — 全库 frontmatter 可读快照（自动生成）
