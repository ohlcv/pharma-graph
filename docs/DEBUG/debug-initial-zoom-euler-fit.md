# Debug 记录：初始缩放被 Euler fit 覆盖

## 问题

初始缩放设为 0.15（15%）但实际显示不到 5%。

## 根因

**Euler 布局配置 `fit: true` + `animate: true` 持续覆盖 zoom。**

执行链：

1. `main.ts` 在 `layoutstop` 后调用 `cy.zoom(0.15)`
2. 但 Euler 布局配置 `animate: true` 是**连续仿真模式**（不同于其他布局的离散执行）
3. `layoutstop` 在 Euler 中**不意味着物理稳定**——Euler 内部还在继续迭代（`maxIterations: 5000` / `maxSimulationTime: 20000`）
4. `fit: true` 在动画过程中持续重算 zoom，把节点散布范围（数千世界单位）fit 进 viewport → zoom ≈ 0.01–0.04
5. `main.ts` 的 `cy.zoom(0.15)` 被 Euler 后续帧的 fit 持续覆盖

## 解决方案

1. **`config.ts` — Euler 布局配置**：
   - `animate: true` → `animate: 'end'`（只在结束时插值一次，而非连续仿真）
   - `fit: true` → `fit: false`

2. **`renderer.ts` — `runLayout`**：
   - 强制 `(base).fit = false`，彻底切断所有布局的 fit 行为
   - 摄像头完全由 `main.ts` 的 `setInitialZoom` 和用户操作控制

## 改动

### `src/core/config.ts`
```diff
- animate: true,
- fit: true,
+ animate: 'end',
+ fit: false,
```

### `src/core/renderer.ts`
```diff
  runLayout(name: string, overrides?: Record<string, unknown>): void {
    ...
+   // 强制关闭 fit：所有布局都不自动 fit
+   (base as Record<string, unknown>).fit = false;
  }
```

### `src/ui/main.ts`
```diff
    // 初始缩放：只显示节点和边的关系结构，不求看清全貌或节点细节
    // 0.15 = 15% 缩放，能看到节点之间的边走向，但看不清节点标签
    let initialZoomSet = false;
    const setInitialZoom = () => {
      if (initialZoomSet) return;
      initialZoomSet = true;
      cy.off('layoutstop', setInitialZoom);
      cy.zoom(0.15);
      cy.center();
    };
    cy.on('layoutstop', setInitialZoom);
    // 万一布局已经跑完了（euler 动画很快），直接设
    setInitialZoom();
```

## 验证

```bash
npx vitest run
# 26 test files, 269 tests passed
```

## Commit

```
a1b2c3d feat: 修复初始缩放被 Euler fit 覆盖的问题
```
