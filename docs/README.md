# 药学知识图谱 — 产品文档

> **当前状态**：本项目已于 **2026-07-14** 完成 ISA 边迁移。所有 has 边已清零（384→0），isa 边由 0 增至 356。详见 [ADR-0001](./ADR-0001-层级关系统一使用isa方向.md) 与 [migration-report](./migration-report.md)。

## 1. 产品概述

**药学知识图谱**（pharma-graph）是一个基于知识图谱可视化技术，帮助药学学习者整理、关联和记忆药学专业知识的工具。

核心思路：用 Markdown 写笔记，用图谱看知识。

---

## 2. 核心概念

### 2.1 节点（Node）

每个药学概念、药物名称、术语、方法等，都对应图谱中的一个**节点**。

节点的元数据定义在 Markdown 文件的 frontmatter 里（数据统一放在 `data:` 块下）：

```yaml
---
data:
  id:          # 唯一标识，英文/拼音，全局唯一
  label:       # 显示名称，中文
  essence:     # 节点本质，决定节点形状（basic/drug/disease/...）
  field:       # 学科领域，决定边框色（pharmaceutics/pharmacology/...）
  tier:        # 自然分层，决定背景色（basic/drug/system/...）

location:      # 位置信息（所属教材章节）
  book:        # 书名（=根文件名）
  part:        # 篇（第一级子目录，有则写）
  chapter:     # 章（第二级子目录或文件名，必须）
  section:     # 节（第三级子目录）
  subsection:  # 子节（第四级子目录）
  item:        # 知识点名（叶子节点用）

tags:          # 自由标签列表

summary:
  short:       # 一句话定义（悬停显示）
  full:        # 详细解释（点击弹出）

edges_out:    # 从本节点出发的所有边（列表）
  - target:   # 目标节点id
    type:     # 关系类型（见下方关系类型表）
    reason:   # 为什么我要指向它
---
正文：听课笔记...
```

### 2.2 边（Edge）

边代表两个节点之间的关系。

- **source**：起始节点（即当前 Markdown 文件对应的节点）
- **target**：目标节点（由 `edges_out[].target` 指定）
- **type**：关系类型
- **reason**：这条边为什么存在（可选）

只需要在发起关系的节点里写 `edges_out`，不需要两边都写。

---

## 3. 关系类型（13 种）

### 3.1 关系类型总览

按语义分组：

| 组 | type | 含义 | 方向 | 示例 |
|---|---|---|---|---|
| **A. 层级与组成** | `isa` | 层级归属/概念归类 | 子 → 父 | 节 → 章、美托洛尔 → β受体阻滞剂 |
| | `has` | 物理/组合组成 | 整体 → 部分 | 制剂 → 辅料、人体 → 器官 |
| **B. 药理机制** | `activates` | 激活 | 因 → 果 | 药物 → 受体 |
| | `inhibits` | 抑制 | 因 → 果 | 药物 → 酶 |
| | `metabolizes` | 代谢 | 底物 → 产物 | 药物 → 代谢物 |
| | `mechanism` | 作用机制 | 因 → 果 | 药物 → 靶点通路 |
| **C. 临床应用** | `treats` | 治疗 | 药 → 病 | 苯二氮卓类 → 失眠 |
| | `causes` | 导致 | 因 → 果 | 巴比妥类 → 宿醉效应 |
| | `interacts` | 相互作用 | 双向 | 阿司匹林 ↔ 华法林 |
| | `contraindicates` | 禁忌 | 药/情况 → 禁用 | 某药 → 妊娠 |
| **D. 学习导航** | `prerequisite` | 前置依赖 | 先 → 后 | 中枢肌松药 ← 大脑和脊髓 |
| | `relates` | 相关/横切 | 双向 | 口服吸收 ↔ 首过效应 |
| | `sibling` | 同级 | 双向 | 同章并列节 |

> **核心规则**：
> - **层级关系一律用 `isa`（子→父），不要用 `has` 表达"属于"**。详见 [ADR-0001](./ADR-0001-层级关系统一使用isa方向.md)。
> - **`has` 只用于物理/组合组成**（整体→部分）。本项目当前没有这种用例，类型规范中保留定义以备后用。
> - **禁止双向书写同一对层级关系**（不要同时写 `A isa B` 和 `B isa A`）。

