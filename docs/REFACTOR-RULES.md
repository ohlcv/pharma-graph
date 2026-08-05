# 节点合并 / 重构规则

> 适用范围：在已有图谱上进行结构性清理（合并零入度节点、补齐骨架边、frontmatter 规范化、跨字段合并），与 [SPLIT-RULES.md](./SPLIT-RULES.md)（拆分新增）的方向相反。
>
> 原则：保留图谱语义完整（不丢边、不丢正文）；优先就地扩伞形/节节点正文，次之删除孤立节点；schema 修复与内容合并分离提交。

---

## 一、核心原则

1. **语义不丢**：合并节点的正文必须全部内化进目标节点，不得"内容缩水"。删除节点前需确认其正文已被目标节点吸收。
2. **边不丢**：合并前先确认节点入边（被谁指向）= 0；若 > 0，需先迁移或重新挂接到目标节点，再删除源节点。
3. **不重建已删节点**：合并提交只改源节点正文 + 删除源 md + 必要时改目标节点正文，**不新增任何独立节点**。
4. **schema 修复 vs 内容合并分离**：frontmatter 兼容性修复（双 schema 折叠、字段迁移）单独提交，便于回溯与定位回归。
5. **就地扩展优先**：伞形 module / 节节点 正文应承担"该主题下零散 concept 的容器"职责，而非依赖独立子节点。伞形 ADR/机制段在结构上应与同级伞形对齐（一致才有得比较）。

---

## 二、合并候选识别（4 条信号）

按可信度从高到低：

| 信号 | 含义 | 处置 |
|---|---|---|
| ① `in_deg == 0` 且 essence 非 `medication`/`section` | 零散节点——内容属于伞形/节节点的语义却被独立拆分 | 优先就地扩伞形/节正文；无合并去向则直接删除 |
| ② 伞形 module 正文缺 ADR/机制/口诀 段，但同级伞形都有 | 结构不对称——空段说明应并入的零散节点尚未并入 | 把 in_deg=0 的零散 concept 内化进伞形 |
| ③ 伞形 module 正文已包含与同目录 concept **完全重复**的内容 | concept 已并入但忘了删 md | 直接删除 concept（无需改伞形正文）|
| ④ 节节点正文 `## 这是一节` 段已包含与同目录 concept **完全重复**的内容 | 同上 | 同上 |

**不视为合并候选**：

- `in_deg == 0` 但 essence 是 `medication` 或 `section`（具体药物、节节点本身是图入口，不应被合并）
- `in_deg > 0`（有入边即被图谱引用，需先迁移边再合并）
- 伞形 module 正文为空 + 仅有 in_deg=0 子节点（骨架不完整，需要补边而非合并——见第四节）

---

## 三、合并去向决策

按以下顺序选：

1. **伞形 module 正文的对应段**（`## 机制` / `## 不良反应` / `## 临床应用` 等）—— 零散 concept 的内容天然属于伞形语义。
2. **节节点正文的相关段**（`## 一般在什么时候用` / `## 用药注意` / `## 临床用药评价` / `## 典型症状` 等）—— 跨伞形总论性 concept 归节。
3. **同主题下其它伞形 / 节点正文**—— 只有当伞形/节节点语义边界重叠时才考虑合并跨伞形内容。
4. **直接删除**—— 当节点纯粹是孤立冗余（如孤立方剂型口诀），无任何合并价值时。

**反例**（不要这么合并）：

- ❌ 把"首过效应"并入"口服固体制剂"伞形正文：虽然该伞形正文有"首过效应"基础段，但**首过效应属于"药物吸收"机制概念**，应并入 `drug-absorption-y1`（药物吸收）的正文而非固体制剂。
- ❌ 把"个体化治疗"和"足量足疗程"合并到同一段：两者主题不同（一个谈选药策略、一个谈疗程控制），应分属 `### 个体化治疗` 与 `### 足量足疗程原则` 两个子段。

---

## 四、骨架边补齐（与合并正交）

当某章节的伞形 module / 节节点 in_deg=0，但**它们本来应该有"父→子 prerequisite 边"**把下层节点挂上时，属骨架缺失而非过度拆分。

判断骨架缺失：

```
- 父伞形 module（如 injection-preparations-y1）edges_out 指向根节点（pharmaceutics-y1）
- 子伞形 module（如 common-injection-preparations-y1）edges_out 指向根节点
- 但 父没 prereq→子 → 子 in_deg=0

结论：骨架边丢了，补边即可；不要合并子节点进父节点。
```

补边 vs 合并 是不同动作：

