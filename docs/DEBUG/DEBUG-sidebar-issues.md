# Debug 记录：侧栏图例截断 & 折叠展开失效

**日期**: 2026-08-26
**状态**: 已修复
**严重等级**: High（功能可用性影响）

***

## 问题一：侧栏图例被截断（滚动不生效）

### 1.1 问题描述

侧栏（sidebar）内的图例说明区块包含 4 个子 section（节点本质、学科领域、知识层级、关联关系），当 4 个 section 的总内容高度超过侧栏可视高度时：

- 关联关系（13 种边类型）底部行被截断，无法看到完整文字

- 侧栏滚动条虽然存在，但滚动到底部后仍无法看到完整内容

- 折叠/展开 section 时偶尔出现闪烁

### 1.2 根因定位

**根因 1：`.sidebar-section__body`** **的** **`max-height: 600px`** **硬限制**

```css
/* 旧代码 */
.sidebar-section[data-section-state="open"] .sidebar-section__body {
  max-height: 600px;  /* ← 罪魁祸首 */
}
```

"图例说明"是一个 `sidebar-section`，内部包含 4 个 `legend-block`。其 body 的 `max-height: 600px` 把所有图例内容限制在 600px 内。当 4 个 section 的内容加起来超过 600px 时，底部被 `overflow: hidden`（来自折叠状态的样式）裁掉。

**根因 2：`.legend-section__body`** **展开时** **`overflow-y: visible`**

```css
/* 旧代码 */
.legend-section[data-section-state="open"] .legend-section__body {
  max-height: none;
  overflow-x: auto;
  overflow-y: visible;  /* ← 内容溢出但父级 max-height 截断 */
}
```

子 section 展开时 `overflow-y: visible`，意味着内容可以溢出显示，但父级的 `max-height: 600px` 已经把外层裁掉了，子级溢出的部分也随之丢失。

**根因 3：`max-height`** **过渡的固有缺陷**

`max-height: 0 → 600px` 的过渡动画存在两个问题：

1. 动画时长按 600px 计算，即使实际内容只有 100px，动画也会走完整时长
2. 关闭时内容高度可能远小于 600px，导致"回弹"感
3. 600px 是任意选择的值，无法适应内容变化

### 1.3 解决方案

**第一版方案：CSS Grid** **`grid-template-rows: 0fr → 1fr`**

利用 CSS Grid 的 `0fr` / `1fr` 行高过渡，替代 `max-height` 动画。

```css
/* 第一版方案 */
.sidebar-section__body {
  display: grid;
  grid-template-rows: 0fr;        /* 折叠：行高为 0 */
  transition: grid-template-rows 0.28s cubic-bezier(0.4, 0, 0.2, 1),
              padding 0.28s ease;
}
.sidebar-section__body > * {
  overflow: hidden;              /* 关键：让子元素可收缩到 0 */
}
.sidebar-section[data-section-state="open"] .sidebar-section__body {
  grid-template-rows: 1fr;        /* 展开：行高自适应内容 */
}
```

| 维度    | `max-height`   | `grid-template-rows: 0fr → 1fr`                        |
| ----- | -------------- | ------------------------------------------------------ |
| 高度限制  | 硬编码上限（600px）   | 无限制，自适应内容                                              |
| 动画精度  | 按最大值计算，与实际内容不符 | 按实际内容插值，精准                                             |
| 滚动兼容性 | 父级截断 → 子级滚动失效  | 父级传递高度 → 子级滚动正常                                        |
| 嵌套支持  | 多层嵌套时外层截断内层    | 每层独立过渡，互不干扰                                            |
| 浏览器支持 | 全浏览器           | Chrome 111+ / Firefox 113+ / Safari 16.4+（2023 年后全面支持） |

***

## 问题二：折叠/展开只影响第一个子 section

### 2.1 问题描述

点击"图例说明"或"图谱与布局"的 section header 折叠/展开时：

- "图例说明"只折叠了"节点本质（形状）"，其余 3 个子 section（学科领域、知识层级、关联关系）仍然展开可见

