# ADR-0007: 全项目视觉系统令牌化（Active / Type / Radius / Focus）

**日期**: 2026-09-23
**状态**: 已实现
**决策者**: AI Assistant

---

## 背景问题

### 1. Active（选中/激活）状态三件套碎片化
同一个"激活"语义，4 档 bg α、3 档 glow α、3 种 border 策略，混着用：

| 元素 | bg α | border | glow α |
|---|---|---|---|
| `.btn--active` | `0.15` | `rgba(0.4)` | — |
| `.btn.layout-btn.active` | `0.12` | `var(--accent)` 实色 | `0.22` |
| `#btn-tour.active` | `0.18` | `var(--accent)` 实色 | `0.25` |
| `.node-type-item.active` | `0.18` | `rgba(0.5)` | `0.25` |
| `.legend-row.active` | `0.18` | `rgba(0.5)` | `0.25` |
| `.bs-chip.active` | `0.18` | `rgba(0.4)` | `0.25` |
| `.bs-layout-btn.active` | `0.18` | `rgba(0.4)` | `0.25` |
| `.bs-quick-btn.active` | `0.18` | `rgba(0.4)` | `0.25` |
| `.shape-filter-item.active` | `0.18` | `rgba(0.5)` | `0.25` |
| `.legend-edge-row.active` | `0.18` | `rgba(0.5)` | `0.25` |
| `.node-panel__pin.active` | `0.2` | `rgba(0.7)` | — |
| `.node-panel__tab.active` | `0.18` | `rgba(0.5)` | — |

→ 同样语义的"激活"有 4 种视觉方案，用户看不出层级。

### 2. font-size 22 档裸值
`0.46 / 0.55 / 0.56 / 0.58 / 0.6 / 0.62 / 0.64 / 0.65 / 0.66 / 0.68 / 0.7 / 0.72 / 0.73 / 0.74 / 0.76 / 0.78 / 0.8 / 0.82 / 0.85 / 0.92 / 0.95 / 1.0` — 同样的"标签"语义出现 5 种 (`0.58/0.6/0.62/0.64/0.65`)。

### 3. border-radius 17 档裸值
`2/3/4/5/6/7/8/9/10/12/14/16/18/20/22/24/28px` — 已有 `--radius-xs/sm/md/lg/xl/pill` token 但没人用，档位还是散的。

### 4. focus ring 各自为政
全局 `:focus-visible` 用 `rgba(accent, 0.95)` 硬编码 2px/2px；其他选择器（reduced-motion 路径、debug 模式）有自己独立的 outline。

---

## 决策

### 1. Active 状态收成 2 档 token
- **chip 档**：bg `0.18` + border `0.5` + glow `0.25` — 用在 toggle filter 类（node-type-item、legend-row、legend-edge-row、shape-filter-item、bs-chip、bs-layout-btn、bs-quick-btn、layout-switcher__item、node-panel__pin、node-panel__tab）。
- **btn 档**：bg `0.15` + border `0.4` + glow `0.22` — 用在主按钮的 toggle（btn--active、btn.layout-btn）。

```css
--active-chip-bg-α:           0.18;
--active-chip-border-α:       0.5;
--active-chip-glow-α:         0.25;
--active-btn-bg-α:            0.15;
--active-btn-border-α:        0.4;
--active-btn-glow-α:          0.22;
--active-badge-bg-α:          0.12;
```

**例外保留**：
- `.tour-dt__btn--play.active` 用 `0.25 / 0.4` — 这是高亮态（highlight）而非 toggle，应区分。
- `.np-summary` 用 `0.06 / border-left 0.35` — 是装饰条而非 active。
- `#btn-tour.active` / `#btn-music.active` 用 `var(--accent)` 实色 — 是主按钮 toggle，border 用实色更显眼。

### 2. font-size 收成 7 档 token + 语义命名
```css
--text-3xs:  0.55rem;   /* 8.8px  — 微小提示（游标标签） */
--text-2xs:  0.6rem;    /* 9.6px  — uppercase label */
--text-xs:   0.65rem;   /* 10.4px — secondary chip text */
--text-sm:   0.7rem;    /* 11.2px — body small */
--text-base: 0.72rem;   /* 11.5px — body baseline */
--text-md:   0.78rem;   /* 12.5px — summary body */
--text-lg:   0.85rem;   /* 13.6px — emphasized heading */
```

