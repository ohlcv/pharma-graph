# Tour 移动端滑块渲染问题（fill 错位 / 深度滑块无紫条 / 触摸热区窄 / thumb 错位）

**日期**: 2026-09-11
**状态**: ✅ 已修复
**严重等级**: High（用户调整间隔/深度滑块时反馈失真，触摸命中困难）

***

## 问题描述

用户在手机端（≤640px）调整 Tour 的两个竖向滑块时，遇到 **四个相互关联的视觉/交互问题**：

1. **深度滑块（maxdepth）拉到顶时，紫色 fill 顶部留白 ~6px**（fill 比 thumb 圆心低，看起来没拉满）
2. **深度滑块移动端整条都没有紫色 fill**（和间隔滑块对比，后者有紫条）
3. **触摸热区只有 4px 宽**，手指很难精确拖动滑块
4. **间隔滑块 2s 时紫色 fill 只占 ~16px**（看起来"几乎没填"）

四个问题看似独立，其实是同一组组件（`<input type="range">` + 自定义 fill div + 自定义 thumb）上**三个不同层级的缺陷**叠加的结果。

## 环境

- 浏览器：移动端 Safari/Chrome（≤640px viewport）
- 功能：Tour 漫游控制条（`.tour-mob`）上的两个竖向滑块：间隔 / 深度
- 相关文件：
  - `src/ui/styles/tour.css`（`.tour-mob__track-container` / `.tour-mob__track` / `.tour-mob__fill` / `.tour-mob__range` / `::-webkit-slider-thumb`）
  - `src/ui/tour-controller.ts`（`paintFill`、`bindSlider`）
  - `index.html`（HTML 滑块结构，`tour-depth-fill` / `tour-maxdepth-fill` 等 id）

## 排查过程

### 问题 1：fill 顶端在 pct=1 时穿出 thumb

第一版 `paintFill` 实现：

```typescript
private paintFill(s: SliderBind): void {
  const min = Number(s.range.min), max = Number(s.range.max);
  const pct = ((s.range.valueAsNumber - min) / (max - min));
  if (s.fill) {
    s.fill.style.transform = `scaleY(${pct})`;
  }
  ...
}
```

pct 直接套 `scaleY()`。但浏览器原生 `<input type="range">` 的 thumb 圆心行程是 **`[thumbR, trackLen - thumbR]`**，不是 `[0, trackLen]`。pct=1 时 fill 长满 80px 容器，thumb 圆心其实在 71px 处 → **fill 顶端超出 thumb 圆心 9px**，看起来 fill"顶穿"了圆点。

**修正**：把 pct 映射到 thumb 圆心的实际行程上：

```typescript
const container = s.fill.parentElement as HTMLElement | null;
const trackLen = container?.clientHeight || 80;
const thumbSize = 18;        // 必须与 ::-webkit-slider-thumb 的 width/height 一致
const thumbR = thumbSize / 2;
const travel = Math.max(0, trackLen - thumbSize);
const centerFromBottom = thumbR + pct * travel;
s.fill.style.transform = `scaleY(${centerFromBottom / trackLen})`;
```

这样 fill 顶端严格落在 thumb 圆心。

### 问题 2：深度滑块移动端没有紫色 fill

JS 查找 fill 的代码：

```typescript
for (const mobileDepth of [
  document.getElementById('tour-maxdepth') as HTMLInputElement | null,
  document.getElementById('tour-maxdepth-mob2') as HTMLInputElement | null,
].filter(Boolean) as HTMLInputElement[]) {
  this.sliders.push(this.bindSlider(
    mobileDepth, desktopDepth,
    document.getElementById(mobileDepth.id + '-fill'),  // ← 关键
    ...
  ));
}
```

`mobileDepth.id === 'tour-maxdepth'` 时查找 `tour-maxdepth-fill`，但 HTML 里写的是 `id="tour-depth-fill"` → `getElementById` 返回 `null` → `bindSlider` 把 fill 当 null → `paintFill` 走 else 分支（只处理桌面横条），移动端深度滑块**完全没有 fill**。

对比：间隔滑块 HTML 里就是 `id="tour-interval-fill"`，与 JS 查找规则一致，所以正常显示。

**修正**：HTML 里把 `tour-depth-fill` 改名为 `tour-maxdepth-fill`，与 JS 的 `mobileDepth.id + '-fill'` 查找规则对齐：

```html
<div class="tour-mob__track-container">
  <div class="tour-mob__track">
    <div class="tour-mob__fill" id="tour-maxdepth-fill"></div>
  </div>
  <input type="range" class="tour-mob__range" id="tour-maxdepth" ...>
</div>
```

