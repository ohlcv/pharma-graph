# Debug 记录：侧栏图例被截断（滚动不生效）

**日期**: 2026-08-26
**状态**: 已修复
**严重等级**: High（功能可用性影响）

---

## 1. 问题描述

侧栏（sidebar）内的图例说明区块包含 4 个子 section（节点本质、学科领域、知识层级、关联关系），当 4 个 section 的总内容高度超过侧栏可视高度时：

- 关联关系（13 种边类型）底部行被截断，无法看到完整文字
- 侧栏滚动条虽然存在，但滚动到底部后仍无法看到完整内容
- 折叠/展开 section 时偶尔出现闪烁

## 2. 排查过程

### 2.1 表象与初步假设

| 假设 | 验证结果 |
|---|---|
| `#sidebar` 高度计算错误 | ❌ `height: 100%` 正确，`#main` 的 flex 布局提供确定高度 |
| 被其他元素遮挡（toolbar/bigscreen） | ❌ 排除，问题在常规模式下也复现 |
| `overflow` 属性传递失效 | ❌ 逐级检查后 `overflow-y: auto` 正确传递 |
| `flex-shrink` 导致子项被压缩 | ❌ 已设 `flex-shrink: 0`，内容仍被截断 |

### 2.2 根因定位

**根因 1：`.sidebar-section__body` 的 `max-height: 600px` 硬限制**

```css
/* 旧代码 */
.sidebar-section[data-section-state="open"] .sidebar-section__body {
  max-height: 600px;  /* ← 罪魁祸首 */
}
```

"图例说明"是一个 `sidebar-section`，内部包含 4 个 `legend-block`。其 body 的 `max-height: 600px` 把所有图例内容限制在 600px 内。当 4 个 section 的内容加起来超过 600px 时，底部被 `overflow: hidden`（来自折叠状态的样式）裁掉。

**根因 2：`.legend-section__body` 展开时 `overflow-y: visible`**

```css
/* 旧代码 */
.legend-section[data-section-state="open"] .legend-section__body {
  max-height: none;
  overflow-x: auto;
  overflow-y: visible;  /* ← 内容溢出但父级 max-height 截断 */
}
```

子 section 展开时 `overflow-y: visible`，意味着内容可以溢出显示，但父级的 `max-height: 600px` 已经把外层裁掉了，子级溢出的部分也随之丢失。

**根因 3：`max-height` 过渡的固有缺陷**

`max-height: 0 → 600px` 的过渡动画存在两个问题：
1. 动画时长按 600px 计算，即使实际内容只有 100px，动画也会走完整时长
2. 关闭时内容高度可能远小于 600px，导致"回弹"感
3. 600px 是任意选择的值，无法适应内容变化

## 3. 解决方案

### 3.1 最终方案：CSS Grid `grid-template-rows: 0fr → 1fr`

利用 CSS Grid 的 `0fr` / `1fr` 行高过渡，替代 `max-height` 动画。

```css
/* 新方案 */
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

同样的方案应用到 `.legend-section__body`。

### 3.2 为什么 `0fr → 1fr` 比 `max-height` 好

| 维度 | `max-height` | `grid-template-rows: 0fr → 1fr` |
|---|---|---|
| 高度限制 | 硬编码上限（600px） | 无限制，自适应内容 |
| 动画精度 | 按最大值计算，与实际内容不符 | 按实际内容插值，精准 |
| 滚动兼容性 | 父级截断 → 子级滚动失效 | 父级传递高度 → 子级滚动正常 |
| 嵌套支持 | 多层嵌套时外层截断内层 | 每层独立过渡，互不干扰 |
| 浏览器支持 | 全浏览器 | Chrome 111+ / Firefox 113+ / Safari 16.4+（2023 年后全面支持） |

### 3.3 关键实现细节

1. **`> * { overflow: hidden }`**：Grid 的 `0fr` 行需要直接子元素设置 `overflow: hidden`，否则子元素会保持固有高度，`0fr` 无法收缩。这是最容易遗漏的一步。

2. **`grid-template-rows` vs `grid-template-rows: 1fr`**：
   - 折叠态：`0fr`（行高为 0，子元素被 `overflow: hidden` 裁掉）
   - 展开态：`1fr`（行高占满可用空间，子元素按内容撑开）
   - 过渡时浏览器在 0 和内容实际高度之间插值

3. **保留 `overflow-x: auto`**：长标签横向滚动兜底，防止文字被静默截断。

## 4. 改动清单

| 文件 | 改动 |
|---|---|
| `src/ui/styles/components.css` | `.sidebar-section__body`: `max-height` → `grid-template-rows` |
| `src/ui/styles/components.css` | `.legend-section__body`: `max-height` → `grid-template-rows` |
| `src/ui/styles/components.css` | 添加 `.sidebar-section__body > *` 和 `.legend-section__body > *` 的 `overflow: hidden` |

## 5. 测试验证

- ✅ 235 个单元测试全部通过
- ✅ `vite build` 构建成功
- ✅ 浏览器验证：13 种边类型完整可见，滚动正常，折叠/展开动画平滑
- ✅ 控制台无错误

## 6. 延伸思考

类似的 `max-height` 硬编码问题在其他场景可能重现：

1. **移动端 media query**：`@media (max-width: 768px)` 下的侧栏行为
2. **bigscreen 模式**：进出大屏时侧栏的 grid/flex 切换
3. **未来新增图例 section**：如果再加分类（如"治疗靶点"），600px 限制会再次成为问题

建议：所有折叠/展开动画统一使用 `grid-template-rows: 0fr → 1fr` 模式，彻底消除硬编码高度限制。
