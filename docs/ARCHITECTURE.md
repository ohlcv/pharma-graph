# 药学知识图谱 · 架构文档（ARCHITECTURE）

> 更新日期：2026-09-21　·　基线：commit `26d0563`（本次提交后工作树干净）
>
> 本文件是项目的**结构地图**：每个目录、每个文件的路径、职责、大小与行数，以及最终汇总。它是活文档，`src/`、`scripts/`、`docs/` 有变动时应同步更新。
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

| 路径 | 类型 | 职责 | 大小 / 行数 |
|---|---|---|---|
| `src/` | 目录 | 全部 TypeScript 源码（解析 / 核心逻辑 / UI） | 101 文件 / 24,733 行 |
| `scripts/` | 目录 | 构建与治理入口（构建链、校验、审计） | 10 文件 / 2,329 行 |
| `build/` | 目录 | 构建期库代码（被 vite.config 与 scripts 入口共享） | 1 文件 / 581 行 |
| `tools/` | 目录 | 一次性修复 / 迁移工具（用完归档） | 7 文件 / 1,633 行 |
| `docs/` | 目录 | 文档（架构、规范、ARD 决策记录、调试记录） | 42 文件 / 35,676 行 |
| `public/` | 目录 | 静态资产 + 内容 Markdown + 预生成数据（Vite 的 publicDir） | 1,068 文件 / 52,455 行 |
| `dist/` | 目录 | Vite 构建产物，vercel 部署时自动构建，不入仓库 | — |
| `examples/` | 目录 | 功能演示页 | 1 文件 / 1,348 行 |
| `archive/` | 目录 | 归档内容与一次性迁移脚本 | 7 文件 / 3,008 行 |
| `index.html` | 文件 | 应用唯一 HTML 入口 | 73,934 B / 1,086 行 |
| `vite.config.ts` | 文件 | Vite 配置 + content 构建插件 | 1,568 B / 59 行 |
| `package.json` | 文件 | 项目清单与 npm scripts | 2,084 B / 62 行 |
| `package-lock.json` | 文件 | 锁文件 | 310,596 B / 8,865 行 |
| `tsconfig.json` | 文件 | TypeScript 配置 | 490 B / 21 行 |
| `vitest.config.ts` | 文件 | Vitest 配置 | 506 B / 20 行 |
| `eslint.config.js` | 文件 | ESLint 配置 | 3,341 B / 125 行 |
| `.prettierrc.json` | 文件 | Prettier 配置 | 200 B / 11 行 |
| `vercel.json` | 文件 | 部署配置 | 1,168 B / 55 行 |
| `.env.example` | 文件 | 环境变量模板 | 511 B / 18 行 |
| `.cursor/rules/frontmatter-conventions.mdc` | 文件 | Cursor 规则：frontmatter YAML 写作规范 | 2,093 B / 62 行 |

## 3. `src/` — 源码（101 个文件，24,733 行，约 1.05 MB）

### 3.1 `src/parser/` — Markdown 解析层（5 文件 / 768 行 / 27,044 B）

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `src/parser/content-manager.ts` | 扫描 content 目录、收集文件 | 726 B | 21 |
| `src/parser/frontmatter.test.ts` | 解析器回归测试（含真实文件用例） | 8,539 B | 295 |
| `src/parser/frontmatter.ts` | frontmatter 解析 / 序列化 / 校验入口 | 14,197 B | 367 |
| `src/parser/location-audit.test.ts` | location 审计测试 | 2,099 B | 51 |
| `src/parser/schema.ts` | fill 白名单（从 FILL_CONFIG 派生）与字段校验 | 1,483 B | 34 |

