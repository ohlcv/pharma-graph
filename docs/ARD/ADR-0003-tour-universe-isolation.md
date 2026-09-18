# ADR-0003: Tour 漫游引入体系边界（universe isolation）

| 字段 | 值 |
|---|---|
| **状态** | Accepted · Implemented |
| **日期** | 2026-09-18 |
| **决策者** | 项目所有者 |
| **影响范围** | `src/ui/tour-controller.ts`、`src/core/tour.ts`、`src/core/config.ts`、`public/content/执业药师考试体系.md` |
| **修复文档** | `docs/DEBUG/debug-tour-depth1-universe-isolation.md` |

***

## 一、背景（Context）

项目从单体系（执业药师考试 4 本教材）扩展为**双体系**——新增"个人成长与生存策略"（神经多样性生存策略集合）。

Tour 漫游引擎原本只有一个隐含假设：**整张图是一棵树**，`book-y2` 默认起点，`has-dfs` 沿边遍历整张图所有节点。

双体系下，这个假设崩塌：

| 场景 | 旧行为 | 用户预期 |
|---|---|---|
| 选 book-y2 → 漫游 | 走遍整图（混播两部电视剧）| 只走体系一（执业药师）|
| 选 sum-neurodiversity → 漫游 | 走遍整图 | 只走体系二（生存策略）|
| 不选节点 → 默认起点 | 走 book-y2 → ... → 混播体系二 | 走 book-y2 → ... → 在体系一根停下 |
| 漫游到体系一末尾 | 跳到体系二的第一个节点 | **停**在体系一根（不跨体系）|

需要一套**体系边界**机制，让漫游只走"一部电视剧"。

## 二、决策（Decision）

### 决策 A：建立 `UNIVERSE_ROOTS` 常量作为体系边界的单一来源

```typescript
// src/core/config.ts
export const UNIVERSE_ROOTS: ReadonlySet<string> = new Set<string>([
  'concept-exam-system',       // 体系一：执业药师考试
  'sum-neurodiversity-p1',     // 体系二：神经多样性生存策略
]);
```

- 体系判定 = 沿父链（边方向：子→父，所以父是 outgoers）BFS 回溯，命中任一根节点
- 新增体系只需加一行 id
- 不与 frontmatter 耦合（避免 schema 检查时的循环依赖）

### 决策 B：universe 隔离 = `universeNodeIds` 机制

`TourOptions` 新增 `universeNodeIds: Set<string>`，由 `TourController.pickRoot()` 算出后传入。

```typescript
// 核心契约：universe = rootId 的 strict descendants
// 理由：选 book-y2 → universe = book-y2 子树
//       选 sec-y2-01 → universe = sec-y2-01 子树（章节级隔离）
//       不选节点 → pickDefaultRoot() 选 book-y2 → universe = book-y2 子树
// 所有"选节点 / 不选节点"走同一条路径——只算一次 rootId subtree
```

`TourEngine.applyRootScope()` 用这个 Set 过滤 seq：
- 集合为空 → 不隔离（保留 legacy 行为，用于测试场景）
- 集合非空 → seq 只保留 universe 内节点

### 决策 C：`getStrictDescendants` 用 `incomers('node')` BFS，不用 `.descendants()`

cytoscape 边方向：**source = child, target = parent**（参见 `ADR-0001`）。

| API | 在我们的图里 = ? |
|---|---|
| `.descendants()` | ❌ 只对 compound parent，普通节点返回空 |
| `.children()` | ❌ 同上 |
| `.outgoers('node')` | ❌ 是 parent（target = parent）|
| `.incomers('node')` | ✅ 是 children（source = child）|

正确实现：
```typescript
private getStrictDescendants(nodeId: string): Set<string> {
  const set = new Set<string>([nodeId]);
  const queue: string[] = [nodeId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    this.cy.getElementById(cur).incomers('node').forEach((child) => {
      if (!set.has(child.id())) { set.add(child.id()); queue.push(child.id()); }
    });
  }
  return set;
}
```

