# 药学领域特化参数（RULES）

> 本文件是 **frontmatter.md 在药学领域的特化参数文档**，定义：
> - 药学顶层类（fill 取值）
> - fill 默认外观配置（形状/背景色/默认边框）
> - stroke 渲染参数（边框样式组合值）
> - 药学概念 → fill/stroke 映射表
> - 旧 essence → 新规范迁移映射
>
> **不包含**：转录工作流、字段制作规范、照片提取原则、YAML 格式、质量检查清单——这些在 [SKILL.md](../SKILL.md) 中。
>
> 通用字段规范见 [frontmatter.md](./frontmatter.md)（基于 OWL2，不绑定学科）。

---

## 一、设计理念

本项目采用 OWL2 风格的 **6 种边关系类型** + **三维度视觉编码**：

- **shape**（OWL2 实体类型）：显式填写时覆盖 fill 的默认形状（一对一固定映射）
- **fill**（领域顶层类）：决定背景色 + 默认形状 + 默认边框色（配置中心）
- **stroke**（边框样式组合值）：显式填写时覆盖 fill 的默认边框（流光/光晕）

> **fill 是配置中心**：每个药学顶层类定义完整默认外观；shape/stroke 显式填写时覆盖 fill 默认值。
> **glow 需显式填写**：所有 fill 的 `defaultStroke` 统一为 `auto`（默认无特效）；如需光晕，必须在节点 frontmatter 中显式写 `stroke: glow`。

---

## 二、药学顶层类（fill 取值范围）

以下 10 个顶层类本身也是 `shape: class` 的节点，作为 `fill` 的引用目标。

| fill 值 | 名称 | 包含的节点 |
|---|---|---|
| `cls-structure` | 组织结构 | 书/篇/章/节入口 |
| `cls-classification` | 药物分类 | 粗分类/细分类/亚类 |
| `cls-drug` | 药物 | 具体药物（重点+普通） |
| `cls-disease` | 疾病 | 疾病/症状/综合征 |
| `cls-biomolecule` | 生物实体 | 靶点/受体/酶/转运体/基因 |
| `cls-feature` | 作用特点/临床评价 | 作用特点/临床用药评价/选药原则 |
| `cls-adverse` | 不良反应/禁忌 | 典型不良反应/禁忌/毒性 |
| `cls-concept` | 抽象概念/总论 | 定义性概念/总论/术语 |
| `cls-summary` | 总结 | 节内总结/跨节大总结/表格 |
| `cls-mnemonic` | 口诀 | 记忆口诀/顺口溜 |

---

## 三、OWL2 实体类型 → 几何形状映射（shape 显式填写时生效）

| shape 取值 | OWL2 原名 | 几何形状 | 设计意图 |
|---|---|---|---|
| `class` | owl:Class | round-rectangle | 类用圆角矩形——比纯矩形柔和，比椭圆正式 |
| `named_individual` | owl:NamedIndividual | ellipse | 实例用椭圆——最通用的具体物形状 |
| `object_property` | owl:ObjectProperty | hexagon | 实体化的关系用六边形——视觉区分于实例 |
| `data_property` | owl:DatatypeProperty | rectangle | 数据属性用纯矩形——紧凑、突出数值感 |
| `annotation_property` | owl:AnnotationProperty | tag | 注释用标签形——视觉上像"附加的注释标签" |
| `auto` | — | 由 fill 决定 | 留空走 fill 默认（可为 vee / tag / barrel / star 等扩展形状）|

> **覆盖规则**：显式填写 `shape: <owl2类型>` → 用映射表的固定形状，**覆盖** fill 的默认形状。
> 留空时 → 用 fill 默认形状（FILL_CONFIG 可提供 vee / tag / barrel / star 等扩展形状）。
> 一对一映射：见 `src/core/config.ts` 的 `SHAPE_BY_OWL2` 常量。

---

## 四、fill 默认外观配置表

