# ADR-0008: 表面色与过渡时序令牌化（Surface / Shadow / Transition）

**日期**: 2026-09-23
**状态**: 已实现
**决策者**: AI Assistant

---

## 背景问题

承接 ADR-0007 的清理节奏，继续把"散落的 α 值"和"散落的过渡时长"收成 token。

### 1. 白色 α 碎片化（22 档）
`rgba(255,255,255, 0.X)` 实际散落：0.015/0.018/0.022/0.025/0.04/0.05/0.055/0.06/0.07/0.08/0.09/0.10/0.11/0.12/0.13/0.14/0.15/0.18/0.20/0.22/0.24/0.26/0.28/0.30/0.32/0.34/0.35/0.40/0.55/0.58/0.75/0.95。**22 档**。
- 多数是 chip/card/section 的"微亮底色"——本应走一套刻度
- 0.30+ 的几个是 glass.css 内部 `--lg-*` 装饰渐变或极高亮前景色

### 2. 黑色 α 碎片化（14 档）
`rgba(0,0,0, 0.X)`：0.10/0.25/0.30/0.32/0.34/0.35/0.40/0.45/0.50/0.55/0.60/0.68/0.70。几乎全部位于 box-shadow / inset-shadow，**没有 token，全靠手挑**。

### 3. transition 时序碎片化（12 种）
`0.05s / 0.08s / 0.10s / 0.12s / 0.15s / 0.18s / 0.20s / 0.22s / 0.25s / 0.28s / 0.32s / 0.35s / 0.38s / 0.4s / 0.5s`。已有 `--hover-transition (140ms) / --hover-transition-strong (180ms) / --dur-fast (150ms) / --dur-normal (250ms)`，但 75% 的 transition 走的是**裸 ms/s**。

---

## 决策

### 1. 表面色 α 收成 11 档

```css
--surface-α-2xs:  0.025;    /* 极轻铺垫 */
--surface-α-xs:   0.04;     /* 默认 chip/btn 背景 */
--surface-α-sm:   0.06;     /* card/section hover */
--surface-α-md:   0.08;     /* active/selected 略亮 */
--surface-α-lg:   0.12;     /* 高亮区 */
--surface-α-xl:   0.18;     /* hero / 强亮背景 */
--surface-α-2xl:  0.24;     /* 最高亮（rare） */
--surface-α-3xl:  0.34;     /* glass 装饰渐变端点 */
--surface-α-4xl:  0.55;     /* glass 高光线 */
--surface-α-5xl:  0.75;     /* 前景高亮（logo/icon） */
--surface-α-6xl:  0.95;     /* 全白近乎 */
```

**保留特例**：glass.css 内部的 `--lg-line / --lg-fill` 装饰 token 与高亮前景色（0.75/0.95）走原有体系。

### 2. 阴影 α 收成 7 档

```css
--shadow-α-sm:    0.10;     /* 轻落影（slider thumb tip） */
--shadow-α-md:    0.25;     /* 标准卡（chip raise） */
--shadow-α-lg:    0.35;     /* 中等浮层（dropdown） */
--shadow-α-xl:    0.40;     /* 抽屉/fab 圆钮 */
--shadow-α-2xl:   0.50;     /* 大浮层（sheet） */
--shadow-α-3xl:   0.55;     /* modal */
--shadow-α-4xl:   0.70;     /* 最高浮层（overlay card） */
```

### 3. 过渡时序收成 6 档

```css
--t-instant: 80ms;          /* 微反馈（slider thumb 缩放） */
--t-fast:    150ms;         /* 快速属性过渡（颜色/边框/缩放）——与 --dur-fast 同值 */
--t-normal:  200ms;         /* 标准过渡（chip/btn 背景） */
--t-slow:    280ms;         /* 中速（panel 展开 / 抽屉高度变化） */
--t-slower:  380ms;         /* 慢速（sheet snap、layout 切换） */
--t-slowest: 500ms;         /* 极慢（fade out / 大型过渡） */
```

**保留特例**：
- `--hover-transition (140ms)` / `--hover-transition-strong (180ms)` 不合并（与 hover 系统的边界区分）
- animation duration（`3s` 等循环动画、500ms+ 动画）保持裸值
- `0.05s`（slider thumb 闪一帧）保留裸

---

## 改动范围

| 文件 | 改动 |
|---|---|
| `src/ui/styles/base.css` | 新增 24 个 token（surface-α 11 + shadow-α 7 + t-* 6） |
| `src/ui/styles/components.css` | 157 处替换（白色 α + 黑色 α + transition 时序） |
| `src/ui/styles/glass.css` | 100+ 处替换 |
| `src/ui/styles/layout.css` | 14 处替换 |
| `src/ui/styles/shared.css` | 7 处替换 |
| `src/ui/styles/tour.css` | 38 处替换 |
| `src/ui/styles/sidebar/sidebar-params.css` | 8 处替换 |
| `src/ui/styles/sidebar/sidebar-stats.css` | 2 处替换 |

---

## 效果

- 白色 α：从 22 档散落收成 11 档 token；未来调整 chip 透明度只动 base.css 一档
- 黑色 α：从 14 档散落收成 7 档 token；box-shadow 写法从手挑变成查表
- transition：从 12 种裸时长收成 6 档 token；全项目动效曲线现在受 token 控制

合计替换 ~330 处。

---

## 验证

```bash
npm run build    # ✓ 通过
npm run test     # ✓ 311 tests passed
```

---

## 后续可做（未在本 ADR 范围）

- **P2**：`cursor: pointer + user-select + tap-highlight` 三件套抽公共类（`src/ui/components/btn-base.css`），省 ~17 处重复
- **P2**：glass.css 内部死代码梳理
- **P2**：`linear-gradient` 角度散乱（90/110/135/180）——每个用法不同，价值低
