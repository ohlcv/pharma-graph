# 大屏往返后 Sidebar 消失且切换按钮无响应

## 问题描述

进入大屏模式后再退出大屏，**右侧 sidebar 不可见**，toolbar 上的折叠按钮（`#btn-sidebar`）点击也没反应 —— 看起来像是 sidebar 被永久折叠，但用户实际上从未主动折叠过。

控制台没有任何 JS 错误，`toggleSidebar()` 内部读到的 DOM 状态（`.hidden` class、transform、opacity、width）全部正确，**只是 sidebar 的几何位置不在视口内**。

## 环境

- 浏览器：Chrome / Safari（macOS + Windows）
- 功能：大屏模式（bigscreen）+ sidebar 切换
- 影响视口宽度：**任何窄于 ~1100px 的视口都会触发**（sidebar 260px + 大屏前 canvas 撑出的剩余宽度叠加超过视口）

## 复现步骤

1. 打开图表页面
2. **缩窄浏览器视口到 ~830px**（sidebar 完全可见的临界宽度附近）
3. 点 toolbar 的大屏按钮 → 进入大屏
4. 再点一次（或 ESC）→ 退出大屏
5. 观察：右侧 sidebar 视觉上消失，toolbar 的折叠按钮看上去"没亮起"且点击无效果

> 视口宽度正常（≥1200px）的桌面端几乎不会注意到，但 sidebar-strip 的折叠状态在那个尺寸下也异常。

## 代码位置

- `src/ui/styles/layout.css` — `#main` 的 grid 模板
- `src/ui/styles/components.css` — `html.bigscreen #main` 和窄屏断点
- `src/ui/bigscreen.ts` — 大屏进入/退出与 sidebar 状态恢复

## 排查过程（按时间顺序）

### 第一层：以为是 sidebar 自身 DOM 状态没复位

加了 `[bigscreen] restoreSidebar DONE` 日志打印 sidebar 的 `domHidden / transform / opacity / width / pointerEvents`。

**结果**：

```
domHidden      = false           ← .hidden class 不在 ✅
transform      = matrix(1,0,0,1,0,0)  ← 没有位移 ✅
opacity        = 1               ← 完全不透明 ✅
width          = 260px           ← CSS width 正常 ✅
pointerEvents  = auto            ← 可点击 ✅
```

→ sidebar 自身**一切正常**。问题不在 DOM 状态。

### 第二层：探查 `#main` 的 grid 列宽与 sidebar 几何

加了 `[bigscreen] RESTORE-PROBE` 平铺日志，关键输出：

```
viewportW          = 836
html.scrollW       = 836            ← 页面没有横向滚动
body.scrollW       = 836            ← body 没有横向滚动
appRectW           = 836            ← #app 在视口内 ✅
appOverflowX       = visible
mainRectW          = 836            ← #main 在视口内 ✅
mainRectLeft       = 0
mainOverflowX      = hidden         ← #main 确实在裁剪
mainGridCols       = "862px 260px"  ← ← ← 🔴 grid 想占 1122px
sidebarRectW       = 260
sidebarRectLeft    = 862            ← sidebar 起点 x=862（视口外）
sidebarRectRight   = 1122           ← sidebar 右边缘在视口右边 286px
```

**真因浮出水面** —— `#main` 自己宽 836px、在视口内、有 `overflow: hidden`，**但 grid 报告的两列总宽是 1122px**。CSS Grid 的 track 总宽可以超过容器宽（被 `overflow: hidden` 视觉截断，但几何上 track 起点会推导出视口外的位置）。第 2 列（sidebar）从 `x=862` 开始，**完全在 `#main` 的可见区右边**，被 `overflow: hidden` 切掉。

但浏览器报告的 `sidebarRectLeft=862` —— sidebar 自身的位置是浏览器根据 grid track 推出的真实坐标，确实就在视口外。

### 第三层：找为什么 `1fr` track 报告 862px

`#main` 的 grid 模板是 `1fr 260px`。`1fr` 实际等价于 `minmax(auto, 1fr)`，**`auto` 最小值等于该列的 `max-content`**。第 1 列（canvas）里有什么元素的 max-content 是 862px？

最可能的解释：**cytoscape 在大屏进入时调用了 `cy.resize()`，记录了一个比视口大的 canvas 尺寸**（取决于之前 grid 的尺寸状态）。退出大屏时 grid 回到 `1fr 260px`，**cytoscape 内部的 canvas 元素带着那个被记住的宽度**，作为 grid 第 1 列的 max-content 把 `1fr` 撑到 862px。

这一层不需要再去 cytoscape 源码里抠 —— **问题不在 cytoscape**，问题在 CSS Grid 给了 `1fr` 一个能撑破视口的 `auto` 下限。

