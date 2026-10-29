# 波纹动效在 reduced-motion 下不可见 —— 反馈动效与装饰动效的归类

## 问题描述

点击节点 / 边时本应扩散的波纹（`.node-ripple`，`nodeRipple 0.5s ease-out forwards`）「看不见了」——既不是静止圆圈、也不是扩散变慢，而是**点一下就消失，肉眼完全看不到任何动效**。

## 排查走过的弯路

这个问题踩了一个"先假设、后验证"的反面教训：

1. **第一轮（假设性修复，未让用户验证就下结论）**：看到 `shared.css` 里 `@media (prefers-reduced-motion: reduce)` 把 `.node-ripple` 和 shimmer / dot-pulse 列在一起，以为是归类错误，直接改了豁免。**没让用户验证就以为搞定**，结果用户反馈"问题依然存在"。

2. **第二轮（静态分析穷尽，仍找不到第二个根因）**：
   - 怀疑 `#bigbang-veil`（body 直接子级的全屏覆盖层）盖住波纹 → 查全项目，它是个**无 CSS、无 JS、无内容的裸 div 幽灵**，注释承诺的"大爆炸过渡幕布"动效从未实现，排除（顺手删了）。
   - 怀疑 `#app { isolation: isolate }`（26bd85ac 引入）改了层叠 → 波纹 append 到 `document.body`，在根 stacking context 里 `z-index:5` 高于 `#app`，排除。
   - 怀疑 `@keyframes nodeRipple` 在 `@layer shared` 内、`.node-ripple` 的 `animation` 在 `@layer layout` 内——**跨层 keyframes 引用失败** → 规范说 keyframes 是全局的，但浏览器实现可能有差异，静态分析无法定论。

3. **第三轮（运行时事实定根因）**：静态分析走到"理论可见但实际不可见"的死胡同，请用户在 DevTools Console 跑一条 `MutationObserver` 诊断命令，点节点后 dump 波纹的 computed style。数据回来后**坐实第一轮的假设就是对的**——根因确实是 reduced-motion，第一轮修复其实有效，只是没让用户验证就误判"没修好"。

> 教训：**修复后必须让用户验证再下结论**。第一轮改对了方向，却因为没验证、又转头去查别的假设，绕了一大圈。

## 根因

`src/ui/styles/shared.css` 的 `@media (prefers-reduced-motion: reduce)` 段三股力量合力把波纹压成「瞬间消失」：

1. **universal 万能规则**把所有元素的动画时长压成 0.001ms（即 1 帧）、迭代次数压成 1、延迟清零——本意是"把有限动画压成瞬间完成"。
2. **波纹被和循环装饰一起列进禁用列表**：shimmer、dot-pulse 这些循环装饰被显式干掉（`animation: none`），波纹也被归进了这个列表。
3. **波纹自身的 `forwards` fill**（声明在 `layout.css` 里）：波纹动画带 `fill-mode: forwards`，意味着动画结束后停在末帧。

波纹的 keyframe 走向是「0% 帧 opacity 0.7 / scale 0 → 100% 帧 opacity 0 / scale 3」——从一个半透明小点扩散成一个透明大圆。

**致命链路**：universal 把时长压成 0.001ms，让波纹在 1 帧内跑完 0% → 100%；`forwards` fill 又让它**停在 100% 帧**（opacity 0、scale 3）——点一下瞬间变成一个透明的大圆并停住，肉眼就是"消失"。

### 归类错误

波纹被和 `shimmer` / `dot-pulse` 这些**循环装饰动画**归到了一起。但波纹是：

- **0.5 秒、单次**（非循环）
- **用户主动点击触发**（非自动播放装饰）
- **必要的操作反馈**（告诉用户"你点中了"）

按 W3C `prefers-reduced-motion` 规范，减少动效主要针对**非必要的、可能引起眩晕的循环 / 大幅移动**动效；**用户触发的必要反馈动效应保留**。注释自己写的策略是「compress finite enter animations to < 1 frame (instant)」，但 `forwards` fill 让"压成 1 帧" = "停在末帧消失"——对"从可见(0.7) → 不可见(0)"的动画等于完全消除反馈。

