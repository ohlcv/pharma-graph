# Tour 启动栈溢出（part_of 环 → RangeError）

**日期**: 2026-09-19
**状态**: ✅ 已修复（运行时护栏 + 测试夹具）
**严重等级**: High（一旦触发，漫游功能完全不可用）

---

## 问题描述

控制台报：

```
cytoscape.js?v=32fd14ea:8543 Uncaught RangeError: Maximum call stack size exceeded
    at Element.id (cytoscape.js?v=32fd14ea:8543:17)
    at collectTree (tour.ts:663:67)
    at collectTree (tour.ts:663:53)
    ...
    × 200+ 次
```

触发场景：在漫游 `has-dfs` 策略下，当 `content/*.md` 里存在 **part_of 自环或相互环** 时，启动 tour 直接栈溢出崩浏览器 Tab。

附带出现的其他 console 噪声（同一会话一次性记录）：

| # | 类型 | 来源 | 是否本次修复 |
|---|---|---|---|
| 1 | 🔴 RangeError | tour.ts:663 `collectTree` 递归 | **是**（主因）|
| 2 | 🟡 Warning | renderer.ts:132 `'ghost': true` is invalid | 是 |
| 3 | 🟡 Warning | renderer.ts:136 `'ghost-scale': 1` is invalid | 是 |
| 4 | 🟢 Info | `custom wheel sensitivity` | 否（仅信息提示）|
| 5 | ⚪ Noise | `Permissions policy: unload` | 否（Chrome 扩展）|
| 6 | ⚪ Noise | `Chrome's Built-In AI` | 否（浏览器特性）|

---

## 根因分析

### 1. `collectTree` 是死代码，且无环防护（tour.ts:660-664）

```typescript
// 原代码（已删）
const allStructures = nodes.filter((n) => (n.data('fill') as string) === 'cls-structure');
const collectTree = (parentId: string) => {
  for (const k of children.get(parentId) ?? []) collectTree(k.id());
};
// 第一步：
for (const s of allStructures) collectTree(s.id());   // ← line 698，纯副作用 0
```

**两个问题叠加**：

1. **返回值未被使用**：line 698 调它但**不写入 `result`**，仅靠 line 709-714 的 `dfsChildren` 真正收集。所以这一调用本身**完全无用**。
2. **无环防护**：`collectTree` 不写 `visited`，不写 `walking`，纯递归——一旦 `children[parentId]` 有环，无限递深直到栈底。

### 2. `dfsChildren` 仅在 push 前查 visited（tour.ts:671-693）

```typescript
// 原代码
const dfsChildren = (parentId: string) => {
  for (const fill of FILL_VISIT_ORDER) {
    const kids = (children.get(parentId) ?? []).filter(...);
    for (const k of kids) {
      if (!visited.has(k.id())) {     // ← 仅 push 前查
        visited.add(k.id());
        result.push(k.id());
      }
      dfsChildren(k.id());             // ← 递归本身不拦截！即使 visited 也会继续
    }
  }
  // ...
};
```

**关键**：环上的节点 A 第一次 push 进 `visited` 后，`children.get(A)` 里仍含 B（环另一端）——递归进入 B，B 的 `children` 仍含 A → **栈溢出**。

`visited` 的语义是"已经 emit 到 result"——它**不能**用来防递归深度（防环），两者职责不同。

### 3. 为什么图里会出现环

理论上 `part_of` 应是 DAG（章节→小节→药→口诀）。但实际上 `part_of` 边可被任意 .md 文件的 frontmatter 定义，存在以下污染途径：

| 路径 | 概率 |
|---|---|
| 用户手填 `edges_out` 时把 source/target 写反（建反向自环）| 高 |
| 复制粘贴时漏改 id | 中 |
| 重命名节点时忘了同步引用 | 中 |
| 子节点文件复制到错位置（如 `01 节` 的内容搬到 `02 节` 下没删原 file）| 高 |

**诊断方法**：先打开 `content/个人成长与生存策略/` 里的 .md，搜 `part_of` 找候选。

---

## 修复方案

### 修复 1：删除死代码 `collectTree` + `dfsChildren` 加 walking 灰色节点集

**核心**：增加 `walking: Set<string>`，区分于全局 `visited`：

| 集合 | 生命周期 | 防什么 |
|---|---|---|
| `visited` | 跨 DFS 调用持久 | 同一节点在 result 里重复 emit |
| `walking` | **仅当次 DFS 路径**（try/finally cleanup）| 同一节点在同一条 DFS 路径上二次进入（= 环）|