### 问题 3：触摸热区只有 4px 宽

原始 CSS：

```css
.tour-mob__track-container {
  width: 4px; height: 80px;   /* 视觉轨道容器只有 4px 宽 */
}
.tour-mob__range {
  position: absolute; inset: 0;  /* range 也只有 4px 宽 */
  writing-mode: vertical-lr;
  ...
}
```

`<input type="range">` 的可触摸/可命中区域就是它自身的盒子大小——这里被 `inset:0` 死死限制成 **4px 宽**。手指宽度通常 >10px，命中率极低，必须反复精确点中那 4px 才能触发拖动。

此前曾用 `margin: -6px -8px` 在 thumb 位置扩大热区，但那只是 thumb 当前位置的局部放大，**其他位置的轨道本体仍是 4px**。

**修正**：把"看起来细"和"摸起来粗"拆开——视觉轨道保持 4px 细线，但 `track-container` 加宽到 32px 作为触摸热区：

```css
.tour-mob__track-container {
  position: relative;
  width: 32px; height: 80px;       /* 热区加宽 8 倍 */
}
.tour-mob__track {
  position: absolute;
  left: 50%; top: 0; bottom: 0;
  width: 4px;
  transform: translateX(-50%);      /* 视觉居中显示 4px 细线 */
  background: rgba(255,255,255,0.08);
  pointer-events: none;             /* 避免遮挡下面 32px 的 range */
}
.tour-mob__fill {
  position: absolute;
  left: 50%; bottom: 0;
  width: 4px; height: 100%;
  transform: translateX(-50%) scaleY(0);  /* 居中 + JS 动态 scaleY */
  ...
}
.tour-mob__range {
  position: absolute; inset: 0;     /* 覆盖整个 32×80px container */
  width: auto; height: auto;
  writing-mode: vertical-lr;
  touch-action: none;               /* 显式声明，不依赖父级继承 */
  ...
}
```

配套修正 `paintFill`，因为 fill 现在需要 `translateX(-50%)` 维持居中：

```typescript
s.fill.style.transform = `translateX(-50%) scaleY(${centerFromBottom / trackLen})`;
```

### 问题 4：间隔滑块 2s 时紫色 fill 只占 ~16px

不是代码 bug，是 **min/max 量程设计**：

```html
<input type="range" id="tour-interval" min="1000" max="10000" step="500" value="2000">
```

`pct = (2000 - 1000) / (10000 - 1000) = 0.111` → fill 高 ~16px（占 80px track 的 20%）。**数学上正确**，但视觉上确实看起来"少"。

这是产品决策问题，未在本轮修复。如果后续要改善，可考虑：
- 收窄量程到 1~10s（保持线性，量程缩短）
- 加 `step=250` 让低值刻度更细（仍 1~10s，但 2s/3s 之间有视觉停顿）

### 关联问题：thumb 负 margin 导致 fill 顶部留白

去掉负 margin 之前，CSS 是：

```css
.tour-mob__range::-webkit-slider-thumb {
  width: 18px; height: 18px;
  margin: -6px -8px;   /* 负 margin 把 thumb 视觉位置上移 6px */
}
```

JS 的 fill 公式按 thumb 声明尺寸（18px, `thumbR=9px`）计算，认为 thumb 圆心在 `[9, 71]px` 之间。但 `margin: -6px -8px` 让 thumb 实际渲染位置**整体上移 6px** → 视觉 thumb 圆心在 `[3, 77]px` 之间。pct=1 时 fill 顶端在 71px，视觉 thumb 圆心在 77px → **fill 顶端比 thumb 圆心低 6px**（与问题 1 的症状方向相反）。

**修正**：`margin: -6px -8px` → `margin: 0`，让声明尺寸 = 视觉尺寸。触摸热区已由 `track-container: 32px` 保证，无需负 margin。

## 根本原因

四个问题的根因可以归为三类：

| 类别 | 问题 | 根因 |
|------|------|------|
| **JS 数学模型** | 问题 1（fill 顶端穿出 thumb）| 直接用 `pct` 当 scaleY，没考虑 thumb 圆心行程 ≠ [0, trackLen] |
| **CSS/HTML 标识** | 问题 2（深度滑块无 fill）| HTML fill id 与 JS 查找规则不一致（`tour-depth-fill` vs `tour-maxdepth-fill`）|
| **CSS 触摸热区** | 问题 3（4px 热区）| `<input>` 视觉宽度 = 触摸宽度，没分离"视觉细线"和"命中区" |
| **CSS thumb 渲染** | 问题 4（fill 顶端留白）| 负 margin 让 thumb 视觉位置与原生声明位置脱钩，fill 公式失效 |
| **产品设计** | 间隔滑块 2s 紫色少 | 量程 1~10s 下低值天然占比小，非代码 bug |