### 3.2 `src/core/` — 图谱核心逻辑（含测试 23 文件 / 7,575 行 / 307,046 B）

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `src/core/build-graph.test.ts` | 构建图数据测试 | 4,333 B | 147 |
| `src/core/build-graph.ts` | 从 frontmatter 构建节点边 + BFS 深度 / 子树算法 | 12,218 B | 336 |
| `src/core/config.ts` | 全局配置：FILL_CONFIG / 布局 / 边类型映射 / 主题色 | 33,191 B | 810 |
| `src/core/content-loader.ts` | 内容加载器 | 3,460 B | 73 |
| `src/core/device-capability.ts` | 设备能力检测（移动端 / 大屏） | 3,212 B | 81 |
| `src/core/edge-builder.ts` | 汇总 edges_out → 边数据 | 970 B | 28 |
| `src/core/edge-types.test.ts` | 边类型测试 | 2,533 B | 60 |
| `src/core/edge-types.ts` | 边类型词汇表 | 1,221 B | 33 |
| `src/core/force-drag.ts` | 力导向拖拽交互 | 10,596 B | 324 |
| `src/core/glow-overlay.ts` | glow / flow 光效覆盖层（独立 canvas） | 33,897 B | 789 |
| `src/core/graph-manager.ts` | 图数据装配与缓存管理 | 3,826 B | 110 |
| `src/core/graph.ts` | 节点 / 边数据结构定义 | 4,207 B | 95 |
| `src/core/node-builder.ts` | frontmatter → 节点数据 | 2,705 B | 71 |
| `src/core/node-shape-outline.ts` | 节点形状描边渲染 | 7,299 B | 212 |
| `src/core/optimized-content-loader.ts` | 流式 .md 加载 fallback | 11,223 B | 357 |
| `src/core/prebuilt-loader.ts` | 加载预生成 graph-data.json | 4,369 B | 107 |
| `src/core/renderer.ts` | Cytoscape 实例 + 样式表 + 布局入口 | 46,199 B | 1,087 |
| `src/core/theme-colors.ts` | 主题色读取与切换 | 1,392 B | 35 |
| `src/core/tour-engine.test.ts` | 漫游引擎集成测试 | 28,316 B | 697 |
| `src/core/tour.test.ts` | 漫游引擎单元测试 | 3,501 B | 93 |
| `src/core/tour.ts` | 漫游引擎（DFS/拓扑序、档位、applyRootScope） | 73,908 B | 1,710 |

**`src/core/__tests__/`** — 核心层测试（2 文件 / 303 行 / 13,655 B）

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `src/core/__tests__/config-layouts.test.ts` | 配置布局测试 | 10,986 B | 241 |
| `src/core/__tests__/cytoscape-style-tokens.test.ts` | 样式 token 测试 | 2,669 B | 62 |

### 3.3 `src/data/` — 领域词汇（1 文件 / 575 行 / 31,828 B）

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `src/data/vocabulary.ts` | 药学领域词汇表 | 31,828 B | 575 |

### 3.4 `src/types/` — 类型扩展（1 文件 / 14 行 / 270 B）

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `src/types/cytoscape-extensions.d.ts` | Cytoscape 类型声明补充 | 270 B | 14 |

### 3.5 `src/ui/` — 浏览器层 UI（71 文件 / 15,746 行 / 677,940 B）

#### 入口与装配

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `src/ui/main.ts` | 应用入口，组装所有模块 | 31,596 B | 805 |
| `src/ui/state.ts` | 全局 UI 状态 | 4,740 B | 128 |
| `src/ui/action-dispatcher.ts` | data-action 指令分发 | 3,693 B | 110 |
| `src/ui/action-handlers.ts` | 注册全部 action 处理器 | 5,466 B | 171 |
| `src/ui/dom-cache.ts` | DOM 引用缓存 | 1,969 B | 57 |
| `src/ui/logger.ts` | 日志工具（DEV 才输出） | 1,583 B | 41 |
| `src/ui/debug-bridge.ts` | 调试桥接 | 2,906 B | 86 |
| `src/ui/ui-helpers.ts` | 通用 UI 辅助（toast 等） | 3,578 B | 76 |