```typescript
const walking = new Set<string>();
let cycleWarned = 0;
const warnCycle = (id: string) => {
  if (cycleWarned >= 3) return; // 限流
  cycleWarned++;
  console.warn(
    `[tour.has-dfs] cycle detected at "${id}". ` +
      `Skipping this DFS branch to avoid stack overflow. ` +
      `Inspect build-graph / frontmatter.part_of for the loop.`,
  );
};

const dfsChildren = (parentId: string) => {
  if (walking.has(parentId)) { warnCycle(parentId); return; }   // ← 环剪枝
  walking.add(parentId);
  try {
    // ... fill-order DFS ...
  } finally {
    walking.delete(parentId);  // 离开时清理，允许兄弟分支再访问
  }
};
```

**为什么不用 `visited` 防环**：

- `visited` 一旦被环上节点填入，**整个环的所有节点都不再被 DFS**——会丢失大量正常节点
- `walking` 是"本次路径"灰色节点，离开路径就清除——兄弟分支可正常访问

### 修复 2：删除 renderer.ts 的无效 `ghost*` 样式

cytoscape **没有** `ghost` / `ghost-offset-x` / `ghost-offset-y` / `ghost-opacity` / `ghost-scale` 这几个样式属性。光晕完全靠 `outline-width` / `outline-opacity` 的呼吸动画驱动。

修改点：

```diff
// renderer.ts glowStrokeRule (line 117-142)
- // ── ghost 三层叠加（模拟模糊光晕）────────────────────────────────────
- 'ghost': true,
- 'ghost-offset-x': 0,
- 'ghost-offset-y': 0,
- 'ghost-opacity': 0.28,
- 'ghost-scale': 1,
- 'transition-property': 'border-color, outline-color, outline-opacity, ghost-opacity, border-width, outline-width',
+ // 注：cytoscape 没有 'ghost' / 'ghost-scale' 等样式属性；之前 4 行是无效死代码，
+ //     已删除。光晕完全由 outline-width / outline-opacity 的呼吸动画驱动。
+ 'transition-property': 'border-color, outline-color, outline-opacity, border-width, outline-width',
```

```diff
// renderer.ts startGlowAnimations (line 542)
- glowNodes.style('ghost-opacity', 0.28 + 0.10 * sine);
  glowNodes.style('outline-opacity', 0.35 + 0.10 * sine);
  glowNodes.style('outline-width', 6.5 + 1.5 * sine);
```

同时同步清理注释 / `glowSubtreeRules` 里的 `ghost-opacity` 引用——避免误导后人。

---

## 测试夹具

新增 `src/core/tour-engine.test.ts` 一组 4 个 cycle 防御测试：

| 测试 | 构造 | 期望 |
|---|---|---|
| `survives a self-loop (A→A)` | A 自环 + B 正常挂在 A 下 | 不抛、无重复、含 A 和 B、warn 被调 |
| `survives a 2-cycle (A↔B)` | A↔B 互环 | 同上 |
| `survives a 3-cycle + unrelated tree` | A→B→C→A + D 挂在 A 下 | D 仍可达（关键：环外不丢）|
| `warn is rate-limited to 3 messages` | 5 个自环 | warn 调用 1-3 次，不淹没控制台 |

**核心验收点**：第 3 个测试——`D` 挂在 `A` 下（A 在环里），验证 `walking` 设计正确，**不会因为环丢失环外可达节点**。

```typescript
expect(seq).toContain('D'); // 环外的节点仍被访问到（关键）
```

---

## 验证结果

```
✓ src/core/tour-engine.test.ts (27 tests) 16ms
  含 4 个新 cycle 防御用例，全部通过

Test Files  1 passed (1)
     Tests  27 passed (27)
```

整套测试：302/303 通过。唯一失败是 `location-audit` 测到 `00 阅读指南.md` 缺 `id` 字段——属 pre-existing 数据问题，与本次修复无关。

类型检查：`src/core/tour.ts` + `src/core/renderer.ts` **零 TS 错误**。

---

## 后续可改进（未做）

1. **build-graph.ts 阶段校验**：在边入图前做 DFS 环检测（white/gray/black 三色标记），污染数据在 graph 阶段就被拒绝，根本不会到 tour 阶段。
2. **可视化工具**：在 debug 面板加一个"列出 part_of 环"按钮，方便用户快速定位脏 .md 文件。
3. **`00 阅读指南.md` 跳过审计**：当前它是文档不是节点，应该让 location-audit 跳过它。

---

## 相关代码位置

- `src/core/tour.ts:660-738` — has-dfs 策略 + `dfsChildren` 修复
- `src/core/renderer.ts:117-155` — glow 样式（删除无效 ghost*）
- `src/core/renderer.ts:520-547` — glow 呼吸动画（删除 ghost-opacity 引用）
- `src/core/tour-engine.test.ts:580-697` — 4 个 cycle 防御测试

## 相关 ADR

- ADR-0001: 层级关系统一用 `isa` 边（part_of / subclass_of 的边界）
- ADR-0003: tour universe 隔离（`getStrictDescendants` 用 `incomers` 而非 `outgoers`）
