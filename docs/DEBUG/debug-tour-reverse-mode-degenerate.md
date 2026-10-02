# Reverse 漫游退化成 Forward —— 根因是 universe 边界定的太"窄"

> 状态：**已修复**（2026-10-02）
> 关联文档：[`ADR-0003`](../ADR/ADR-0003-tour-universe-isolation.md)（universe 隔离边界设计决策）
> 修复 commit：本次会话（pickRoot 改 universe 来源）

---

## 二、问题描述

用户在桌面 / 移动端漫游设置里点"倒序"按钮，预期是从 y4 药事管理与法规（章节层反序最末）开始倒序走完 4 本教材，但**实际表现是从 y2 药学专业知识二 第一章开始**，跟"顺序"按钮行为完全一样——reverse 没有退化成"没生效"，是**只在 y2 子树内章节层退化**。

| | 期望（reverse） | 实际 |
|---|---|---|
| seq[0] | 体系一最高 bookOrder 节点 | y2 第一章 |
| seq[1] | y4 章节 / y1 章节 | y2 第一章 |
| seq 长度 | 1202 节点 | 1115 节点（少 87） |

---

## 三、根因（2026-10-02 锁定）

`TourController.pickRoot()` 计算 `universeNodeIds` 时用的是 **`getStrictDescendants(candidateId)`**——即默认起点 book-y2 的子树。

当用户没选节点、`pickDefaultRoot()` 选 `book-y2`（book 优先级最高），universe 被卡在 1115 节点（book-y2 子树，y2 单本书范围内）：

```ts
// 修复前 src/ui/tour-controller.ts:551
const universeNodeIds = this.getStrictDescendants(candidateId);
```

`TourEngine.buildSequence('has-dfs', direction='reverse')` 返回 1377 节点（reverse 序：y4→y1→y3→y2）。`applyRootScope` 用 `universeNodeIds = 1115 节点` 过滤后砍掉 262 节点（y4/y1/y3 整 3 本书）。

**y2 在 reverse 序里是**最末**位**——filter 后剩下的 1115 节点**全是 y2 子树**，**位于 result 的最末段**——也就是说剩下的 1115 节点**内部相对顺序还是 forward**（y2 章节按 bookOrder + locationKey 正序排）。**跟 forward 模式产出完全相同的 seq[0..]** —— reverse 退化成 forward。

### 假设检验

最初怀疑 3 个根因（详细诊断日志附在文末 ▌）：

| 假设 | 证据 | 结论 |
|---|---|---|
| H1：`direction='reverse'` 没传到 buildSequence | log: `buildSequence.entry.direction = 'reverse'` | ❌ 排除 |
| H2：universe 过滤在 buildSequence 之前发生 | log: `buildSequence.exit.resultLen = 1377`（universe 没生效），`applyRootScope.exit.seqLen = 1115`（过滤在 applyRootScope 里） | ✅ 部分成立 |
| H3：sortedStructures reverse 没执行 | log: `preReverse.first5 = ['y2 第一章', ...]`、`postReverse.first5 = ['执业药师考试体系', 'y4 章节', ...]`——reverse 真的发生了 | ❌ 排除 |

**真正根因是 H2**：universe 在 applyRootScope 才生效，且 universe 用的是 candidateId（book-y2）的 subtree，把 y4/y1/y3 砍掉后剩下的 1115 节点内部相对顺序还是 forward——视觉上跟 forward 模式没区别。

---

## 四、修复方案

把 universe 从 `candidateId subtree` 改成 `universeRootId subtree`（体系级）。detectUniverse 不分字母时返回 null（孤悬节点 / 测试环境）→ 回退到 candidateId subtree（向后兼容）。

```ts
// src/ui/tour-controller.ts:542-558（修复后）
const universeRootId = candidateNode.nonempty() ? this.detectUniverseRoot(candidateNode) : null;

const universeNodeIds = universeRootId
  ? this.getStrictDescendants(universeRootId)  // 体系级：跨 4 本书
  : this.getStrictDescendants(candidateId);    // 回退：孤悬节点向后兼容

return { rootId: candidateId, universeRootId, universeNodeIds };
```

修复后 universe = `concept-exam-system` 子树 = 1202 节点（不是 1115），reverse 在体系级 1300+ 节点里真正反序生效。

### 副作用 / 行为差异

| 场景 | 旧（修复前） | 新（修复后） |
|---|---|---|
| 不选节点，forward | 走 book-y2 子树 1115 节点 | 走体系一 1202 节点 |
| 不选节点，reverse | 退化（退化成 forward） | ✅ 走 1202 节点反序 |
| 选 `y2-ch01`，forward | 走 ch01 | 走整个体系一（rootId 仍是 ch01） |
| 选 `y2-ch01`，reverse | 退化 | ✅ 走整个体系一反序 |
| 跨体系隔离 | ✅ | ✅ 保留（不同体系根子树互不相交） |

