# Reverse 漫游退化成 Forward —— 三个根因，按用户反馈逐步锁定

> 状态：**两轮修复完成**（2026-10-02）
> 关联文档：[`ADR-0003`](../ADR/ADR-0003-tour-universe-isolation.md)（universe 隔离边界设计决策）
> 修复 commits：
> - 828c315：第一次尝试——universe 改用 universeRootId 子树（**回归**，下面详述）
> - 本次 commit：第二次——universe 保持 rootId 子树，修复 dfsChildren 章内子节 reverse

---

## 一、问题描述

用户在桌面 / 移动端漫游设置里点"倒序"按钮，期望：

```
[药二第九章, 药二第九章的子节, ..., 药二第一章, 药二第一章的子节, ...]
```

实际看到的是 "**从药二第一章第一节开始**"——reverse 没生效 / 不止。

经过两轮用户反馈 + 两次修复，才摸清完整的 reverse 旅程设计意图：

| | 期望 | 第一轮修复后实际 | 第二轮修复后实际 |
|---|---|---|---|
| reverse 启动 seq[0] | 药二第九章（最末章） | 体系一根子树最末（药一）❌ | ✅ 药二第九章 |
| reverse 到达 y2 内部 | 药二第九章 → 第七章 → ... → 第一章 | 从药二第一章开始 ❌ | ✅ 药二第九章 → 第七章 → ... → 第一章 |
| 章内子节顺序 | 第三节 → 第二节 → 第一节 | 不进 y2 直接走体系根 ❌ | ✅ 第三节 → 第二节 → 第一节 |
| 章内 DFS 顺序（先分类后药名） | 保持正向 | ✅ | ✅ 保持正向（"先骨架后细节"在 reverse 也成立） |
| 不选节点默认 universe | 药二子树 | ❌ 体系一整 4 本书（1202 节点） | ✅ 药二子树（1115 节点） |
| 选节点 universe | 节点子树 | ❌ 体系根子树（1202 节点） | ✅ 节点子树 |

---

## 二、修复历史（两轮）

### 第一轮修复（commit 828c315）—— 回归

**思路**：universe 改用 universeRootId 子树（体系级）。理由是 user 报告"reverse 不生效"——根因被诊断为 universe 卡在 book-y2 子树（1115 节点），导致 reverse 在 y2 内部退化。

**修复**：pickRoot() 把 universe 来源从 `getStrictDescendants(candidateId)` 改为 `getStrictDescendants(universeRootId)`。

**测试**：3 个新回归测试都过（默认 / 选节点 / 孤悬节点）。

**用户反馈**（提交后）：
1. "现在倒序它是从药一开始了——为什么倒序把药一也掺和进来了？"
2. "我选中一个节点，再点击漫游，并非从这个节点开始。"

**问题**：
- 不选节点 → universe 从"药二子树 1115 节点"变成"体系一整 1202 节点"——跨了 4 本书。
- 选中节点 → universe 同样变成"体系根子树 1202 节点"——不再只循环选中的子树。
- 用户期望：不选节点 = 药二子树；选节点 = 节点子树（**隔离边界由用户输入决定**，不是体系根）。

### 第二轮修复（本次 commit）—— 三处

1. **revert universe 为 candidateId subtree**：universe 永远是 `getStrictDescendants(candidateId)`，保留传统行为（"两部电视剧不混播"）。
2. **修复 dfsChildren 章内子节 reverse**：`has-dfs` 之前只翻 `sortedStructures`（顶级 chapter/sub-section 入口），章内 `cls-structure` 兄弟子节没翻。用户报告"reverse 到了 y2 以后，还是从第一章第一节开始"——根因在这里。
3. **保留"先骨架后细节"语义**：reverse 模式只翻 `cls-structure` 兄弟节点（章/节），不翻 `cls-classification` / `cls-drug` / `cls-mnemonic` 等 fill（这些保持 FILL_VISIT_ORDER 正向）。用户原话："**节下面还是先分类再药名**"——章内反序会让用户在同一章里看"药名 → 分类 → 节标题"，反人类。

---

## 三、根因（第二轮锁定）

### 根因 A：reverse 启动走不到 y2 内部

**修复前**：universe = book-y2 subtree (1115 节点)，sortedStructures reverse 后是 `[book-y2, 第一章, ..., 第七章, ..., 第九章]` 排序数组 reverse → `[第九章, ..., 第七章, ..., 第一章, book-y2]`。

但**仅章节层** reverse——**章内子节顺序、子节内仍按 locationKey 升序遍历**。所以 dfsChildren(book-y2) → cls-structure kids = `[第一章, ..., 第九章]`（升序）——子节正向遍历。

**实际 seq**：filter universe 后剩 1115 节点，全部 y2 子树；相对顺序 = `[第七章第一节, ..., 第七章第三节, 第六章第一节, ..., 第九章第一节, 第九章第二节, book-y2]`——**用户看到"从第一章第一节开始"**是因为**章内子节**没 reverse。

### 根因 B：选节点也走整个体系

第一轮修复把 universe 扩到 universeRootId 子树，**让选节点失去了章节级隔离**。用户选中 `y2-ch01`，期望只循环 ch01，但走了整个体系一。

### 根因 C：跨书

universeRootId subtree 包含 y1/y2/y3/y4 全部，导致不选节点时 reverse 跨了 4 本书。

---

## 四、修复方案

### 修复 A：universe 永远是 candidateId subtree

```ts
// src/ui/tour-controller.ts:pickRoot (修复后)
const universeNodeIds = this.getStrictDescendants(candidateId);
```

