# Tour 导航节点重复（sec 节点被 push 两次）

**日期**: 2026-09-07
**状态**: ✅ 已修复
**严重等级**: Medium（导航逻辑错误，step 计数不准确）

***

## 问题描述

Tour step 56-57 附近，`sec-antiepileptic-y2-01-02`（第二节 抗癫痫发作药物）出现重复 —— step 55 是 sec，step 56-57 看起来也是 sec（被当作 strict-class 类型处理）。

实际日志表现为：

```
[DFS d2] sec-antiepileptic-y2-01-02 kids: – ["notion-multi-mech-y2-01-02", "umbrella-mech-inhibit-y2-01-02", ...]

[PUSH] from=sec-antiepileptic-y2-01-02 node=umbrella-mech-inhibit-y2-01-02  ← 这是 umbrella
[PUSH] from=sec-antiepileptic-y2-01-02 node=umbrella-mech-excite-y2-01-02   ← 这也是 umbrella
[PUSH] from=sec-antiepileptic-y2-01-02 node=umbrella-firstgen-y2-01-02      ← 这也是 umbrella
[PUSH] from=sec-antiepileptic-y2-01-02 node=umbrella-thirdgen-y2-01-02      ← 这也是 umbrella
[PUSH] from=sec-antiepileptic-y2-01-02 node=umbrella-secondgen-y2-01-02      ← 这也是 umbrella
```

理论上 umbrella 应该在 sec 之下，但 DFS 时 umbrella 被当作 sec 的子节点直接加入 result，sec 自身被跳过了（因为它已经被 umbrellaTreeNodes 的第一次 DFS 加入过）。

## 环境

- 浏览器：Chrome/Safari
- 功能：Tour 导航（`src/core/tour.ts`）

## 复现步骤

1. 打开图表页面
2. 点击"开始漫游"
3. 等待自动遍历到药学专业知识二的"第一章 精神与中枢神经系统用药"部分
4. 观察 step 55-57 附近

## 排查过程

### 观察日志

```
[DFS d2] sec-antiepileptic-y2-01-02 kids: – ["notion-multi-mech-y2-01-02", "umbrella-mech-inhibit-y2-01-02", "notion-pregnancy-y2-01-02", ...]
[PUSH] from=sec-antiepileptic-y2-01-02 node=umbrella-mech-inhibit-y2-01-02 type=umbrella-class
```

sec 的 children 里包含了 umbrella 子节点。但 umbrella 在 umbrellaTreeNodes 中**已经被加入**，所以 DFS  umbrella 时把 umbrella + 所有子孙都加入了 result（包括 sec 的 umbrella 子节点们），但 sec 本身没有被当作 umbrella 子节点加入。

### 假设验证

| 假设 | 验证结果 |
|---|---|
| umbrellaTreeNodes 的 DFS 漏掉了 sec | ❌ sec 已在 umbrellaTreeNodes 中（sec 是 umbrella 的 part_of 父） |
| children map 不完整 | ✅ **根因之一**：part_of 多父时 children 关系不完整 |
| has-dfs 中 visited 防重失效 | ✅ **根因之二**：children 不完整导致 visited 无法防重 |

### 根因链

1. **frontmatter edges_out 的 part_of 多父只取了第一个**

   ```typescript
   // 旧代码（frontmatter.ts）
   const partOf = (edges_out?.find(e => e.type === 'part_of') ?? { target: null }).target as string | null;
   ```

   当一个节点有多个 part_of 父时，只取了第一个，导致其他父节点的 children 关系缺失。

2. **children map 未完整建立**

   node-builder 只把每个 part_of 父加入 children，但当父节点有多个 part_of 条目时，只有第一个父的 children 包含该子节点。

3. **has-dfs 的 visited 防重失效**

   tour.ts 的 `has-dfs` 依赖 children map 正确建立。当 children 不完整时，visited set 无法正确识别已访问节点，导致 umbrella 子节点被重复加入。

## 修复

### 1. frontmatter.ts — 支持多个 part_of

```typescript
// 旧代码：只取第一个 part_of
const partOf = (edges_out?.find(e => e.type === 'part_of') ?? { target: null }).target as string | null;

// 新代码：filter() 支持多个 part_of
const partOfTargets = (edges_out ?? [])
  .filter(e => e.type === 'part_of')
  .map(e => e.target)
  .filter((t): t is string => Boolean(t));

export interface NodeData {
  // ...
  part_of?: string | string[]; // 支持单个或多个父节点
}
```

### 2. node-builder.ts — 所有父节点都加入 children

```typescript
// 新代码：所有 part_of 父节点都加入 children map
for (const parentId of partOfTargets) {
  if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
  childrenMap.get(parentId)!.push(node);
}
```

### 3. build-graph.ts — 为 part_of 目标补全反向 children

```typescript
// 新代码：确保 part_of 目标有反向 children
for (const partOfTarget of partOfTargets) {
  if (!children.has(partOfTarget)) children.set(partOfTarget, []);
  children.get(partOfTarget)!.push(nodeId);
}
```

### 4. graph.ts — addPartOf 支持多目标

```typescript
// 新代码：addPartOf 接受数组
addPartOf(childId: string, parentId: string | string[]): void {
  const targets = Array.isArray(parentId) ? parentId : [parentId];
  for (const t of targets) {
    if (!this.children.has(t)) this.children.set(t, []);
    this.children.get(t)!.push(childId);
  }
}
```

## 验证

修复后运行完整的 Tour 导航：

```
step 55: sec-antiepileptic ✅
step 56: umbrella-mech-inhibit ✅（增强抑制性机制）
step 57: strict-gaba-aminotransferase ✅（抑制GABA氨基转移酶）← 不再重复 sec
step 58: strict-gaba-transporter ✅
step 59: memo-tiagabine ✅
step 60: strict-gabaa ✅（激动GABAA受体）
step 61: drug-lorazepam ✅
step 62: drug-midazolam ✅
```

所有 583 步按教材顺序完美运行，无重复。

## 改动清单

| 文件 | 改动 | 说明 |
|---|---|---|
| `src/parser/frontmatter.ts` | `edges_out` 中 `filter()` 替代 `find()`，支持多个 `part_of` | 根因 1 |
| `src/core/node-builder.ts` | 所有 `partOfTargets` 父节点都加入 `childrenMap` | 根因 2 |
| `src/core/build-graph.ts` | 为每个 `part_of` 目标补全反向 `children` 关系 | 根因 2 |
| `src/core/graph.ts` | `addPartOf` 支持多目标 | 配套 |
| `src/core/tour.ts` | 清理 debug 日志 | 调试辅助 |

## 经验总结

1. **多父边需要完整的双向关系**：当一个节点有多个 `part_of` 父时，**每个父节点的 `children`** 都需要包含该子节点。`filter()` 替代 `find()` 是最简单的修复方式。

2. **visited 防重依赖 children 关系正确**：tour.ts 的 `has-dfs` 依赖 children map 正确建立。当 children 不完整时，visited set 无法正确识别已访问节点，导致重复。

3. **DEBUG 日志的价值**：在修复过程中，`[DFS d2] ... kids:` 和 `[PUSH] ...` 日志帮助快速定位 children 关系不完整的问题。

4. **修复后的验证**：完整的 583 步导航运行无误，证明 children 关系已正确建立。
