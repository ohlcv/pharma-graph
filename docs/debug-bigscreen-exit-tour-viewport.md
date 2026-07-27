# 大屏模式退出时漫游视口丢失问题

## 问题描述

ESC 退出大屏时，漫游中的节点不再居中显示，而是跳到下一个节点才居中。重启 enter 大屏正常。

## 环境

- 浏览器：Chrome/Safari（macOS 全屏 API）
- 功能：大屏模式 + 漫游（TourEngine）

## 复现步骤

1. 启动漫游，开始自动遍历
2. 进入大屏模式（漫游中）
3. 按 ESC 退出大屏
4. 观察：漫游的当前节点不在屏幕中心，下一步才居中

## 代码位置

`src/ui/bigscreen.ts`

## 已知信息

### 进入大屏正常

`captureViewport()` 在漫游中的 cy.animate() 期间调用，保存的是动画**当前帧**的 extent（scene 坐标），这本身没问题。`cy.resize()` 后 extent 变大，scene 中心不变，漫游节点仍在中心。

### 退出大屏有问题

ESC 退出时的执行顺序（推测）：

```
ESC keydown
  → exitBigscreen()
    → captureViewport()
    → document.documentElement.classList.remove('bigscreen')
    → document.exitFullscreen()
    → fullscreenchange fire
      → bigscreen.ts fullscreenchange handler
        → setTimeout(restoreViewport, 0)

macrotask 1:
  → restoreViewport: setTimeout(doRestore, 0)

macrotask 2:
  → doRestore: cy.zoom() + cy.pan()
```

### 关键挑战

1. **cy.animate() 动画冲突**：漫游用 `cy.animate({ center: { eles: node }, zoom: ... })` 控制视口。`exitBigscreen()` 中的 `captureViewport()` 在漫游运行时被调用，捕获的是**动画当前帧的 extent**。

2. **cy.stop() 的重置行为**：尝试用 `cy.stop()` 停止漫游动画后再恢复，但 CytoScape 的 `stop()` 会把视口重置到动画**开始时**的状态（不是当前帧），可能反而加剧问题。

3. **cy.resize() 的时序**：退出全屏时，浏览器先触发 `fullscreenchange`，然后才重新布局 DOM（toolbar 回来），最后触发 `cy.resize()`。`cy.resize()` 会基于当前 pan 重新计算 extent，可能覆盖我们手动设置的 pan。

4. **#main 高度固定**：`#main` 的 CSS 高度是 `calc(100vh - 56px - 44px)`，退出大屏时 canvas 大小不变，只是整体下移 56px。

## 已尝试的修复（均未完全解决）

### 方案 1：恢复 pan + zoom（原始）
```typescript
cy.animate({ pan: vp.pan, zoom: vp.zoom, duration: 0 });
```
结果：失败。pan 值在不同 extent 下映射到不同 scene 位置。

### 方案 2：同步设置 pan + zoom
```typescript
cy.pan(vp.pan);
cy.zoom(vp.zoom);
```
结果：失败。同上，pan 值问题。

### 方案 3：scene 中心 + canvasBounds 恢复
```typescript
cy.zoom(vp.zoom);
cy.pan({
  x: canvasBounds.left + canvasBounds.width/2 - centerScene.x * zoom,
  y: canvasBounds.top + canvasBounds.height/2 - centerScene.y * zoom,
});
```
结果：仍有问题。canvasBounds 在 restoreViewport 被调用时可能还不是最终值。

### 方案 4：双 setTimeout 延迟恢复
```typescript
setTimeout(() => setTimeout(doRestore, 0), 0);
```
结果：仍未完全解决。

## 根本原因推测

`captureViewport()` 在 `cy.animate()` **运行时**被调用——此时 cy 正在从节点 A 动画到节点 B。每次 animate 的 `complete` 回调才更新 `onStepAfterCenter`，之后才会 `scheduleNext` 继续漫游。

退出大屏时：
1. `captureViewport()` 捕获的是**动画进行中**的 extent（节点 A→B 的中间位置）
2. `cy.stop()` 让动画**回弹**到节点 A 的视口
3. `restoreViewport()` 恢复到节点 A 的视口
4. 漫游继续，下一步到节点 B

这解释了为什么"退出后节点不在中心，下一步才居中"——因为 capture 捕获了动画中间态。

## 待解决

- [ ] 在 `cy.animate()` 动画**稳定时**（`complete` 回调后）才允许 capture
- [ ] 或在退出大屏时暂停/停止漫游动画，capture 稳定视口
- [ ] 或完全绕过 `cy.animate()` 的视口控制，改用手动 `cy.pan()` / `cy.zoom()`
- [ ] 验证 `cy.resize()` 到底在哪个时间点触发，是否需要额外监听

## 相关代码

- `src/ui/bigscreen.ts` - 大屏模式管理
- `src/core/tour.ts` - 漫游引擎，`highlightAndFocus()` 中使用 `cy.animate()`