#### 图谱交互

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `src/ui/graph-events.ts` | Cytoscape 事件绑定（点击 / 悬停 / 缩放） | 10,518 B | 242 |
| `src/ui/drag-manager.ts` | 侧栏 / 面板拖拽与吸附 | 22,385 B | 624 |
| `src/ui/focus-node.ts` | 节点聚焦 | 4,103 B | 113 |
| `src/ui/highlight-engine.ts` | 高亮引擎 | 7,763 B | 222 |
| `src/ui/search.ts` | 搜索逻辑 | 6,078 B | 167 |
| `src/ui/search-ui.ts` | 搜索 UI | 7,844 B | 196 |
| `src/ui/keyboard-shortcuts.ts` | 快捷键 | 3,433 B | 106 |
| `src/ui/detail-panel.ts` | 节点详情面板 | 21,173 B | 493 |
| `src/ui/bigscreen.ts` | 大屏模式 | 23,138 B | 555 |
| `src/ui/ui-toggle.ts` | UI 开关 | 6,036 B | 170 |
| `src/ui/music-player.ts` | 背景音乐 | 3,053 B | 90 |
| `src/ui/starfield.ts` | 星空背景 | 10,677 B | 270 |
| `src/ui/carousel.ts` | 品牌词轮播 | 3,727 B | 129 |
| `src/ui/speech.ts` | 语音播报 | 5,008 B | 140 |
| `src/ui/anim-pulse.ts` | 脉冲动画 | 2,341 B | 56 |
| `src/ui/graph-stats.ts` | 图谱统计 | 518 B | 13 |
| `src/ui/markdown.ts` | Markdown 渲染（marked + DOMPurify） | 4,166 B | 124 |

#### 漫游（Tour）

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `src/ui/tour-controller.ts` | 漫游控制器（绑定引擎与 UI） | 47,356 B | 1,039 |

#### 布局子系统 `src/ui/layout/`

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `src/ui/layout/layout-engine.ts` | 布局运行器 + 参数类型还原 | 4,414 B | 114 |
| `src/ui/layout/layout-engine-reexport.ts` | 布局引擎再导出 | 483 B | 9 |
| `src/ui/layout/layout-params.ts` | 布局参数面板逻辑 | 10,324 B | 253 |
| `src/ui/layout/layout-params-template.ts` | 参数模板 | 5,892 B | 129 |
| `src/ui/layout/layout-store.ts` | 布局参数持久化 | 2,698 B | 82 |
| `src/ui/layout/layout-switcher.ts` | 布局切换器 | 3,256 B | 88 |
| `src/ui/layout/toolbar-actions.ts` | 工具栏动作（fit / randomize） | 1,690 B | 44 |

#### 图例与统计

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `src/ui/legend-factory.ts` | 图例生成 | 8,642 B | 208 |
| `src/ui/legend-manager.ts` | 图例管理 | 11,032 B | 259 |
| `src/ui/layout-manager.ts` | 布局管理 | 1,324 B | 41 |
| `src/ui/layout-menu.ts` | 布局菜单 | 408 B | 11 |
| `src/ui/stats/stat-cards.ts` | 统计卡片 | 2,541 B | 62 |
| `src/ui/stats/stat-animation.ts` | 统计动画 | 1,640 B | 59 |
| `src/ui/stats/perf-monitor.ts` | 性能监控（UI 侧） | 5,117 B | 166 |

#### 样式 `src/ui/styles/`

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `src/ui/styles/base.css` | 基础样式 | 14,065 B | 304 |
| `src/ui/styles/components.css` | 组件样式（最大） | 85,996 B | 1,396 |
| `src/ui/styles/glass.css` | 液态玻璃皮肤（@layer glass） | 29,962 B | 608 |
| `src/ui/styles/index.css` | 样式入口 | 594 B | 13 |
| `src/ui/styles/layout.css` | 布局样式 | 18,032 B | 352 |
| `src/ui/styles/shared.css` | 共享工具类 | 9,330 B | 221 |
| `src/ui/styles/sidebar/sidebar-params.css` | 侧栏参数样式 | 2,738 B | 28 |
| `src/ui/styles/sidebar/sidebar-stats.css` | 侧栏统计样式 | 2,544 B | 30 |
| `src/ui/styles/tour.css` | 漫游 UI 样式 | 35,199 B | 636 |

