# 药学家族关系星图 · pharma-graph

> 基于执业药师考试大纲构建的交互式药学知识图谱：药一 · 药二 · 药综三大科目的知识节点可视化呈现，支持关系推理、漫游学习与多种布局。

[![线上地址](https://img.shields.io/badge/线上地址-pharma.ac.cn-6366f1?style=for-the-badge&logo=firefoxbrowser&logoColor=white)](https://www.pharma.ac.cn/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Cytoscape.js](https://img.shields.io/badge/Cytoscape.js-3.34-06b6d4?style=for-the-badge)](https://js.cytoscape.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Vitest-2.x-8B5CF6?style=for-the-badge)](https://vitest.dev/)

---

## ✨ 项目简介

项目把执业药师考试三大核心科目（药学专业知识一、药学专业知识二、药学综合知识与技能）的全部知识点拆解为节点，通过**属种关系（subclass_of）**、**包含关系（part_of）**、**实例关系（instance_of）**、**互斥关系（disjoint_with）**、**等价关系（equivalent_to）**等关联类型连接成一张可交互的拓扑网络。每个节点对应一份独立 Markdown 文档，包含定义、分类、用法、不良反应等完整内容；点击节点即可在详情面板查看正文、跳转关联节点，或启动漫游模式自动学习。

> **结构约定**：`location` 字段承载教材位置（书→章→节→目），不参与图形编码；节点形状 + 填充色表达语义层（module / strict-class / umbrella-class / concept / medication / illness / notion / mnemonic / summary），边类型表达关系层，二者正交。

---

## 🎯 核心功能

### 探索与交互
- **搜索**：顶栏与移动端双入口，实时模糊匹配 1100+ 节点
- **选中详情**：点击高亮关联节点并弹出详情面板（概述 / 正文双页）
- **右键删除**：临时隐藏节点，聚焦剩余子图
- **双击锁定**：固定节点位置，防止布局调整时位移
- **邻居牵引**：拖动节点时，1 跳邻居会短暂跟随（最多 24 个，防止根节点拖动画喧宾夺主），松手后停在原位不归位——用最小的逐帧开销换取“图是活的”的触感

### 🚶 漫游学习
点击工具栏「漫游」按钮，引擎按选定策略自动遍历图谱，适合初次复习整本书或查漏补缺：

- **两种策略**：教材顺序（深度优先，按书→章→节→分类→药→口诀） · 层级依赖（拓扑序，先修前置再访节点，一次跑完）
- **间隔可调**：1s – 10s 连续滑块（步进 500ms，默认 3s）
- **深度档位**：5 档（结构 → 概览 → 复习重点药 → 口诀 → 全面），无限模式循环直到用户停止
- **手动步进**：暂停后可用上一个 / 下一个按钮或 `[` `]` 键翻页
- **朗读**：可选开启每步语音播报节点名

### 🗺️ 多布局
布局切换器一键变换图谱形态，每种布局提供细粒度参数面板（引力、斥力、理想边长、迭代次数等），支持恢复默认与持久化：

| 布局 | 适用场景 |
|---|---|
| Euler（默认） | 力导向，全局优化边交叉与边长，日常首选 |
| COSE | 复合结构聚类，适合查看章节脉络 |
| 同心圆 | 中心发散，适合依赖观察 |
| 环形 | 环上均匀分布，适合顺序浏览 |
| 网格 | 规整排列，适合定位同形状编码节点 |
| Dagre | 有向无环层级，适合读前置依赖链 |
| 广度优先 | 从选中节点 BFS 展开，适合围绕核心做辐射学习 |

### 🎬 大屏模式
隐藏全部 UI 元素、图谱铺满全屏，适合课堂演示与投屏讲解。按 `Esc` 或双击画布退出。

### 🌌 加载与背景
- **星图宇宙大爆炸**：数据流式加载完成后，力学布局从奇点爆散、在引力斥力中自然排列成知识拓扑，右上角统计胶囊实时同步进度
- **四层背景**：噪点（SVG feTurbulence 平铺）→ 星云光晕（radial-gradient 慢漂移）→ 三层视差星点（canvas 取模无限平铺）→ 图谱本身，全部 `pointer-events: none`

### 🪟 液态玻璃皮肤
顶栏 / 工具栏 / 侧栏 / 详情面板 / 底部面板统一一套 Liquid Glass 材质（`backdrop-filter` 模糊 + 半透明染色 + 左上亮→右下回亮的高光边），三档模糊区分面板层级。规则全部收在 `src/ui/styles/glass.css` 的 `@layer glass`，作为 `index.css` 最后一条 import；删掉该 import 即回退原样式。

### 🎵 背景音乐
内置《Echoes of the Eye · Travelers Encore》，工具栏「音乐」按钮控制播放。

### 📱 多端适配
- **桌面端**：顶栏（品牌词轮播 + 搜索）+ 工具栏（布局 / 适应 / 随机 / 重置 / 脉冲 / 漫游 / 音乐 / 大屏）+ 右侧侧栏（图例 / 图谱状态 / 布局设置 / 快捷键）+ 左侧节点详情面板
- **移动端**：顶栏搜索 + 底部可拖拽抽屉（节点本质 / 关联关系 / 图谱信息 / 快捷操作 / 布局设置），布局参数与切换收在「高级设置 → 布局设置」

### ⌨️ 快捷键

| 操作 | 按键 |
|---|---|
| 全选节点 | `Ctrl/Cmd + A` |
| 删除选中 | `Delete` / `Backspace`（需再次确认） |
| 适应画布 | `F` |
| 随机分布 | `R` |
| 漫游开关 | `T` |
| 暂停 / 继续 | `P` |
| 上一个 / 下一个 | `[` / `]` |
| 退出大屏 / 清除选中 | `Esc` |

> 注：Delete 为两段式确认——按下后 1.5s 内再次按同一键才真正删除，防止误触。

---

## 📚 覆盖学科

- **药学专业知识一**：药剂学（药物与药品质量体系 · 口服 / 注射 / 皮肤黏膜给药制剂）· 药理与毒理学（药物对机体的作用 · 毒性与安全）· 药物化学（结构作用 · 代谢 · 抗肿瘤 · 抗感染）· 药动学（吸收分布代谢排泄）· 生命药学
- **药学专业知识二**：神经与精神用药（镇静催眠 · 抗癫痫 · 抗抑郁 · 镇痛 · 抗帕金森 · 抗精神病）· 解热镇痛抗炎与抗风湿 · 呼吸 / 消化 / 心血管 / 泌尿 / 内分泌 / 血液系统用药 · 抗肿瘤与抗感染 · 痛风骨病等
- **药学综合知识与技能**：药学服务与药师职责 · 处方审核与调剂 · 用药安全与不良反应监测 · 常见病症健康管理 · 慢病长期用药管理 · 特殊人群用药

---

## 🛠️ 技术栈

| 层级 | 选型 | 说明 |
|---|---|---|
| 构建 | Vite 8 + plugin-legacy | 自定义插件构建期生成 graph-data.json / content-manifest / sitemap；legacy 仅为旧浏览器出 ES5 分包 |
| 类型 | TypeScript 5.5（strict） | 核心数据结构全量类型覆盖 |
| 图谱 | Cytoscape.js 3.34（canvas） | 1100+ 节点流畅渲染；glow / flow 动效画在独立覆盖层 canvas，不参与 cytoscape 重绘管线 |
| 布局 | euler · cose-bilkent · dagre 等 | 7 种布局引擎组合 |
| 数据 | 构建期预生成 graph-data.json | 浏览器只 fetch 一个约 1.2MB 的 JSON（ADR-0004），并保留流式 .md 路径作 fallback |
| 内容 | marked + yaml + DOMPurify | Markdown frontmatter 解析 + XSS 清理（详情正文渲染路径） |
| 样式 | 原生 CSS `@layer` | 13 层，`glass.css` 最后引入，隐藏态工具类不进层保证优先级 |
| 测试 | Vitest 2 + jsdom | 30 个测试文件 / 315 用例，UI 模块与源码同目录（`*.test.ts`） |
| 质量 | ESLint 9 + Prettier 3 | @typescript-eslint + eslint-plugin-prettier |

---

## 📁 项目结构

```
pharma-graph/
├── public/
│   ├── content/            # 全部知识节点 Markdown（数据源，按学科/章节分目录）
│   ├── audio/ images/      # BGM 与静态资源
│   ├── graph-data.json     # 构建期预生成的整图数据（提交入库，保证协作一致）
│   ├── sitemap.xml         # 构建时生成，1100+ URL（不提交）
│   └── content-manifest.json  # 构建时生成的节点索引（不提交）
├── src/
│   ├── core/               # 图谱核心（不含 UI）：config（视觉单一来源）/ renderer /
│   │                       #   tour（漫游引擎）/ glow-overlay / build-graph / graph-manager /
│   │                       #   prebuilt-loader / force-drag / device-capability 等
│   ├── parser/             # frontmatter / schema：Markdown 解析与校验
│   ├── data/               # 领域词表（vocabulary）
│   ├── types/              # 第三方类型补丁
│   └── ui/                 # 所有 UI 行为（测试与源码同目录）
│       ├── main.ts         # 入口与初始化编排
│       ├── tour-controller.ts / detail-panel.ts / bigscreen.ts / search-ui.ts /
│       │   graph-events.ts / highlight-engine.ts / neighbor-tug.ts / starfield.ts 等
│       ├── layout/ stats/  # 布局状态与参数 / 状态卡与 FPS·内存采样
│       └── styles/         # index.css（@layer 声明 + 全部 import，glass 最后）/
│                           #   base / layout / components / glass / tour / sidebar/
├── docs/                   # 开发文档（frontmatter / SKILL / RULES / ADR / DEBUG 等）
├── ADR/                    # 架构决策（docs/ADR/ 的同级目录别名；正式目录是 docs/ADR/）
├── archive/                # 历史版本快照
├── scripts/                # 构建与校验脚本（build-graph-data / validate / audit 等）
├── index.html              # 单页入口 + SEO（JSON-LD / noscript / 爬虫可见数据）
├── vite.config.ts / vitest.config.ts
├── eslint.config.js / .prettierrc.json
└── package.json
```

---

## 🚀 快速开始

### 环境
Node.js ≥ 20，npm ≥ 10

```bash
npm install        # 安装依赖
npm run dev        # 开发服务器 → http://localhost:5173
npm run build      # 生产构建（prebuild 自动重生成 graph-data.json + manifest + 校验）
npm run preview    # 本地预览构建产物
```

### 常用命令

| 命令 | 作用 |
|---|---|
| `npm run validate` | 校验全部 1100+ 份 Markdown frontmatter |
| `npm run audit` | 审计重复 ID / 缺失字段 |
| `npm run measure-overlap` | 计算三科目知识点重叠度 |
| `npm run check:graph` | 检查预生成的 graph-data.json 是否过期 |
| `npm run lint` / `lint:fix` | ESLint 检查 / 自动修复 |
| `npm test` | 运行全部测试（315 用例） |
| `npm run build:graph` / `build:manifest` | 单独重生成图数据 / 节点索引 |

---

## 📝 节点写作规范

每个知识节点是一个独立 Markdown 文件，位于 `public/content/` 对应学科目录下，头部 YAML frontmatter 示例：

```yaml
---
id: morphine                        # 全局唯一（英文 kebab-case）
label: 吗啡                          # 显示名称
essence: medication                 # module | strict-class | umbrella-class | concept | medication | illness | notion | mnemonic | summary
edges_out:                          # 对外关联（出边）
  - target: opioid-receptor
    type: instance_of               # 实例→类别
  - target: central-analgesics-chapter
    type: subclass_of               # 子类→父类
---
```

> 注意：内容文件名须避免半角逗号；`id` 必须存在且全局唯一。完整字段与取值见 [docs/frontmatter.md](docs/frontmatter.md) 和 [docs/SKILL.md](docs/SKILL.md)。

---

## 🔍 SEO 与爬虫友好

构建时做了多层优化，搜索引擎与 AI 抓取工具无需执行 JS 即可读到完整图谱：

- **JSON-LD 结构化数据**：WebSite（含站内搜索框）· EducationalOrganization · LearningResource · BreadcrumbList 四类实体
- **`<noscript>` 纯文本**：三大科目说明 · 60+ 核心药名标签 · 平台特色
- **内联 JSON 数据**：构建时将全部节点与边注入 HTML，爬虫直接可读
- **sitemap.xml**：首页 + 1100+ 内容页，按路径深度分级 priority
- **robots.txt**：允许主流爬虫并声明 Sitemap 绝对 URL
- **OG / Twitter Card**：summary_large_image 分享卡片

---

## 📄 更多文档

| 文档 | 说明 |
|---|---|
| [docs/frontmatter.md](docs/frontmatter.md) | Markdown frontmatter 字段详解 |
| [docs/SKILL.md](docs/SKILL.md) | 节点转录工作流、字段制作规范与质量检查清单 |
| [docs/RULES.md](docs/RULES.md) | 药学领域特化参数（fill / stroke 取值与映射） |
| [docs/DEVELOP.md](docs/DEVELOP.md) | 开发模式与调试技巧 |
| [docs/CODE-WIKI.md](docs/CODE-WIKI.md) | 代码结构速查 |
| [docs/Cytoscape.md](docs/Cytoscape.md) | Cytoscape.js 用法与踩坑记录 |
| [docs/布局参数清单.md](docs/布局参数清单.md) | 7 种布局的可调参数与默认值 |
| [docs/ADR/](docs/ADR/) | 架构决策记录（ADR-0001 ~ 0006） |
| [docs/DEBUG/](docs/DEBUG/) | 问题排查记录（仅活跃问题；已修复归档到 `docs/archive/debug/`） |
| [docs/archive/施工单-布局设置重构-2026.md](docs/archive/施工单-布局设置重构-2026.md) | 布局设置重构的施工单（已实施，归档） |

---

## 📜 致谢

- 图谱引擎：[Cytoscape.js](https://js.cytoscape.org/) 及其布局扩展作者
- 封面 BGM：*Echoes of the Eye* · Travelers Encore
- 品牌图腾：六角苯环 + Kekulé 式双键

---

<div align="center">

苯环六角图腾 · 信息熵 · **by meow**

</div>
