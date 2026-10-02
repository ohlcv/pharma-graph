# 通用知识图谱节点规范（基于 OWL2）

> 本规范为**通用设计文档**，不绑定任何学科。药学、数学、政治等领域的具体映射规则与渲染参数在各领域 RULES.md 中定义。
> 以下示例以药学领域举例，仅为说明用法。

---

## 一、设计原则

### 1.1 语义层与渲染层分离

```
fill（领域顶层类）──→ 提供默认外观（几何形状 / 背景色 / 默认边框色）
shape（显式填写）──→ 覆盖 fill 的默认几何形状
stroke（显式填写）─→ 覆盖 fill 的默认边框
```

- **fill 是配置中心**：每个领域顶层类在 RULES 中定义完整的默认外观
- **shape / stroke 可选**：不填或缺省值时，使用 fill 的默认配置
- **显式填写时覆盖**：shape 和 stroke 互不影响（同级），各自独立覆盖 fill 的默认外观

### 1.2 严格基于 OWL2

| 本规范字段       | OWL2 对应                                         | 说明                                             |
| ---------------- | ------------------------------------------------- | ------------------------------------------------ |
| `fill`           | Direct Class Assertion（领域顶层类）              | 个体归属的上层类 IRI                             |
| `shape`          | OWL2 实体类型枚举值（class/named_individual/...） | 显式填写时按 SHAPE_BY_OWL2 查表得 Cytoscape 形状 |
| `stroke`         | 自定义 AnnotationProperty `style`                 | OWL2 合法扩展，组合值                            |
| `edges_out.type` | OWL2 Axiom                                        | 5 种公理                                         |

> OWL2 允许自定义 AnnotationProperty，`style` 是本图谱定义的注释属性（组合值），属于 OWL2 标准扩展机制，非造词。
> `shape` 填的是 OWL2 实体类型（如 `named_individual`），渲染时按 [RULES §三 SHAPE_BY_OWL2](./RULES.md) 映射到具体 Cytoscape 形状（ellipse / diamond / hexagon 等）。`fill: cls-drug` 隐含语义"named_individual 类的药物实例"，因此多数情况不填 shape、用 fill 的默认椭圆即可。

---

## 二、标准结构（字段平铺，无 data 包装）

```yaml
---
id: string # 必填，唯一标识（IRI 片段），英文/拉丁文
label: string # 必填，显示名称（rdfs:label），中文

# === 语义层（严格 OWL2）===
shape: auto | class | named_individual | object_property | data_property | annotation_property
# 可选，缺省 auto。auto 时由 fill 的默认配置决定几何形状。
# 显式填写时填 OWL2 实体类型，对应固定几何形状（round-rectangle / ellipse / hexagon / rectangle / tag）。
# 显式填写时覆盖 fill 的默认形状（最高优先级）。
# 完整 OWL2 → 几何形状映射见 RULES §三 + SHAPE_BY_OWL2。

fill: string # 可选，领域顶层 Class IRI（如 cls-drug / cls-disease）
# 缺省时不写节点（节点归入通用类），具体 fill 值见 RULES §二。
# 决定背景色 + 默认几何形状 + 默认边框色，并在 RULES 中定义该类的完整默认外观。

stroke: auto | glow | flow | fallback | double
# 可选，缺省由 fill 的 defaultStroke 决定（目前所有 fill 均为 glow，见 RULES §四）。
# auto     → 先查 subtreeRoot，无子树时降级到 fill 兜底边框色（FILL_BORDER_HINTS[fill]）
# fallback → 永远按 fill 兜底边框色着色（跳过 subtreeRoot）
# glow     → 呼吸光晕（固定紫 #818cf8，有子树时被子树色覆盖）；目前是默认 stroke
# flow     → 取色同 auto，外加绕节点旋转的流动光点
# double   → 双线边框，取色同 auto（重点节点：临床用药评价分支下的重点药/重点分类）
# 完整 stroke 链路见 RULES §5.1。

# === 定位与内容 ===
location: # 教材/资料定位（不参与图形编码）
  book: string # 必填
  chapter: string # 必填
  section: string # 可选
  item: string # 可选，节内排序/子项

tags: string[] # 检索关键词（rdfs:seeAlso）

summary:
  short: string # 一句话定义，关键词用 **加粗**
  full: string # 详细解释，用 | block scalar，【标签】分段

# === 边（OWL2 公理）===
edges_out:
  - target: string # 对方节点 id
    type: subclass_of | instance_of | part_of | disjoint_with | equivalent_to
    reason: string # 关系具体语义注释
---
```

---

## 三、字段说明

### 3.1 id / label

| 字段    | 类型   | 必填 | 说明                                                            |
| ------- | ------ | ---- | --------------------------------------------------------------- |
| `id`    | string | ✅   | 唯一标识，英文/拉丁文，格式 `{前缀}-{英文名}-{书简写}-{章号}-{节号}` |
| `label` | string | ✅   | 显示名称，中文；文件名 = label                                  |

### 3.2 shape — OWL2 实体类型（覆盖 fill 的默认形状）

