# ADR-0001: 层级关系统一使用 `isa`（子→父）方向

| 字段 | 值 |
|---|---|
| **状态** | Accepted |
| **日期** | 2026-07-14 |
| **决策者** | 项目所有者 |
| **影响范围** | `content/**` 所有 frontmatter、`src/parser/frontmatter.ts`、`src/scripts/validate.ts`、`docs/frontmatter.md` |

## 一、背景（Context）

### 1.1 当前问题

在审查图谱时发现大量**双向**的 `has` 边：

```94:103:src/core/build-graph.ts
  // Deduplicate edges (same source+target+type).
  const seenEdge = new Set<string>();
  const edges: EdgeData[] = [];
  for (const e of rawEdges) {
    if (seenEdge.has(e.id)) continue;
    seenEdge.add(e.id);
    edges.push(e);
  }
```

构图时去重的 key 是三元组 `source||target||type`，但**两条方向相反的边 source 和 target 对调**，去重抓不到，于是两条都进入 Cytoscape。

### 1.2 抽样调查

以《第一章 精神与中枢神经系统用药》为例，**7 节全部都写了反向 `has → cns-drugs-y2`**：

| 节点 | 边的写法 |
|---|---|
| `cns-drugs-y2`（章） | `has → anti-dementia-drugs`（父→子） |
| `anti-dementia-drugs`（节） | `has → cns-drugs-y2`（子→父） |

类似情况在全书普遍存在：第二章 3 节、第八章 N 节都写了"本节属于 XXX 章"的反向 `has` 边。

### 1.3 根本原因

- `docs/frontmatter.md`（第 200-204 行）规定 `has` 表示**整体→部分**（方向不可逆）。
- 但内容作者普遍把"本节属于章"误用 `has` 写成了**子→父方向**，与规范语义不符。
- 同时章节点又按规范写了**父→子的 `has`**，于是产生"一对反向 has"。
- 由于 `has` 在 `config.ts:116` 的样式是**灰色无箭头实线**，肉眼无法看出方向差异，两条几乎重叠成一坨。

## 二、决策（Decision）

### 2.1 核心原则

**所有层级关系一律使用 `isa`，方向永远是子→父。**

```
section  ──isa──>  chapter  ──isa──>  part  ──isa──>  book
   │
   └──isa──> chapter（或 part，跳过中间层）
```

### 2.2 边的语义分工

| 边类型 | 方向 | 适用场景 | 示例 |
|---|---|---|---|
| **`isa`** | **子→父**（强制） | 层级归属、分类归类 | 节 → 章、具体药 → 药理类 |
| **`has`** | **整体→部分**（强制） | 物理/组合组成 | 制剂 → 辅料、人体 → 器官 |

### 2.3 关键规则

1. **任何层级归属关系都用 `isa`**，禁止用 `has` 表示"属于"。
2. **`isa` 永远是子→父方向**，永远不要父节点枚举所有子节点。
3. **`has` 只保留给"物理组成"语义**（如制剂包含辅料）。本项目当前没有这种用例，所以实际保留是预留。
4. **禁止双向书写同一关系**（如同时写 `A isa B` 和 `B isa A`）—— 这会让去重失效并产生歧义。
5. **非 book 节点建议至少有 1 条 `isa` 边**（warning 级提示，不阻断构建，后续视数据规模再决定是否升级为强制）。book 节点是根，不要求。
6. **`isa` 的 target 可以指向非直系上级**（如节直接 `isa` 到 book），按知识语义决定，不强制跳级。

### 2.4 与现有规范的关系

`docs/frontmatter.md` 第 199-204 行当前定义：

```
| `has` | 物理组成（整体含部分） | 制剂 → 辅料 | 布洛芬缓释胶囊 → 羟丙甲纤维素 |
| `isa` | 是个体/实例（具体归抽象） | 具体药 → 药理分类 | 美托洛尔 → β受体阻滞剂 |
```

**本次决策保留此语义，并重新划分使用语境**：

- 当前所有"层级归属"用例（章→节、篇→章、章→book 等）**全部从 `has` 改为 `isa`**。
- `has` 在文档规范中保留定义，但**不推荐**继续用于结构层级。
- 后续如出现物理组成用例（如制剂拆解为辅料），再使用 `has`。

## 三、备选方案（Alternatives Considered）

### 3.1 方案 A：保留父→子 `has`，删除子→父 `has`/ `isa`（已否决）

**做法**：只改章节点的边，删掉节节点里的反向 `has`。

**否决理由**：

- 章节点变成 hub（一个章有十几条 `has` 出去），cose-bilkent 布局会把章节点顶到中心，节围着章成一坨。
- 违反业界惯例（见第 4 节）。
- 新增子节点时不需要改父节点的原则没解决。

### 3.2 方案 B：双向都保留，让 `buildGraph()` 做去重时把方向归一化（已否决）

**做法**：在 `src/core/build-graph.ts` 去重时把 `source/target` 按字典序排序再算 key。

**否决理由**：

- 会让有向图丧失方向语义；`A→B` 和 `B→A` 本质是不同语义关系。
- 即便做了归一化，渲染时还是无箭头灰色（has 的样式），看不出来谁是谁的父。
- 用代码"容忍"数据错误是反模式，应该从源头治理。

### 3.3 方案 C：让 `buildGraph()` 从 `location` 自动派生 `isa` 边（保留备选）

**做法**：节点写 `location: { book, part, chapter, section }`，构图时根据路径自动生成 `isa` 链，frontmatter 里不再写 `isa`。

**优点**：

- 完全消除冗余，frontmatter 更干净。
- 数据一致性最稳。

**缺点**：