## 修复

`src/ui/styles/shared.css` 第 313-329 行附近，两步：

1. **把波纹类从禁用列表摘出**：原来波纹和 shimmer / dot-pulse 共用一条 `animation: none` 规则，现在让那条规则只管循环装饰，波纹不再被它干掉。
2. **给波纹单独加一条显式时长豁免**：把波纹的 `animation-duration` 恢复成 0.5s（带 `!important`），覆盖 universal 的 0.001ms。

之所以这条豁免能胜出：类选择器特异性高于 universal 星号选择器，同带 `!important` 时特异性高的胜。波纹的其他动画子属性（动画名、迭代次数、延迟、fill、缓动）来自 `layout.css` 的波纹规则，universal 没动它们，保持不变。

该修复**双向安全**：系统没开减少动效时媒体查询不匹配、不生效；开了则波纹照常扩散 0.5s。

## 验证

用户在浏览器 DevTools Console 跑一条诊断命令：用 `MutationObserver` 监听 body 子级新增，一旦匹配到波纹类元素，就在它创建瞬间 dump `getComputedStyle` 的动画名 / 时长 / fill 模式 / opacity / transform / 矩形尺寸。这条命令**不依赖时机**——波纹 0.5s 后会自动移除，但 MutationObserver 在元素创建瞬间就抓到了，不用和动画赛跑。点节点后 console 打印结果。

诊断结果（点节点后）：

| 字段 | 值 | 含义 |
| --- | --- | --- |
| `animationName` | `"nodeRipple"` | keyframes 跨 `@layer` 引用**正常**（之前怀疑的跨层问题不存在） |
| `animationDuration` | `"0.5s"` | duration 被显式豁免**恢复**（不再是 0.001ms） |
| `animationFillMode` | `"forwards"` | fill 正常 |
| `opacity` | `0.7` | 0% 帧的 opacity（动画在正常播放） |
| `transform` | `matrix(0,0,0,0,-20,-20)` | 0% 帧 translate(-50%,-50%) scale(0)，40px 的 50% = 20px（动画正常初始态） |
| `rect.width/height` | `0 / 0` | 因 scale(0)，符合 0% 帧 |

波纹恢复扩散，用户确认「波文回来了」。

### 关于 macOS 的 reduceMotion 偏好读取

macOS 27.2 用 `defaults read com.apple.universalaccess reduceMotion` 和 `defaults read com.apple.Accessibility reduceMotion` **都读不到键**（`Could not find key`）。但这**不代表系统没开减少动效**——新版本 macOS 把偏好挪了位置 / 走 cloud sync，`defaults read` 经常读不到实时值。**以浏览器实际是否 match `prefers-reduced-motion: reduce` 为准**，不要以 `defaults read` 的结果排除。

## 用户偏好（本次体现 + 持续生效）

> 这一节写给后续在本项目工作的 AI 编程代理。这些偏好是硬规则，不是建议。

### 1. 让你测你再测

不要主动启动 playwright / chromium 跑浏览器 probe 自证。完成代码改动后**只跑 `npx tsc --noEmit` + 相关单元 / 组件测试**，用户要看效果会自己刷新预览，需要 agent 验证时会明确说「测一下」「起本地版我测一下」。这次 agent 一开始没主动测（对），等用户说「你给我起一个本地版，我测试一下看看」才起 dev server——符合规则。

### 2. 修复后让用户验证再下结论

**不要改完就宣布"修好了"**。第一轮改了 reduced-motion 豁免，没让用户验证就以为搞定，用户反馈"问题依然存在"——既浪费一轮信任，又让排查方向跑偏（去查 bigbang-veil / isolation / 跨层 keyframes 等不相关的假设）。正确做法：改完告诉用户「刷新看下」，拿到验证结果再下结论。

### 3. 静态分析穷尽后，用诊断命令获取运行时事实

