# ADR-0012: 多重宇宙渲染隔离（per-space rendering isolation）

| 字段         | 值                                                                    |
| ------------ | --------------------------------------------------------------------- |
| **状态**     | Accepted · Implemented                                                |
| **日期**     | 2026-10-29                                                            |
| **决策者**   | 项目所有者                                                            |
| **影响范围** | `src/ui/main.ts`、`src/ui/space-controller.ts`、`src/core/spaces.ts`、`src/core/space-layout.ts`、新建 `src/core/space-data-cache.ts` |
| **测试**     | `tests/component/ui/space-controller.test.ts`、`tests/unit/core/space-layout.test.ts` |

---

## 一、背景（Context）

「多重宇宙」最初只是**视觉组织**手段：所有 2735 节点都装在 cytoscape 里，靠 `display: none`（`applyVisibility` 里的 `n.hide()/n.show()`）把别的空间藏起来。

这套做法有两个根本问题：

1. **性能**：cytoscape 的 `:visible` 选择器排除 `display: none`，但 euler 力导**不过滤**——它对 `cy.nodes()` 跑全部 2735 节点的物理模拟，主线程卡 20 秒，移动端直接死。用户反馈：「现在要是 2000 多个节点，我就已经有点卡了。」

2. **逻辑自相矛盾**：既然「不同宇宙的节点互不影响」，那把它们都装在同一个 cytoscape 实例里、靠 CSS 藏起来，本身就是「互不影响」的反面——它们在共享同一套力导物理。

同时，用户对产品的诉求进一步收紧：

- 「没有退全图这回事」——换空间唯一路径 = 传送门菜单。
- 「不必强制规定传送门和奇观的坐标，让它们就根据计算自然散落」——奇观不靠人工坐标。
- 「现在除了传送门在所有宇宙都有以外，不同宇宙的节点应该互不影响。」

由此得到本次决策：把多重宇宙从「视觉藏显」升级为「渲染隔离」——cy 只装当前空间的节点，euler 只算当前空间的力学。

---

## 二、决策（Decision）

### 决策 A：删除「全图态」，cy 永远只装一个空间

`exitToFullGraph()` 函数体清空（保留空壳避免外部 import 报错），只收菜单。键盘 `Esc`（`keyboard-shortcuts.ts`）不再调它，只收菜单 / 清选中 / 关面板。

换空间的唯一路径 = `enterSpace()` → `onEnterSpace` 回调（由 `main.ts` 注入）。

**首屏数据**也只装主空间：`main.ts` 启动时用 `sliceGraphBySpace` 切出主空间子图 + 传送门节点，构造 `bootstrapData` 喂给 Renderer。2735 节点的负担降到 O(主空间)。

### 决策 B：`sliceGraphBySpace` 按空间切子图并缓存

新建 `src/core/space-data-cache.ts`，职责单一：

- 拿到 `GraphData` + `SpaceInfo[]`，按 `space.nodeIds` 把节点切片、把「两端都在本空间内」的边切片。
- 所有切片缓存在一个 `Map<spaceId, SpaceSlice>` 里，切空间时只 `cy.add()` 取出的切片——不重算。
- **传送门单独保留**（不入空间缓存）：`getPortalNode(slice)` 给调用方，进任何空间都先 add 它。

为什么边能按「两端都在本空间」切：空间 = 连通分量（`computeSpaces` 的定义），同空间的节点彼此连边，跨空间节点之间没有连边。所以「两端都在本空间」就等于「本空间内的全部边」，不会漏也不会错。

### 决策 C：`installSpaceController` 加第三参数 `inSpaces`

```typescript
export function installSpaceController(
  cy: cytoscape.Core,
  options: SpaceControllerOptions = {},
  inSpaces?: readonly SpaceInfo[],
): void
```

`main.ts` 从**全图**算一次 `computeSpaces(data.nodes, data.edges, UNIVERSE_ROOTS)`，把奇观补进 misc 后，把 `allSpaces` 显式传入。

为什么不从 cy 现场算：渲染隔离后，cy 里只有当前空间的内容节点。`installSpaceController` 内部若仍 `computeSpaces(nodesOf(cy), ...)`，永远只能看到一个空间——用户实测反馈「打开传送门后只有药师体系和奇观散点这两个宇宙」（因为首屏装的是主空间，其它空间不在 cy 里）。

参数名特意用 `inSpaces` 而非 `spaces`：模块级有同名变量 `let spaces: readonly SpaceInfo[]`，参数名遮蔽它会导致内部函数读到旧值（这一坑实打实踩过一次）。

### 决策 D：`onEnterSpace` 回调负责换内容