- `isa` 的语义目标不一定等于 `location` 的直接上级（如跨章节的"对比"关系）。
- 失去了手写 `isa` 时的灵活度（如某些概念可以同时属于多个父）。
- 现有的 `location` 是路径派生的（不是手写），且 frontmatter 里也没有"父节点 ID"的直接字段；自动派生需要额外的 ID 映射表。

**结论**：方案 C 与本决策**正交**，可作为后续增强。当前方案 B（即本 ADR 采纳的方案）保留手写 `isa` 的灵活性，同时杜绝反向冗余。

## 四、业界参考（References）

W3C 标准体系、知识图谱惯例、面向对象设计等反复验证"子→父"是层级关系的唯一合理方向：

### 4.1 W3C / RDF / OWL

| 体系 | 关系 | 方向 |
|---|---|---|
| RDF Schema | `rdfs:subClassOf` | 子类 → 父类 |
| OWL 2 | `owl:subClassOf` | 子类 → 父类 |
| SKOS | `skos:broader` / `skos:narrower` | 推荐只存 `broader`（子→父），`narrower` 由推理得到 |

### 4.2 知识库 / 本体

- **Cyc / OpenCyc**：`isa`（实例→类型）和 `genls`（子类→父类），30+ 年历史
- **Wikidata**：`P279 subclass of` —— 子项指向父项
- **FIBO**（金融本体）、**GoodRelations**（商业模式本体）：均遵循子类声明父类
- **Schema.org**：所有 `subClassOf` 都是子→父

### 4.3 编程语言 / 面向对象

```java
class Dog extends Mammal {}  // 子类声明父类
```

`Mammal.java` 不维护 `List<Dog>`。反射可列举子类，但关系断言只在子类一边。

### 4.4 UML

类图继承箭头**朝向父类**（空心三角），即子类指向父类。

## 五、后果（Consequences）

### 5.1 正面影响

1. **图谱视觉清爽**：每个章节点不再被十几条 `has` 边围成毛球；层级关系变成清晰指向父节点的蓝色箭头（`isa` 在 `config.ts:117` 是蓝色有三角箭头）。
2. **方向可读**：所有层级关系一眼看出谁是父谁是子。
3. **写入局部性**：新增节点只改自己的 frontmatter 文件，父节点不动。
4. **度计算更真实**：章节点的 degree 不再虚高（之前每章被双重计算）。
5. **符合业界惯例**：与 W3C、OWL、SKOS、Cyc、Schema.org 等一致。

### 5.2 负面影响

1. **需迁移已有内容**：所有章→节的 `has` 边要被删除或转成 `isa`；节→章的反向 `has` 要转成 `isa`。
2. **`has` 暂时闲置**：本项目目前没有"物理组成"用例，`has` 在数据上会消失一段时间。规范中仍保留定义以备后用。
3. **章节间跨级跳转不便**：若某概念同时属于多章，目前的"每节点 1 条 isa"建议会让跨章概念难以表达。这通过"非直系 isa"规则（见 2.3 节第 6 条）部分缓解，未来如需要可加 `relates` 或 `sibling`。

### 5.3 风险

- 迁移脚本写错可能误删正常边 → 用 `npm run validate` 双向校验前后差异。
- 部分子节点的 `isa` 目标语义上不易确定（如某个核心概念同时属于多章） → 按"主归属 + has/relates 补充"处理。

## 六、迁移计划（Migration Plan）

### Step 1: 编写一次性迁移脚本

新建 `src/scripts/fix-isas.ts`：

```typescript
// 伪代码
for each content/**/*.md file:
  parse frontmatter
  for each edge in edges_out:
    if edge.type === 'has':
      // 反向 has（子→父） → 改 has 为 isa
      if edge.target === node's parent (by location):
        change edge.type to 'isa'
      // 父→子的 has → 删除
      else:
        mark edge for deletion
  write back
```

### Step 2: 更新 schema 文档

修改 `docs/frontmatter.md`：

- 在 `### edges_out — 关系边` 章节加上"层级归属用 `isa` 而非 `has`"的明确说明。
- 在 `**has**` 行加注脚："has 主要用于物理组成；层级关系请用 isa"。

### Step 3: 增强校验

修改 `src/scripts/validate.ts`：

1. 警告"父→子方向的 `has` 边"（建议改用 `isa`）。
2. 警告"双向 `isa`/`has` 配对"（应只留一边）。
3. 警告：非 book 节点没有 `isa` 边（保守策略：先以 warning 形式提示，不阻断构建；待确认存量违规数量后，再决定是否升级为 error）。

> 后续如发现违规分布高度集中（例如 80% 以上非 book 节点都已满足），可考虑升级为 error；如分布稀疏则保持 warning 长期提示。

### Step 4: 视觉调整（可选）

`src/core/config.ts` 中 `isa` 当前样式是 `{ color: '#4a90e2', lineStyle: 'solid', arrow: 'triangle' }`，**已足够清晰**，无需调整。

### Step 5: 执行与回归

```bash
# 1. 跑迁移脚本
npx tsx src/scripts/fix-isas.ts

# 2. 校验
npm run validate

# 3. 视觉回归（本地启动 dev server 看图谱）
npm run dev
```

### Step 6: 收尾

迁移完成后，写一份"迁移报告"附录在本 ADR 末尾，记录：

- 涉及的节点数
- 转换的边数
- 任何需要人工判断的边界情况

## 七、相关决策（Related Decisions）

- **未来可考虑** ADR-0002：从 `location` 自动派生 `isa` 边（见方案 C）。当手写 `isa` 维护成本上升、且没有跨父归属需求时启动。
- **未来可考虑** ADR-0003：定义 `has` 的具体使用场景模板（如制剂拆解）。

## 八、变更历史（Change History）

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-07-14 | 1.0 | 初稿，状态 Accepted |