**核心承诺不变**：跨体系不混播、universe 仍由 `universeRootId` 决定。

---

## 五、诊断日志（核心证据摘录）

### log: `[tour-dbg] controller.start.pickRoot`（修复前）

```
{
  rootId: 'book-y2',
  universeRootId: null,               ← detectUniverseRoot 没被调用
  universeNodeIdsSize: 1115
}
```

修复后（验证用，确认 universeRootId 现在是体系根）：

```
{
  rootId: 'book-y2',
  universeRootId: 'concept-exam-system',  ← 修复后命中
  universeNodeIdsSize: 1202
}
```

### log: `[tour-dbg] strategy.has-dfs.sortedStructures.preReverse`（修复前）

```
{
  direction: 'reverse',
  first5: ['药学专业知识二', '第一章\n精神与中枢...', '第一节\n镇静...', '...'],
  totalStructures: 206
}
```

### log: `[tour-dbg] strategy.has-dfs.sortedStructures.postReverse`（修复前）

```
{
  direction: 'reverse',
  first5: ['执业药师考试体系', '第八节\n外部参考模块', '第七节\n...', ...],
  last3: ['第一节\n镇静...', '第一章\n精神与中枢...', '药学专业知识二']
}
```

→ sortedStructures reverse **真的**生效：preReverse 是 y2 在前，postReverse 是 y4 在前。

### log: `[tour-dbg] engine.applyRootScope.exit`（修复前）

```
{
  rootId: 'book-y2',
  mode: 'reverse',
  seqLen: 1115,
  rootIdIsAtIdx0: true,                                    ← mode=sequential 才 unshift；但 reverse 也没把它甩开
  seqHead3: ['药学专业知识二', '第一章\n精神与中枢...', '第一节\n镇静...'],  ← forward 序
  seqTail3: ['第七节\n妇科外用药', '第八节\n消毒防腐药', '第九节\n抗过敏药']   ← y2 中段
}
```

### log: `[tour-dbg] engine.applyRootScope.exit`（修复后）

```
{
  rootId: 'book-y2',
  mode: 'reverse',
  seqLen: 1202,
  rootIdIsAtIdx0: false,    ← reverse 模式不 unshift（by design）
  seqHead3: ['执业药师考试体系', '药事管理与法规', '药学专业知识一'],   ← y4/y1 在前 ✅
  seqTail3: ['第三节\n肿瘤化疗管理', '第四节\n肿瘤靶向治疗管理', '第五节\n肿瘤支持治疗管理']  ← y2 末尾 ✅
}
```

---

## 六、回归测试（tests/component/ui/tour-controller.test.ts）

3 个新 pickRoot 回归测试：

1. **默认起点 → universe 是体系根子树**：universeNodeIdsSize=1202，包含 book-y2/sec-y2-01/topic-y2-01-a，但**不**包含 sum-neurodiversity 子树
2. **用户选 y2-ch01 → universe 仍是体系根子树**：reverse 才能跨章节层
3. **孤悬节点 → detectUniverseRoot 返回 null → 回退到 candidateId subtree**（向后兼容）

---

## 七、后续相关 ADR / 改动

- **ADR-0003 决策 B 核心契约修订**：universe 从 `rootId subtree` 改为 `universeRootId subtree`
- **`TourEngine.applyRootScope` 不变**：seq 过滤逻辑仍然用 `universeNodeIds` Set
- **`TourEngine.setMode` 不变**：reverse / random 不 unshift（bc2b83e 已修）
- **`has-dfs.buildSequence` 不变**：reverse 章节层 + 章内正序（章内反序反人类，line 927-930 注释）

---

## 八、教训 / 复用原则

- **universe 边界应该与"体系"对齐，而不是与"用户选的节点"对齐**：体系是稳定语义边界（"两部电视剧"），用户选的节点是临时性内容；universe 该跟前者走。
- **forward vs reverse 在"小 universe"里可能完全等价**：reverse 生效需要 ≥ 2 个 book / ≥ 2 个章节层的规模；小 universe 内 reverse 退化成 forward 是设计取舍，不是 bug——但用户感知是 bug。
- **诊断"按了按钮没反应"类问题**：**先看 buildSequence 输出的 seq[0..2] 是什么**，再看 applyRootScope 过滤后变什么；先确认"策略层"有没有按用户意图排，再确认"过滤层"有没有把意图砍掉。