#### 测试文件

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `src/ui/__tests__/bigscreen.test.ts` | 测试 | 6,229 B | 160 |
| `src/ui/action-dispatcher.test.ts` | 测试 | 6,688 B | 214 |
| `src/ui/app-debug.test.ts` | 测试 | 12,883 B | 333 |
| `src/ui/bigscreen-sidebar-roundtrip.test.ts` | 测试 | 8,804 B | 237 |
| `src/ui/bottom-sheet-easing.test.ts` | 测试 | 3,702 B | 88 |
| `src/ui/detail-panel-questions.test.ts` | 测试 | 3,342 B | 89 |
| `src/ui/focus-node.test.ts` | 测试 | 2,948 B | 76 |
| `src/ui/graph-events-helpers.test.ts` | 测试 | 4,370 B | 102 |
| `src/ui/graph-events.test.ts` | 测试 | 7,252 B | 200 |
| `src/ui/layout-manager.test.ts` | 测试 | 6,079 B | 164 |
| `src/ui/layout-menu.test.ts` | 测试 | 5,511 B | 168 |
| `src/ui/legend-factory.test.ts` | 测试 | 8,240 B | 208 |
| `src/ui/legend-manager.test.ts` | 测试 | 6,160 B | 165 |
| `src/ui/logger.test.ts` | 测试 | 978 B | 29 |
| `src/ui/mobile-accordion.test.ts` | 测试 | 5,629 B | 136 |
| `src/ui/search-ui.test.ts` | 测试 | 5,450 B | 141 |
| `src/ui/search.test.ts` | 测试 | 4,724 B | 131 |
| `src/ui/sidebar-transition.test.ts` | 测试 | 8,601 B | 202 |
| `src/ui/state.test.ts` | 测试 | 4,517 B | 110 |
| `src/ui/tour-controller.test.ts` | 测试 | 14,228 B | 397 |
| `src/ui/ui-toggle.test.ts` | 测试 | 7,065 B | 184 |

### 3.6 `src/` 文件数 / 行数小计

| 路径 | 文件数 | 行数 | 字节 |
|---|---:|---:|---:|
| `src/parser/` | 5 | 823 | 28,848 |
| `src/core/` | 23 | 7,575 | 307,046 |
| `src/data/` | 1 | 575 | 31,828 |
| `src/types/` | 1 | 14 | 270 |
| `src/ui/` | 71 | 15,746 | 677,940 |
| **合计** | **101** | **24,733** | **1,045,932** |

## 4. 构建与工具脚本

目录重组后，`scripts/` 只保留活跃的构建 / 治理入口，构建期共享库移到 `build/`，一次性修复 / 迁移工具移到 `tools/`。

### 4.1 `scripts/` — 构建与治理入口（10 个文件，2,329 行，约 77 KB）

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `scripts/audit-frontmatter.ts` | 打分审计（永远 exit 0，输出报告） | 23,624 B | 598 |
| `scripts/build-content-manifest.ts` | 生成 content-manifest.json（入口） | 344 B | 13 |
| `scripts/build-graph-data.ts` | 生成 graph-data.json（入口） | 342 B | 13 |
| `scripts/check-graph-fresh.ts` | 检查图数据是否新鲜 | 3,167 B | 94 |
| `scripts/dev.sh` | 开发启动脚本 | 253 B | 14 |
| `scripts/measure-overlap.ts` | 重叠度测量 | 24,815 B | 911 |
| `scripts/serve.ts` | 本地静态服务器 | 2,578 B | 70 |
| `scripts/validate-graph-data.ts` | 校验 graph-data.json | 12,276 B | 309 |
| `scripts/validate-graph-deep.ts` | 深度校验 | 4,482 B | 141 |
| `scripts/validate.ts` | 严格 schema 校验（CI 门禁，非零退出） | 5,228 B | 166 |

### 4.2 `build/` — 构建期共享库（1 个文件，581 行，约 21 KB）

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `build/build-content.ts` | 内容构建核心：frontmatter 解析 → graph-data.json / content-manifest / sitemap（被 vite.config 与 scripts 入口共享） | 21,060 B | 581 |