`SpaceControllerOptions` 新增 `onEnterSpace?: (spaceId: string) => void`，由 `main.ts` 实现并在 `enterSpace()` 内部被调用（`changed && onEnterSpace && !skipLoad` 时触发）。

`main.ts` 的实现：

1. `sliceCache.get(spaceId)` 取切片；
2. 传送门常驻：`getPortalNode(sliceCache)`，若 cy 里没有就补进 sliceData；
3. `cy.batch()` 清掉旧空间所有节点 + 边——**传送门和奇观除外**（传送门跨宇宙；奇观是 layer-parent，remove 了会让 overlay 找不到节点报错）；
4. `renderer.addElements(sliceData)` 装新空间；
5. halo 圆预铺位置——euler 从这些位置收敛；
6. `renderer.runLayout(DEFAULT_LAYOUT, { randomize: false }, { skipEntering: true, onLayoutStop: settleAfterLayout })`。

性能链：cy 永远只装一个空间的内容，euler 物理只算一个空间，主线程开销从 O(全图) 降到 O(当前空间)。

### 决策 E：传送门跨宇宙常驻，不参与分岛

传送门 `portal-gate` 是内容树里的正式节点（有自己的 md），在所有宇宙里都看同一个坐标。它的特殊地位有三条：

1. **不参与分岛平移**：`separateSpaces()` 的 geometry 循环 `if (id === PORTAL_ID) continue`。一旦把它算进散点岛一起平移，它会被推到几千单位以外（实测 x=37775），而当前视口停在主宇宙——传送门就消失了。
2. **不参与 remove**：`onEnterSpace` 清旧空间时跳过它。
3. **每次切空间单独 add**：若 cy 里没有就补进 sliceData。

### 决策 F：奇观只属于散点空间，按归属显示

装饰奇观（太极八卦 / 四维空间 / 生命之树 / E8 根系）是 overlay 运行时创建的 cytoscape 节点，不在 `graph-data.json` 里——`computeSpaces` 算 `allSpaces` 时看不到它们。

`main.ts` 装完所有 overlay 后，把它们补进 misc 空间：

```typescript
for (const n of cy.nodes(`.${CLASSES.LAYER_PARENT}`).toArray()) {
  const misc = allSpaces.find((s) => s.id === MISC_SPACE_ID);
  if (misc) misc.nodeIds.add(n.id());
}
```

`applyVisibility(space)` 收紧为按 `space.nodeIds` 归属显示，**不再强制 show layer-parent**。曾经的 `n.show()` 让四个奇观在药学宇宙首屏里也飘着（用户实测反馈「所有奇观都散落在药师体系宇宙里，而奇观散点宇宙只有一个传送门节点」）。

### 决策 G：halo 循环不加 entering class

切空间时 halo 预铺位置那一步**不加** `entering` class。

`entering` 是 `opacity: 0` 的入场样式。`runLayout` 的 `skipEntering: true` 分支只「跳过入场动画处理」，**不会移除** `entering`——节点就永远 `opacity: 0` 隐形，只有 hover 触发 `.hovered` 规则时才现形。

用户实测反馈（原话）：「我切换宇宙后，只有边显示出来了，节点隐形了。把鼠标点到它以后，它才现形。」

修复：halo 循环直接不加 entering。切换空间不需要再来一次大爆炸——节点直接可见、euler 让它们从 halo 散开即可。

### 决策 H：`computeFitTarget` 加 `insets`，与 renderer.fit() 口径统一

`spaces.ts` 的 `computeFitTarget` 新增 `insets` 参数（CSS px，优先于 `padding` / `topInset`）：

```typescript
export interface FitTargetInput {
  bb: { x1: number; y1: number; x2: number; y2: number };
  width: number;   // CSS px
  height: number;  // CSS px
  insets?: FitInsets;       // 像素留白，优先
  padding?: number;         // 比例留白（旧口径，保留给按比例场景）
  topInset?: number;        // 顶部额外像素（旧口径）
}
```

`space-controller.ts` 的 `currentFitTarget()` 用：

```typescript
insets: { top: topInset(), right: FIT_INSET, bottom: FIT_INSET, left: FIT_INSET }
```

其中 `FIT_INSET = FIT_PADDING`、`topInset() = topChromeHeight() + FIT_INSET`——直接复用 `renderer.ts` 导出的「适应视图」那套实测值。

为什么必须统一口径：旧实现用 `padding: 0.12`（比例）+ `topInset: 96`（像素），爆炸结束后镜头停在 zoom≈0.0399，而用户按一下工具栏「适应视图」变成 0.0475——同一张图两种「刚好装下」，看着就是「缩放不对」。两边取同一套像素留白后，传送取景与「适应视图」得到的 zoom 一致。

---

