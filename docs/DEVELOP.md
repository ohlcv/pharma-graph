# 药学知识图谱 — 开发文档

---

## 1. 定位与愿景

药学知识图谱是一个**内容驱动**的工具：Markdown 文件是核心资产，图谱是内容的可视化视图。

核心理念：
- 学习者在 Markdown 里写笔记，图谱自动生成
- 节点即知识点，边即知识关联
- 用图谱探索笔记，用笔记完善图谱

---

## 2. 技术选型

| 层级 | 技术 | 选型理由 |
|------|------|----------|
| 图谱渲染 | Cytoscape.js v3.34 | Web 图论可视化的事实标准，生态丰富，扩展多 |
| 内容格式 | Markdown + frontmatter | 学习者友好，无需数据库 |
| 前端 | 原生 HTML / 无构建工具 | 示例零依赖，专注图谱本身 |

---

## 3. 设计原则

### 3.1 数据与视图分离

```
Markdown 文件（内容层）
      ↓ 解析
JSON 数据（节点 + 边）
      ↓
Cytoscape.js（渲染层）
```

内容和渲染完全解耦：同一套数据可以接不同的可视化引擎。

### 3.2 单向边定义

关系只在**发起方**定义，不需要两边都写。

例如：巴比妥类 → 镇静催眠药，在巴比妥类的 `edges_out` 中写入指向关系即可。

### 3.3 数据优先原则

图谱中展示的所有信息，都必须先在 Markdown frontmatter 中有明确定义。视觉表现（颜色、形状）是数据的下游，不反向定义数据。

---

## 4. 数据模型

### 4.1 节点

每个 Markdown 文件对应一个节点，节点数据从 frontmatter 解析而来。

| 字段 | 来源 | 说明 |
|------|------|------|
| `id` | frontmatter | 全局唯一标识 |
| `label` | frontmatter | 界面显示名称 |
| `type` | frontmatter | 影响节点形状 |
| `category` | frontmatter | 影响节点颜色 |
| `summary` | frontmatter | 悬停/弹窗文本 |
| `location` | frontmatter | 章节归属（过滤用） |

### 4.2 边

边的数据由所有 Markdown 文件的 `edges_out` 汇总生成。

| 字段 | 来源 | 说明 |
|------|------|------|
| `source` | 当前文件 id | 自动填充 |
| `target` | `edges_out[].target` | 目标节点 id |
| `type` | `edges_out[].type` | 关系类型 |
| `reason` | `edges_out[].reason` | 关系说明 |

---

## 5. 关系类型设计

### 5.1 关系类型总览

| 类型 | 语义 | 性质 |
|------|------|------|
| `isa` | 层级归属/概念归类（子→父、具体→抽象） | 反对称 + 传递 |
| `has` | 物理/组合组成（整体→部分） | 反对称 + 传递 |
| `prerequisite` | 前置依赖 | 反对称 |
| `relates` | 相关/同级/横切 | 对称 |
| `sibling` | 同级 | 对称 |
| `activates` | 激活 | 非对称 |
| `inhibits` | 抑制 | 非对称 |
| `metabolizes` | 代谢 | 非对称 |
| `mechanism` | 作用机制 | 非对称 |
| `treats` | 治疗 | 非对称 |
| `causes` | 导致 | 非对称 |
| `interacts` | 相互作用 | 对称 |
| `contraindicates` | 禁忌 | 非对称 |

> **层级关系一律用 `isa`（子→父方向），不使用 `has` 表达"属于"。** `has` 仅用于物理/组合组成。详见 [ADR-0001](./ADR-0001-层级关系统一使用isa方向.md)。

### 5.2 视觉区分维度

每种关系通过三个维度区分：

| 维度 | 可选值 |
|------|--------|
| 线条颜色 | 8种固定颜色 |
| 线型 | 实线 / 虚线 / 点线 |
| 箭头形状 | 三角 / 圆点 / 菱形 / T形 / 无箭头 |

### 5.3 关系配置表

| 关系 | 颜色 | 线型 | 箭头 |
|------|------|------|------|
| `isa` | 蓝色 | 实线 | 三角 |
| `has` | 青色 | 实线 | 三角 |
| `prerequisite` | 橙色 | 点线 | 菱形 |
| `relates` | 灰色 | 虚线 | 圆点 |
| `sibling` | 黄色 | 虚线 | 圆点 |
| `activates` | 绿色 | 实线 | 三角 |
| `inhibits` | 红色 | 实线 | T形 |
| `metabolizes` | 紫色 | 实线 | 三角 |
| `mechanism` | 紫色 | 实线 | 三角 |
| `treats` | 绿色 | 实线 | 三角 |
| `causes` | 红色 | 虚线 | T形 |
| `interacts` | 黄色 | 虚线 | 圆点 |
| `contraindicates` | 红色 | 实线 | T形 |