### 4.3 `tools/` — 一次性修复 / 迁移工具（7 个文件，1,633 行，约 62 KB）

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `tools/audit-and-fix-ids.ts` | 审计并修复 id | 9,211 B | 275 |
| `tools/fix-frontmatter.py` | frontmatter 修复 | 5,893 B | 178 |
| `tools/fix-section-fields.py` | section 字段修复 | 6,358 B | 183 |
| `tools/fix-y1-chapters.py` | 药一章节修复 | 5,700 B | 160 |
| `tools/fix-yaml-anchors.cjs` | YAML anchor 修复 | 7,300 B | 190 |
| `tools/migrate-essence-to-fill.js` | essence → fill 迁移 | 8,746 B | 259 |
| `tools/migrate-ids-to-rules.ts` | id → rules 迁移 | 19,170 B | 388 |

> 迁移说明：`build-content.ts` 原在 `scripts/`，因被 vite.config.ts 与多个 scripts 入口 import，属共享库，移至 `build/`。6 个一次性修复 / 迁移工具（fix-*、migrate-*、audit-and-fix-ids）不参与构建链，移至 `tools/`。

## 5. `docs/` — 文档（42 个文件，35,676 行，约 3.94 MB）

### 5.1 架构与规范

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `docs/DEVELOP.md` | 开发文档（数据模型、关系类型、目录设计） | 16,202 B | 392 |
| `docs/CODE-WIKI.md` | 代码维基（全文件级说明；2026-08 后未刷新，部分行级说明可能漂移 → 待 refresh） | 37,131 B | 649 |
| `docs/RULES.md` | 规则汇总 | 14,828 B | 223 |
| `docs/SKILL.md` | 技能 / 工作流说明 | 37,981 B | 798 |
| `docs/frontmatter.md` | frontmatter 模板与规范 | 17,439 B | 404 |
| `docs/frontmatter-audit.md` | 审计报告（生成物，由 `npm run audit` 生成；勿手改） | 254,750 B | 1,720 |
| `docs/Cytoscape.md` | Cytoscape.js v3 通用速查（不绑定项目） | 9,657 B | 376 |

### 5.2 决策记录 `docs/ADR/`

> 所有决策记录均采用 ADR- 前缀（Architecture Decision Record）。目录命名统一为 `ADR/`。

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `docs/ADR/ADR-0001-层级关系统一使用isa方向.md` | 层级关系统一 isa（子→父） | 10,810 B | 254 |
| `docs/ADR/ADR-0002-节点美化方案选型.md` | 节点美化选型 | 12,304 B | 294 |
| `docs/ADR/ADR-0003-tour-universe-isolation.md` | 漫游体系隔离 | 7,063 B | 166 |
| `docs/ADR/ADR-0004-图数据从运行期解析迁移到构建期预生成.md` | 预生成图数据 | 8,912 B | 161 |
| `docs/ADR/ADR-0005-tour-depth-levels.md` | 漫游 5 档深度过滤 | 3,120 B | 98 |
| `docs/ADR/ADR-0006-applyRootScope-子树漫游算法重写.md` | 子树漫游算法重写 + 档位自动升级 | 16,507 B | 373 |
| `docs/ADR/migration-report-ADR-0001-APPLY.md` | ADR-0001 迁移执行报告（217 文件 / 167 isa 转换 / 2026-07-14） | 90,810 B | 1,251 |

### 5.3 调试记录 `docs/DEBUG/`

> **仅保留活跃 / 未确认修复的问题**。已修复的全部归档到 `docs/archive/debug/`（见 §5.4）。

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `docs/DEBUG/debug-bigscreen-sidebar-offscreen.md` | 大屏侧栏出屏（**未验证修复，保留跟踪**） | 8,223 B | 156 |