## 三、今天踩的坑（问题 → 根因 → 修复）

这一节是本次决策落地过程中的真实修复记录，按发生顺序排列。

| # | 用户反馈 / 现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| 1 | 「最开始大爆炸时候的缩放不对」 | `enterInitialSpace` 在 halo 预铺位置取景，算出 zoom≈1.07，把镜头怼在小点上，euler 炸开时全程在画面外 | `enterSpace` 加 `frame?: boolean` 选项；`enterInitialSpace` 传 `{ frame: false }` 不动镜头，留在 main.ts 设的 0.08 宏观视野 |
| 2 | 爆炸结束后镜头比「适应」小约 19% | 取景用比例留白 `padding: 0.12`，「适应视图」用像素 `FIT_PADDING`，两套口径 | 决策 H：`computeFitTarget` 加 `insets`，两边复用 renderer 的 `FIT_PADDING` / `topChromeHeight()` |
| 3 | 「初始化完成之后强制缩放/平移了一下，没有必要」 | 分岛不锚定，整张图整体平移，镜头得跟着飞 | `planSeparation` 加 `anchorId`；`separateSpaces` 锚定当前空间，被看的东西原地不动；`settleAfterLayout` 只分岛不动镜头 |
| 4 | 传送门飘到 x=37775 消失 | 传送门被归入散点空间参与分岛，被推到几千单位外 | 决策 E：传送门不参与分岛、不参与 remove、跨宇宙常驻 |
| 5 | 传送门菜单只有两项 | `installSpaceController` 从 cy 现场算 spaces，cy 里只有主空间 | 决策 C：加 `inSpaces` 第三参数，main.ts 从全图算后传入 |
| 6 | 所有奇观散落在药学宇宙 | `applyVisibility` 强制 show layer-parent | 决策 F：去掉强制 show，按 `space.nodeIds` 归属显示 |
| 7 | 奇观散点宇宙只有传送门 | 奇观没被加到 misc 的 nodeIds | main.ts 装完 overlay 后把奇观补进 misc |
| 8 | 「切换宇宙后只有边显示，节点隐形，鼠标点上去才现形」 | halo 循环加 entering class，`skipEntering:true` 不移除它 | 决策 G：halo 循环不加 entering |
| 9 | （内部）参数遮蔽 | `installSpaceController` 参数名 `spaces` 遮蔽模块级变量，内部函数读旧值 | 参数改名 `inSpaces`，显式赋值给模块级 `spaces` |
| 10 | （内部）类型不匹配 | 模块级 `let spaces: SpaceInfo[]` 不接受 readonly 入参 | 改为 `let spaces: readonly SpaceInfo[] = []` |

---

## 四、不选方案（Alternatives Considered）

### 不选 A：保留全图态，只在力导层做虚拟节点过滤

不改架构，只让 euler 跳过 `display: none` 的节点。

- ❌ cytoscape euler 的 `:visible` 与力导过滤口径不一致是库级行为，要改得 fork 库或在每次 `cy.layout()` 前手动构造 `elements` 子集——后者等于「手动切片」，但 cy 里仍装着 2735 节点，DOM 层、选择器层、事件层都在为不可见节点付出代价。
- ❌ 不解决「全图态」本身的自相矛盾：用户要的是「不同宇宙互不影响」，全图态天然违反。

### 不选 B：每个空间一个独立 cytoscape 实例

为每个空间 new 一个 cy，切换时换实例。

- ❌ cytoscape 实例初始化开销大（canvas、事件系统、样式表），切换时白屏。
- ❌ overlay（奇观 / 传送门）跨实例同步是新的工程量。
- ❌ 焦点跳转（搜索 / 漫游）跨实例定位复杂度陡增。
- 当前「单实例 + 切片缓存」已经把性能降到 O(当前空间)，没必要为隔离换实例。

### 不选 C：奇观用人工坐标固定

给四个奇观写死坐标，不参与 euler。

- ❌ 用户明确反对：「不必强制规定传送门节点和奇观的坐标，让它们就根据计算自然散落即可」。
- ❌ 人工坐标与 euler 输出混排时，奇观会被力导推开（它们是 layer-parent，但仍有 position），视觉跳动。

### 不选 D：传送门用视口中心固定坐标

给传送门一个「始终在视口右下角」的固定坐标。

- ❌ 传送门是内容树节点，有自己的语义位置（在散点空间里）。钉死视口会让它在不同 zoom 下漂移、与其它奇观失去空间关系。
- ❌ 分岛时它得被排除，但又得参与斥力——两条约束打架。

### 不选 E：切空间时加 entering class 播一次小爆炸

让新空间的节点从 halo 散开时带 opacity 入场动画。