### 决策 D：`concept-exam-system.fill` 从 `cls-concept` 改为 `cls-structure`

体系根本质上是"结构入口"——它把分散的 4 本教材组织成"一个体系"，从用户视角它就是顶层结构节点。

`isNodeInLevel`（档位判定）只看 `cls-structure`，档位 1（结构档）漫游必须能访问到体系根，否则：
- 漫游走完 4 本教材的结构后**停在 book-y4 最后一个节**（突兀）
- 进度条**不包含**体系根
- 用户看不到"我走完了体系一"的视觉锚点

修改：
```diff
  edges_out: []
- fill: cls-concept
+ fill: cls-structure
```

`essence: concept` 保留——概念语义不变，只是 fill 标记为结构（让它在档位 1 下可见）。

## 三、不选方案

### 不选 A：用 cytoscape compound parent 表达体系

如果把 `concept-exam-system` 设为 `compound: true` 的 compound parent，下面的书/章/节作为它的 compound children——可以直接用 `.descendants()`。

- ❌ 我们已经有 ~1000+ 节点，重新拓扑化工程量大
- ❌ compound parent 在 cytoscape 布局里有特殊行为（影响 euler / breadthfirst 排版）
- ❌ 与现有"边表达层级"的模型冲突（`ADR-0001` 已经确立 `isa` 方向）

### 不选 B：在 frontmatter 给每个节点加 `universe` 字段

```yaml
data:
  universe: exam-system
```

- ❌ 数据冗余：父链已经隐含了这个信息
- ❌ 内容作者要维护额外字段（容易漏填、出错）
- ❌ 新增体系需要批量改 frontmatter

### 不选 C：让 `concept-exam-system` 保留 `cls-concept`，档位判定上特判它

```typescript
if (level >= 1 && (fill === 'cls-structure' || id === 'concept-exam-system')) return true;
```

- ❌ 把"体系根"硬编码进档位判定，违反 fill-based 分层原则
- ❌ 体系二根 `sum-neurodiversity-p1`（fill=cls-summary）也会有同样问题，需要逐一特判
- ❌ 后续每个体系根都要改这里

### 不选 D：进度条不显示体系根（"结构"不含根")

- ❌ 用户测试点 4 明确要求"漫游末尾 = 体系根高亮"
- ❌ 没有视觉锚点，漫游"走完"没感觉

## 四、后果（Consequences）

### 正面

- ✅ 漫游只走一个体系，跨体系不混播
- ✅ 进度条 = 选中节点子树大小（语义直观）
- ✅ 档位 1 漫游体系一末尾 = 停在体系根（视觉锚点清晰）
- ✅ 选节点 / 不选节点走同一套路径（无分支）
- ✅ 新增体系只需 `UNIVERSE_ROOTS` 加一行

### 负面 / 风险

- ⚠️ `getStrictDescendants` 用 `incomers` BFS——**O(节点数 × 子孙数)** 走完全图；体系一大约 ~600 节点，秒级无压力；超过 ~5000 节点需要优化（考虑用 memoization 或反向邻接表）
- ⚠️ `concept-exam-system` 改了 fill=cls-structure 后，在视觉上会显示为结构色（柔奶杏粉五边形）。如果未来想要"体系根有独立视觉标识"，需要新增 fill（如 `cls-system-root`）并扩 isNodeInLevel / UNIVERSE_ROOTS 的判定
- ⚠️ `UNIVERSE_ROOTS` 是常量，新增体系需要手动同步——可考虑后续从 frontmatter 扫描自动生成（启动时一次扫描）

## 五、测试覆盖

- `src/core/tour-engine.test.ts` 23 个测试 ✅
- `src/ui/tour-controller.test.ts` 15 个测试 ✅
- 新增建议（未实施）：headless cytoscape 单元测试 `incomers vs outgoers` 语义，防止回归

## 六、相关 ADR

- `ADR-0001-层级关系统一使用isa方向.md`——确立了"子→父"边方向，是 `incomers` 选型的依据