### 5.3a 调试归档 `docs/archive/debug/`

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `docs/archive/debug/debug-bigscreen-exit-tour-viewport.md` | 大屏退出漫游视口（已修复 2026-09-22，cy.stop + capture） | 4,164 B | 113 |
| `docs/archive/debug/debug-index.md` | 2026 年度修复问题索引 | 15,802 B | 427 |
| `docs/archive/debug/debug-initial-zoom-euler-fit.md` | 初始缩放被 Euler fit 覆盖（已修复，commit a1b2c3d） | 2,204 B | 76 |
| `docs/archive/debug/debug-log-2026-09-20.md` | 2026-09-20 单日调试日志（一次性） | 10,458 B | 97 |
| `docs/archive/debug/debug-sidebar-issues.md` | 侧栏问题（已修复） | 15,677 B | 339 |
| `docs/archive/debug/debug-tour-depth-slider-restart.md` | 深度滑块重启（已修复） | 5,659 B | 180 |
| `docs/archive/debug/debug-tour-depth1-universe-isolation.md` | 深度 1 体系隔离（已修复） | 5,328 B | 121 |
| `docs/archive/debug/debug-tour-mob-slider-rendering.md` | 移动端滑块渲染（已修复） | 11,428 B | 269 |
| `docs/archive/debug/debug-tour-node-duplicate.md` | 漫游节点重复（已修复） | 6,405 B | 165 |
| `docs/archive/debug/debug-tour-stack-overflow-cycle.md` | 漫游栈溢出循环（已修复，运行时护栏 + 测试夹具） | 8,399 B | 218 |

### 5.4 归档 `docs/archive/`

| 路径 | 职责 | 大小 | 行数 |
|---|---|---:|---:|
| `docs/archive/OLD_RULES.md` | 旧规则 | 66,247 B | 1,237 |
| `docs/archive/OLD_SKILL.md` | 旧技能说明 | 11,898 B | 176 |
| `docs/archive/OLD_frontmatter.md` | 旧 frontmatter 规范 | 28,308 B | 952 |
| `docs/archive/REFACTOR-RULES.md` | 重构规则 | 14,507 B | 273 |
| `docs/archive/SPLIT-RULES.md` | 拆分规则 | 17,345 B | 302 |
| `docs/archive/all-frontmatter-extracted.md` | 全库 frontmatter 聚合（最大单文件） | 630,671 B | 13,765 |
| `docs/archive/content v1.0.zip` | 内容 v1.0 打包（2.1 MB，二进制不计行） | 2,136,627 B | 4,823 |
| `docs/archive/debug/` | **调试归档目录**（10 个已修复调试记录，见 §5.3a） | ≈ 82,964 B | ≈ 1,985 |
| `docs/archive/frontmatter-audit.md` | 归档审计 | 194,557 B | 1,130 |
| `docs/archive/old-frontmatter-audit.md` | 旧审计报告 | 2,451 B | 79 |
| `docs/archive/old-frontmatter.md` | 旧 frontmatter 规范（早期版本） | 37,844 B | 675 |
| `docs/archive/新版规则全文档重构计划.md` | 重构计划 | 155,584 B | 665 |
| `docs/archive/施工单-布局设置重构-2026.md` | 布局设置重构施工单（已实施） | 7,153 B | 190 |
| `docs/archive/问题清单.md` | 问题清单 | 5,009 B | 62 |

## 6. 测试汇总

| 路径 | 文件数 | 大小合计 | 行数合计 |
|---|---:|---:|---:|
| `src/core/__tests__/` | 2 | 13,655 B | 303 |
| `src/core/*.test.ts` | 4 | 38,683 B | 997 |
| `src/parser/*.test.ts` | 2 | 10,638 B | 346 |
| `src/ui/__tests__/` | 1 | 6,229 B | 160 |
| `src/ui/*.test.ts`（散落） | 19 | 113,555 B | 3,006 |
| **合计** | **28** | **182,760 B** | **4,812** |

## 7. `public/` — 静态资产与内容（1,068 文件，52,455 行，约 7.75 MB）