- "图谱与布局"只折叠了上方的统计卡片区域，下方的布局说明文字仍然展开可见

- 用户期望：点击 section header 应折叠/展开该 section 下的 **所有** 子内容

### 2.2 排查过程

| 假设                                  | 验证结果                                   |
| ----------------------------------- | -------------------------------------- |
| HTML 结构错误                           | ❌ 检查 index.html，所有子 section 均在父 body 内 |
| CSS 选择器未匹配                          | ❌ `data-section-state` 选择器正确匹配         |
| `grid-template-rows: 0fr` 只控制第一个子元素 | ✅ **根因**                               |

### 2.3 根因分析

使用 `grid-template-rows: 0fr → 1fr` 方案时，CSS Grid 的 `0fr` / `1fr` 只控制 **直接子元素** 的行高。当 `sidebar-section__body` 内包含 **多个** 子元素（如 4 个 `legend-block`）时：

- 第一版方案中，`grid-template-rows: 1fr` 只给第一行分配了空间

- 第二个及后续子元素不受 `0fr → 1fr` 过渡控制

- 它们保持自身高度，因此没有被折叠

**图示**：

```
sidebar-section__body (grid)
├── legend-block (节点本质)  ← 受 0fr→1fr 控制 ✅
├── legend-block (学科领域)  ← 不受控制 ❌
├── legend-block (知识层级)  ← 不受控制 ❌
└── legend-block (关联关系)  ← 不受控制 ❌
```

### 2.4 解决方案

**方案 A：包装为单一子元素（尝试，部分成功）**

在 HTML 中为每个 `sidebar-section__body` 添加一个 `.sidebar-section__body-inner` 包装 div，使 body 只有一个直接子元素：

```html
<div class="sidebar-section__body">
  <div class="sidebar-section__body-inner">
    <div class="legend-block">...</div>
    <div class="legend-block">...</div>
    <div class="legend-block">...</div>
    <div class="legend-block">...</div>
  </div>
</div>
```

这样 `grid-template-rows: 0fr → 1fr` 就能控制唯一的子元素，进而控制所有子 section。

**但此方案仍有问题**：Grid 的 `0fr` 行高依赖于子元素的 `overflow: hidden`，当内容高度动态变化时（如图例内容较多），过渡可能不够平滑。

**方案 B：JS 驱动的** **`max-height`** **动画（最终方案）**

放弃纯 CSS 的 `grid-template-rows` 方案，改用 JavaScript 测量 `scrollHeight` 并通过 `max-height` 实现平滑过渡：

```typescript
// src/ui/drag-manager.ts — toggleSection
export function toggleSection(name: string): void {
  const section = document.querySelector(`[data-section="${name}"]`);
  if (!section) return;
  const body = section.querySelector('.sidebar-section__body, .legend-section__body') as HTMLElement | null;
  const head = section.querySelector('.sidebar-section__chevron');

  const isOpen = section.getAttribute('data-section-state') === 'open';
  const willOpen = !isOpen;

  if (body) {
    if (willOpen) {
      // 先设为 auto 让内容撑开，测量实际高度
      body.style.maxHeight = 'none';
      const targetHeight = body.scrollHeight;
      // 设回 0，然后过渡到实际高度
      body.style.maxHeight = '0px';
      // 强制 reflow 使过渡生效
      void body.offsetHeight;
      body.style.maxHeight = targetHeight + 'px';
    } else {
      // 从当前高度过渡到 0
      body.style.maxHeight = body.scrollHeight + 'px';
      void body.offsetHeight;
      body.style.maxHeight = '0px';
    }
  }

  section.setAttribute('data-section-state', willOpen ? 'open' : 'closed');
  if (head) head.classList.toggle('open', willOpen);

  // 动画结束后，展开状态设为 none 以支持动态内容
  if (willOpen && body) {
    const onEnd = () => {
      body.style.maxHeight = 'none';
      body.removeEventListener('transitionend', onEnd);
    };
    body.addEventListener('transitionend', onEnd);
  }
}
```

同时在 `restoreSectionState` 和 `initSectionHeights` 中同步 `max-height` 样式，确保大屏切换等场景下状态一致。