> **每个 OWL2 实体类型对应一个固定的 Cytoscape 几何形状**（一对一映射，见 [RULES.md §三](./RULES.md)）。
> **留空时使用 fill 的默认形状**——可访问 FILL_CONFIG 中的扩展形状（vee / tag / barrel 等）。

| 值                    | OWL2 原名              | 含义                   | 几何形状                    | 药学范畴                     |
| --------------------- | ---------------------- | ---------------------- | --------------------------- | ---------------------------- |
| `class`               | owl:Class              | 概念集合/类型          | round-rectangle（圆角矩形） | 药物分类、章/节、疾病分类    |
| `named_individual`    | owl:NamedIndividual    | 具体实例               | ellipse（椭圆）             | 具体药物、具体疾病、靶点、酶 |
| `object_property`     | owl:ObjectProperty     | 个体间关系（实体化时） | hexagon（六边形）           | 治疗、导致、抑制、代谢       |
| `data_property`       | owl:DatatypeProperty   | 个体→数值的属性        | rectangle（矩形）           | 半衰期、剂量、生物利用度     |
| `annotation_property` | owl:AnnotationProperty | 注释/元数据            | tag（标签形）               | 显式指定时用于注释类节点（口诀/总结默认由 fill 决定，不必填 shape） |
| `auto`                | —                      | 由 fill 决定           | —                           | 缺省值                       |

**覆盖规则**：

- 显式填写 `shape` → 使用映射表的固定形状，**覆盖** fill 的默认形状
- 留空或填 `auto` → 使用 fill 的默认形状（可为 vee / tag / barrel 等 FILL_CONFIG 扩展形状）

**用法示例**：

```yaml
# 例 1：默认情况（推荐）—— 不填 shape，用 fill 的扩展形状
fill: cls-mnemonic # → 标签形（tag）+ 浅橙背景
# 留空 shape → 节点是标签形

# 例 2：覆盖 fill —— 想让口诀用普通椭圆
fill: cls-mnemonic
shape: named_individual # → 椭圆（覆盖 tag）

# 例 3：关系实体化 —— "治疗" 边转成节点
fill: cls-feature
shape: object_property # → 六边形（强制显式指定）
```

### 3.3 fill — 领域顶层 Class IRI

- 类型：`string`，值为领域顶层类的 id
- 通用图谱：缺省时**省略**（节点归入通用类，不写也合法）
- **领域图谱（如药学）：`fill` 必填**，否则失去 fill 提供的语义色与默认配置（见 [RULES.md §二](./RULES.md)）
- 作用：
  1. 决定节点**背景色**
  2. 在 RULES 中定义该类的**默认 shape（几何形状）**
  3. 在 RULES 中定义该类的**默认边框色和边框效果**
- 具体领域顶层类（如 `cls-drug` / `cls-disease` / `cls-math-concept`）在各领域 RULES 中定义

### 3.4 stroke — 边框样式（可选）

stroke 是自定义 AnnotationProperty `style` 的简写，值为组合枚举，完整定义边框色 + 效果。
**完整 stroke 链路以 [RULES §5.1](./RULES.md) 为准**（本节仅速查）。

| 值                   | 边框色                                                     | 线型 | 效果                 | 适用场景                                          |
| -------------------- | ---------------------------------------------------------- | ---- | -------------------- | ------------------------------------------------- |
| `auto`（如显式填写） | subtreeRoot 色 或 FILL_BORDER_HINTS[fill]                  | 实线 | —                    | 跟子树走                                          |
| `fallback`           | FILL_BORDER_HINTS[fill]（不查 subtreeRoot）                | 实线 | —                    | 按 fill 自身颜色着色的节点                        |
| `glow`               | 固定紫 #818cf8（有子树时被子树色覆盖）                     | 实线 | **呼吸脉冲光晕**     | 默认 stroke（所有 fill 的 defaultStroke）         |
| `flow`               | 同 auto（subtreeRoot 色 / fill 兜底）                      | 实线 | 绕节点旋转的流动光点 | 需要"流动"强调的节点                              |
| `double`             | 同 auto（subtreeRoot 色 / fill 兜底）                      | 双线 | —                    | **重点节点**：临床用药评价分支下的重点药/重点分类 |
| _不填_               | 由 `FILL_CONFIG[fill].defaultStroke` 决定（当前为 `glow`） | —    | —                    | 多数节点的推荐写法                                |

> 边框宽度默认 2px（`double` 为 4px），不参与区分。

### 3.5 location — 教材定位

| 字段      | 类型   | 必填 | 说明            |
| --------- | ------ | ---- | --------------- |
| `book`    | string | ✅   | 根文件名/教材名 |
| `chapter` | string | ✅   | 章              |
| `section` | string | 可选 | 节              |
| `item`    | string | 可选 | 节内排序/子项   |

> location 不参与图形编码，仅用于节点详情展示。

### 3.6 tags — 检索关键词

