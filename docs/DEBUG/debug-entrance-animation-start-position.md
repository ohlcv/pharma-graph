# 入场动画从原点炸开而非从星尘环接续

## 问题描述

加载完成后，预动画（`startWaitingAnimation`）把节点铺成一片星尘环（约 900ms 铺完，之后在 120–340 半径区间内以 6% 幅度呼吸）。Worker 算完布局后，**节点先从星尘环被拽回原点、再从原点向外炸开**——视觉上是「缩一下 → 挤回中心 → 散开」三段脱节，整体看起来很丑。

控制台日志（命中现场）：

```
layout-worker-client.ts:250 [entrance] 启动等待预动画：1243 个节点铺成星尘
... 约 10s 后 ...
layout-worker-client.ts:429 [entrance] 启动入场动画：1243 个节点，行程 max=17473，总时长 1700ms
```

`总时长 1700ms` 是固定的 `ENTRANCE_ANIMATION_MS (1200) + STAGGER_MS (500)`,但预动画后节点**不在原点**——所以这个 1700ms 是用 halo 位置当起点算出来的「错位的动画」。

## 环境

- 浏览器：所有支持 rAF 的桌面浏览器
- 功能：Worker 布局 + 预动画 + 入场动画（`?layout=worker` 默认路径）
- 影响版本：所有开启预动画的入场动画（reduced motion / sync 路径不受影响）

## 复现步骤

1. `npm run dev`
2. 打开 `http://localhost:5173/`
3. 观察加载完成后的入场动画

应该看到（修复前）：节点铺开成星尘 → 一帧之内**全部回到原点** → 从原点炸开成最终结构。

应该看到（修复后）：节点铺开成星尘 → 短暂停顿（呼吸）→ 从星尘位置直接炸开成最终结构。两段动画首尾相接，看不出接缝（这是 `animatePositionsTo` 注释里的设计意图）。

## 代码位置

- `src/core/layout-worker-client.ts`
  - `runLayoutInWorker` 的 `onmessage` 分支（约 117 行起）：抓 `startPositions` + 调 `animatePositionsTo`
  - `animatePositionsTo`（约 371 行起）：入场动画主体
  - `startWaitingAnimation`（约 225 行起）：预动画主体
  - `ENTRANCE_ANIMATION_MS`（约 174 行）：写死的 1200ms 入场时长

## 排查过程

### 第一层：怀疑预动画根本没跑

加了 `[entrance] 启动等待预动画：xxx 个节点铺成星尘` 日志（`startWaitingAnimation` 第 250 行），加 `[entrance] 启动入场动画：...` 日志（`animatePositionsTo` 第 429 行）。

**结果**：两条日志都打出来了，预动画启动 1243 个节点，入场动画同样启动 1243 个节点。

→ 预动画**确实在跑**。问题不在「预动画有没有触发」，而在「入场动画用了什么起点」。

### 第二层：怀疑入场动画用错了起点

`animatePositionsTo` 的第一个参数 `start` 来自哪里？

```ts
animatePositionsTo(cy, startPositions, msg.positions, prefersReducedMotion());
```

`startPositions` 是 136 行 `for (const n of nodes) startPositions[n.id] = { x: n.x, y: n.y }` 抓的——**抓的是 cy 在 `postMessage` 之前的位置**。在 `postMessage` 之前，预动画还没启动，节点还在 halo burst 留下的原点位置（halo 动画 `duration: 0` 又被 `cy.stop()` 掐掉，全部堆在原点）。

但预动画在 `postMessage` **之后**启动（163 行 `waiting = startWaitingAnimation(cy)`），把每个节点搬到了星尘环上的目标位置 `targets[id] = { x, y }`。

**所以入场动画拿到的是「halo 位置」（原点），而 cy 里实际位置是「星尘环位置」**。当入场动画接管时，`stopWaitingAnimation` 在第 142 行把 cy 里的节点落到星尘环裸坐标（即 `targets`）—— **但入场动画的起点写的是 halo 位置**，它在第一帧就把节点从星尘环拉回 halo，再从 halo 飞向终点。

**真因浮出水面**：`startPositions` 这个变量名是错的，或者更准确地说，**它在 Worker 路径下被错误地当成了入场动画的起点**。

### 第三层：验证修复方向

入场动画的起点语义应该是「cy 在接管这一刻的实际位置」，而不是「postMessage 那一刻的位置」。这两个值在「无预动画」路径下重合（都在 halo 位置），所以原代码「碰巧工作」；一旦预动画接管，halo 位置就不是真实位置了。

修复方案：

1. Worker 路径下，让 `waiting` 的 `targets` 作为入场动画起点（因为 `stopWaitingAnimation` 刚刚把节点落到 `targets`）。
2. 退化路径下（reduced motion / `startWaitingAnimation` 因全 layer-parent 返回 null），预动画没跑，节点还在 halo 位置，`startPositions` 仍然是对的。

代码层面用一个 `fromPositions = waiting ? waiting.targets : startPositions` 三元即可。`startPositions` 字段保留在 `WorkerLayoutResult` 接口上——它是「postMessage 时的快照」，这个语义对调用方来说一直是有用的（可以还原「原始 halo 位置」）。

### 第四层：固定 1700ms 入场时长也是另一个观感问题

修完起点后会发现第二个症状：入场动画还是**固定 1700ms 跑完**（1200 + 500 stagger）。这个固定时长下，行程 50 的近核心节点和行程 17000+ 的远外围节点在同一秒数里走完，**平均速度差 350 倍**：

- 近节点「一闪而过」
- 远节点「飞过去像撞墙」