| 场景 | 处置 |
|---|---|
| 节点零入度 + 有自身语义（机制/ADR/监护/特殊主题）| 合并到伞形/节节点正文 |
| 节点零入度 + 是骨架本身（伞形 module / 子节 / 具体药物）| 补 `prerequisite` 边 |
| 节点零入度 + 是图入口（节、章、book 总节点）| 不动 |

---

## 五、frontmatter schema 修复

### 双 schema 现象

历史文件有两种 frontmatter 布局并存：

**新 schema**（推荐）：
```yaml
data:
  id: xxx
  edges_out:
    - target: yyy
      type: isa
```

**legacy schema**：
```yaml
id: xxx
edges_out:
  - target: yyy
    type: isa
```

### 检测方法

```python
import yaml
parsed = yaml.safe_load(text)
if isinstance(parsed.get('data'), dict):
    has_data = True  # 新 schema 容器存在
has_data_edges = parsed.get('data', {}).get('edges_out') is not None  # 新 schema 边
has_top_edges = parsed.get('edges_out') is not None  # legacy 边
```

当 `has_data and not has_data_edges and has_top_edges` 时，是纯 legacy 布局——边不在图里。

### 修复（parser 层）

在 `src/parser/frontmatter.ts` 的 `pickSource` 中：

```ts
function pickSource(yamlRoot) {
  const nested = yamlRoot['data'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const block = nested;
    const rootEdges = yamlRoot['edges_out'];
    const blockHasEdges = 'edges_out' in block && block['edges_out'] != null;
    if (!blockHasEdges && Array.isArray(rootEdges)) {
      block['edges_out'] = rootEdges;  // 折叠根级到嵌套
    }
    return block;
  }
  return yamlRoot;
}
```

下游代码（`fm['edges_out']`）保持不变。

### 长期迁移（可选清理）

可单独提交一次 frontmatter 迁移：把 216 个 legacy 文件的 `id`/`label`/.../`summary`/.../`edges_out` 全部塞进 `data:` 块顶层 —— 让所有文件统一到新 schema。**与 parser 修复分开提**，便于回溯。

---

## 六、提交拆分原则

一次合并提交应只做一类事，便于 `git log -p` 阅读和回退：

| 提交类型 | 内容 | 例子 |
|---|---|---|
| 内容合并 | 扩伞形/节节点正文 + 删 concept + 更新 manifest | `refactor(content): 第六节节点合并 — 6 个零入度节点收入伞形/节节点正文` |
| schema 修复 | parser / frontmatter 兼容性改动 | `fix(parser): 修复 legacy frontmatter 顶层 edges_out 读取` |
| 骨架边补齐 | 仅新增 `prerequisite` 边 + 更新 manifest | `chore(content): 药一第一篇补齐 6 条骨架 prerequisite 边` |
| 跨格式迁移 | legacy → 新 schema 全量迁移 | `chore(content): 216 个 frontmatter 迁移到嵌套 data 块` |

**禁止**：

- ❌ 内容合并 + parser 修复放在同一提交（语义混在一起，回归定位困难）
- ❌ 一次提交跨多个章节的内容合并（节点数 > 50 时尤其要拆）
- ❌ 提交中既改 frontmatter 字段名又合并节点正文（两个原子变更）

---

## 七、合并后验证清单

每次提交前必须确认：

1. ✅ 全仓 md 数减少（删除 ≥ 1 个）且 manifest 同步更新
2. ✅ `npm test` 全 228 测试通过（parser 改动必须）
3. ✅ 0 missing 边（脚本扫：所有 edges_out.target 在仓库存在）
4. ✅ 0 YAML 错误 / 0 ID 重复
5. ✅ 删掉的节点 `in_deg == 0`（验证前用扫描脚本确认）
6. ✅ 删掉的节点正文**已 100%** 并入目标节点（人工 / 脚本 diff 比对）
7. ✅ 提交信息含：候选数 / 合并映射 / 受影响章节 / 净减节点数 / 是否触 schema 改动

---

## 八、参考合并提交记录

| 提交 | 内容 | 净减 |
|---|---|---|
| `8f00b0f` | 第七节 抗精神病药 27 个 concept/process 收入伞形与药物正文 | -27 |
| `3418fe4` | 第六节 抗帕金森病药 6 个零入度节点收入伞形/节节点正文 | -6 |
| `8b0a17b` | 第 1-5 节零入度节点合并（9 个 concept 收入节/伞形正文）| -18 |
| `7379ef7` | parser 修复 + 3 个 concept 合并（含药一第一篇 first-pass-effect）| -3 + 全图边恢复 |