---

## 6. 节点类型设计

| 类型 | 形状 | 适用场景 |
|------|------|----------|
| 概念（concept） | 圆角矩形 | 定义、理论 |
| 药物（drug） | 椭圆 | 药物名称 |
| 术语（term） | 矩形 | 专业术语 |
| 方法（method） | 六边形 | 检测/制备方法 |
| 疾病（disease） | 菱形 | 疾病名称 |
| 靶点（target） | 桶形 | 受体、酶、离子通道 |

---

## 7. 目录结构

```
pharma-graph/
│
├── src/                          ← 源代码
│   ├── parser/                   ← Markdown 解析层
│   │   ├── content-manager.ts   ← 扫描 content 目录，读文件列表
│   │   └── frontmatter.ts       ← frontmatter 解析器
│   │
│   ├── core/                     ← 图谱核心逻辑
│   │   ├── config.ts            ← 全局配置（默认布局、颜色映射、边类型映射）
│   │   ├── graph.ts            ← 节点/边数据结构定义
│   │   ├── node-builder.ts     ← 从 frontmatter 构建节点数据
│   │   ├── edge-builder.ts     ← 从 frontmatter 构建边数据
│   │   ├── renderer.ts         ← Cytoscape 实例 + 样式表 + 布局
│   │   └── tour.ts             ← 章节导览逻辑
│   │
│   ├── ui/                       ← 浏览器层 UI 代码（详见 DEVELOP.md 下半部分）
│   │
│   └── scripts/                  ← 工具脚本（详见下文"scripts/"小节）
│       ├── validate.ts          ← 严格 schema 校验（`npm run validate`）
│       ├── audit-frontmatter.ts ← ADR-0001 评分 + 关系方向审查（`npm run audit`）
│       └── serve.ts             ← 静态服务器（`npm run view`）
│
├── content/                      ← 知识内容（Markdown + frontmatter）
│   │   ├── config.ts            ← 全局配置（默认布局、颜色映射、边类型映射）
│   │   ├── graph.ts            ← 节点/边数据结构定义
│   │   ├── node-builder.ts     ← 从 frontmatter 构建节点数据
│   │   ├── edge-builder.ts     ← 汇总 edges_out 构建边数据
│   │   └── renderer.ts          ← Cytoscape.js 渲染封装
│   │
│   └── ui/                       ← 前端 UI 层
│       ├── index.ts                  ← UI 入口
│       ├── app.css                  ← Tailwind 入口（@tailwind 指令）
│       ├── tailwind.config.js       ← Tailwind 配置（主题色、组件样式）
│       └── components/           ← UI 组件（各自独立状态）
│           ├── Toolbar/         ← 工具栏（布局切换、缩放、导出按钮）
│           ├── Sidebar/         ← 侧边栏（图例、统计、参数面板）
│           ├── DetailPanel/     ← 节点详情弹窗
│           ├── SearchBar/        ← 搜索栏
│           └── ContextMenu/      ← 右键菜单
│
├── examples/                     ← 功能演示
│   ├── lib/                      ← Cytoscape 及扩展库（第三方）
│   ├── cytoscape-example.html    ← 图谱功能演示页
│   └── server.js                ← 本地 HTTP 服务器（运行示例）
│
├── content/                      ← 知识内容（Markdown 笔记）
│   ├── 药学专业知识一/           ← 按科目分目录
│   │   ├── 药剂学/
│   │   │   └── 第七章/
│   │   │       └── 口服固体制剂/
│   │   │           ├── 缓释剂.md
│   │   │           ├── 片剂辅料.md
│   │   │           └── ...
│   │   └── 药理学/
│   └── 药学专业知识二/
│
├── docs/                         ← 文档
│   ├── frontmatter.md            ← frontmatter 模板（给用户参考）
│   ├── SPEC.md                   ← 产品需求规格说明
│   ├── ARCH.md                   ← 本文档，架构设计
│   └── README.md                 ← 产品文档（给用户）
│
├── public/                       ← 静态资源（图片等）
│
├── dist/                         ← 构建输出（CI 生成，不提交）
│
├── archive/                      ← 归档文件
│
├── package.json
└── tsconfig.json
```

### 7.1 目录设计说明