最核心的设计错误是 **「fill 公式依赖 thumb 的浏览器内部几何形状」** —— 浏览器对 `<input type="range">` 的内部阴影 DOM 几何形状并没有公开规范，Chrome/Safari/Firefox 的实现细节略有不同（特别是 thumb 的负 margin 行为），导致 fill 公式极易与视觉脱钩。

## 修复方案

### 1. `src/ui/tour-controller.ts` `paintFill`

填高度按 thumb 圆心实际行程换算，保留 `translateX(-50%)` 让居中生效：

```typescript
private paintFill(s: SliderBind): void {
  const min = Number(s.range.min), max = Number(s.range.max);
  const pct = ((s.range.valueAsNumber - min) / (max - min));
  if (s.fill) {
    const container = s.fill.parentElement as HTMLElement | null;
    const trackLen = container?.clientHeight || 80;
    const thumbSize = 18;
    const thumbR = thumbSize / 2;
    const travel = Math.max(0, trackLen - thumbSize);
    const centerFromBottom = thumbR + pct * travel;
    s.fill.style.transform = `translateX(-50%) scaleY(${centerFromBottom / trackLen})`;
  } else {
    // ...桌面横条渐变不变
  }
}
```

### 2. `index.html` 深度滑块 fill id

```diff
- <div class="tour-mob__fill" id="tour-depth-fill"></div>
+ <div class="tour-mob__fill" id="tour-maxdepth-fill"></div>
```

### 3. `src/ui/styles/tour.css` 触摸热区分离

```css
.tour-mob__track-container {
  position: relative;
  width: 32px; height: 80px;  /* 加宽到 32px 作触摸命中区 */
}
.tour-mob__track {
  position: absolute;
  left: 50%; top: 0; bottom: 0;
  width: 4px;
  transform: translateX(-50%);
  pointer-events: none;
}
.tour-mob__fill {
  position: absolute;
  left: 50%; bottom: 0;
  width: 4px; height: 100%;
  transform: translateX(-50%) scaleY(0);
}
.tour-mob__range {
  position: absolute; inset: 0;
  width: auto; height: auto;
  writing-mode: vertical-lr;
  touch-action: none;
  z-index: 2;
}
.tour-mob__range::-webkit-slider-thumb {
  width: 18px; height: 18px;
  margin: 0;   /* 去掉负 margin，避免与 fill 公式脱钩 */
}
```

## 验证

- ✅ 间隔滑块拖动：fill 从底向上平滑增长，顶端严格停在 thumb 圆心
- ✅ 深度滑块拖动：fill 与 thumb 同步拉满，顶部无留白
- ✅ 触摸命中：手指在 track 周围 32px 范围内任意位置点击/拖动都能触发
- ✅ thumb 位置：fill 公式预测与 thumb 视觉位置完全一致（声明尺寸 18px = 视觉尺寸）

## 经验教训

1. **fill 公式不要依赖浏览器内部几何形状**：原生 `<input type="range">` 的 thumb 行程是 `[thumbR, trackLen - thumbR]`，不是 `[0, trackLen]`。要么按这个行程反推，要么干脆自绘 thumb（但工作量大）。本轮选了前者。
2. **HTML id 与 JS 查找规则要严格一致**：`getElementById(prefix + '-fill')` 这种"约定式"查找对 id 命名很敏感。深度滑块的 id (`tour-maxdepth`) 与 fill id (`tour-depth-fill`) 不一致是踩坑的根本原因。后续若再加新滑块，应强制保持 id 一致（或干脆把 fill id 改成跟 range id 同名加后缀，约定明确写入注释）。
3. **"视觉细"和"命中粗"必须分离**：iOS/Android 系统设置滑块普遍用 32~44px 宽的命中区配 4px 细线，本轮采用同样做法。再次修改时不要把 `.tour-mob__range` 宽度重新改回 4px。
4. **负 margin 是 thumb 错位的常见元凶**：thumb 声明尺寸 ≠ 视觉尺寸时，fill 公式必然失效。除非完全自绘 thumb，否则保持 `margin: 0`，靠外层加宽来扩大命中区。