### 3.2 边的视觉区分

每种关系类型在图谱中通过**颜色 + 线型 + 箭头形状**三维度区分（参见 [DEVELOP.md §5.3](./DEVELOP.md#53-关系配置表)）：

| 关系 | 颜色 | 线型 | 箭头 |
|------|------|------|------|
| `isa` | 蓝色 | 实线 | 三角 |
| `has` | 青色 | 实线 | 三角 |
| `prerequisite` | 橙色 | 点线 | 菱形 |
| `relates` | 灰色 | 虚线 | 圆点 |
| `sibling` | 黄色 | 虚线 | 圆点 |
| `activates` | 绿色 | 实线 | 三角 |
| `inhibits` | 红色 | 实线 | T形 |
| `metabolizes` | 紫色 | 实线 | 三角 |
| `mechanism` | 紫色 | 实线 | 三角 |
| `treats` | 绿色 | 实线 | 三角 |
| `causes` | 红色 | 虚线 | T形 |
| `interacts` | 黄色 | 虚线 | 圆点 |
| `contraindicates` | 红色 | 实线 | T形 |

---

## 4. 节点本质 essence（影响形状）

| essence | 形状 | 适用场景 |
|---|---|---|
| `module` | 圆角矩形（大） | 章/篇级容器 |
| `section` | 圆角矩形（中） | 节级容器 |
| `basic` | 圆角矩形（小） | 定义/理论/概念 |
| `drug` | 椭圆 | 药物名称 |
| `disease` | 菱形 | 疾病名称 |
| `process` | 六边形 | 体内过程/方法 |
| `target` | 桶形 | 受体/酶/离子通道 |
| `management` | 圆角矩形（高亮） | 临床管理/用药监护 |
| `service` | 圆角矩形（高亮） | 药学服务 |
| `foundation` | 圆角矩形（基础） | 学科基础 |

完整 essence/field/tier 取值集合见 [frontmatter.md §一/二/三](./frontmatter.md)。

---

## 5. 工作流程

```
编写 Markdown 笔记（public/content/**/*.md）
        ↓
frontmatter (data: 块) 定义节点元数据
edges_out 定义关系
        ↓
vite 在 buildStart 生成 content-manifest.json
        ↓
浏览器 fetch manifest → 并行 fetch 每个 .md
        ↓
parseFrontmatter → buildGraph
        ↓
Cytoscape.js 渲染知识图谱
        ↓
交互探索：点击、缩放、搜索、布局切换
```

---

## 6. 使用场景

### 场景一：备考复习
将教材考点写成卡片笔记，通过图谱直观看到知识点之间的关联，找出自己的薄弱环节。

### 场景二：知识整理
听完课后整理笔记，梳理概念之间的 `isa` / `prerequisite` / `relates` 关系，加深理解。

### 场景三：考前冲刺
通过图谱快速浏览全章知识结构，聚焦高频考点。

---

## 7. 术语表

| 术语 | 说明 |
|---|---|
| frontmatter | Markdown 文件顶部的 YAML 元数据区域 |
| node（节点） | 图谱中的圆点，代表一个知识点 |
| edge（边） | 图谱中的连接线，代表两个知识点之间的关系 |
| layout（布局） | 节点在画布上的排列方式（环形、树状、力导引等） |
| highlight（高亮） | 选中节点后，与它关联的节点/边高亮显示 |
| location | 节点在教材中的路径（book → part → chapter → section → ...） |
| manifest | vite 生成的 `public/content-manifest.json`，列出所有可加载的 markdown |

---

## 8. 相关文档

- [DEVELOP.md](./DEVELOP.md) — 开发者指南：项目结构、运行、构建、调优
- [frontmatter.md](./frontmatter.md) — 完整字段参考、13 种关系判定规则
- [ADR-0001](./ADR-0001-层级关系统一使用isa方向.md) — 层级关系改为 isa（子→父）的决策记录
- [migration-report.md](./migration-report.md) — ISA 迁移执行的详细报告
- [Cytoscape.md](./Cytoscape.md) — Cytoscape.js 渲染层笔记
- [all-frontmatter-extracted.md](./all-frontmatter-extracted.md) — 全部 223 个文件 frontmatter 的可读快照（自动生成）