- 类型：`string[]`
- 由两部分组成：**结构标签**（节点名称、归属分类、节名等，由规则生成）+ **重点提示词标签**（取自 `summary.full` 中被标记为重点的词）
- 用于检索和筛选
- 取词来源、前缀分类与抽取流程由各领域工作流规定；药学图谱见 [SKILL.md §5.4](./SKILL.md)

### 3.7 summary — 节点详情

| 字段    | 类型   | 说明                                                  |
| ------- | ------ | ----------------------------------------------------- |
| `short` | string | 一句话定义，关键词用 `**加粗**`（口诀节点例外：可多行换行对齐，详见 [SKILL.md §6.4](./SKILL.md)） |
| `full`  | string | 详细解释，用 `\|` block scalar 保留换行，【标签】分段 |

**full 标签**：取自纸质版框名原样（如 `【总论】` `【作用机制】` `【作用特点】` `【典型不良反应】` `【禁忌】` `【药物相互作用】`），不自拟；药学领域的常见框名见 [SKILL.md §5.2](./SKILL.md)。

> 药学图谱：`full` 是纸质版的**逐字转录**，没有纸质版内容时留空，不由 AI 填充（口诀节点除外），详见 [SKILL.md §零](./SKILL.md)。

### 3.8 edges_out — OWL2 公理（5 种）

| type            | OWL2 对应                | 语义              | 方向规则  |
| --------------- | ------------------------ | ----------------- | --------- |
| `subclass_of`   | SubClassOf               | 类→父类（是一种） | 子类→父类 |
| `instance_of`   | ClassAssertion           | 个体→类（是一个） | 个体→类   |
| `part_of`       | TransitiveObjectProperty | 局部→整体（组成） | 局部→整体 |
| `disjoint_with` | DisjointClasses          | 互斥              | 对称      |
| `equivalent_to` | EquivalentClasses        | 类等价            | 对称      |

> 只有以上 5 种合法类型。旧文档中出现过的 `has_instance` 等写法已废弃，不得使用。
>
> `part_of` 是声明为 Transitive 的 ObjectProperty，属于 OWL2 标准用法。
> 口诀→主知识、总结→主章节等"辅助节点→主知识"也使用 `part_of`。
>
> 每条边必须填 `reason`，措辞规范见 [RULES.md §8.2](./RULES.md) + [SKILL.md §5.5](./SKILL.md)。

---

## 四、边框色计算优先级

> **本节是速查版，权威定义在 [RULES.md §5.1](./RULES.md)**（含 fallback / FILL_BORDER_HINTS[fill] / defaultStroke 兜底链路）。

边框色由两层叠加决定：

```
┌──────────────────────────────────────────────────────────────┐
│  边框色 = 基础层（subtreeRoot 或 fill 兜底）                  │
│         + 强调层（stroke 显式：double 的重点标记）         │
│                                                              │
│  基础层（自动计算）        强调层（显式声明）                 │
│  ─────────────────        ─────────────────                   │
│  告诉用户"属于哪个分类"    告诉用户"有多重要"                 │
└──────────────────────────────────────────────────────────────┘
```

### 4.1 stroke 链路速查

边框本体（线型/颜色）取色的完整优先级链路，以及 `defaultStroke` 与 `STROKE_MERGE_MODE` 的叠加规则，**只在 [RULES.md §5.1](./RULES.md) 维护**（唯一权威源），本节不再复述。

### 4.2 auto vs fallback

- `auto`：先查 subtreeRoot，有就用子树色（保持同子树视觉统一）；无才用 fill 兜底
- `fallback`：**永远**按 fill 兜底色着色，subtreeRoot 完全不参与（适合没有子树归属感的节点）

### 4.3 subtreeRoot 自动色

- **有 subtreeRoot** → 按 subtreeRoot id hash 分配稳定色（15 色循环）
- **无 subtreeRoot** 且 stroke=auto → 走 4.1 链路中「auto + 无 subtreeRoot」那一步的 `FILL_BORDER_HINTS[fill]`（不是 depth 灰阶——以 RULES 为准）

### 4.4 融合设计示例

```yaml
# 示例 1：重点药（stroke: double）
fill: cls-drug
stroke: double # → 双线边框（重点药特效）

# 示例 2：演示 fallback 用法（仅作语法示例；药学图谱中普通药 stroke 不填，见 SKILL §1.4）
fill: cls-drug
stroke: fallback # → 浅蓝边框，按 fill 自身颜色着色

# 示例 3：默认（不填 stroke，用 fill 的 defaultStroke）
fill: cls-drug # 默认 stroke=glow（呼吸光晕）
```

---

完整示例与字段填写样例见 [SKILL.md §五"字段制作规范"](./SKILL.md)(含 YAML 模板、full 格式、加粗规则、tags 抽取)。frontmatter.md 仅保留字段定义,不维护示例。

---

## 五、文件名与 id 命名

- **文件名** = `label`（中文），如 `地西泮.md`、`苯二氮䓬类.md`
- **id** = 英文/拉丁文，格式 `{前缀}-{英文名}-{书简写}-{章号}-{节号}`

完整的前缀表与药学 id 命名细则（权威）见 [SKILL.md §1.2](./SKILL.md)。本节不重复维护，以避免双份漂移。