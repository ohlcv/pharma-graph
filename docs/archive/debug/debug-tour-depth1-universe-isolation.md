# Tour 档位 1 漫游时 universe 隔离导致进度条只剩 2 步

**日期**: 2026-09-18
**状态**: ✅ 已修复
**严重等级**: High（用户选 book-y2 漫游时，进度条只显示 2 步而非药二子树全部结构节点；体系边界判定完全失效）

***

## 问题描述

深度档位 1（结构档 = 只看 cls-structure）漫游体系一时，进度条分母只剩 **2**：
- 1 是选中节点 book-y2 本身
- 1 是体系根 concept-exam-system（不该被算进来）

预期：进度条 = book-y2 子树里所有 cls-structure 节点的总数（章/节入口，远大于 2）。

### 现象

| 用户操作 | 期望进度条 | 实际进度条 |
|---|---|---|
| 不选 → 默认 book-y2 → 档位 1 启动 | book-y2 子树结构数（数十个） | **2**（book-y2 + concept-exam-system）|
| 选 sec-y2-01 → 档位 1 启动 | 该节子数（远小于 book-y2） | 类似错误 |
| 选 book-y2 → 档位 1 漫游走完 | 走完整个体系一，停 concept-exam-system（不跳体系二）| 走 2 步就停，或乱跳 |

***

## 排查过程

### 第一阶段：确认 universe 隔离有生效

新引入的 `universeNodeIds` 机制确实在跑——`applyRootScope()` 把 seq 限制到 universe 内。问题是 universe **自己算错了**：

```typescript
// tour-controller.ts
private getStrictDescendants(nodeId: string): Set<string> {
  const set = new Set<string>([nodeId]);
  const queue: string[] = [nodeId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const node = this.cy.getElementById(cur);
    node.incomers('node').forEach((child) => { ... });
    //                                 ^^^^^^^^^^^ 选对了
  }
  return set;
}
```

第一轮我写的是 `node.descendants()`（cytoscape compound API），所有"普通"节点（没有 `compound: true`）返回空，导致 seq 全被清空、漫游立刻完成。

第二轮我**改成 `node.outgoers('node')`**——`getStrictDescendants('book-y2')` 算出来 = `{book-y2, concept-exam-system}`，正好就是进度条 2 的来源。

### 第二阶段：根因——cytoscape 边方向 vs outgoers/incomers 语义

我们的图边方向：**source = child, target = parent**（参见 `docs/ADR/ADR-0001-层级关系统一使用isa方向.md`）。

| cytoscape API | 语义 | 在我们的图里 = ? |
|---|---|---|
| `.descendants()` | compound parent 子孙 | ❌ 我们的节点不是 compound parent → 空 |
| `.children()` | compound parent 直接孩子 | ❌ 同上 |
| `.outgoers('node')` | 沿 outgoing edges 到达的 node | ❌ **是 parent**（target = parent）|
| `.incomers('node')` | 沿 incoming edges 到达的 node | ✅ **是 children**（source = child）|

我第二轮把 `.descendants()` 换成 `.outgoers()` 时**记反了**边的方向——以为 `source = parent`，所以 `outgoers = children`。

实际是反过来：**`incomers = children`**。

### 第三阶段：修复 + 验证

```diff
- node.outgoers('node').forEach((child) => { ... });
+ node.incomers('node').forEach((child) => { ... });
```

修复后：

```
incomers of book-y2            → [sec-y2-01, ...]   ✓ children
incomers of concept-exam-system → [book-y1, y2, y3, y4] ✓ children
getStrictDescendants('book-y2') → {book-y2, sec-..., ch-..., ...}  ✓
```

进度条恢复成 book-y2 子树里 cls-structure 的实际数量。

### 第四阶段：还有一处隐含 bug——体系根 fill 类型

`concept-exam-system` 的 fill 是 `cls-concept`（概念根），档位 1（`isNodeInLevel` 只接 `cls-structure`）下**永远不可见**。

这导致：
- 漫游走完整个体系一所有 4 本教材的结构节点后，**停在 book-y4 最后一个节**——用户期望"停在体系根"。
- seq 里没有 concept-exam-system → 进度条不包含它。

修复：把 `concept-exam-system.fill` 从 `cls-concept` 改为 `cls-structure`（essence 仍为 concept，但作为体系根也承担"结构入口"角色）。这是经过用户确认的决策，详见 `ADR-0003-…`。

***

## 环境

- 浏览器：Chrome/Safari
- 功能：Tour 档位 1 漫游 + 体系边界隔离
- 相关文件：
  - `src/ui/tour-controller.ts`（`getStrictDescendants`，`pickRoot`，`detectUniverseRoot`）
  - `src/core/tour.ts`（`applyRootScope`，`TourOptions.universeNodeIds`）
  - `src/core/config.ts`（`UNIVERSE_ROOTS`）
  - `public/content/执业药师考试体系.md`（fill: cls-concept → cls-structure）

***

## 经验教训

1. **cytoscape 边方向 API 必须画图确认**——`incomers` / `outgoers` 的语义是 outgoing/incoming 边的终点，**和 source/target 是谁无关**。
2. **不要盲信 API 名字**——`.descendants()` 字面是"descendants"，但只在 compound parent 上有效，普通节点返回空。
3. **小步验证**——每个 API 替换后应该跑一次 headless cytoscape 单元测试确认 BFS 方向；这次我连续两轮都搞反方向，就是缺这一步。
4. **测试覆盖**——`build-graph.test.ts` / `tour-controller.test.ts` 应该新增"incomers/outgoers 语义"测试用例，避免回归。

***

## 相关决策

- `ADR-0003-universe-roots-作为体系边界单一来源.md`
- `ADR-0004-universe-隔离用-incomers-而不是-descendants.md`（隐含在 0003）
- `ADR-0005-concept-exam-system-改为-cls-structure-作为漫游终点.md`
