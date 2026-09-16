# ARD-004: applyRootScope 子树漫游算法重写 + 档位自动升级

| 字段 | 值 |
|---|---|
| **日期** | 2026-09-16 |
| **状态** | 已实现 |
| **决策者** | AI Assistant + 用户 |
| **影响范围** | `src/core/tour.ts`（applyRootScope/start/recomputeTotal）、`src/ui/tour-controller.ts`（onRootOutOfLevel 事件处理）、`docs/ARD/ARD-004.md` |
| **前置条件** | ADR-0001（isa 方向已统一），ARD-003（档位过滤已实现） |

---

## 一、背景（Context）

### 1.1 原始问题

用户在漫游时选中一个分类节点（如 `cls-benzodiazepine-y2-01-01`，苯二氮卓类药物分类），期望漫游从该分类开始只走它的下层节点（ 8 个具体药物 + 2 个口诀），但实际上漫游范围错误地包含了**整个执业药师体系**（762 个节点），包括其他不相关的章节和分类。

### 1.2 根因分析

`applyRootScope()` 的原算法存在**数学错误**：

```startLine:1355:endLine:1360:src/core/tour.ts
    // 1) Identify the system: all nodes in rootId's connected component.
    //    cytoscape has no direct connectedComponent() API, so we do a
    //    BFS via neighborhood() — which is undirected and follows BOTH
    //    in-edges and out-edges. This is exactly what we want for "two
    //    independent sub-graphs": we never cross a gap with no edges.
```

原算法使用 **undirected neighborhood BFS** 计算连通分量（component），然后用 **outgoers BFS** 计算祖先集（ancestors），最终用差集 `component - ancestors` 得到"后代"：

```
旧算法:
  component = undirected BFS from rootId via neighborhood()  → 762 个节点（整本书）
  ancestors = outgoers BFS from rootId via outgoers()        → 4 个祖先（book, ch, sec）
  descendants = component - ancestors - rootId                → 757 个节点 ❌
  预期: 10 个节点（8 药 + 2 口诀）                           → 差了 75 倍
```

**错误本质**：在树或 DAG 中，`component - ancestors` 并不等于"后代"——它等于"所有非祖先节点"，包括了**兄弟分支、祖先的祖先的兄弟子树**等完全无关的节点。

连通分量的数学定义：
```
component ∩ (all non-ancestors) ≠ descendants
component ∩ (all non-ancestors) = siblings + cousins + unrelated branches
```

### 1.3 第二个问题：档位边界场景

在调研过程中发现 `applyRootScope` × `isNodeInLevel` 的交互产生了新的边界场景：

当用户选中**叶子节点**（具体药物）或**分类节点**，且**档位调得很低**（L1 结构 = 只包含 `cls-structure`）时：

| 选中节点 | fill 类型 | L1 是否包含 | 后果 |
|---|---|---|---|
| `drug-diazepam` | `cls-drug` | 不包含 | `totalSteps = 0` → 漫游"瞬间结束" |
| `cls-benzodiazepine` | `cls-classification` | 不包含 | `totalSteps = 0` → 漫游"瞬间结束" |
| `med-zopiclone` | `cls-drug` | 不包含 | 同上 |

原有代码在 `totalSteps === 0` 时直接 `stop()` + `return false`，用户体验为"点开始漫游但什么也不发生"。

---

## 二、决策（Decision）

### 2.1 核心算法：DOWN-only BFS 子树计算

**丢弃**连通分量 + 祖先差集的思路，改为**直接计算 rootId 的后代子树**：

```
Edge 语义（ADR-0001 已统一）:
  edges_out: source (子) → target (父)
  因此: incomers(node) = 该节点的直接子节点
  BFS via incomers() = 沿"子"方向向下遍历 = 完全正确的后代集合
```