**`content/`** — 这是最重要的新增目录。知识内容按教材章节组织，Markdown 文件名即节点 id，frontmatter 包含节点和边的全部元数据。

**`src/`** — 核心源代码，按职责分层：
- `parser/` 负责扫描内容目录、解析 Markdown 文件和 frontmatter
  - `content-manager.ts` 读取 content 目录的文件列表，支持递归扫描
  - `frontmatter.ts` 解析 frontmatter 元数据（标题、正文等结构已被内化到这里——曾经的 `markdown-parser.ts` 已删，#18）
- `core/` 负责从解析结果构建图谱数据：
  - `config.ts` 集中管理全局配置（默认布局、节点颜色映射、边类型样式映射），后续换主题/改样式只需改这里
  - `node-builder.ts` 将 frontmatter 映射为 Cytoscape 节点数据
  - `edge-builder.ts` 汇总所有文件的 `edges_out`，去重后生成边数据
  - `renderer.ts` 封装 Cytoscape.js 实例化逻辑
- `ui/` 负责图谱的视觉呈现和交互，按组件拆分：
  - `components/` 中每个组件独立管理自己的状态和 DOM，适合后续扩展（如添加动画、响应式逻辑）
  - `styles/` 统一管理样式变量和组件样式，CSS 变量集中定义颜色和间距，方便换主题
  - `cytoscape-overrides.css` 覆盖 Cytoscape.js 的默认背景色、滚动条等 UI 元素

**`scripts/`** — 独立工具脚本，可单独运行或集成到 CI。代码位于 `src/scripts/`，通过 `npm run <name>` 调用：

| 命令 | 脚本 | 用途 | 退出码 |
|---|---|---|---|
| `npm run validate` | `validate.ts` | 严格 schema/类型校验；CI 必跑 | 0 = 通过；非 0 = 有 ❌ |
| `npm run audit` | `audit-frontmatter.ts` | 评分 + ADR-0001 关系方向 + 双向配对；输出 `docs/frontmatter-audit.md` | 永远 0（人工修正用） |
| `npm run view` | `serve.ts` | 启动开发静态服务器（无 HMR）+ `/api/graph` 端点 | — |

### `audit` 与 `validate` 的差异

两者都扫描 `content/**/*.md` 的 frontmatter，但**口径不同**：

- **`validate`** 是**门禁**：缺失必填字段、值非法（不在 schema 白名单）、跨文件引用 id 不存在等情况会**让进程退出非零**。这是给 CI 用的硬约束，新提交的 markdown 必须 0 ❌ 才能合并。
- **`audit`** 是**度量**：给每篇 markdown 打 0/1/2/3 的字段分，并按目录分组输出 markdown 报告。它**永远** exit 0，因为字段缺失是常态（增量写作中）。报告是手动修 frontmatter 时的真值来源，包含修复策略和修正进度跟踪。

简短决策树：
- 改了 markdown → 先 `npm run validate`（防 schema 回归）
- 集中批量修一批 markdown → 中途用 `npm run audit` 看整体进度和 ADR-0001 合规率
- 修完提交前 → 再 `npm run validate`（兜底）

### 已归档的一次性脚本（不在 npm scripts 里）

大型重构时跑过、已经完成历史使命的工具，**归档在 [`archive/scripts/`](../archive/scripts)**，不在日常开发中使用：

- `migrate-frontmatter.ts` — 把 frontmatter 统一迁到新 schema（位置/字段顺序）；`--dry-run` 默认。归档前最后一次运行已完成全库迁移。
- `migrate-isa.ts` — 按 ADR-0001 把 has 边统一为 isa；默认 dry-run，`--apply` 才落盘。已与 ADR-0001 一并落地（详见 `docs/migration-report.md`）。
- `extract-all-frontmatter.ts` — 把全库 frontmatter 聚合成一份 markdown（人工审查用），输出 `docs/all-frontmatter-extracted.md`。
- `fix-duplicate-id.ts` / `batch-fix.ts` — 历史遗留修复工具，仅在已知问题复发时跑。

跑法统一为 `npx tsx archive/scripts/<name>.ts [--flags]`。各文件头部已标注"ONCE-OFF / completed YYYY-MM"，请勿在当前数据上重跑。

**`tests/`** — 测试代码，保证 parser 和 graph 构建逻辑的正确性，防止解析错误导致图谱数据损坏

**`dist/`** — TypeScript 编译输出，由 CI 自动构建，不提交到仓库

**`.env.example`** — 环境变量模板，记录需要配置的环境变量（如 content 路径、输出格式等）

### 7.2 `content/` 命名规范