| 路径 | 内容 | 大小 |
|---|---|---:|
| `public/content/**/*.md` | 知识节点 Markdown（1,041 个文件，24,645 行） | 约 4.9 MB |
| `public/graph-data.json` | 构建期预生成整图数据（单行 JSON） | 1,270,189 B |
| `public/content-manifest.json` | 节点索引 | 119,983 B |
| `public/sitemap.xml` | SEO 站点地图（构建生成） | 469,594 B |
| `public/audio/Echoes of the Eye - Travelers Encore.mp3` | 背景音乐 | 3.1 MB |
| `public/images/药一二综目录.png` | 目录图 | 1.4 MB |
| `public/images/药学知识拓扑.png` | 拓扑图 | 271 KB |
| `public/diagnose.js` | 诊断脚本 | 1,572 B |
| `public/full-diagnose.js` | 完整诊断脚本 | 1,559 B |
| `public/favicon.svg` | 图标 | 1,082 B |
| `public/robots.txt` | 爬虫协议 | 525 B |

`public/content/` 按学科分目录：`药学专业知识一`、`药学专业知识二`、`药学综合知识与技能`、`个人成长与生存策略`（辅助体系）。节点目录结构：`{科目}/{章}/{节}/{考点}.md`。

---

## 8. 其他目录

| 路径 | 内容 |
|---|---|
| `dist/` | Vite 构建产物（`index.html` + assets + 复制的内容），CI 生成 |
| `examples/cytoscape-example.html` | 独立演示页（51 KB / 1,348 行） |
| `archive/pharma_v3.html` | 旧版 HTML 入口 |
| `archive/vercel.json` | 旧版部署配置 |
| `archive/scripts/` | 5 个一次性迁移脚本（112 KB） |
| `.vscode/settings.json` | 编辑器设置 |
| `.cursor/rules/frontmatter-conventions.mdc` | Cursor 规则：frontmatter YAML 写作规范 |

---

## 9. 全项目汇总表

| 区域 | 文件数 | 行数 | 字节 |
|---|---:|---:|---:|
| `src/`（源码） | 101 | 24,733 | 1,045,932 |
| `scripts/` | 10 | 2,329 | 77,109 |
| `build/` | 1 | 581 | 21,060 |
| `tools/` | 7 | 1,633 | 62,378 |
| `docs/`（含 archive 子目录，不含 zip） | 38 | 29,560 | ≈ 1,995,000 |
| `docs/archive/` 内的二进制（content v1.0.zip） | 1 | — | 2,136,627 |
| `public/`（含 content） | 1,068 | 52,455 | 7,749,108 |
| `examples/` | 1 | 1,348 | 51,187 |
| `archive/`（根目录一次性归档：HTML 1 + vercel.json + scripts/ 5 个 ts） | 7 | 2,014 | ≈ 53,000 |
| **小计（非二进制）** | **≈ 1,234** | **≈ 114,634** | **≈ 11,070,000** |
| 根配置文件（package*.json、tsconfig、vite、eslint、prettier、vercel、env、editorconfig 等） | 13 | 10,329 | 398,214 |
| 二进制 / 大文件（graph-data.json 1.27MB、音频 3.1MB、PNG 1.7MB、zip 2.1MB） | 5 | — | 约 8.2 MB |
| **总计** | **约 1,252** | **约 124,963** | **约 21.7 MB** |

> 说明：
> - 行数为 `wc -l` 等价统计（换行符 \n 计数），字节为文件字节数（含换行）。
> - `docs/archive/content v1.0.zip` 为二进制，不计行。
> - 汇总不含 `dist/`（CI 生成）。
> - 决策记录（ADR）全部位于 `docs/ADR/` 单一目录下。

---

## 10. 维护提示

1. **新增 / 删除文件**：更新对应目录的表格，保持"路径 ↔ 职责 ↔ 大小 / 行数"一致。
2. **大文件预警**：`components.css`（86KB）、`tour.ts`（74KB）、`renderer.ts`（46KB）、`tour-controller.ts`（47KB）接近拆分阈值；`docs/archive/all-frontmatter-extracted.md`（630KB）为生成物，勿手改。
3. **决策记录位置**：新决策统一写 `docs/ADR/` 目录下，文件前缀 `ADR-000N-` 续号，并在此登记。
4. **重建本表**：可用 `find src scripts docs -type f -exec stat -f%z {} +` 配合 `wc -l` 重新统计（macOS 语法）。