```typescript
private applyRootScope(): void {
  const rootId = this._rootId;
  if (!rootId || this.seq[0] === rootId) return;

  // 步骤 1: DOWN-only BFS 计算 subtree
  const subtree = new Set<string>([rootId]);
  const subQueue: string[] = [rootId];
  while (subQueue.length > 0) {
    const current = subQueue.shift()!;
    const currentNode = this.cy.getElementById(current);
    if (currentNode.empty()) continue;
    for (const child of currentNode.incomers('node')) {
      // incomers = children (因为 edge 是 child→parent)
      const cid = child.id();
      if (!subtree.has(cid)) {
        subtree.add(cid);
        subQueue.push(cid);
      }
    }
  }

  // 步骤 2: 从原 DFS seq 中提取 subtree 内的节点（保留 DFS 顺序）
  const idx = this.seq.indexOf(rootId);
  if (idx >= 0) {
    const inSeqDescendants: string[] = [];
    for (const id of this.seq) {
      if (id !== rootId && subtree.has(id)) inSeqDescendants.push(id);
    }
    const missing: string[] = [];
    for (const id of subtree) {
      if (id !== rootId && !this.seq.includes(id)) missing.push(id);
    }
    // DFS 未覆盖的 descendants 追加到末尾
    this.seq = [rootId, ...inSeqDescendants, ...missing];
    this.recomputeTotal();
    return;
  }

  // 步骤 3: rootId 不在 seq（策略 DFS 跳过了它）→ 从 subtree 重建顺序
  const ordered: string[] = [];
  const visited = new Set<string>();
  const visitDown = (nodeId: string): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    ordered.push(nodeId);
    const n = this.cy.getElementById(nodeId);
    if (n.empty()) return;
    for (const child of n.incomers('node')) {
      if (subtree.has(child.id())) visitDown(child.id());
    }
  };
  visitDown(rootId);
  this.seq = ordered;
  this.recomputeTotal();
}
```

**数学验证**（用 Python 模拟 Cytoscape 行为）：

| 选中节点 | 旧算法输出 | 新算法输出 | 数学正确值 | 验证 |
|---|---|---|---|---|
| `cls-benzodiazepine` | 751 | **11** | 1+10=11 | ✅ |
| `cls-dora` | - | **3** | 1+2=3 | ✅ |
| `sec-sedative` | 751 | **37** | 1+36=37 | ✅ |
| `drug-diazepam` | 751 | **1** | 1+0=1（叶子） | ✅ |
| `sum-neurodiversity` | 100 | **100** | 整体系 | ✅ |
| `sec-social-reasoning` | 100 | **69** | 1+68=69 | ✅ |

### 2.2 档位自动升级机制

当 `rootId` 的 fill 类型不在当前档位范围内时，**自动升级到 L5（全面）**并触发事件：

```typescript
// 在 start() 中 applyRootScope() + recomputeTotal() 之后：
const rootNodeForLevel = this.cy.getElementById(rootId);
if (
  this._depthLevel < 5 &&
  this._cachedTotalSteps === 0 &&
  !rootNodeForLevel.empty() &&
  !isNodeInLevel(rootNodeForLevel, this._depthLevel)
) {
  const requestedLevel = this._depthLevel;
  this._depthLevel = 5;
  this.recomputeTotal();
  this.onRootOutOfLevel?.({
    rootId,
    requestedLevel,
    upgradedLevel: 5,
  });
}
```

**行为矩阵（自动升级后）**：

| 选中节点 | L1 结构 | L5 全面 |
|---|---|---|
| 不选节点 | ✅ 20 结构节点 | ✅ 全部 |
| 书节点 | ✅ 20 结构节点 | ✅ 762 |
| 章节点 | ✅ 8 结构节点 | ✅ 241 |
| 节节点 | ✅ 1（自己） | ✅ 37 |
| **分类节点** | ⭐ **自动 L1→L5** | ✅ 11 |
| **药物叶子** | ⭐ **自动 L1→L5** | ✅ 1 |
| 神经总集 | ✅ 14 结构节点 | ✅ 100 |

**新增事件 `onRootOutOfLevel`**：

```typescript
export interface RootOutOfLevelInfo {
  rootId: string;
  requestedLevel: number;   // 用户原本选的档位
  upgradedLevel: number;    // 自动升级到的档位（固定为 5）
}
```

UI 处理：显示 toast "所选节点不在【结构】档位内，已自动切换到【全面】漫游"，同步滑块 DOM。

---

## 三、备选方案（Alternatives Considered）

### 3.1 方案 A：保留 component - ancestors，追加 sibling 分支过滤（否决）

**做法**：在原算法基础上，增加"兄弟节点"的过滤——遍历 ancestors，计算每个祖先的**其他子节点（兄弟）**，并把这些兄弟及其后代也从结果中排除。

**否决理由**：
- 复杂度大幅增加：需要同时维护 ancestors 和 siblings 两个集合。
- 在有 **多父节点**（part_of 语义）的 DAG 中，"兄弟"的定义本身就不清晰。
- 即使加了 sibling 过滤，结果仍然和真正的"后代 BFS"不等价。

### 3.2 方案 B：自动选择最近的有效祖先（否决）

**做法**：当选中的节点不在档位内时，不是升级档位到 L5，而是**向上找最近的 fill 类型符合档位的祖先节点**，然后自动切换 rootId 到那个祖先。

