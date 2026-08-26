# 药学家族关系星图 · pharma-graph

> **基于执业药师考试大纲构建的交互式药学知识图谱学习平台**
>
> 药一 · 药二 · 药综 三大科目知识节点可视化呈现，关系推理、漫游学习、多种布局，系统化梳理药物脉络。

[![部署状态](https://img.shields.io/badge/线上地址-pharma.ac.cn-6366f1?style=for-the-badge&logo=firefoxbrowser&logoColor=white)](https://www.pharma.ac.cn/)
[![构建工具](https://img.shields.io/badge/Vite-8.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![图谱引擎](https://img.shields.io/badge/Cytoscape.js-3.34-06b6d4?style=for-the-badge)](https://js.cytoscape.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![测试](https://img.shields.io/badge/Vitest-2.x-8B5CF6?style=for-the-badge)](https://vitest.dev/)
[![License](https://img.shields.io/badge/开源项目-FREE-E11D48?style=for-the-badge)](#)

---

## ✨ 项目简介

**药学家族关系星图**（pharma-graph）是一个面向执业药师考生、药学专业学生与医药行业从业者的开放知识图谱可视化项目。它把执业药师考试三大核心科目（药学专业知识一、药学专业知识二、药学综合知识与技能）的全部知识点拆解为**节点**，并通过**属种关系**、**治疗关系**、**前置依赖**、**机制作用**、**包含关系**等多种关联类型连接成一个可交互的拓扑网络。

每一个节点都是一份独立的 Markdown 文档，包含知识定义、分类、用法、不良反应等完整内容。点击任意节点，即可在详情面板中查阅正文、跳转到关联节点、或启动漫游模式按依赖顺序自动学习。

<details><summary>📊 图谱结构一览</summary>

| 维度 | 说明 |
|---|---|
| **节点本质（形状）** | 药物 · 模块 · 章节 · 概念 · 疾病 · 过程 |
| **学科领域（边框色）** | 药理学 · 药学服务 · 药剂学 · 药物化学 · 生物药剂学 · 药动学 · 毒理学 |
| **知识层级（填充色）** | 基础 → 服务 → 管理 → 临床 → 进阶 |
| **关联关系（边类型）** | 属种 (isa) · 包含 (has) · 前置 (prerequisite) · 治疗 (treats) · 相关 (relates) · 机制 (mechanism) · 兄弟 (sibling) · 特化 (specializes) · 致因 (causes) · 禁忌 (contraindicates) · 代谢 (metabolizes) |

</details>

---

## 🎯 核心功能

### 🔍 交互探索
- **节点搜索**：顶栏与移动端面板双入口，实时模糊匹配 1100+ 节点
- **点击选中**：高亮关联节点并弹出详情面板（概述 / 正文标签页切换）
- **右键删除**：临时隐藏节点，聚焦剩余子图
- **双击锁定**：固定节点位置，防止布局调整时位移
- **Pin 固定**：详情面板可钉在画布任意位置，支持拖拽缩放

### 🗺️ 多种布局算法
通过布局切换器一键变换图谱形态，找到最适合当前学习场景的结构视图：

| 布局 | 适用场景 |
|---|---|
| **Euler（默认）** | 力学力导向布局，全局优化边交叉与边长度，日常学习首选 |
| **COSE** | 复合结构图，自动检测聚类并组织子群，适合查看章节脉络 |
| **同心圆** | 中心发散式，中心节点向外辐射层级，适合依赖观察 |
| **环形** | 环上均匀分布，适合按顺序浏览药物类别 |
| **网格** | 规整网格排列，适合快速定位形状编码相同的一批节点 |
| **Dagre** | 有向无环图，从上到下层级布局，适合前置依赖链阅读 |
| **广度优先** | 从选中节点 BFS 展开，适合围绕核心药物做辐射学习 |

每种布局均提供细粒度参数调整面板（引力、斥力、理想边长、迭代次数等），一键恢复库默认值或应用自定义参数。

### 🚶 漫游学习
点击工具栏「漫游」按钮，系统按选定策略依次访问节点，像看教学动画一样自动遍历图谱：

- **策略选择**：教材顺序（按药学专业知识目录层级） · 深度优先 · 广度优先 · 随机 · 拓扑序（先修前置再访节点）
- **间隔可调**：2s / 3s / 5s / 10s / 30s / 60s 预设 + 自定义滑块
- **最大深度**：限制遍历层数，避免一次漫游覆盖全部节点
- **手动翻页**：暂停后可使用上一个 / 下一个按钮手动步进
- **状态条**：画布底部实时显示当前节点 / 总数 / 深度 / 进度

### 🎬 大屏影院模式
隐藏全部 UI 元素，图谱铺满全屏——适合课堂演示、投屏讲解、或沉浸式学习。按 ESC 或双击画布即可退出。

### 🎵 背景音乐
内置一首「*Echoes of the Eye* · Travelers Encore」环境音乐，点击工具栏「音乐」按钮即可播放或暂停，为长时间学习提供舒适氛围。

### 📱 多端适配
| 终端 | UI 结构 |
|---|---|
| **桌面端** | 左侧悬浮节点详情 + 右侧侧栏（图例 / 图谱统计 / 布局参数 / 快捷键） + 顶栏搜索 |
| **移动端** | 底部可拖拽抽屉面板（图例 / 统计 / 布局 / 漫游参数） + 顶栏居中搜索框 + 展开手柄 |

侧栏各分区均支持折叠 / 展开，所有图例类型（形状 / 边框 / 填充 / 边）均为动态生成，随节点数量实时更新统计。

### ⌨️ 快捷键

| 操作 | 按键 |
|---|---|
| 选中节点 | `点击` |
| 删除节点 | `右键` |
| 锁定节点 | `双击` |
| 适应画布 | `F` |
| 随机分布 | `R` |
| 删除选中 | `Del` |
| 重置视图 | `Esc` |
| 全选节点 | `Ctrl + A` |

---

## 📚 覆盖学科

### 药学专业知识一
- **第一篇 药剂学**：药物与药品质量体系 · 口服制剂 · 注射剂 · 皮肤和黏膜给药制剂
- **第二篇 药理与毒理学**：药物对机体的作用 · 药物毒性与用药安全
- **第三篇 药物化学**：药物的结构与作用 · 药物代谢 · 抗肿瘤药物 · 抗感染药物
- **第四篇 药动学**：药物的体内过程（吸收、分布、代谢、排泄）
- **第五篇 生命药学**：人体代谢 · 感染与免疫 · 病理生理

### 药学专业知识二
- 精神与中枢神经系统用药（镇静催眠 · 抗癫痫 · 抗抑郁 · 镇痛 · 抗帕金森 · 抗精神病）
- 解热镇痛抗炎药与抗风湿药
- 呼吸系统用药、消化系统用药
- 心血管系统用药、泌尿系统用药
- 内分泌系统用药、血液系统用药
- 抗肿瘤药物、抗感染药物
- 男性泌尿/前列腺/膀胱疾病用药
- 痛风、抗风湿、骨疾病用药

### 药学综合知识与技能
- 药学服务与执业药师职责
- 处方审核与处方调剂
- 用药安全与不良反应监测
- 常见病症健康管理
- 慢性疾病长期用药管理
- 特殊人群用药（妊娠、哺乳、老年、肝肾功能不全）

---

## 🛠️ 技术栈

| 层级 | 选型 | 说明 |
|---|---|---|
| **构建工具** | Vite 8 | 极速 HMR，自带 content-manifest / sitemap 自定义插件 |
| **类型系统** | TypeScript 5.5 | 严格模式，完整类型覆盖核心数据结构 |
| **图谱引擎** | Cytoscape.js 3.34 | 高性能图可视化，支持上千节点流畅渲染 |
| **布局算法** | cytoscape-euler · cytoscape-cose-bilkent · cytoscape-dagre | 7 种布局引擎组合 |
| **工具提示** | cytoscape-popper | 悬停节点弹出快速摘要卡片 |
| **内容解析** | marked 18 + yaml 2 + DOMPurify 3 | 流式 Markdown frontmatter 解析 + XSS 清理 |
| **测试框架** | Vitest 2 + jsdom 25 | 前端 DOM 仿真测试，23 测试文件 |
| **代码质量** | ESLint 9 + Prettier 3 | @typescript-eslint + eslint-plugin-prettier |

---

## 📁 项目结构

```
pharma-graph/
├── public/
│   ├── content/                      # 全部知识节点 Markdown 文件
│   │   ├── 药学专业知识一/            # 第一篇药剂学 / 第二篇药理 / ...
│   │   ├── 药学专业知识二/            # 第一章中枢神经 / 第三章呼吸 / ...
│   │   └── 药学综合知识与技能/
│   ├── audio/                        # 背景 BGM
│   ├── favicon.svg                   # 苯环六角图腾 favicon
│   ├── robots.txt                    # 搜索引擎抓取规则
│   ├── sitemap.xml                   # 构建时自动生成（1100+ URL）
│   └── content-manifest.json         # 构建时生成的节点索引
├── src/
│   ├── core/                         # 图谱核心逻辑
│   │   ├── frontmatter.ts            # Markdown YAML 头部解析
│   │   ├── content-loader.ts         # 节点 URL 编码与懒加载
│   │   ├── graph-builder.ts          # Cytoscape 实例 + nodes/edges 注入
│   │   ├── layouts/                  # 7 种布局参数预设
│   │   ├── legends/                  # 四类图例（形状/边框/填充/边）动态生成
│   │   └── tour/                     # 漫游学习引擎（策略/调度/播放控制）
│   ├── ui/                           # 所有 UI 行为
│   │   ├── main.ts                   # 入口 + 初始化编排
│   │   ├── toolbar.ts                # 工具栏按钮 + 布局切换器
│   │   ├── sidebar/                  # 桌面侧栏（图例/统计/参数/快捷键）
│   │   ├── bottom-sheet.ts           # 移动端底部抽屉
│   │   ├── node-panel.ts             # 节点详情面板（概览/正文/固定/缩放）
│   │   ├── search.ts                 # 顶栏搜索 + 结果定位
│   │   ├── bigscreen.ts              # 大屏影院模式
│   │   ├── drag-manager.ts           # 侧栏折叠动画 + 分区高度 JS 测量
│   │   └── music.ts                  # BGM 控制（用户首次点击后才 preload）
│   └── style/
│       ├── layout.css                # 主布局（Flex 代替 CSS Grid，画布高度无截断）
│       └── components.css            # 侧栏/工具栏/抽屉/面板/快捷键卡片样式
├── tests/                            # 23 个测试文件（235+ 测试用例）
├── scripts/                          # 构建校验脚本（validate / audit / overlap）
├── vite.config.ts                    # Vite 配置 + contentManifestPlugin
├── index.html                        # 单页入口 + SEO meta + JSON-LD + noscript
├── eslint.config.js / .prettierrc.json
└── package.json
```

---

## 🚀 快速开始

### 环境要求
- Node.js ≥ 20
- npm ≥ 10

### 安装与开发
```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（默认 5177 端口）
npm run dev
# → http://localhost:5177

# 3. 生产构建
npm run build
# 产物输出到 dist/

# 4. 本地预览构建结果
npm run preview
```

### 常用命令
```bash
npm run validate        # 校验全部 1100+ 份 Markdown frontmatter 是否合规
npm run audit           # 审计 frontmatter 重复 ID / 缺失字段
npm run measure-overlap # 计算药一/药二/药综三科目之间知识点重叠度
npm run lint            # ESLint 检查
npm run lint:fix        # ESLint 自动修复
npm run format          # Prettier 格式化全项目
npm test                # 运行全部测试（235+ 用例）
npm run test:watch      # 测试监听模式
npm run test:coverage   # 测试覆盖率报告
```

---

## 📝 节点写作规范

每个知识节点都是一个独立的 Markdown 文件，位于 `public/content/` 对应学科目录下。文件头必须包含以下 YAML frontmatter：

```yaml
---
id: morphine                              # 唯一标识，全局不重复（英文 kebab-case）
label: 吗啡                                # 显示名称
essence: medication                        # 节点本质: medication | module | section | notion | illness | process | concept
field: pharmacology                        # 学科领域
tier: clinical                             # 知识层级: basic | service | management | clinical | advanced
edges_out:                                 # 对外关联
  - target: opioid-receptor                # 目标节点 id
    type: mechanism                        # 关系类型
  - target: acute-pain
    type: treats
  - target: central-analgesics-chapter
    type: isa
---

# 吗啡

吗啡是阿片类生物碱的代表药物，通过激动中枢 μ 阿片受体产生强大的镇痛作用……
```

> **命名约束**：内容文件名必须使用全角逗号（`，`）而非半角逗号（`,`）；id 字段必须存在且全局唯一。具体规则参见 [docs/SPLIT-RULES.md](docs/SPLIT-RULES.md) 与 [docs/frontmatter.md](docs/frontmatter.md)。

---

## 🔍 SEO & 爬虫友好

项目在构建时做了多层优化，确保 Google / 百度 / 必应等搜索引擎与 AI 抓取工具能直接读到完整图谱数据而无需执行 JS：

| 机制 | 作用 |
|---|---|
| **JSON-LD 结构化数据** | WebSite（含站内搜索框） · EducationalOrganization · LearningResource · BreadcrumbList 四实体 |
| **`<noscript>` 纯文本内容** | 三大科目说明 · 60+ 核心药名标签 · 平台特色 5 条 |
| **`<script type="application/json">`** | 构建时将全部节点（label/essence/field/tier）与边（source/target/type）注入 HTML，爬虫直接可读 |
| **可见占位符预填** | 侧栏 "节点 — / 边 —" 占位符与"图谱为空"空状态，构建时替换为真实数字与状态 |
| **sitemap.xml** | 构建时自动生成，首页 + 1100+ Markdown 内容页，按路径深度分级 priority |
| **robots.txt** | 允许所有主流爬虫，声明 Sitemap 绝对 URL |
| **OG / Twitter Card** | summary_large_image 大图分享卡片，社交平台预览带图预览 |
| **Favicon** | `/favicon.svg` 苯环六角图腾公开 HTTP 可访问文件 + data URI 内联兜底 |

---

## 📄 更多文档

| 文档 | 说明 |
|---|---|
| [docs/frontmatter.md](docs/frontmatter.md) | Markdown frontmatter 字段详解 |
| [docs/SPLIT-RULES.md](docs/SPLIT-RULES.md) | 节点拆分与文件命名规则 |
| [docs/REFACTOR-RULES.md](docs/REFACTOR-RULES.md) | 重构规则与约定 |
| [docs/Cytoscape.md](docs/Cytoscape.md) | Cytoscape.js 用法与踩坑记录 |
| [docs/DEVELOP.md](docs/DEVELOP.md) | 开发模式与调试技巧 |
| [docs/CODE-WIKI.md](docs/CODE-WIKI.md) | 代码结构速查 |
| [docs/ARD/ADR-0001.md](docs/ARD/ADR-0001-层级关系统一使用isa方向.md) | 架构决策记录 |
| [docs/DEBUG-sidebar-issues.md](docs/DEBUG-sidebar-issues.md) | 侧栏折叠/截断问题 debug 记录 |

---

## 📜 致谢

- 图谱引擎：[Cytoscape.js](https://js.cytoscape.org/) 及其布局扩展作者
- 封面 BGM：*Echoes of the Eye* · Travelers Encore
- 品牌图腾：六角苯环 + Kekulé 式双键

---

<div align="center">

苯环六角图腾 · 信息熵 · **by meow**

</div>
