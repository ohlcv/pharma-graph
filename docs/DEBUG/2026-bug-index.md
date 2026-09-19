# Debug 索引：2026 年修复的问题汇总

**日期**: 2026-09-19
**范围**: 2026 年 1 月 1 日 至今，仓库 `pharma-graph` 内已合并 / 已修复的全部问题
**目的**: 用作年度问题清单，按类别索引；具体修复过程见对应 commit 与单点 debug 文档

---

## 1. 解析器 / Frontmatter

### 1.1 YAML 别名解析失败（多轮复发）
- **现象**: 节点 / 边被静默丢弃，控制台无明显报错
- **根因**: js-yaml 将 `**bold**` 当作 alias 语法，触发解析错误；多行裸标量同样不被接受
- **触发形式**:
  - 字符串里夹 `**xx**` 加粗
  - `label` / `short` 等字段跨多行书写
- **解决方向**: 加粗字段必须用双引号包裹；多行值合并为单行引号字符串或用 `|` / `>` 块标
- **相关文件**: `src/parser/frontmatter.ts`、`src/parser/schema.ts`、`public/content/**/*.md`（约 30+ 处）
- **预防规范**: 已落地到 `.cursor/rules/frontmatter-conventions.mdc`

### 1.2 Frontmatter 结构混用
- **现象**: 同一字段既可写在根也可写在 `edges_out` 嵌套下，读出来不一致
- **解决方向**: 在 `schema.ts` 统一白名单，根级与嵌套级二选一
- **相关文件**: `src/parser/schema.ts`、`src/parser/frontmatter.ts`

### 1.3 缩进错误导致整文件解析失败
- **现象**: 单个文件结构损坏牵连同一目录其它文件
- **范例**: `抗胆碱M受体解痉药.md` 缩进错位
- **解决方向**: 解析失败上报 `ParseWarning`，不向全图传播

### 1.4 节点 / 边 ID 缺失
- **现象**: `ParseWarning` 报 "missing required field"
- **解决方向**: `frontmatter.ts` 校验必填字段，缺则警告 + 跳过

---

## 2. 边 / 关系

### 2.1 Dangling Target（边指向不存在的节点）
- **现象**: 控制台报 `Can not create edge`，节点入图但边被丢弃
- **根因**: `edges_out.target` 写错、复制粘贴漏改、重命名节点忘了同步
- **解决方向**: parser 阶段把目标不存在的边写入 `parserWarnings`；运行时由 `window.__graphDiag.skippedEdges` 暴露

### 2.2 part_of 自环 / 互环
- **现象**: `has-dfs` 漫游启动时 `RangeError: Maximum call stack size exceeded`
- **根因**: `dfsChildren` 把"已访问"和"防环"两个职责混用一个 `visited` 集合
- **解决方向**:
  - 增加 `walking: Set<string>`（仅当次 DFS 路径上灰色节点，离开时清理）
  - 删除无副作用的 `collectTree` 死代码
  - 加 4 个 cycle 防御测试夹具
- **相关文档**: `debug-tour-stack-overflow-cycle.md`

### 2.3 边类型不统一
- **现象**: 出现 `has_couplet` 等非标准类型，与既有 14 种类型重复
- **解决方向**: 标准化为既有类型；`contains → has`、`part_of → isa` 合并去重
- **相关文件**: `src/parser/schema.ts`

### 2.4 缺少 contains 边
- **现象**: 父→子 / 章节→小节 关系缺边
- **解决方向**: 支持 `part_of` 多父；children 构造完整化

### 2.5 边样式不支持
- **现象**: `line-gradient-direction` 在 cytoscape 3.34 不支持
- **解决方向**: 改为节点 outline + 边的颜色分段

### 2.6 渐变颜色格式
- **现象**: rgba 渐变在中途断点
- **解决方向**: 用 hex + darken 替代 rgba 渐变

---

## 3. 图布局 / 定位

### 3.1 初始缩放被 Euler fit 覆盖
- **现象**: 设的 0.15 被覆盖到 0.01–0.04
- **根因**: Euler `animate: true` 是连续仿真，`layoutstop` 不代表物理稳定；`fit: true` 在动画中持续重算 zoom
- **解决方向**: `animate: 'end'`（仅结束时插值一次）、强制 `fit: false`、缩放由 `main.ts` 完全控制
- **相关文档**: `debug-initial-zoom-euler-fit.md`

### 3.2 节点重叠
- **现象**: Euler 收敛后 1.02% 节点重叠
- **根因**: 默认 spring 太软、repulsion 不够
- **解决方向**: 调低 spring、抬高 repulsion；切换默认布局为 Euler；加 `resolveOverlaps()` 圆形散开

### 3.3 缩放范围不足
- **现象**: 移动端无法缩到全图
- **解决方向**: min zoom 从默认提到 0.02