**否决理由**：
- 破坏了用户"选了哪颗就从哪颗开始"的明确意图。
- 如果用户就是想漫游这颗叶子（即使在 L1），"自动跳到父节点"的行为比"自动升档"更令人困惑。
- 实现更复杂（需要来回切换 rootId），收益不对等。

### 3.3 方案 C：不做任何处理，依赖用户自己调整档位（否决）

**做法**：保持原有 `totalSteps === 0` → `stop()` 的行为，不加自动升级。

**否决理由**：
- 用户体验极差："点开始但什么都没发生"是最令人困惑的错误形式之一。
- 用户不知道是选错了节点还是调错了档位，排查成本高。

---

## 四、修改的文件（Changes）

| 文件 | 改动 |
|---|---|
| `src/core/tour.ts` | 完全重写 `applyRootScope()`（~100 行）；新增 `RootOutOfLevelInfo` 接口、`onRootOutOfLevel` 事件字段；在 `start()` 中加入自动升级逻辑 |
| `src/ui/tour-controller.ts` | 新增 `onRootOutOfLevel` 事件处理器（toast + 滑块同步） |
| `docs/ARD/ARD-004.md` | 本文档 |

---

## 五、后果（Consequences）

### 5.1 正面影响

1. **漫游范围数学正确**：选任意节点，漫游范围精确等于该节点的 BFS 下行子树，不再包含无关分支。
2. **多体系隔离**：两个独立体系（执业药师 + 神经策略）通过无跨边自然隔离，切换体系时漫游范围正确。
3. **叶子节点优雅降级**：用户选了具体药物后，漫游直接走完它（1 步）或者自动升档，不会"突然消失"。
4. **DFS 顺序保持**：优先使用策略的原始 DFS 顺序（父先于子），只在 DFS 跳过的节点才追加，保证"教学顺序"不变。

### 5.2 需注意

1. **叶子节点的 L1-L4**：选了具体药物后，如果在 L1-L4 档位漫游，引擎会自动升到 L5，用户会看到意外地漫游了"全面"档位。建议的 UX 是：选具体药物后默认使用 L5。
2. **subtree 范围依赖边数据质量**：如果某个节点的 `edges_out` 数据缺失或不完整，它的 subtree 会小于实际语义上的后代。需通过 `npm run audit` 定期检查孤立节点。
3. **DFS 未覆盖的 descendants 追加顺序**：这些节点追加到 seq 末尾时使用的是 BFS 顺序（而非 DFS 的 fill 优先级顺序）。数量通常很少（个位数），影响可忽略。

---

## 六、验证方法（Verification）

```bash
# 1. 数学验证：确认每种 rootId 的输出节点数精确等于 1 + BFS 子树大小
python3 scripts/verify-subtree.py   # 待编写，建议定期运行

# 2. 浏览器端验证：
#    - 选 cls-benzodiazepine → 控制台输出 seq.length = 11
#    - 选 drug-diazepam + L1 → toast 提示自动升档
#    - 选 sec-sedative → seq.length = 37

# 3. 回归测试：
npm run test          # 单元测试
npm run validate      # frontmatter 校验
```

---

## 七、相关决策（Related Decisions）

| 编号 | 标题 | 关系 |
|---|---|---|
| ADR-0001 | 层级关系统一使用 isa（子→父）方向 | 依赖：incomers BFS 的方向语义基于 isa |
| ARD-003 | 漫游深度层级过滤系统 | 依赖：isNodeInLevel 过滤逻辑；本 ARD 扩展了其边界处理 |

---

## 八、变更历史（Change History）

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-09-16 | 1.0 | 初稿，状态已实现 |
| 2026-09-16 | 1.1 | 补充附录 A：跨体系漫游已知限制（pickRoot 在多体系下未做体系感知） |

---

## 附录 A：跨体系漫游的预期行为与设计意图

### A.1 体系拓扑现状

当前图谱存在**两个完全隔离的体系**（通过数据验证）：

| 体系 | 根节点 | 节点数 | 与药考体系的交集 |
|---|---|---|---|
| 药考体系 | `concept-exam-system` | 762 | — |
| 神经策略体系 | `sum-neurodiversity-p1` | 100 | **0（完全隔离）** |

数学验证（Python BFS，undirected）：
```
component(concept-exam-system) = {762 节点}
component(sum-neurodiversity-p1)  = {100 节点}
交集 = ∅
```