> **原则**：fill 只管背景色 + 默认形状 + **默认 stroke**。边框色由 `stroke` 方案决定：
> 1. 节点显式 `stroke`（glow）→ `STROKE_CONFIG[stroke].color` + 对应特效
> 2. 节点没填 `stroke` → 用 `FILL_CONFIG[fill].defaultStroke`（所有 fill 均默认为 `auto`）
> 3. 节点填了 `stroke="auto"` 或没 fill → 走 subtreeRoot 色 / fill 兜底边框色 fallback

### 4.1 fill 字段定义

> **"默认 stroke"** = 节点不填 stroke 时使用的值（统一为 `auto`，详见 4.4）。
> **"fill 兜底边框色"** = 节点显式 `stroke: auto` 且无 subtreeRoot 时，按 fill 取的边框色（`FILL_BORDER_HINTS[fill]`）。

| fill | 中文含义 | 形状 | 背景色 | 默认 stroke | fill 兜底边框色 |
|---|---|---|---|---|---|
| `cls-structure` | 组织结构 | round-pentagon（五边形） | `#fae8e3` 柔奶杏粉 | `auto` | `#c89b8a` 浅棕 |
| `cls-classification` | 药物分类 | octagon（八边形） | `#ffe4b5` 柔莫兰迪黄 | `auto` | `#c9a06a` 莫兰迪棕黄 |
| `cls-drug` | 药物 | ellipse（椭圆） | `#dbeafe` 柔天空蓝 | `auto` | `#7aa8d9` 浅蓝 |
| `cls-disease` | 疾病 | diamond（菱形） | `#fce7f3` 柔樱花粉 | `auto` | `#e89bb8` 浅粉 |
| `cls-biomolecule` | 生物实体 | round-triangle（圆角三角） | `#d1fae5` 柔薄荷绿 | `auto` | `#6dbfa0` 浅绿 |
| `cls-feature` | 作用特点/临床评价 | star（星形） | `#cffafe` 柔湖青 | `auto` | `#7db8c4` 浅青 |
| `cls-adverse` | 不良反应/禁忌 | round-hexagon（圆角六边形） | `#ffe4e6` 柔玫瑰粉 | `auto` | `#d4868f` 浅玫 |
| `cls-concept` | 抽象概念/总论 | round-rectangle（圆角矩形） | `#e0e7ff` 柔雾紫蓝 | `auto` | `#818cf8` 浅紫 |
| `cls-summary` | 总结 | bottom-round-rectangle（下圆矩形） | `#fef9c3` 柔麦穗黄 | `auto` | `#c9b96a` 浅黄 |
| `cls-mnemonic` | 口诀 | tag（标签形） | `#fed7aa` 柔蜜桃橙 | `auto` | `#d4884e` 浅橙 |
| `owl:Thing`（兜底） | 默认 | ellipse | `#f9fafb` 极浅灰 | `auto` | `#9ca3af`（`FILL_BORDER_DEFAULT`） |

> 边框色名称统一：**"fill 兜底边框色"** = stroke=auto 链路无 subtreeRoot 时的边框色 = `FILL_BORDER_HINTS[fill]` 值。
> 该色同时被 `stroke: fallback` 链路使用（详见 5.1 完整链路）。

### 4.2 字段兜底关系：fill / shape / stroke 三件套

> **核心原则**：三个字段都是"我要这个节点长什么样"——用户显式填写的值就是最终决定；不填时由 `fill` 兜底。

| 字段 | 用户显式值 | 用户不填（undefined/字段缺失） |
|---|---|---|
| `fill` | 用用户填的 fill | 节点归入通用类（不参与 fill 配置；边框色降级到 `FILL_BORDER_DEFAULT`） |
| `shape` | 用用户填的 shape | `FILL_CONFIG[fill].shape`（fill 缺失时用 `ellipse`） |
| `stroke` | 用用户填的 stroke（含 `'auto'` / `'fallback'`） | `FILL_CONFIG[fill].defaultStroke`（统一为 `'auto'`） |