## 根本原因

CSS Grid 的 `1fr` 不是"弹性占满剩余空间"，而是 `minmax(auto, 1fr)`：

- `auto` 最小值 = 列内**所有内容的 max-content 宽度**
- 如果列里**任何一个子元素的 max-content > (viewport - 其它列宽)**，`auto` 就会撑破视口

进入大屏 → `cy.resize()` 让 cytoscape canvas 元素"记住"了一个较宽的尺寸（取决于当时的 grid 配置）。**退出大屏时 grid 回到 `1fr 260px`，但 canvas 元素的尺寸仍然较宽**，作为 `max-content` 把 `1fr` 撑到 862px（在我们 836px 视口下）。Sidebar 在 grid 第 2 列，**起点被推到 x=862**，完全在 `#main` 的 `overflow: hidden` 框之外。

**为什么 sidebar 自身看起来一切正常？** —— sidebar 自己的 DOM 没动（`.hidden` 不在、transform identity、opacity 1），它**只是几何上被放到了视口右边**，肉眼完全看不见。点 toolbar 的折叠按钮时，按钮接收点击、状态切换正常，但 sidebar 还是在视口外，用户感知就是"按钮没反应"。

## 修复

把 `#main` 所有 grid 模板里的 `1fr` 改成 **`minmax(0, 1fr)`**，强制 canvas 列的最小宽度为 0，使 grid 总宽被 `#main` 自身宽度约束在视口内。

**`src/ui/styles/layout.css`**：

```css
#main {
  display: grid;
  /* minmax(0, 1fr) is required — a plain `1fr` defaults to
     `minmax(auto, 1fr)`, whose `auto` minimum is the column's
     max-content. If cytoscape's canvas remembers a width larger
     than (viewport - 260px) — which it routinely does after a
     bigscreen round-trip — that auto-min pushes the canvas track
     past viewport width and parks the sidebar column entirely
     outside #main's overflow:hidden box. Forcing min size to 0
     keeps the grid total pinned to #main's own width. */
  grid-template-columns: minmax(0, 1fr) 260px;
  overflow: hidden;
  height: calc(100vh - 56px - 44px);
  position: relative;
  z-index: 1;
  /* Same reason at the flex/grid boundary — without min-width:0,
     a grid item can refuse to shrink below its min-content size
     and re-introduce the same overflow. */
  min-width: 0;
}

#main.sidebar-hidden { grid-template-columns: minmax(0, 1fr) 0; }
```

**`src/ui/styles/components.css`** — `html.bigscreen #main` 和 `@media (max-width: 768px)` 里的 `1fr` 同样改：

```css
html.bigscreen #main {
  height: 100vh;
  grid-template-columns: minmax(0, 1fr) 0;
}

@media (max-width: 768px) {
  #main { grid-template-columns: minmax(0, 1fr); }
}
```

## 验证

修复后再次执行原复现步骤：

- `mainGridCols` 从 `"862px 260px"` 变成 `"576px 260px"`（视口 836 - sidebar 260 = 576）
- `sidebarRectLeft` 从 `862` 变成 `576`
- `sidebarRectRight` 从 `1122` 变成 `836`（正好等于视口右边缘）
- Sidebar 视觉上完全可见，折叠按钮正常切换

## 经验总结

1. **CSS Grid 的 `1fr` 永远要警惕 `auto` 下限** —— 任何子元素 max-content 异常都能撑破容器。**任何 grid 容器 + 动态子内容**的场景，默认就用 `minmax(0, 1fr)`。
2. **几何位置不对但 DOM 状态正确** —— 这类 bug 调试时不能只看元素自身属性，必须看**它所在的布局上下文**（grid track、flex item、绝对定位父级）。
3. **`overflow: hidden` 不能解决 grid track 越界** —— 它只裁剪视觉，不影响 track 内部的子项几何坐标。如果 track 起点已经在视口外，子项再"健康"也救不回来。
4. **大屏/全屏切换是 grid track 撑破的常见诱因** —— resize()、全屏 API、layout 突变都可能在子元素上留下"记住的尺寸"，作为 max-content 在下一次 grid 重新计算时撑破 `1fr`。

## 相关代码

- `src/ui/styles/layout.css` — `#main` 主网格（已修复）
- `src/ui/styles/components.css` — 大屏规则 + 窄屏断点（已修复）
- `src/ui/bigscreen.ts` — 大屏进入/退出与 sidebar 状态恢复（日志已清理）
- 修复提交：`6f2d290 fix(bigscreen): sidebar pushed offscreen after bigscreen round-trip`