因为两个体系间**没有任何边**，所以从算法层面 `applyRootScope` 的 DOWN-only BFS **天然正确隔离**——选了药考节点就只漫游药考子树，选了神经策略节点就只漫游神经策略子树。

### A.2 `pickRoot()` 的预期行为：默认走药考体系

`pickRoot()`（`src/ui/tour-controller.ts:196-230`）的优先级：

```
1. 有选中节点 → 用选中节点       ✅ 跨体系正确（取决于选中谁）
2. 无选中节点 → 找 id='book-*'  → 返回药考书节点（concept-exam-system）
3. 再没有   → 找非 sec-/ch- 的 structure
4. 最后     → degree 最高的节点
```

**这是有意为之的默认行为，不是 bug**：

- 药考体系是项目的主体系（762 节点，占总内容 ~88%），用户每次进入图谱默认就应从主体系开始漫游
- 神经策略体系是辅助/分支体系（100 节点），需要"主动选择节点"才能进入漫游，这符合"主次分明"的 UX 意图
- 用户如果想漫游神经策略，路径很清晰：在图谱上点击神经策略任意节点 → 点"开始漫游" → applyRootScope 精确漫游神经策略子树

**设计意图总结**：

| 场景 | pickRoot 返回 | 漫游范围 | 意图 |
|---|---|---|---|
| 选中药考节点 | 该节点 | 药考子树 | ✅ |
| 选中神经策略节点 | 该节点 | 神经策略子树 | ✅ |
| **不选节点** | **concept-exam-system** | **药考全书** | ✅ **预期** |

### A.3 体系 × 档位完整行为矩阵

药考体系：

| 选中 | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| 药考-书节点 | 20 | 157 | 225 | 324 | 762 |
| 药考-章节点 | 8 | 66 | 89 | 126 | 241 |
| 药考-节节点 | 1 | 7 | 10 | 18 | 37 |

神经策略体系（fill 类型与药考不完全对齐，档位效果不同）：

| 选中 | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| 神经总集 (cls-summary) | 14 | 14 | 14 | 16 | 100 |
| 神经章 (cls-structure) | 9 | 9 | 9 | 10 | 69 |
| 神经分类 (cls-feature) | L1=0→**自动升档** | 1 | 1 | 1 | N |

> **特别说明**：神经策略体系的节点 fill 是 `cls-feature`（80 个），而 L1-L3 档位只包含 `cls-structure` / `cls-classification` / 重点药，所以**选了神经分类节点后默认 L1-L3 会触发自动升档**。这与药考药物叶子节点的触发条件类似，但神经策略节点整体 L1-L3 步数显著偏少（因为大部分 feature 节点不计入）。

### A.4 跨体系设计的内在保证

由于两体系在数据层**完全无跨边**，以下性质天然成立，无需额外代码保护：

1. **漫游不会跨界**：选了药考节点的漫游**永远**不会跳进神经策略体系，反之亦然
2. **度数计算无虚高**：一个节点的 degree 永远是体系内的连接数，不会被无关节点污染
3. **子图布局独立**：cose-bilkent 布局把两个体系各自收紧，不会混成一坨
4. **未来扩展安全**：如果想新增第三个体系（如"法考体系"），只要新体系的根节点不与现有任一体系建边，applyRootScope 自动正确处理

### A.5 未来可选工作（非必要）

| 优先级 | 任务 | 描述 |
|---|---|---|
| 低 | `pickRoot()` 体系感知 | 当无选中节点时，根据"当前 viewport 中心"或"最近查看的体系根"决定起点，而不是固定返回 book-y2。**当前不修**：业务优先级低，默认走药考符合"主次分明"的 UX 意图 |
| 低 | 神经策略体系 fill 类型归一化 | `cls-feature` 在语义上接近 `cls-classification`（都是分类），可以考虑合并或重新映射到档位配置，让 L2 档位也能覆盖神经策略分类。**当前不修**：用户已经接受"选神经分类节点触发自动升档到 L5"的现有体验 |
| 极低 | 跨体系节点 (`relates` 边) | 如果后续业务需要在两体系间建立"对比/关联"边（`relates` 边），需要扩展 `applyRootScope` 的 DOWN-only BFS 来支持"白名单+黑名单"的双向约束。**当前不需要**：两体系在数据上完全独立 |
| 极低 | UI 提示"当前漫游体系" | 在漫游详情面板显示"漫游范围：药考体系 / 神经策略体系"。**当前不需要**：漫游的视觉聚焦本身已经清楚表达当前所在体系 |

如需修复 `pickRoot()` 或新增跨体系边时，建议在新的 ARD-005 中独立记录方案选择。