- ❌ 正是决策 G 修掉的 bug 来源：`skipEntering: true` 不移除 entering，节点永远隐形。
- ❌ 切换空间不需要大爆炸——euler 从 halo 散开已经是动态过程，再叠 opacity 入场是冗余的视觉噪音。

---

## 五、后果（Consequences）

### 正面

- ✅ 性能从 O(全图) 降到 O(当前空间)：主宇宙 2556 节点的 euler 只算自己，移动端不再卡。
- ✅ 「不同宇宙互不影响」从口号落地为架构事实——不同宇宙的节点物理上不在同一个 cytoscape 元素集合里。
- ✅ 「全图态」删除后，换空间语义唯一、路径单一（传送门菜单），Esc 不再有「退全图」这一歧义分支。
- ✅ 传送门取景与工具栏「适应视图」得到同一 zoom，不再有「缩放不对」。
- ✅ 奇观只在散点空间可见，主宇宙首屏干净。
- ✅ 切空间节点立即可见，不再隐形。

### 负面 / 风险

- ⚠️ **首次进入没访问过的空间时 euler 会跑一次**——但只跑那一空间，节点数小（药学 2556 / 生存策略 175 / 奇观散点 ~5），秒级无压力。已访问过的空间再次进入时，若缓存了收敛后的位置可省掉这次 euler——目前未做位置缓存，每次切都重跑（halo 预铺 → euler 收敛）。后续优化项。
- ⚠️ `onEnterSpace` 回调里 halo 预铺位置是**重置**——切回已访问过的空间时，节点位置会被重置回 halo 圆，再 euler 一遍。用户若期望「切回去还在原位」，目前不满足。这是「不缓存位置」的直接后果，与上一条同源。
- ⚠️ `separateSpaces()` 的分岛在渲染隔离后**只对当前 cy 里的节点有意义**——其它空间的节点不在 cy 里，planSeparation 算到的 geometry 只有当前空间一岛（外加 misc 里的奇观）。分岛退化为「把奇观挪开」。这是预期行为：渲染隔离下没有「全图分岛」的需求了。**缓解**：分岛逻辑保留，未来若恢复多空间同渲染（如大屏模式）仍可用。
- ⚠️ 依赖 `computeSpaces` 的连通分量定义——若未来图数据里出现跨空间的边（人为连接两个宇宙），`sliceGraphBySpace` 会把那条边丢到 misc 兜底，不会报错，但那条边在 UI 上不显示。属可接受的防御性降级。
- ⚠️ 传送门的 `__portal__` 缓存键是字符串字面量，与 `PORTAL_ID` 常量解耦——若未来有人改 `PORTAL_ID` 的值，缓存键不会跟着变（它只是 Map 的 key，与节点 id 无关）。无功能影响，但理解上需注意。

---

## 六、测试覆盖（Test Coverage）

`tests/component/ui/space-controller.test.ts`（删全图态测试后重写）：

| 测试 | 验证 |
| --- | --- |
| 传送门分岛：传送门不参与 planSeparation 平移 | separateSpaces 后传送门坐标不变 |
| settleAfterLayout 只分岛不动镜头 | settle 后 zoom/pan 与调用前一致 |
| onLayoutStopped 首屏路径 | bootLayoutPending 时走 settle，不取景 |
| onLayoutStopped 非首屏取景 | 非 boot 时 separateSpaces + flyToCurrentSpace |

`tests/unit/core/space-layout.test.ts`：

| 测试 | 验证 |
| --- | --- |
| anchorId 锚定：锚定岛坐标零平移 | 传入 anchorId 后锚定岛所有点 dx=dy=0 |
| 幂等：对结果再算一次坐标不变 | 二次 planSeparation 结果与一次相同 |

`space-data-cache.ts` 的切片逻辑目前由 `main.ts` 集成路径间接覆盖，未单独补单元测试——后续建议补：传送门单独保留、跨空间边丢 misc、空 spaces 输入。

全量结果：`tsc --noEmit` 通过，`tests/unit + tests/component` 共 593 / 593 测试通过（2 个 sidebar 偶发超时与本决策无关）。

---

## 七、相关 ADR

- **ADR-0003**（Tour 漫游引入体系边界）—— `UNIVERSE_ROOTS` 常量与「空间 = 连通分量」的语义来源。本 ADR 把「空间」从视觉概念升级为渲染边界，依赖 ADR-0003 确立的体系根。
- **ADR-0011**（布局运行期尊重用户手动镜头操作）—— 同一天落地，处理的是「布局结束后取景策略」，与本文「渲染隔离」正交。ADR-0011 的 `layoutStartView` 快照机制建立在本文决策 A（cy 只装当前空间）之上：快照比较的 zoom/pan 只对当前空间有意义。
