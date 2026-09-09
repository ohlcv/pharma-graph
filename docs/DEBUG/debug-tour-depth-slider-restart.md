# Tour 档位滑块重启后失效（maxDepth 被重置为 1）

**日期**: 2026-09-09
**状态**: ✅ 已修复
**严重等级**: High（用户调整档位无效，每次重启漫游都被强制设为档位 1）

***

## 问题描述

用户调节 Tour 档位滑块到任意档位（如 "全部 5"）后，关闭漫游再重启，滑块值会被强制重置回初始的档位 1，导致漫游只显示前 2 步（book → chapter）就停止。

### 现象

1. 启动漫游 → 默认档位 5（全部） → 正常遍历全部 288 步 ✅
2. 调节档位滑块到 1 → `[setMaxDepth]` 日志显示 `maxDepth=-1`（无限模式）→ 游走正常 ✅
3. 关闭漫游
4. 重新启动 → 走 2 步就停了 ❌

### 关键日志对比

```
# ✅ 调节滑块后
[Tour DEBUG setMaxDepth] 档位已更新为 1，maxDepth=-1

# ❌ 重新启动漫游后
[Tour DEBUG start] maxDepth=1, _depthLevel=1     ← 步数限制是 1！
[Tour DEBUG visitNext] maxDepth=1, _depthLevel=1
[Tour DEBUG] 显示节点 id=ch-cns-y2-01, currentStep=2, maxDepth=1, maxDepth>0=true, currentStep>=maxDepth=true
[Tour DEBUG] 达到深度限制，停止
```

## 环境

- 浏览器：Chrome/Safari
- 功能：Tour 档位滑块 + 漫游启动/停止
- 相关文件：
  - `src/core/tour.ts`（`TourEngine.start`、`setMaxDepth`）
  - `src/ui/tour-controller.ts`（`start()` 调用方）

## 排查过程

### 第一阶段：检查滑块事件

首先怀疑是滑块 `change` 事件没触发。给 `bindSlider` 加日志确认：

```typescript
(v) => {
  console.log(`[TourController DEBUG] 深度滑块 change 事件，值=${v}`);
  this.engine?.setMaxDepth(v >= 5 ? -1 : v);
}
```

发现 `change` 事件正常触发，`setMaxDepth` 也被调用，但每次**重启漫游后** `maxDepth=1`。

### 第二阶段：定位问题根源

调用栈梳理：

1. `tour-controller.ts:start()` 创建新 `TourEngine`
2. 调用 `engine.start(rootId, { interval, maxDepth: this.currentMaxDepth(), ... })`
3. `TourEngine.start(options)` 中 `this.maxDepth = options.maxDepth ?? INFINITE_DEPTH`

关键发现：`start()` 里读的是**当前 DOM 滑块值**（`currentMaxDepth()`），而不是滑动过的最新值！

### 第三阶段：第一版修复（部分生效）

在 `tour-controller.ts` 中加 `_pendingMaxDepth` 追踪状态：

```typescript
private _pendingMaxDepth: number = 5;

start(): void {
  ...
  this.engine.start(rootId, {
    maxDepth: this._pendingMaxDepth,
    ...
  });
}
```

并在滑块 `change` 时同步更新：

```typescript
(v) => {
  this._pendingMaxDepth = v;
  this.engine?.setMaxDepth(v);
}
```

问题：**新版 `TourEngine.setMaxDepth` 已经废弃了 `maxDepth` 步数限制**（改为"档位"），但 `TourEngine.start` 内部仍然把 `options.maxDepth` 当作"步数限制"处理：

```typescript
// src/core/tour.ts start()
this.maxDepth = options.maxDepth ?? INFINITE_DEPTH;
```

所以虽然 `setMaxDepth(1)` 会把 `_depthLevel=1, maxDepth=-1`，但 `start({maxDepth:1})` 会把 `maxDepth=1`，导致 2 步就停。

### 第四阶段：最终修复

让 `TourEngine.start` 与 `setMaxDepth` 保持同样的语义 —— `maxDepth` 参数表示"档位（1-5）"，内部始终强制无限：

```typescript
start(rootId: string, options: TourOptions): void {
  this.stop();
  this.paused = false;
  this.stopped = false;
  this.interval = options.interval ?? DEFAULT_INTERVAL_MS;
  // maxDepth 参数表示档位（1-5），5 或负数 = 全部（无限漫游）
  // 始终使用无限模式（步数不受限制），让档位过滤单独工作
  const level = options.maxDepth ?? INFINITE_DEPTH;
  this._depthLevel = level <= 0 ? 5 : level;
  this.maxDepth = -1; // 始终无限
  ...
}
```

## 根本原因

设计混淆：**滑块值 1-5 同时被解释为两个不同的含义**：

| 位置 | 含义 | 行为 |
|------|------|------|
| `setMaxDepth`（滑块 change 时） | 档位（1-5） | `maxDepth=-1`（无限） |
| `TourEngine.start`（创建时） | 步数限制（1-288） | `maxDepth=1`（步数限制 1）|

两者语义不一致，导致**同一个 DOM 值在不同入口会产生完全不同的结果**。

## 修复方案

### 1. `src/core/tour.ts` `TourEngine.start`

将 `options.maxDepth` 也当作档位（1-5）解释，始终强制 `maxDepth=-1`：

```typescript
const level = options.maxDepth ?? INFINITE_DEPTH;
this._depthLevel = level <= 0 ? 5 : level;
this.maxDepth = -1; // 始终无限
```

### 2. `src/ui/tour-controller.ts` 追踪状态

新增 `_pendingMaxDepth` 字段，滑块 `change` 时同步：

```typescript
private _pendingMaxDepth: number = 5;

start(): void {
  this.engine.start(rootId, {
    interval: this.currentInterval(),
    maxDepth: this._pendingMaxDepth, // 用追踪值，不用 DOM 实时值
    ...
  });
}

bindSlider(..., (v) => {
  this._pendingMaxDepth = v;
  // 同步更新 DOM 滑块
  const depthSlider = this.findSlider('maxdepth');
  if (depthSlider) {
    depthSlider.range.value = String(v);
    this.paintFill(depthSlider);
  }
  this.engine?.setMaxDepth(v);
});
```

## 验证

- ✅ 启动 → 全部 288 步
- ✅ 滑块调节 → 立即生效（档位过滤）
- ✅ 关闭 → 重启 → 仍然使用调节过的档位
- ✅ 任意档位下都不会再出现"2 步就停"

## 经验教训

1. **UI 状态不要从 DOM 反推**：应该有一个 in-memory 的状态对象，DOM 滑块只是它的"视图"。
2. **同一参数必须有唯一语义**：`maxDepth` 不应该在 `setMaxDepth` 表示"档位"又在 `start` 表示"步数"。
3. **重启 / 重新创建对象时要保留用户偏好**：从用户视角，调整过的设置关机重启应该还在。
