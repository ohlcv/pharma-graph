---
name: pharma-mindmap-transcribe
description: "将纸质思维导图照片（或扫描件）转录为符合药学知识图谱规范（frontmatter.md + RULES.md）的独立节点 Markdown 文件。每个节点单独一个 .md，按 frontmatter 标准结构输出（id/label/essence/location/tags/summary/edges_out）。触发场景：用户提供思维导图/知识框架的纸质照片，要求转换为文字版节点文件、逐节点建 md、按规范转录（essence 分类、5 种边、命名前缀、口诀双轨、summary 填写限制）。也用于后续对同一套规范的节点文件进行编辑、自查、校验。"
---
# Pharma Mindmap Transcribe — 纸质思维导图 → 节点 md

把纸质思维导图照片忠实转录为符合规范的独立节点 `.md` 文件。规范文档是权威来源，开始任何转录前必须读取：
- `references/frontmatter.md` — frontmatter 字段定义、9 种 essence（形状+颜色）、5 种边、视觉编码规范（权威）
- `references/RULES.md` — 节点构建规则：命名、summary 填写、tags 抽取、边方向铁律、转录规则、口诀双轨

> **原则：忠实还原纸质资料，不猜、不编、不擅自补全。** 不确定的内容必须问用户，用户提供更详细资料后再写。

## 工作流（按序执行）

### Step 1 — 读规范
读取 `references/frontmatter.md` 与 `references/RULES.md` 全文。字段、essence 枚举、边类型、命名前缀、summary 限制，全部以这两份文档为准。

### Step 2 — 读照片（放大、多轮细读）
1. 下载/读取全部思维导图照片（多张图时逐张读取）。
2. 文字过小或过密时放大裁剪再读，必要时按区域细读。
3. 记录：分支结构、各节点名称、药物画像正文、荧光笔高亮、手写补充、口诀文字。

### Step 3 — 用户确认模糊点（不猜）
识别所有读不清/有歧义的内容，一次性列出向用户确认，例如：
- OCR 模糊的药名/术语
- 归属不明的口诀（哪条口诀挂哪个药/分类）
- 手写补充的含义与位置
- 命名分歧（如「枸橼酸托法替布 vs 托法替布」，以用户确认/最新照片为准）

### Step 4 — 建节点（每个节点单独一个 md）
- 输出目录：当前工作目录下建任务子目录，如 `y2-02-02/`。
- 命名：`前缀-节点英文名-章节后缀`，如 `med-leflunomide-y2-02-02`；后缀 `{书简写}-{章号}-{节号}`（y1/y2/y3/y4）。
- 每个节点一个文件，frontmatter 含 `id/label/essence/location/tags/summary/edges_out`（见 references）。
- **不建冗余空模块**（如「分类与代表药品」这种纯视觉分区 wrapper），四大类直接挂节入口。
- 口诀节点（`memo-`）建独立 md，同时按双轨制写入主知识节点 `summary.short` 末尾。
- summary 填写严格按 RULES §5.8 / §5.10：手写补充 > 荧光笔高亮 > 普通印刷；无用户资料时 `full` 留空，绝不 AI 自动填充。

### Step 5 — 自查（每个节点）
- YAML frontmatter 可解析（注意 `**…**` 开头的值需加引号，否则 YAML 误判为锚点）。
- 边方向铁律：子→父（subclass_of）、局部→整体（part_of）、实例→类别（instance_of）、口诀→主知识（part_of）；父节点不反向枚举子节点。
- tags 从 summary 加粗词抽取、语义去重、不写 essence 枚举值；药物节点含分类 tag + 作用 tag。
- 命名前缀与 essence 匹配；id 与文件名一致；所有 edges_out.target 存在（或为预期骨架边）。

### Step 6 — 分批交付
一次可处理多个节点，交付时分批呈现（如按分支分组），最终汇总总数与层级结构。汇报中明示：哪些 short/full 是用户提供的、哪些留空、哪些是手写/高亮/印刷来源、口诀归属、命名处理。

## 关键决策速查

### essence 判定（决定形状+颜色）
| essence | 中文 | 典型 |
| --- | --- | --- |
| module | 结构入口 | 书/章/节 |
| strict-class | 严格分类（细） | 化学/药理亚类（金制剂、磺胺类） |
| umbrella-class | 伞形分类（粗） | 临床用途/机制聚类（免疫抑制剂、抗疟药） |
| concept | 概念 | 定义明确的术语 |
| medication | 药物 | 具体药名 |
| illness | 疾病 | 可治疗/禁忌的疾病 |
| notion | 经验认知 | 临床提示、易混点 |
| mnemonic | 口诀 | 顺口溜 |
| summary | 总结 | 多节点收束 |

### 边类型速查
| type | 语义 | 方向（谁写） |
| --- | --- | --- |
| subclass_of | 类-类，A 是 B 的子类 | 子类 → 父类 |
| part_of | 局部-整体 / 辅助→主知识 | 局部/辅助节点 → 整体/主知识 |
| instance_of | 实例-类，药→分类 | 实例 → 类别 |
| disjoint_with | 互斥 | 任一侧（对称） |
| equivalent_to | 等价 | 任一侧（对称） |

### summary 填写红线
- `full` 仅当用户主动提供文本时写入；创建时**不写** `full`、不用占位符、不"按药理推断"。
- `short` 由手写/高亮关键词重组，关键词用 `**…**` 加粗。
- 药物节点的临床内容（药理/适应症/禁忌/相互作用）写入 `summary.full`，不拆独立边。

### 质量优先
一次处理不完可分批；宁慢勿错，不完整内容不乱猜。交付前用「可能失败」的方式回读验证（如重新解析 YAML、检查边 target）。