### 3.4 randomize 不 fit
- **现象**: 随机化后节点位置错位 / 飞出视野
- **解决方向**: randomize 完成后用世界坐标 + 自动 fit

---

## 4. 渲染器 / Cytoscape

### 4.1 SVG 性能瓶颈
- **现象**: 200+ 节点时 DOM 元素爆量，交互卡顿
- **解决方向**: 切到 Canvas 渲染器；WebGL 可选（GPU 精灵表加速）

### 4.2 pixelRatio 失控
- **现象**: Retina 屏 canvas 内存翻倍
- **解决方向**: `pixelRatio` 上限 `Math.min(dpr, 2)`

### 4.3 ghost 样式无效
- **现象**: 控制台持续 warn `'ghost': true is invalid`
- **根因**: cytoscape 没有 `ghost` / `ghost-scale` 等属性
- **解决方向**: 删除 `renderer.ts` 中的死代码与样式引用，光晕完全靠 `outline-width` / `outline-opacity` 呼吸动画
- **相关文档**: `debug-tour-stack-overflow-cycle.md` 修复 2

### 4.4 高亮 / 选中边框冲突
- **现象**: `.selected-node` 与 `.highlighted` 边框规则相互覆盖
- **解决方向**: 拆分 border-color 规则到具体 selector

### 4.5 子树边框颜色不稳定
- **现象**: 子树边框颜色随数组顺序变化
- **解决方向**: 用 id 哈希替代数组索引做颜色种子

---

## 5. 加载 / 性能

### 5.1 启动黑屏
- **现象**: 打开页面到图出现之间长时间白屏
- **根因**: 一次性 `loadContent()` 等所有文件加载完才一次性渲染
- **解决方向**:
  - 新增 `optimized-content-loader.ts`，按批次流式 fetch，每批完成即回调
  - 主流程 `boot()` 改为流式：首批到位即初始化 cytoscape，后续批次增量 `addFiles()` 追加
  - Halton 序列为节点预分配均匀的环状位置
  - 节点出现走"cosmic expansion"动画：从原点辐射到目标位

### 5.2 大图 setTimeout 爆炸
- **现象**: 689 个节点用 689 个独立 setTimeout，浏览器卡顿
- **解决方向**: 节点数 > 500 时按 50 个一批共享 setTimeout；定时器从 ~689 降到 ~14

### 5.3 流式加载的边丢失
- **现象**: 边跨批次引用节点时部分边不出现
- **根因**: 边过滤只检查当前批次节点，未把"已存在节点"加入已知集
- **解决方向**: `appendBatchToGraph()` 维护 `existingNodeIds ∪ newNodeIds` 的并集

### 5.4 加载时双重动画
- **现象**: 节点先经历"从原点展开"再被布局 stagger 闪一次
- **解决方向**: 给 `runLayout()` 加 `skipEntering` 选项；流式最终化时跳过 stagger

### 5.5 preset 布局被构造器覆盖
- **现象**: 流式分配的 halton 位置被构造时自动布局覆盖
- **解决方向**: 传 `layoutName: 'preset'` 时跳过构造器内自动布局

### 5.6 `+` 字符 URL 编码
- **现象**: 文件名含 `+` 时生产环境 404
- **解决方向**: URL 拼接时将 `+` 编码为 `%2B`

### 5.7 加载指示器
- **现象**: 用户无反馈，不知道是卡死还是加载中
- **解决方向**: 右上角胶囊显示阶段 / 计数 / 百分比；完成后 fade-out

---

## 6. 漫游 / 引导

### 6.1 步数累积错乱
- **现象**: 步骤 badge 显示累计数而非当前 / 总数
- **解决方向**: 区分"累计 step" 与"当前 step index"

### 6.2 档位切换 currentStep 错算
- **现象**: 切换档位后回到错误步骤
- **解决方向**: 修正 `onStepAfterCenter` 触发逻辑；累计步骤正确归零

### 6.3 setInterval 重置
- **现象**: 步进定时器无法重新计时
- **解决方向**: 重写定时器重置 / 重新定位方法

### 6.4 进度条填充错位
- **现象**: 深度滑块 fill 缺失 / 与视觉位置不一致
- **根因**: track / fill / range 坐标系不统一；负 margin 让 fill 公式错位
- **解决方向**: 统一坐标系；fill 从 thumb 实际位移算起；移除负 margin

### 6.5 移动端滑块触摸区
- **现象**: 4px 触摸区太小，父容器优先滚动
- **解决方向**: 扩到 32px；touchmove stopPropagation

### 6.6 竖排滑块方向混淆
- **现象**: `writing-mode: vertical-lr` 下 height / width 互换
- **解决方向**: 改用 vertical-lr 不旋转；height 固定 80px 作拖动距离

