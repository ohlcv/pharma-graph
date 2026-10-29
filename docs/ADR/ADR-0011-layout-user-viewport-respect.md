# ADR-0011: 布局运行期尊重用户手动镜头操作

> **⚠️ 已被取代（2026-10-29 同日）**：用户进一步反馈"任何地方都不想要强制取景"
> （含虫洞切宇宙场景），本 ADR 的"用户动过则不取景 / 没动则取景"三支判定被推翻。
> `layoutStartView` 快照、`bootLayoutPending`、`markLayoutStart` 全部删除，
> `onLayoutStopped()` 简化为只 `separateSpaces()`，永不取景。
> 另新增布局坐标缓存（`cacheActiveSpacePositions`/`getCachedPositions`）让切宇宙瞬切。
> 见当日工作日志"彻底取消布局后取景 + 布局坐标缓存"段。本文保留作历史记录。

| 字段         | 值                                                                    |
| ------------ | --------------------------------------------------------------------- |
| **状态**     | ~~Accepted · Implemented~~ → Superseded（同日被推翻）                 |
| **日期**     | 2026-10-29                                                            |
| **决策者**   | 项目所有者                                                            |
| **影响范围** | `src/ui/space-controller.ts`、`src/ui/graph-events.ts`                |
| **测试**     | `tests/component/ui/space-controller.test.ts`                         |

---

## 一、背景（Context）

布局停止（`layoutstop`）后的取景（reframe）策略在两个场景下行为不一致，用户反馈其一不想要：

| 场景                                       | 旧行为                         | 用户预期                      |
| ------------------------------------------ | ------------------------------ | ----------------------------- |
| 刷新网页，入场布局跑动期间缩放/平移屏幕    | 布局结束后**保留**用户视角     | ✅ 保留（符合预期）           |
| 点重置按钮触发新布局，期间缩放/平移屏幕    | 布局结束后**强制取景**覆盖操作 | ❌ 应保留用户视角             |

### 为什么会有"布局结束后取景"这件事

`onLayoutStopped()`（`space-controller.ts`）对**非首屏**的 `layoutstop` 一律执行 `flyToCurrentSpace(false)`——把当前可见节点整体重新取景（zoom + pan 一次性跳到目标值，无动画）。

这条逻辑的初衷是合理的：用户主动换布局 / 重排 euler 时，节点会被甩到全新区位，镜头若守着旧位置，视野里多半只剩空地，重新取景是这次操作的收尾。首屏那次走 `bootLayoutPending` 分支，本来就不取景——所以"刷新网页"场景碰巧符合预期。

问题出在**用户在布局跑动期间动了镜头**这种情况没有被识别。重置按钮触发的新布局也是一个非首屏 `layoutstop`，于是用户的缩放/平移被收尾取景覆盖掉了。

### 一个关键不变量

`renderer.runLayout()` 强制 `fit: false`（`renderer.ts` 注释明确：所有布局都不自动 fit，完全由 `main.ts` 的 `setInitialZoom` 和用户手动操作控制摄像头）。

这意味着：**布局本身不会改变 zoom / pan。** 所以"布局开始 → 结束"之间视角若有变化，**一定是用户手动操作的**——这条不变量是本次决策的判定基础。

---

## 二、决策（Decision）

### 决策 A：在 `layoutstart` 时记录视角快照，`layoutstop` 时比较

新增模块级状态 `layoutStartView: { zoom, panX, panY } | null`：

- `layoutstart` 事件触发时，`markLayoutStart(cy.zoom(), cy.pan())` 写入快照
- `layoutstop` 事件触发时，`onLayoutStopped()` 调 `userMovedDuringLayout()` 比较：
  - **一致** → 用户没动 → 照常取景（节点被甩到新位置，旧视角多半剩空地）
  - **不一致** → 用户动过 → **跳过取景**，尊重用户操作

```typescript
// src/ui/space-controller.ts
let layoutStartView: { zoom: number; panX: number; panY: number } | null = null;

const VIEW_EPS = 1e-9;

function userMovedDuringLayout(): boolean {
  if (!layoutStartView || !cyRef) return false;
  const z = cyRef.zoom();
  const p = cyRef.pan();
  return (
    Math.abs(z - layoutStartView.zoom) > VIEW_EPS ||
    Math.abs(p.x - layoutStartView.panX) > VIEW_EPS ||
    Math.abs(p.y - layoutStartView.panY) > VIEW_EPS
  );
}

export function onLayoutStopped(): void {
  if (!cyRef) return;
  if (bootLayoutPending) {
    bootLayoutPending = false;
    layoutStartView = null;     // 首屏路径不依赖快照，消费掉防止泄漏
    settleAfterLayout();
    return;
  }
  const userTouched = userMovedDuringLayout();
  layoutStartView = null;     // 一次性消费
  separateSpaces();            // 分岛每次都要做
  if (userTouched) return;    // 用户动过 → 不取景
  flyToCurrentSpace(false);    // 没动 → 照常取景
}
```

### 决策 B：快照由 `graph-events.ts` 的 `layoutstart` 监听器写入

不在 `space-controller` 内部自挂 `layoutstart` 监听——保持事件绑定单一入口（`graph-events.ts` 聚合所有 cytoscape 事件）。

`graph-events.ts` 里原本的 `layoutstart` 监听只做了 `cancelForceDrag()`，现在顺带调一次 `markLayoutStart()`：

```typescript
// src/ui/graph-events.ts
cy.on('layoutstart', () => {
  cancelForceDrag();
  markLayoutStart(cy.zoom(), cy.pan());
});
```

### 决策 C：浮点容差 `VIEW_EPS = 1e-9`