**关键点**：
- `fill` 是**推荐字段**而非必填——不填时节点仍可渲染（通用外观），但失去 fill 提供的语义色
- `shape` 不填 → 用 `FILL_CONFIG[fill].shape`
- `stroke` 不填 → 用 `FILL_CONFIG[fill].defaultStroke`（统一为 `auto`，无特效）
- 用户填 `stroke="auto"` 就是显式表达"我要 auto"，**不会被 fill.defaultStroke 覆盖**
- 一旦用户表达了 `stroke`，`fill.defaultStroke` 自动让位、不参与决策

**示例**（假设 fill=cls-drug）：
- `fill: cls-drug`（无 shape/stroke）→ 椭圆药物 + 默认边框（`auto`，无特效）
- `fill: cls-drug, shape: object_property` → 六边形药物 + 默认边框（shape 显式覆盖为六边形，stroke 仍走 auto）
- `fill: cls-drug, stroke: auto` → 椭圆药物 + fill 兜底边框色（subtreeRoot 色优先，无则 `#7aa8d9`）
- `fill: cls-drug, stroke: glow` → 椭圆药物 + 光晕边框（重点药/重点分类，呼吸脉冲特效）

### 4.3 形状分配设计意图

- 结构/概念：方形系（round-pentagon / round-rectangle）—— 稳定的"骨架/定义"
- 分类/总结：多边形系（octagon / bottom-round-rectangle）—— 明显的"层级感"
- 药物/疾病：实物形（ellipse / diamond）—— 直觉化的"物质感"
- 生物实体：圆角三角形（round-triangle）—— 三角形的"指向/锚定"意象，靶点/受体是药理作用的锚点
- 特点/口诀：特征形（star / tag）—— 醒目的"标签/亮点"
- 不良反应：警示形（round-hexagon）—— 类似交通警示标志，唤起警惕

### 4.4 默认 stroke 设计意图

| fill | defaultStroke | 理由 |
|---|---|---|
| 所有 fill | `auto` | 所有 fill 统一默认 `auto`（无特效）；特效需在节点 frontmatter 中显式填写 |

> **为什么统一为 auto？** 光晕（glow）是有意强调的视觉特效，不应该是某类节点的"默认行为"。只有需要强调的重点节点（临床用药评价分支下的重点药/重点分类）才显式写 `stroke: glow`，其余节点保持简洁的实线边框。
>
> 如需某 fill 始终按 fill 颜色着色（不跟子树走），可把 `defaultStroke` 改为 `fallback`（需同步改 `src/core/config.ts`）。

### 4.5 边框色配置

- `FILL_BORDER_HINTS`（在 `src/core/config.ts` 末尾）：**fill 兜底边框色**，stroke=auto 链路无 subtreeRoot 时（5.1 第 4 步）和 stroke=fallback 时（5.1 第 2 步）都用它
- `FILL_BORDER_DEFAULT`（也在 `src/core/config.ts` 末尾）：节点连 fill 都没填时的中性灰边框色

> 设计原则：每个 fill 的边框色与背景色系协调、取同一色相的中等明度版本，保持"色块是这类内容"的视觉记忆。
>
> 调色流程：先在 `FILL_BORDER_HINTS` 调色，覆盖的是 stroke=auto 默认外观和 stroke=fallback 默认外观（共用一张表）；如需特殊边框（比如某节点想用 subtreeRoot 色），节点填 `stroke: auto` 后由 subtreeRoot 接管，无需改 hints。
>
> **覆盖规则**：
> - 显式填写 `shape: hexagon` → 覆盖 fill 的默认几何形状
> - 显式填写 `stroke: glow` → 覆盖 fill 的默认边框（流光动画）
> - 显式填写 `stroke: glow` → 覆盖 fill 的默认边框（呼吸光晕）
> - 不填或填 `auto` → 使用 fill 的默认配置（`defaultStroke: auto`，无特效）

---

## 五、渲染参数

### 5.1 stroke 组合值