### 2.5 关键实现细节

1. **测量** **`scrollHeight`**：必须在 DOM 布局完成后测量，使用 `void body.offsetHeight` 强制浏览器完成 reflow
2. **展开后设为** **`none`**：动画结束后将 `max-height` 设为 `none`，这样内容变化时不会被截断
3. **关闭前锁定高度**：关闭前先将 `max-height` 设为当前 `scrollHeight`，再过渡到 `0`，确保平滑动画
4. **初始化同步**：页面加载时通过 `initSectionHeights()` 根据 `data-section-state` 设置初始 `max-height`

***

## 改动清单

| 文件                             | 改动                                                                                        | 解决的问题            |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ---------------- |
| `src/ui/styles/components.css` | `.sidebar-section__body`: 移除 `grid-template-rows`，改为 `max-height: 0` + `overflow: hidden` | 问题一根因 1          |
| `src/ui/styles/components.css` | `.legend-section__body`: 同上                                                               | 问题一根因 1          |
| `src/ui/styles/components.css` | 移除 `> * { overflow: hidden }` 规则                                                          | 问题二（grid 方案不再使用） |
| `index.html`                   | 添加 `.sidebar-section__body-inner` 包装 div                                                  | 问题二（方案 A 过渡）     |
| `src/ui/drag-manager.ts`       | `toggleSection`: 改用 JS 测量 `scrollHeight` + `max-height` 动画                                | 问题二（方案 B）        |
| `src/ui/drag-manager.ts`       | 新增 `restoreSectionState`: 同步 `data-section-state` 和 `max-height`                          | 问题二（大屏恢复）        |
| `src/ui/drag-manager.ts`       | 新增 `initSectionHeights`: 初始化时设置 `max-height`                                              | 问题二（首屏状态）        |
| `src/ui/main.ts`               | 调用 `initSectionHeights()` 完成初始化                                                           | 问题二（首屏状态）        |
| `src/ui/bigscreen.ts`          | `restoreSidebar`: 改用 `restoreSectionState` 同步状态                                           | 问题二（大屏恢复）        |

***

## 测试验证

- ✅ 235 个单元测试全部通过

- ✅ `vite build` 构建成功

- ✅ 浏览器验证：13 种边类型完整可见，滚动正常

- ✅ 浏览器验证：折叠/展开"图例说明" → 4 个子 section 同时折叠/展开

- ✅ 浏览器验证：折叠/展开"图谱与布局" → 统计卡片和布局说明同时折叠/展开

- ✅ 控制台无错误

***

## 经验总结

1. **CSS Grid** **`0fr → 1fr`** **限制**：该方案只对单一直接子元素有效。当容器内有多个并列子元素时，需要先包装为单一子元素，或使用 JS 方案。

2. **`max-height: none`** **+ JS 动画**：虽然纯 CSS 方案更优雅，但当需要处理多个子元素时，JS 测量 + `max-height` 过渡更可靠。关键是：

   - 展开时：测量实际高度 → 过渡到该高度 → 动画结束设为 `none`

   - 关闭时：锁定当前高度 → 过渡到 `0`

3. **状态同步**：任何通过 JS 修改的样式（如 `max-height`）都需要在所有状态恢复路径（初始化、大屏切换、持久化）中同步，否则会出现状态不一致。

4. **未来建议**：如果需要更复杂的折叠动画（如 FLIP 技术），可考虑使用 `element.animate()` Web Animations API，它支持更精确的高度动画控制。

***

## 问题三：折叠侧栏后"黑幕"挡住节点（反复出现）

### 3.1 问题描述

点击"切换侧栏"按钮折叠 sidebar 后，canvas 右侧出现黑色半透明面板挡住节点。此问题在修复后曾再次出现（回归），经多次排查最终定位根因。

### 3.2 排查过程

**第一次修复尝试：sidebar-overlay 背景不透明**

sidebar 背景为 `rgba(12, 18, 34, 0.7)`（30% 透明）。折叠/展开动画期间 sidebar 进入 `sidebar-overlay` 浮层模式（`position: absolute`），canvas 在其背后 resize，30% 透明度让黑色透出。