**保留**特例：
- `font-size: 0.85em`（np-markdown code，相对父元素）
- `font-size: 1.05rem`（layout-info__badge 大徽章）
- `font-size: 1.1rem`（node-overlay-close "×" 关闭按钮）

### 3. border-radius 收成 9 档 token
旧 token（`--radius-xs/sm/md/lg/xl/pill`，值 4/8/14/20/28/999）扩展为：

```css
--radius-2xs: 2px;     /* 微型 dot、slider thumb 内层指示 */
--radius-xs:  4px;     /* 标签/小标签/code block */
--radius-sm:  6px;     /* 24px 方按钮、close/pin/tab */
--radius-md:  8px;     /* row、chip、输入框、scrollbar */
--radius-lg:  10px;    /* 大按钮、quick btn */
--radius-xl:  14px;    /* 面板、大卡片 */
--radius-2xl: 20px;    /* 胶囊 tag、stat-card */
--radius-3xl: 24px;    /* overlay panel、sheet 顶部 */
--radius-pill: 999px;  /* pill / 圆形按钮 */
```

**保留**特例（几何多值）：
- `border-radius: 3px 5px 5px 3px` — bs-chip__shape.shape-round-tag 的不对称形状
- `border-radius: 22px 22px 0 0` — bottom-sheet 顶部圆角
- `border-radius: 30px 30px 0 0` — sheet 装饰层

### 4. focus ring 抽成 token
```css
--focus-ring-width:        2px;
--focus-ring-offset:       2px;
--focus-ring-color:        rgba(var(--accent-rgb), 0.95);
```

全局 `:focus-visible` 和 reduced-motion 路径都消费这套 token，未来要改粗细只需一处。

**保留**特例：
- `.dbg-header__copy:focus-visible { outline: 2px solid var(--debug-purple); }` — debug 模式专用色
- `.dbg-header__close:focus-visible { outline: 2px solid #a5b4fc; }` — debug 模式专用色

---

## 改动范围

| 文件 | 改动 |
|---|---|
| `src/ui/styles/base.css` | 新增 5 组 token（active / focus / 扩展 radius / type scale） |
| `src/ui/styles/components.css` | 全部 `.active` 状态 token 化 + 22 处 font-size token 化 + 40+ 处 border-radius token 化 + 1 处 outline |
| `src/ui/styles/glass.css` | font-size / border-radius token 化 + 1 处 outline |
| `src/ui/styles/layout.css` | font-size / border-radius token 化 |
| `src/ui/styles/shared.css` | font-size / border-radius token 化 + 1 处 outline |
| `src/ui/styles/tour.css` | font-size / border-radius token 化 |
| `src/ui/styles/sidebar/sidebar-params.css` | font-size / border-radius token 化 |
| `src/ui/styles/sidebar/sidebar-stats.css` | font-size / border-radius token 化 |

---

## 效果

- **`.active` 状态**：13 个元素的视觉方案从 4 档收成 2 档，肉眼一眼能识别"这是个 toggle"
- **`font-size`**：从 22 档裸值收成 7 档 token；未来调字号只动 base.css
- **`border-radius`**：从 17 档裸值收成 9 档 token；未来调圆角曲线只动 base.css
- **`:focus-visible`**：所有 focus ring 走同一 token，未来改 outline 颜色/粗细只动一处

---

## 验证

```bash
npm run build    # ✓ 通过
npm run test     # ✓ 311 tests passed
npm run lint     # ✓ 0 CSS 错误（其他 182 errors 是 baseline，与本改动无关）
```

---

## 后续可做（未在本 ADR 范围）

- **P1**：text-2 / muted 混用、border / border-hi 混用 — 收 token
- **P1**：padding 5/6/7/8/9/10px 散布 — 抽 spacing scale
- **P2**：disabled 状态没有 token 化
- **P2**：glass.css 多处是死代码，可清