| stroke 值 | 边框色 | 线型 | 特效 | 适用场景 |
|---|---|---|---|---|
| `auto` | subtreeRoot 色 或 `FILL_BORDER_HINTS[fill]` | solid 实线 | 无 | 普通节点（默认） |
| `fallback` | `FILL_BORDER_HINTS[fill]`（不查 subtreeRoot） | solid 实线 | 无 | 按 fill 自身颜色着色的节点 |
| `glow` | subtreeRoot 色 | solid 实线 | outline + ghost 多层叠加 + **呼吸脉冲动画** | **重点节点**：临床用药评价分支下的重点药（med-）/重点分类 |

**什么是重点节点（stroke: glow）？**

临床用药评价分支下独立成框的节点：

| 节点类型 | 示例 | 判定标准 |
|---|---|---|
| **重点药** | 地西泮、唑吡坦、巴氯芬 | 纸质版"临床用药评价"分支下有该药的独立框（含作用特点/临床应用/不良反应正文） |
| **重点分类** | 巴比妥类、苯二氮䓬类 | 纸质版"临床用药评价"分支下直接出现该分类名，且其下有作用特点/不良反应 |

> **关键区分**：glow 的判定依据是"该节点是否出现在纸质版'临床用药评价'分支下"，不是"该分类下有没有药"或"该分类有没有代表药"。分类与作用机制分支里的分类，即使列出了代表药，也不加 glow。
>
> **示例**：中枢肌松药的"非苯二氮䓬类"只出现在分类分支，临床用药评价分支下直接是乙哌立松/巴氯芬/氯唑沙宗三个药 → 非苯二氮䓬类不加 glow，三个药加 glow。

**完整 stroke 链路（按优先级）**：

1. 用户填 `stroke: glow` → `STROKE_CONFIG[stroke].color` + 呼吸脉冲光晕特效（subtreeRoot 色优先）
2. 用户填 `stroke: fallback` → 直接用 `FILL_BORDER_HINTS[fill]`，**跳过 subtreeRoot**
3. 用户填 `stroke: auto` + 有 subtreeRoot → subtreeRoot 色
4. 用户填 `stroke: auto` + 无 subtreeRoot → `FILL_BORDER_HINTS[fill]`
5. 用户不填 stroke → `FILL_CONFIG[fill].defaultStroke`（统一为 `auto`，再走 1~4）
6. 节点连 fill 都没填 → `FILL_BORDER_DEFAULT`（中性灰）

**`auto` vs `fallback` 的区别**：
- `auto`：先查 subtreeRoot，有就用子树色（保持同子树视觉统一）；无才用 fill 兜底边框色
- `fallback`：**永远**按 fill 兜底边框色着色，subtreeRoot 完全不参与

- 边框宽度固定 **2px**，不参与区分

---

## 六、药学概念 → fill/stroke 映射表

| 药学概念 | fill | 普通节点 stroke | 重点节点 stroke |
|---|---|---|---|
| 书/篇/章/节入口 | `cls-structure` | `auto` | — |
| 药物分类（无临床评价） | `cls-classification` | `auto` | — |
| 药物分类（有临床评价） | `cls-classification` | — | `glow` |
| 普通药（仅提名） | `cls-drug` | `auto` | — |
| 重点药（有药理卡片） | `cls-drug` | — | `glow` |
| 疾病/症状 | `cls-disease` | `auto` | — |
| 靶点/受体/酶 | `cls-biomolecule` | `auto` | — |
| 作用特点/临床评价 | `cls-feature` | `auto` | — |
| 选药原则/用药注意 | `cls-feature` | `auto` | — |
| 典型不良反应 | `cls-adverse` | `auto` | — |
| 禁忌 | `cls-adverse` | `auto` | — |
| 抽象概念/总论 | `cls-concept` | `auto` | — |
| 节内总结 | `cls-summary` | `auto` | — |
| 跨节大总结/表格 | `cls-summary` | — | `glow` |
| 口诀 | `cls-mnemonic` | `auto` | — |

> "重点"判定标准：教材中有详细药理卡片/临床用药评价单独讲解的药物或分类。
