# 闭包作用域迫使直接操作 DOM —— 妥协方案与最佳实践

## 问题描述

首屏 euler 布局还没收敛时，用户通过虫洞切换宇宙，`renderer.runLayout` 会 stop 旧实例、启动新实例。首屏 euler 的 `onLayoutStop` 回调因 instance 检查被跳过，`completeLoading` 永远不被调用 → 「大爆炸！」加载条卡死不消失。

修这个 bug 时，agent 第一次给的方案是**直接操作 DOM**：

```ts
// onEnterSpace 里的妥协方案（已被废弃）
const loadingIndicator = document.getElementById('loading-indicator');
if (loadingIndicator && !loadingIndicator.classList.contains('complete')) {
  completeLoadingWithFadeOut();  // 绕过 completeLoading，直接调底层
}
```

用户一眼看穿这是妥协，连续追问三个问题：

1. **"你说的闭包是什么？是代码层面的吗？"**
2. **"直接操作 DOM 是最佳实践吗，还是妥协的替代方案？"**
3. **"那如果开了，是不是最佳实践？最佳实践是什么？你按照最佳实践给我做。"**

## 闭包是什么（代码层面）

是的，纯代码层面的 JavaScript 函数闭包（closure）。

```ts
function finishStreamingLayout(): void {
  let settled = false;            // 局部变量
  const completeLoading = () => { // 局部函数
    if (settled) return;          // 按引用读 settled —— 闭包
    settled = true;
    completeLoadingWithFadeOut();
    ...
  };
}
```

`settled` 和 `completeLoading` 是 `finishStreamingLayout` 的**局部变量**。JavaScript 的作用域规则：只有这个函数内部能访问它们。外面的函数（`onEnterSpace`、`boot`）**语法上就读不到**——不是"没暴露"，是 JS 作用域根本不允许。

正因为 `onEnterSpace` 读不到 `completeLoading`，agent 才退而求其次直接调了底层的 `completeLoadingWithFadeOut()`（那个是模块级函数，外面能读到）。

## 妥协方案的三个问题

| 问题 | 说明 |
| --- | --- |
| **绕过闸门** | `completeLoading()` 有 `settled` 幂等保护，`completeLoadingWithFadeOut()` 没有——直接调等于绕过状态机，加载条可能被触发多次 |
| **两条路径都能触发"加载完成"** | `finishStreamingLayout` 里调 `completeLoading()`，`onEnterSpace` 里调 `completeLoadingWithFadeOut()`——职责分散，谁能触发什么不清晰 |
| **用表现反推状态** | `classList.contains('complete')` 是 DOM 表现，不是真正的状态变量——用"看起来像完成了"来推断"确实完成了"，脆弱。如果哪天 CSS class 名改了，这个检查就静默失效 |

## 最佳实践

**把状态提升到所有需要它的代码都能访问的层级，用一个明确的单一入口控制状态转换。**

### 原则

1. **状态有单一事实来源**（one source of truth）——不要让同一个状态分散在多个变量 / DOM class / 闭包里
2. **状态转换有单一入口**——所有需要触发状态转换的代码都走同一个函数，不要各自绕过它调底层
3. **幂等保护在入口处**——多次调用安全，入口函数自己保证只生效一次
4. **DOM 操作封装在底层**——外部只调状态入口函数，不直接碰 DOM

### 具体做法

把 `settled`（局部变量）和 `completeLoading`（局部函数）从 `finishStreamingLayout` 内部**提升到模块级**：

```
提升前：
  finishStreamingLayout() {
    let settled = false;           ← 局部，外面读不到
    const completeLoading = ...    ← 局部，外面调不到
  }
  onEnterSpace() {
    ??? 想调 completeLoading 但访问不到
    → 退而求其次直接操作 DOM（妥协）
  }

提升后：
  let bootSettled = false;         ← 模块级，所有函数都能读
  function completeLoading() {     ← 模块级，所有函数都能调
    if (bootSettled) return;       ← 幂等闸门
    bootSettled = true;
    completeLoadingWithFadeOut();  ← DOM 操作封装在内部
    settleAfterLayout();
  }
  finishStreamingLayout() { ... completeLoading() ... }  ← 调模块级
  onEnterSpace() { ... completeLoading() ... }            ← 也调模块级，同一入口
```