### 6.7 漫游 #11 prev/next 不同步
- **现象**: prev/next 不触发 onPause，toggle 用了旧 state
- **解决方向**: prev/next 始终触发 onPause；togglePause 用引擎实际状态

### 6.8 漫游 #10 图标不同步
- **现象**: prev/next 后图标不更新

### 6.9 漫游居中偏移
- **现象**: 居中点被 topbar 遮住
- **解决方向**: topbar offset 计算修正

### 6.10 漫游重启次数耗尽无提示
- **解决方向**: 加用户可见的耗尽提示

### 6.11 移动端深度滑块渲染
- **相关文档**: `debug-tour-mob-slider-rendering.md`

### 6.12 深度 1 漫游 universe 隔离
- **相关文档**: `debug-tour-depth1-universe-isolation.md`

### 6.13 漫游节点重复
- **相关文档**: `debug-tour-node-duplicate.md`

---

## 7. UI / 交互

### 7.1 侧边栏折叠后黑底遮节点
- **现象**: 折叠后侧边栏残留黑色覆盖层挡住 cytoscape
- **根因**: CSS `@layer` 优先级冲突 + 静态边特殊路径
- **解决方向**: 移除静态边路径，统一用 JS 控制 `max-height` 动画
- **相关文档**: `debug-sidebar-issues.md`

### 7.2 节点详情面板位置错位
- **现象**: `position: fixed` 被 `#main` z-index 降级
- **解决方向**: 详情面板 DOM 移出 `#main`，坐标参考系修正

### 7.3 面板 z-index 被工具栏遮
- **现象**: 工具栏 z-index 高过面板
- **解决方向**: 面板 z-index 提到 30+；移除 `#main` z-index 修补层

### 7.4 图例溢出
- **现象**: 折叠后 body 仍溢出
- **解决方向**: 移除 max-height 常量；用 max-height transition 控制折叠

### 7.5 布局下拉被工具栏裁剪
- **现象**: `overflow-y: hidden` 截断布局下拉
- **解决方向**: 下拉提到 body 级 fixed 定位；移除 overflow 限制

### 7.6 音乐 label 不更新
- **现象**: 播放 / 暂停后按钮文字不变
- **解决方向**: label 与播放状态强绑定

### 7.7 节点邻居"皮筋"抖动
- **现象**: 拖拽邻居节点时反复震荡
- **根因**: spring 太软
- **解决方向**: 抬高 spring (k=2) + 皮筋位移钳制；追拖所有 1-hop 邻居

---

## 8. 搜索 / 图例

### 8.1 图例数量选择器类型不匹配
- **现象**: level 为 number 时 countSelector 不命中
- **解决方向**: 规范 countSelector 的 level 类型

### 8.2 图例等级色块尺寸
- **现象**: 固定 12px 与知识等级不对应
- **解决方向**: 色块尺寸按等级缩放

### 8.3 节点类型 shape 映射缺失
- **现象**: 某些 fill 没有对应 shape
- **解决方向**: 补全 `NODE_TYPE_SHAPE_MAP`

### 8.4 ↑ / ↓ 在图例里循环行
- **现象**: 图例选中状态下方向键循环行而非节点
- **解决方向**: ↑/↓ 在图例选中时循环节点

### 8.5 边类型图例不全
- **现象**: `relates` / `sibling` 缺席
- **解决方向**: 补全图例

### 8.6 Enter 在图例不开详情面板

---

## 9. 大屏 / 全屏

### 9.1 侧边栏推出视野
- **现象**: 大屏切换回来后侧边栏飞出屏幕
- **相关文档**: `debug-bigscreen-sidebar-offscreen.md`

### 9.2 大屏后 toggle 不响应
- **根因**: `UiToggle` 内存状态未同步
- **解决方向**: 同步 toggle 状态机

### 9.3 大屏 canvas 不铺满
- **解决方向**: canvas 设全屏 + 触发 `cy.resize()`

### 9.4 大屏退出 viewport 不保留
- **解决方向**: 退出时保存视口、进入时还原
- **相关文档**: `debug-bigscreen-exit-tour-viewport.md`

---

## 10. 移动端 / 响应式

### 10.1 iOS Safari 搜索自动放大
- **根因**: 字体 < 16px 时聚焦触发 viewport 缩放
- **解决方向**: input 字体提到 16px

### 10.2 移动端搜索 pan 太激进
- **解决方向**: 移动端搜索结果只 pan 不 zoom

### 10.3 面板拖动越界
- **解决方向**: 拖动加 clamp，限定在视口内

### 10.4 面板尺寸不自动
- **解决方向**: 改 auto，移动端走 bottom-sheet 风格

### 10.5 Android / iOS 布局差异
- **解决方向**: 收敛 4 处差异