```
content/
└── {书名}/
    └── {篇名}/
        └── {章号} {章名}/
            └── {节号} {节名}/
                ├── {考点编号} {考点名}.md
                └── ...
```

示例：
```
content/
└── 药学专业知识一/
    └── 第一篇 药剂学/
        └── 第七章 口服制剂与临床应用/
            └── 第一节 口服固体制剂/
                ├── 考点1 口服固体制剂的常用辅料.md
                └── 考点2 薄膜包衣材料.md
```

---

## 8. 渲染管道

```
content/*.md
    │
    ▼
frontmatter 解析器
    │  提取节点数据 + edges_out
    ▼
图谱数据构建器
    │  合并节点、去重边
    ▼
{src/core/graph.ts} — { nodes[], edges[] }
    │
    ├──→ stylesheet 配置（节点形状 / 边颜色线型）
    ├──→ layout 配置（默认 Euler，2026-07 §12.4 由 COSE 切来）
    └──→ events 配置（点击 / 悬停 / 快捷键）

        ▼

Cytoscape.js 实例
    │
    ▼
浏览器渲染
```

---

## 9. 布局系统

### 9.1 布局选择

| 布局 | 适用数据结构 | 特点 |
|------|-------------|------|
| **Euler** | 任意 | 图论力学，优化边交叉。**默认布局（2026-07 §12.4）**。N=10 mean overlap 1.6 / worst 3，是当前最稳定的引擎 |
| COSE-Bilkent | 任意 | 力学弹簧，自动聚类。原默认；现在作为"次选"保留 |
| Dagre | 有向无环图（DAG） | 按方向分层，层次清晰 |
| Euler | 任意 | 图论力学，优化边交叉 |
| 同心圆 | 任意，按权重分层 | 重要性越大的越居中 |
| 环形 | 任意 | 均匀绕圆，适合循环关系 |
| 树状（Breadth-first） | 树状结构 | 从根向外扩散 |

### 9.2 默认布局

默认使用 **Euler**（2026-07 §12.4 由 COSE 切换）。Euler 在 224 节点图上 N=10 mean overlap 1.6 / worst 3，对比 COSE mean 21.3 / worst 34。物理模拟比 COSE-Bilkent 稳定——首屏几乎看不到重叠。详见 [`docs/布局参数清单.md` §12.4](../布局参数清单.md#124-euler-密扫--默认布局切换2026-07)。

---

## 10. 交互设计

### 10.1 交互层次

| 层级 | 交互 | 效果 |
|------|------|------|
| 浏览 | 拖拽平移、滚轮缩放 | 探索图谱 |
| 发现 | 单击节点 | 高亮该节点及所有邻居，其他变暗 |
| 探索 | 单击边 | 高亮该边及其两个端点 |
| 重置 | 单击空白处 | 取消所有高亮 |
| 筛选 | 单击形状/颜色图例 | 仅显示该类型节点 |
| 搜索 | 输入关键词 | 定位节点 |
| 编辑 | 右击节点 | 删除节点 |

### 10.2 键盘快捷键

| 按键 | 作用 |
|------|------|
| `F` | 适应画布（zoom to fit） |
| `R` | 打散节点位置 |
| `Esc` | 取消选择，重置视图 |
| `Del` | 删除选中节点 |
| `Ctrl+A` | 全选 |

---

## 11. 后续开发任务

按优先级排序：

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | Markdown 解析器 | 扫描 content/，解析 frontmatter，构建图谱数据 |
| P0 | 节点搜索 | 按 label 搜索并定位节点 |
| P1 | 详情弹窗 | 点击节点弹出 summary.full 内容 |
| P1 | 按章节过滤 | 根据 location 字段筛选节点 |
| P1 | 边类型图例 | 侧边栏显示 8 种边的颜色/线型说明 |
| P2 | 导出图片 | 将图谱导出为 PNG/SVG |
| P2 | 多图谱切换 | 不同科目/书籍切换不同 content 目录 |
| P3 | 节点编辑 | 在图谱内直接编辑节点元数据 |
| P3 | 协作注释 | 为边/节点添加个人批注 |

---

## 12. 参考资料

- [Cytoscape.js 官方文档](https://js.cytoscape.org/api/cytoscape.js-latest/)
- [Cytoscape.js — cose-bilkent 布局](https://github.com/cytoscape/cytoscape.js-cose-bilkent)
- [Cytoscape.js — dagre 布局](https://github.com/cytoscape/cytoscape.js-dagre)
- [Cytoscape.js — Euler 布局](https://github.com/cytoscape/cytoscape.js-euler)