提升后：
- **单一事实来源**：`bootSettled` 是唯一的"首屏是否已收尾"状态
- **单一入口**：`completeLoading()` 是唯一会翻 `bootSettled` 的函数
- **幂等**：`onEnterSpace` 兜底调 `completeLoading()` 安全——已收尾则 no-op
- **DOM 封装**：`onEnterSpace` 不再直接碰 DOM，只调 `completeLoading()`

## 代码位置

- `src/ui/main.ts`
  - `bootSettled`（模块级状态变量）—— 提升自 `finishStreamingLayout` 局部 `settled`
  - `completeLoading()`（模块级函数）—— 提升自 `finishStreamingLayout` 局部函数
  - `completeLoadingWithFadeOut()`（模块级函数）—— 底层 DOM 操作，保持不变
  - `finishStreamingLayout()` —— 删掉局部 `settled` / `completeLoading`，改调模块级
  - `onEnterSpace` 回调 —— 删掉直接操作 DOM 的 4 行，改调 `completeLoading()`

## 修复

### 提升状态到模块级

```ts
// 模块级（let tourController 附近）
let bootSettled = false;

// 模块级（completeLoadingWithFadeOut 之后）
function completeLoading(): void {
  if (bootSettled) return;
  bootSettled = true;
  completeLoadingWithFadeOut();
  if (!(window as unknown as { __noSep?: boolean }).__noSep) settleAfterLayout();
}
```

### onEnterSpace 改调单一入口

```ts
// 改前（妥协方案）
const loadingIndicator = document.getElementById('loading-indicator');
if (loadingIndicator && !loadingIndicator.classList.contains('complete')) {
  completeLoadingWithFadeOut();
}

// 改后（最佳实践）
completeLoading();  // 幂等，已收尾则 no-op
```

### finishStreamingLayout 删掉局部定义

```ts
// 删掉：
let settled = false;
const completeLoading = (): void => { ... };

// 留下注释指向模块级定义：
// completeLoading 和它的 bootSettled 闸门已提升到模块级——
// onEnterSpace 在边界场景里也需要调它做兜底。
```

## 验证

| 项 | 妥协方案 | 最佳实践 |
| --- | --- | --- |
| 状态来源 | 两处（`settled` 闭包 + DOM `classList`） | 一处（`bootSettled`） |
| 触发入口 | 两个（`completeLoading` + `completeLoadingWithFadeOut`） | 一个（`completeLoading`） |
| 幂等保护 | `onEnterSpace` 路径绕过了 `settled` 闸门 | `completeLoading` 内部统一保护 |
| DOM 操作 | `onEnterSpace` 直接 `getElementById` + `classList` | 封装在 `completeLoadingWithFadeOut` 内 |
| 状态推断 | 用 DOM 表现（`classList.contains`）反推状态 | 直接读状态变量（`bootSettled`） |
| `tsc --noEmit` | 通过 | 通过 |

## 经验总结

### 给 agent 的教训

1. **遇到"访问不到"时，先问"为什么访问不到"，再问"正确的做法是什么"**——闭包作用域是 JS 的基本规则，不是障碍物。绕过它（直接操作 DOM）是把架构问题用 hack 掩盖，根因是状态放错了层级。

2. **"能用"不等于"该这么写"**——妥协方案能跑通当前场景，但引入了状态分散、职责分散、表现反推状态三个隐患。用户一眼就能看出来。

3. **DOM 是表现层，不是状态层**——永远不要用 DOM 的 class / attribute / style 来推断业务状态。状态放变量里，DOM 只是状态的渲染结果。

### 妥协方案什么时候可接受

只在**临时验证假设**时（比如 probe 脚本里快速试一下"是不是这个原因"）可接受。一旦确认要落代码，必须按最佳实践重构。永远不要把妥协方案留在生产代码里。

## 相关代码

- `src/ui/main.ts` — `bootSettled` / `completeLoading` / `completeLoadingWithFadeOut` / `finishStreamingLayout` / `onEnterSpace`（已修复）
- `docs/ADR/ADR-0011-layout-user-viewport-respect.md` — 同期的布局取景决策（已被 ADR-0012 superseded，但历史背景相关）