universeRootId 字段仍然返回（用于检测/调试），但 universe 来源固定为 candidateId subtree。

### 修复 B：dfsChildren 章内子节 reverse

```ts
// src/core/tour.ts:dfsChildren (修复后)
for (const fill of FILL_VISIT_ORDER) {
  const kidsRaw = (children.get(parentId) ?? []).filter(
    (k) => (k.data('fill') as string) === fill,
  );
  // reverse 模式下，cls-structure 兄弟节点按 location 降序遍历——
  //   - 章一级：[第九章, ..., 第一章]（reverse 期望从最后一章往前）
  //   - 子节一级：[第三节, 第二节, 第一节]（reverse 期望从最后节往前）
  const kids =
    direction === 'reverse' && fill === 'cls-structure' ? [...kidsRaw].reverse() : kidsRaw;
  for (const k of kids) {
    if (!visited.has(k.id())) {
      visited.add(k.id());
      result.push(k.id());
    }
    dfsChildren(k.id());
  }
}
```

仅 reverse 模式下，cls-structure fill 的兄弟节点 reverse。其他 fill（cls-classification / cls-drug / cls-mnemonic 等）保持 FILL_VISIT_ORDER 正向——"先骨架后细节"在 reverse 模式下仍然成立。

### 修复 C：universeRootId 不再影响 universe 来源

`universeRootId` 字段保留在 `pickRoot()` 返回值中（用于检测），但 universe 来源固定为 candidateId subtree。这是经过用户测试后确认的：**用户期望的边界是"用户输入决定"，不是"体系根决定"**。

---

## 五、副作用 / 行为差异

| 场景 | 修复前（v0） | 第一轮修复（v1） | 第二轮修复（v2，本次） |
|---|---|---|---|
| 不选节点 + forward | 药二子树 1115 节点 | ❌ 体系一 1202 节点 | ✅ 药二子树 1115 节点 |
| 不选节点 + reverse | 退化（退化成 forward） | 体系一反序 | ✅ 药二子树反序 |
| 选 `y2-ch01` + forward | ch01 子树 | ❌ 体系一 | ✅ ch01 子树 |
| 选 `y2-ch01` + reverse | 退化 | 体系一反序 | ✅ ch01 子树反序 |
| 跨体系隔离 | ✅ | ✅ | ✅ |

**核心承诺**：跨体系不混播——保持不变。

---

## 六、回归测试

`tests/component/ui/tour-controller.test.ts`：

- **3 个 pickRoot 回归测试**（更新）：默认起点 / 选节点 / 孤悬节点——所有都期待 universe = candidateId subtree，不依赖 universeRootId。

`tests/component/core/tour-engine.test.ts`：

- **1 个新 reverse 章节 + 子节回归测试**：
  - 章级 reverse（book-y2 在最末）
  - 子节级 reverse（第三节排在第一节之前）
  - 子节内其他 fill 正序（分类排在药之前）

---

## 七、教训 / 复用原则

### 教训 1：用户期望的"边界"可能跟"技术语义"不一致

`universeRootId subtree` 在技术上是合理的隔离边界（"两部电视剧不混播"），但用户期望的是**自己输入决定的边界**——"我选了什么就只看什么"。**先问用户期望的边界是什么，再确定 universe 该跟什么走。**

### 教训 2：reverse 在多层级的语义需要逐步跟用户对齐

- 第一轮用户反馈："reverse 不生效"——根因被简化为 universe 太窄（其实更准确的根因是 dfsChildren 没翻子节）。
- 第二轮用户反馈："reverse 到了 y2 还是从第一章第一节开始"——这次才暴露真正的根因。

**"reverse 不生效"的诊断不能一蹴而就**——reverse 在每个层级都有独立的语义，需要把 reverse 在**章节层、子节层、子节内 fill** 三处的行为都跟用户确认清楚再开始实现。

### 教训 3：测试构造图必须用生产数据格式

回归测试用 `edges_out`（frontmatter 关系格式）而不是 cytoscape edge——tour.ts 通过 `n.data('edges_out')` 读关系。第一版测试用 cytoscape edge，结果 children Map 空，断言用绝对 index 失败。教训**：抽象测试的图必须用生产数据格式**（`edges_out`）。

---

## 八、相关 ADR / 改动

- **ADR-0003 决策 B 核心契约**：universe 永远是 candidateId subtree（`universeRootId` 不影响 universe 来源）
- **`TourEngine.applyRootScope` 不变**：seq 过滤逻辑仍然用 `universeNodeIds` Set
- **`TourEngine.setMode` 不变**：reverse / random 不 unshift（bc2b83e 已修）
- **`has-dfs.buildSequence` 子节 reverse**（本次 commit）

---

## 九、诊断日志证据（早期版本摘要）

> 第二轮修复前，`controller.start.pickRoot`（revert 后）：

```
{
  rootId: 'book-y2',
  universeRootId: 'concept-exam-system',
  universeNodeIdsSize: 1115  ← 修复后是 1115（不再 1202）
}
```

> 第一轮修复后（错版）：

```
{
  rootId: 'book-y2',
  universeRootId: 'concept-exam-system',
  universeNodeIdsSize: 1202  ← ❌ 包含 4 本书
}
```

> 第二轮修复后（reverse 启动真实 seq）：

```
seqReverse = ["sec-y2-01-第三节","sec-y2-01-第一节","sec-y2-01","cls-y2-01","drug-y2-01","book-y2"]
// ✅ 第三节 reverse
// ✅ 分类 drug 顺序保持（FILL_VISIT_ORDER 正向）
// ✅ book-y2 在最末（章节层 reverse）
```