修复：给 `#sidebar.sidebar-overlay` 加 `background: rgb(12, 18, 34)` 完全不透明。

结果：背景不透明了，但问题依然存在。

**第二次修复尝试：opacity 不淡出**

发现 sidebar 在动画期间 `opacity: 0.03`（几乎透明）。`#sidebar.hidden` 设置 `opacity: 0` 带 280ms 过渡，sidebar 滑出时整体淡出，不透明背景跟着变透明。

修复：给 `#sidebar.sidebar-overlay` 加 `opacity: 1` + 只过渡 transform 不过渡 opacity。

结果：动画期间 opacity 正确为 1，但折叠**完成后**问题依然存在。

**第三次修复（最终）：CSS @layer 优先级冲突**

折叠完成后检查 computed style 发现：

- `width: 260px`（应為 0）

- `flex: 0 0 260px`（应为 0）

- `opacity: 0.053`（仍在淡出中）

- `overflow: hidden auto`（overflow-y 未被覆盖）

**根因**：CSS `@layer` 声明顺序为 `base, shared, layout, ..., sidebar, ...`。`sidebar` 层优先级高于 `layout` 层。

- `#sidebar` 基础规则在 `@layer sidebar` 中设了 `width: 260px; flex: 0 0 260px; overflow-y: auto`

- `#main.sidebar-hidden #sidebar` 在 `@layer layout` 中设了 `width: 0; flex: 0 0 0; overflow: hidden`

- 由于 `sidebar` 层 > `layout` 层，**后者被完全覆盖**，sidebar 折叠后仍占 260px 宽

### 3.3 最终解决方案

将 `flex/width/overflow` 覆盖从 `@layer layout` 移到 `@layer sidebar` 的 `#sidebar.hidden` 规则中。同层内 specificity `#sidebar.hidden`（1 ID + 1 class）> `#sidebar`（1 ID），正确覆盖：

```css
/* components.css @layer sidebar 内 */
#sidebar.hidden {
  transform: translateX(100%); opacity: 0; pointer-events: none;
  flex: 0 0 0; width: 0; overflow: hidden; border-left: none;
}

#sidebar.sidebar-overlay {
  position: absolute; right: 0; top: 0; bottom: 0; width: 260px; z-index: 6;
  background: rgb(12, 18, 34);
  opacity: 1;
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
```

### 3.4 验证

| 属性       | 修复前（折叠后）      | 修复后（折叠后）    |
| -------- | ------------- | ----------- |
| width    | `260px`       | `0px` ✅     |
| flex     | `0 0 260px`   | `0 0 0px` ✅ |
| opacity  | `0.053`       | `0` ✅       |
| overflow | `hidden auto` | `hidden` ✅  |

| 属性         | 修复前（动画中 50ms）        | 修复后（动画中 50ms）     |
| ---------- | -------------------- | ----------------- |
| opacity    | `0.03`               | `1` ✅             |
| background | `rgba(12,18,34,0.7)` | `rgb(12,18,34)` ✅ |
| position   | `static`             | `absolute` ✅      |

### 3.5 经验总结

1. **CSS** **`@layer`** **优先级陷阱**：当 `@layer` 声明顺序使某层优先级更高时，该层中的低 specificity 规则会覆盖其他层中的高 specificity 规则。跨层覆盖属性时，必须将覆盖规则放在同一层或更高层。

2. **opacity 过渡与背景透明的交互**：`opacity` 作用于整个元素（包括子元素和背景），即使背景色设为不透明，`opacity < 1` 仍会让整个元素半透明。折叠动画应只过渡 `transform`，不过渡 `opacity`，或在 overlay 期间强制 `opacity: 1`。

3. **回归根因**：此问题之前"修复"过，但只修了表面（背景不透明、opacity 不淡出），没有修到根因（@layer 优先级冲突导致 `width/flex` 未生效）。反复出现的教训：**务必用 computed style 验证最终状态**，而非只看动画中间状态。

