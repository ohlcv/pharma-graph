---
name: pharma-mindmap-transcribe
description: "将纸质思维导图照片（或扫描件）转录为符合药学知识图谱规范（docs/frontmatter.md + docs/RULES.md）的独立节点 Markdown 文件。每个节点单独一个 .md，按 frontmatter 标准结构输出（id/label/essence/location/tags/summary/edges_out）。触发场景：用户提供思维导图/知识框架的纸质照片，要求转换为文字版节点文件、逐节点建 md、按规范转录（essence 分类、5 种边、命名前缀、口诀双轨、summary 填写限制）。也用于后续对同一套规范的节点文件进行编辑、自查、校验。"
---
# Pharma Mindmap Transcribe — 纸质思维导图 → 节点 md

把纸质思维导图照片忠实转录为符合规范的独立节点 `.md` 文件。规范文档是权威来源，开始任何转录前必须读取：
- `docs/frontmatter.md` — frontmatter 字段定义、9 种 essence（形状+颜色）、5 种边、视觉编码规范（权威）
- `docs/RULES.md` — 节点构建规则：命名（含文件名 = label）、summary 填写（含 §10【标签】格式）、tags 抽取、边方向铁律、转录规则、口诀双轨

> **本规范与 RULES.md 冲突时，以 RULES.md 为准**。RULES §10（新）和 §九（新）已包含本 SKILL 未列出的硬性规定。

## 关键硬性约定（违反即不合规）

> 全部源自 RULES.md，列在此处是为了转录时一眼可见。每条都可在 RULES 找到详细解释和示例。

1. **文件名 = `data.label`（中文）**（RULES §9.7 历史教训 + §零）
   - 正确：`别嘌醇.md`、`吡拉西坦.md`、`促进尿酸排泄药.md`
   - 错误：`med-allopurinol-y2-02-03.md`（这是 `data.id`，不是文件名）
   - 目录里全用中文 label，一眼能识别是什么节点

2. **`data.id` = 英文/拉丁文 ID**（RULES §零）
   - 用于图的 id 寻址、sitemap URL、edges_out.target 引用
   - 格式：`前缀-英文名-章节后缀`，如 `med-allopurinol-y2-02-03`

3. **`summary.full` 必须用「【标签】+ 段落」格式**（RULES §10，新）
   - 必用标签：`【药理作用】` `【适应症】` `【不良反应】` `【禁忌】` `【相互作用】` `【药代动力学】` `【临床应用注意】`
   - 禁止使用 `(1)(2)(3)` 半角括号编号、禁止整段不换行
   - 关键医学术语用 `**加粗**`、子项用 `- ` markdown 列表

4. **`summary.full` 跨行必须加 `|` block scalar**（RULES §9）
   - `summary.full: |`（literal）或 `summary.full: >`（folded）
   - 不加 `|` 时换行会被 YAML 解析器折叠成空格

5. **不要 AI 自动填充 `summary.full`**（RULES §5.8）
   - 缺用户资料时 `full` 留空，绝不"按药理推断"填充

6. **不要把临床内容拆成独立 `link` 边同时又写在 `summary.full`**（RULES §5.7）
   - 药理/适应症/禁忌/相互作用全部写入 `summary.full`，不要为每条建边

## 工作流（按序执行）

### Step 1 — 读规范
读取 `docs/frontmatter.md` 与 `docs/RULES.md` 全文。字段、essence 枚举、边类型、命名前缀、summary 限制、§10 标签格式，全部以这两份文档为准。

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
- **输出目录**：当前工作目录下建任务子目录，如 `y2-02-02/`、`第三节 抗痛风药/`。
- **文件名**：严格等于 `data.label`（中文），见上文「关键硬性约定 #1」。
  - 药物：`别嘌醇.md`、`苯溴马隆.md`
  - 分类：`促进尿酸排泄药.md`、`糖皮质激素.md`（同标签的多分类都用全中文 label）
  - 章节入口：`第三节 抗痛风药.md`
  - 口诀：`促进尿酸排泄药口诀.md`
- 每个节点一个文件，frontmatter 含 `id/label/essence/location/tags/summary/edges_out`（见 references）。
- **不建冗余空模块**（如「分类与代表药品」这种纯视觉分区 wrapper），四大类直接挂节入口。
- 口诀节点（口诀）建独立 md，同时按双轨制写入主知识节点 `summary.short` 末尾。
- **summary.full 填写**严格按 RULES §5.8 / §5.10 + §10：
  - 手写补充 > 荧光笔高亮 > 普通印刷（来源优先级）
  - 内容用 `【药理作用】` `【适应症】` `【不良反应】` `【禁忌】` `【相互作用】` `【药代动力学】` `【临床应用注意】` 标签分段
  - 关键医学术语 `**加粗**`，多项用 `- ` 列表
  - 必须用 `full: |`（block scalar）让 YAML 保留换行
  - 无用户资料时 `full` 留空，绝不 AI 自动填充

### Step 5 — 自查（每个节点）
- YAML frontmatter 可解析（注意 `**…**` 开头的值需加引号，否则 YAML 误判为锚点）。
- **文件名 = `data.label`**（中文）；**`data.id`** 是英文 ID 形式。两者分工，不可混用。
- **summary.full 用了 `|` block scalar**（跨行时），且每段以 `【标签】` 起头。
- 边方向铁律：子→父（subclass_of）、局部→整体（part_of）、实例→类别（instance_of）、口诀→主知识（part_of）；父节点不反向枚举子节点。
- tags 从 summary 加粗词抽取、语义去重、不写 essence 枚举值；药物节点含分类 tag + 作用 tag。
- 命名前缀与 essence 匹配；所有 edges_out.target 存在（或为预期骨架边）。
- 如果文件被引用到 `public/sitemap.xml`，确认 URL 中的文件名部分已与新文件名同步。

### Step 6 — 分批交付
一次可处理多个节点，交付时分批呈现（如按分支分组），最终汇总总数与层级结构。汇报中明示：哪些 short/full 是用户提供的、哪些留空、哪些是手写/高亮/印刷来源、口诀归属、命名处理、是否同步了 sitemap。

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
- 当 `full` 实际写入时，必须用 `【标签】` 分段格式（RULES §10），关键术语加粗，多项用 `- ` 列表。
- 药物节点的临床内容（药理/适应症/禁忌/相互作用）写入 `summary.full`，不拆独立边。

### 命名格式速查
- 文件名 = 中文 label（与 data.label 一致），例：`秋水仙碱.md`
- data.id = 英文 ID，例：`med-colchicine-y2-02-03`
- 命名模板：`{前缀}-{节点英文名}-{书简写}{章号}-{节号}`
  - 药物：`med-leflunomide-y2-02-02`
  - 严格分类：`strict-gold-y2-02-02`
  - 伞形分类：`umbrella-immunosuppressant-y2-02-02`
  - 口诀：`memo-uricexcretion-y2-02-03`
  - 章节入口：`sec-antigout-y2-02-03`

### 质量优先
一次处理不完可分批；宁慢勿错，不完整内容不乱猜。交付前用「可能失败」的方式回读验证：
1. 重新解析每个 md 的 YAML frontmatter（确保 `summary.full` 的 `\n` 没被折叠）
2. 检查文件名 = `data.label`
3. 检查所有 `edges_out.target` 存在（或为预期骨架边）
4. 如果改动涉及文件名，同步更新 `public/sitemap.xml`
