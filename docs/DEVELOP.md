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
│   │   ├── markdown-parser.ts   ← 解析 Markdown 本身（提取标题、正文等）
│   │   └── frontmatter.ts       ← frontmatter 解析器
│   │
│   ├── core/                     ← 图谱核心逻辑
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
├── scripts/                      ← 工具脚本
│   ├── scan.ts                   ← 扫描 content 目录，生成图谱数据
│   ├── export-image.ts          ← 导出图谱为图片
│   ├── validate.ts              ← frontmatter schema 校验（CI 用）
│   └── dev.ts                   ← 开发热重载脚本
│
├── tests/                        ← 测试
│   ├── parser.test.ts           ← frontmatter 解析测试
│   └── graph.test.ts            ← 图谱构建测试
│
├── dist/                         ← 构建输出（CI 生成，不提交）
│
├── .env.example                 ← 环境变量示例
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
  - `markdown-parser.ts` 解析 Markdown 正文内容，提取标题、代码块等结构
  - `frontmatter.ts` 解析 frontmatter 元数据
- `core/` 负责从解析结果构建图谱数据：
  - `config.ts` 集中管理全局配置（默认布局、节点颜色映射、边类型样式映射），后续换主题/改样式只需改这里
  - `node-builder.ts` 将 frontmatter 映射为 Cytoscape 节点数据
  - `edge-builder.ts` 汇总所有文件的 `edges_out`，去重后生成边数据
  - `renderer.ts` 封装 Cytoscape.js 实例化逻辑
- `ui/` 负责图谱的视觉呈现和交互，按组件拆分：
  - `components/` 中每个组件独立管理自己的状态和 DOM，适合后续扩展（如添加动画、响应式逻辑）
  - `styles/` 统一管理样式变量和组件样式，CSS 变量集中定义颜色和间距，方便换主题
  - `cytoscape-overrides.css` 覆盖 Cytoscape.js 的默认背景色、滚动条等 UI 元素

**`scripts/`** — 独立工具脚本，可单独运行或集成到 CI：
- `validate.ts` 校验所有 frontmatter 的 schema（缺失字段、类型错误），CI 中自动检查内容质量
- `dev.ts` 开发时监听 content 目录变更，自动重新构建图谱数据并刷新页面

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
    ├──→ layout 配置（默认 COSE-Bilkent）
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
| COSE-Bilkent | 任意 | 力学弹簧，自动聚类，默认布局 |
| Dagre | 有向无环图（DAG） | 按方向分层，层次清晰 |
| Euler | 任意 | 图论力学，优化边交叉 |
| 同心圆 | 任意，按权重分层 | 重要性越大的越居中 |
| 环形 | 任意 | 均匀绕圆，适合循环关系 |
| 树状（Breadth-first） | 树状结构 | 从根向外扩散 |

### 9.2 默认布局

默认使用 **COSE-Bilkent**，适合药学知识的非线性网状关联结构。

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