当代码层面"理论可见但实际不可见"时，不要反复盲改假设。请用户在 DevTools Console 跑一条 `MutationObserver` + `getComputedStyle` 的诊断命令，一次性 dump 元素的动画名 / 时长 / fill 模式 / opacity / transform / 矩形尺寸——比连改三轮假设高效得多。诊断命令要**不依赖时机**（用 MutationObserver 在元素创建瞬间抓，而不是让用户和 0.5s 的动画赛跑）。

### 4. 点击反馈动效在 reduced-motion 下要保留

波纹（`.node-ripple`，0.5s 单次）这类**用户主动点击触发的即时反馈**属「必要操作反馈」，按 `prefers-reduced-motion` 规范应保留。**不能**进 `shared.css` reduced-motion 段的禁用列表，**也不能**被 universal 的 0.001ms 时长规则压（配合 `forwards` fill 会瞬间跳到 opacity 0 停住 = 消失）。以后动 reduced-motion 媒体查询时，先区分「循环装饰动效」（shimmer / dot-pulse，该 kill）和「用户主动反馈动效」（波纹 / 点击高亮闪现，该保留）。

### 5. 不要用妥协方案糊弄

遇到问题按最佳实践修，不要绕过。这次把波纹"显式豁免时长"而非"删掉波纹动效"或"把波纹也改成静止圆圈"，就是按规范保留必要反馈，而不是偷懒删功能。

### 6. 文档内不要写具体代码

写文档（debug 笔记、决策记录、说明文档等）时**不要贴实现代码块**（CSS / JS / TS 多行代码），用文字描述讲了什么规则、什么链路、怎么改的。代码在源文件里，文档负责讲清逻辑和决策。行内标识符引用（类名、属性名、文件名）可保留。这条跨所有项目。

## 经验总结

### 给 agent 的教训

1. **`forwards` fill + reduced-motion 的 universal "压成 1 帧" 是致命组合**：universal 把动画时长压成 0.001ms 让动画 1 帧跑完，`forwards` fill 让它停在末帧。对"从可见 → 不可见"的动画（opacity 0.7 → 0）等于完全消失。设计 reduced-motion 策略时要专门检查所有 `fill-mode: forwards` 的动画。

2. **区分动效类型再决定 reduced-motion 策略**：
   - **循环装饰**（shimmer / dot-pulse / 呼吸光晕）→ kill（animation 置空）
   - **有限入场动画**（淡入 / 滑入）→ compress 成 1 帧（停在末态，末态可见）
   - **用户主动反馈**（波纹 / 点击高亮）→ **保留**（必要反馈，规范明确）

3. **`@keyframes` 跨 `@layer` 引用是安全的**：`@keyframes nodeRipple` 定义在 `@layer shared`，`.node-ripple` 的 `animation` 在 `@layer layout` 引用——规范说 keyframes 是全局的，本次诊断 `animationName: "nodeRipple"` 也印证引用正常。不要因为跨层就怀疑 keyframes 失效。

4. **`defaults read` 读不到 macOS 偏好 ≠ 系统没开**：新 macOS 把辅助功能偏好挪了位置，以浏览器实际 match `prefers-reduced-motion` 为准。

5. **body 直接子级里"注释承诺但没实现"的元素要果断删**：`#bigbang-veil` 是个"计划做但从未实现"的裸 div 幽灵（注释写了"大爆炸过渡幕布"但没 CSS 没 JS），占着 DOM 不干活还干扰排查。确认无引用后删掉。

## 相关文件

- `src/ui/styles/shared.css` — `@media (prefers-reduced-motion: reduce)` 段 + 波纹豁免（已修复）
- `src/ui/styles/layout.css` — 波纹样式与动画声明（第 654-662 行）
- `src/ui/ui-helpers.ts` — `spawnNodeRipple`：创建元素 + append 到 body + animationend 移除（第 34-42 行）
- `src/ui/graph-events.ts` — 节点 tap（第 116 行）与边 tap（第 153 行）调 `spawnNodeRipple`
- `src/ui/styles/base.css` — z-index scale（波纹用硬编码 z-index 5，未走 token）
- `index.html` — `#bigbang-veil` 已删除（曾是 body 直接子级的裸 div 幽灵）

---

**署名**

- Agent：WorkBuddy
- 模型：GLM-5.2