### 10.6 顶栏品牌名被裁
- **解决方向**: max-width 提升 + clamp() 响应式

---

## 11. 语音 / TTS

### 11.1 iOS AudioContext 挂起
- **根因**: iOS Safari 强制要求用户手势解锁
- **解决方向**: 第一次交互时 unlock

### 11.2 voices 列表为空时调用
- **解决方向**: 等 voices ready 再 unlock

### 11.3 语速过快
- **解决方向**: 1.25x 替换 1.0x / 1.5x

---

## 12. 杂项

### 12.1 Safari / 微信 WKWebView 兼容
- **现象**: 旧 WebView 语法 / API 不支持
- **解决方向**: 构建目标语法降级 + core-js polyfill

### 12.2 DNS 重定向
- **现象**: `pharma.ac.cn` 域名解析失败
- **解决方向**: `pharma.ac.cn` → `www` 回退

### 12.3 控制台噪声
- **解决方向**: 生产环境移除 `console.info` 等调试输出

### 12.4 键盘字母徽章
- **解决方向**: 移除工具栏上的 F / R / T 字母徽章

### 12.5 边 hover 气泡
- **解决方向**: 移除边的 hover 气泡提示

### 12.6 自环边
- **现象**: 2 个节点的自环边
- **解决方向**: 入图时检测自环

---

## 13. 测试 / 工具

### 13.1 `tour-engine.test.ts` cycle 防御套件
- **新增 4 个 case**:
  - 自环 A→A 不崩
  - 互环 A↔B 不崩
  - 三环 + 环外子树（D 挂在 A 下），D 必须可达（关键）
  - warn 限流到 3 条
- **验收**: 27/27 通过
- **相关文档**: `debug-tour-stack-overflow-cycle.md`

### 13.2 `frontmatter-audit.md` 审计工具
- **作用**: 全量扫 `public/content/` 下 .md，列出解析失败 / 缺字段 / dangling target / 自环 / 互环

### 13.3 build-graph 共享核心
- **现象**: `buildGraph()` 在 graph-manager 与 parser 各有一份重复实现
- **解决方向**: 抽到 `src/core/build-graph.ts`，消除双份解析

---

## 14. 仍未处理

| # | 问题 | 影响 |
|---|---|---|
| 1 | `00 阅读指南.md` 缺 `id` 字段，frontmatter-audit 报错 | 仅审计噪声，非功能问题 |
| 2 | `contains → has` / `part_of → isa` 后旧数据还没全部迁移 | 老 .md 还可能有遗留 |
| 3 | `__graphDiag` 仅 console 输出，没有可视化面板 | 调试依赖人工 console |
| 4 | build-graph 阶段没有强制环检测 | 数据脏时仍要靠 tour 兜底 |
| 5 | localStorage 缓存目前禁用 | 二次访问无快速通道 |
| 6 | `performance-monitor.ts` 已写但未接入主流程 | 设备画像自适应能力空转 |

---

## 15. 单点 debug 文档索引

| 文档 | 主题 |
|---|---|
| `debug-sidebar-issues.md` | 侧边栏折叠动画、z-index、溢出 |
| `debug-bigscreen-exit-tour-viewport.md` | 大屏退出 viewport 丢失 |
| `debug-bigscreen-sidebar-offscreen.md` | 大屏切换侧边栏飞出 |
| `debug-initial-zoom-euler-fit.md` | 初始 zoom 被 Euler fit 覆盖 |
| `debug-tour-depth-slider-restart.md` | 深度滑块重启逻辑 |
| `debug-tour-depth1-universe-isolation.md` | 深度 1 universe 隔离 |
| `debug-tour-mob-slider-rendering.md` | 移动端滑块渲染 |
| `debug-tour-node-duplicate.md` | 漫游节点重复 |
| `debug-tour-stack-overflow-cycle.md` | part_of 环导致栈溢出 + ghost 死代码 |

---

## 16. 关联 ADR

- ADR-0001: 层级关系统一用 `isa` 边（part_of / subclass_of 的边界）
- ADR-0003: tour universe 隔离（`getStrictDescendants` 用 `incomers` 而非 `outgoers`）

---

## 17. 统计

| 类别 | 数量 |
|---|---|
| 解析器 / Frontmatter | 4 |
| 边 / 关系 | 6 |
| 图布局 / 定位 | 4 |
| 渲染器 / Cytoscape | 5 |
| 加载 / 性能 | 7 |
| 漫游 / 引导 | 13 |
| UI / 交互 | 7 |
| 搜索 / 图例 | 6 |
| 大屏 / 全屏 | 4 |
| 移动端 / 响应式 | 6 |
| 语音 / TTS | 3 |
| 杂项 | 6 |
| 测试 / 工具 | 3 |
| **合计** | **~80** |
| 待办（仍未处理） | 6 |