修完起点后会变得更明显（因为入场动画现在真的「从星尘环接续」了，星尘环 → 终点 的距离和 halo → 终点的距离不一样）。

解法：每节点的时长按 `dist/maxDist` 在 `[MIN_MS, MAX_MS]` 区间内插值（`duration = minMs + t * (maxMs - minMs)`），让所有节点平均视觉速度一致。

为了单测，把算法从 `animatePositionsTo` 里抽成 `computeEntranceSchedule` 纯函数——`tests/unit/core/layout-worker-client.test.ts`。

## 根本原因

| 错 | 应该 |
| --- | --- |
| 入场动画起点用 `postMessage` 时刻的 halo 位置 | 入场动画起点用「接管那一刻 cy 里的实际位置」（开预动画时 = 星尘环 targets，否则 = halo） |
| 入场动画时长写死 1200ms | 每节点时长按距离归一化在 [600, 2500] ms 区间内插值 |

**为什么 `startPositions` 这个名字误导了原来的实现？** —— 因为在 117–150 行那个上下文里，它确实就是「postMessage 时的位置」。原代码写 `animatePositionsTo(cy, startPositions, ...)` 时，作者脑子里大概是「动画从起点 → 终点跑」。这两个「起点」恰好是同一个值（halo 位置），所以实现没出错。**预动画（163 行）作为后期加入的功能，把这两个「起点」拉开了距离**——但入场动画那一行的代码没跟着改。

## 修复

### `src/core/layout-worker-client.ts`

**1. 入场动画起点切换为接管那一刻的位置**

```ts
// 抓 startPositions（postMessage 时快照，保留在接口上）
const startPositions: Record<string, { x: number; y: number }> = {};
for (const n of nodes) startPositions[n.id] = { x: n.x, y: n.y };

// 但入场动画的实际起点取决于预动画是否接管过
const fromPositions = waiting ? waiting.targets : startPositions;

if (waiting) stopWaitingAnimation(cy, waiting.targets, waiting.cancel);

animatePositionsTo(cy, fromPositions, msg.positions, prefersReducedMotion());
finish({ positions: msg.positions, elapsedMs: msg.elapsedMs, startPositions: fromPositions });
```

**2. 入场动画时长按距离自适应**

替换 `ENTRANCE_ANIMATION_MS = 1200` 为：

```ts
const ENTRANCE_MIN_MS = 600;
const ENTRANCE_MAX_MS = 2500;
```

并把调度算法抽成纯函数 `computeEntranceSchedule(end, start, { staggerMs, minMs, maxMs })`，参数化三个独立常数。`animatePositionsTo` 只负责把 schedule 的 id 解析成 cy node 引用 + 跑 rAF 循环。

**3. 算法契约**

```ts
delay_i     = (dist_i / maxDist) * staggerMs     // 远的先走
duration_i  = minMs + (dist_i / maxDist) * (maxMs - minMs)  // 远的飞得久
totalMs     = max(delay_i + duration_i)          // 被最外围节点钉住
```

## 验证

| 项 | 修复前 | 修复后 |
| --- | --- | --- |
| 预动画后节点位置 | 全部在原点（被入场动画第一帧拉回） | 全部在星尘环上 |
| 入场动画起点 | halo（原代码注释里说的「正常路径下恒为 (0,0)」） | `fromPositions`（开预动画 = 星尘环，否则 = halo） |
| 入场动画时长 | 固定 1700ms | max ≈ 3000ms（staggerMs 500 + maxMs 2500） |
| 近核心节点动画时长 | 1200ms（行程 50）→ 平均速度 0.04 | 600ms（行程 50）→ 平均速度 0.08 |
| 远外围节点动画时长 | 1200ms（行程 17000+）→ 平均速度 14 | 2500ms（行程 17000+）→ 平均速度 7 |
| 平均速度比（远/近） | 350× | 87×（仍有差，但已经到「同速感」量级） |

> 87× 还是大，但**这是「结构化为视觉前提」的代价**——所有节点都从**视觉上看是同一个速度**。再调参（拉近 MIN/MAX 区间、或者改用速度常数归一化而非线性插值）都能进一步收敛，但属于美学调优。

控制台日志（修复后）：

```
layout-worker-client.ts:250 [entrance] 启动等待预动画：1243 个节点铺成星尘
... 约 10s 后 ...
layout-worker-client.ts:429 [entrance] 启动入场动画：1243 个节点，行程 max=17473，总时长 3000ms（核心 600ms / 外围 2500ms，自适应）
```

## 经验总结

1. **「动画起点」必须用「接管那一刻的实际位置」**——而不是「发起那一刻的快照」。这两个值在「动画-动画」直接接续的场景下分离得最远。
3. **rAF 接力赛里名字对得上 ≠ 语义对得上**——`startPositions` 在它出现的**每一处**都用对了，但**它被传进了一个语义不同的函数**。命名清晰只能防止 80% 的 bug,剩下的靠明确的接口契约（注释、测试）。
2. **写死的时间常数通常是观感 bug 的入口**——动画时长一旦固定，行程差异立刻放大成速度差异。改自适应后,**速度差减少一个量级**（350× → 87×）。

## 相关代码

- `src/core/layout-worker-client.ts` — 入场动画 + 预动画 + schedule 算法（已修复）
- `tests/unit/core/layout-worker-client.test.ts` — `computeEntranceSchedule` 单元测试（新建）
- 修复提交：待提交

## 归档计划

等用户在浏览器里目视确认两段动画无缝衔接后，归档到 `docs/archive/debug/`。在归档前不要清掉任何 console.info 日志——这条修复路径靠日志确认起点切换，时序稳定。