zoom / pan 都是 JS 浮点数。理论上"用户没动"时 `cy.zoom()` 在 `layoutstart` 和 `layoutstop` 两个时刻返回的是同一个数字，比较应严格相等。加 1e-9 容差是为了在极少数浮点漂移下（如 cytoscape 内部归一化）别误判成"用户动过"——实际取景跳变都是数量级远大于 1e-9 的位移，不会误伤。

### 决策 D：首屏路径仍走 `bootLayoutPending`，不依赖快照

首屏那次 `layoutstop` 的"不取景"语义由 `beginBootLayout()` 打的 `bootLayoutPending` 标志承载，与本次新增的快照机制**正交**。

`onLayoutStopped()` 里首屏分支显式把 `layoutStartView` 置 null——防止首屏 `layoutstart` 写入的快照泄漏到下一次非首屏布局的判定里（虽然下一次会重新写，但显式消费更清晰，也避免"快照在首屏后被读到"这类边界 bug）。

---

## 三、不选方案（Alternatives Considered）

### 不选 A：监听 `zoom` / `pan` 事件设"用户动了"标志

cytoscape 提供 `cy.on('zoom')` 和 `cy.on('pan')`，能直接捕获用户操作。

- ❌ 这两个事件**不仅**对用户手势触发——`flyToCurrentSpace()`、`setInitialZoom()`、`fit()` 这些程序化操作也会触发。要区分"用户动"和"程序动"得在每处程序操作前后开关 flag，状态机变复杂、易漏。
- ❌ 快照方案是**无状态读**：只在开始记一次、结束时比一次，中间不维护任何标志，少了四处埋雷的开关。

### 不选 B：取消所有非首屏取景

最简单：布局结束后一律不取景，镜头爱停哪停哪。

- ❌ 用户主动换布局（euler → grid 等）时，节点被甩到全新区位，旧视角确实可能只剩空地。取景作为"换布局操作的收尾"是有价值的，一刀切砍掉会引入新的"换完布局看不到图"反馈。

### 不选 C：用 `userZoomingEnabled` / `userPanningEnabled` 在布局期间禁用用户操作

cytoscape 支持运行时关掉用户的 zoom / pan。

- ❌ 直接改变了产品交互——用户**就是想在布局跑动期间调视角**（这正是本次反馈的核心诉求）。禁用等于把用户想要的能力关掉，方向反了。

### 不选 D：在 `action-handlers.ts` 的 `reset-all` 里特殊处理

给重置按钮单独打一个"这次别取景"的标志。

- ❌ 真正的判据不是"哪个按钮触发的"，而是"用户在布局期间有没有动镜头"。按触发源分叉会把同样的逻辑散到多处（换布局按钮、热键、程序化重排都得各自打标），且无法覆盖"用户没动 → 应该取景"这条同一路径上的合理分支。快照方案是**按状态判定，不按来源分叉**，更内聚。

---

## 四、后果（Consequences）

### 正面

- ✅ 两个场景行为统一：**只要用户在布局期间动了镜头，就保留；没动就照常取景**
- ✅ 判定基于"布局 `fit:false` 不动镜头"这条既有不变量，无需新增运行期约束
- ✅ 无状态读（开始记一次、结束比一次），没有跨事件的标志位要维护
- ✅ 与首屏 `bootLayoutPending` 机制正交，互不干扰

### 负面 / 风险

- ⚠️ 依赖"`renderer.runLayout()` 永远 `fit: false`"这条不变量。**若未来有人在这个方法里放开 fit**（比如某个布局 preset 想自动 fit），快照比较就会失效——`fit` 改了 zoom/pan，会被误判成"用户动过"，于是永远不取景。**缓解**：`renderer.ts` 里 `fit: false` 那行已有注释说明"完全由 main.ts 的 setInitialZoom 和用户手动操作控制"，改动时应同步评估本 ADR。
- ⚠️ `markLayoutStart` 必须被**所有**触发布局的路径覆盖。目前 `layoutstart` 是 cytoscape 全局事件，所有 `cy.layout().run()` 都会触发——单一入口，覆盖完整。若未来有人绕过 `cy.layout()` 直接操作节点位置（如 `randomize` 里的 `node.positions()`），不会触发 `layoutstart`，那条路径本来也不走 `onLayoutStopped`（它只挂在 `layoutstop` 上），无影响。
- ⚠️ 极少数浮点漂移（< 1e-9）会被判成"没动"。实际取景跳变都是远大于 1e-9 的位移，容差不会误伤。若未来发现误判，把 `VIEW_EPS` 调小到 0 即可（快照与结束时是同一 JS 数字时严格相等）。

---

## 五、测试覆盖（Test Coverage）

`tests/component/ui/space-controller.test.ts` 在"落定之后不动镜头" describe 块下新增两条测试，与既有"首屏不取景 / 之后取景"契约并列：

| 测试                                            | 验证                                              |
| ----------------------------------------------- | ------------------------------------------------- |
| 布局期间用户动过镜头时，layoutstop 不再强制取景 | `markLayoutStart` 后改 zoom/pan → `onLayoutStopped` 后视角不变 |
| 布局期间用户没动镜头时，layoutstop 照常取景     | `markLayoutStart` 后不动 → `onLayoutStopped` 后视角变（取景发生） |

全量结果：`tests/unit + tests/component` 共 **593 / 593 测试通过**，`tsc --noEmit` 通过。

---

## 六、相关 ADR

- **ADR-0003**（Tour 漫游引入体系边界）—— `onLayoutStopped()` 所在的 `space-controller.ts` 整个模块的来源。本 ADR 修改的是该模块的"取景策略"部分，空间隔离 / 分岛 / 传送门逻辑均不动。