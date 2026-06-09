---
data:
  id: (英文/拼音唯一标识，如 kangfengtong-kuangtonji)
  label: (显示名称，如 抗风湿药)

  # 实体类型 → 决定节点形状
  # drug / disease / pathogen / mechanism / ingredient / concept / service / pathway / indicator
  type: concept

  # 系统归属 → 决定节点边框色（同一颜色 = 同一系统领域）
  # cardiovascular / respiratory / digestive / endocrine / musculoskeletal / anti_infective /
  # anti_tumor / blood / immunology / dermatology / antipyretic / anti_rheumatic /
  # anti_gout / nutrition / diagnostic / pharmacy_practice
  category: anti_rheumatic

  # 知识层 → 决定节点布局分组和视觉层次
  # foundation（基础层：生理、病理、药理基础）/
  # system（药物系统层：具体药物、制剂、成分）/
  # clinical（临床层：疾病、治疗方案、用药）/
  # service（服务层：用药管理、药品调配、合理用药）
  layer: system

location:
  book: 药学专业知识二
  chapter: 解热镇痛抗炎抗风湿及抗痛风药
  section: 抗风湿药
  # point: 考点1 ...
  # item: 缓释剂
  # subsection: 辅料

tags:
  - XXX

summary:
  short: (一句话定义，悬停时显示在详情面板)
  full: (详细解释，点击弹出)

edges_out:
  - target: (对方节点 id)
    # isa（是个体/种概念，如具体药→药物种类）/
    # part_of（属于某整体，如章→篇）/
    # mechanism（作用机制，如药→靶点机制）/
    # causes（引起/导致，如病原体→疾病）/
    # treats（治疗，如药→疾病）/
    # has（含/具有，如药含成分）/
    # relates（一般关联，如同领域相关药）
    type: relates
    reason: (为什么我要指向它，hover 时显示为边标签)
---

# 正文：听课笔记

---

## 字段说明

### data.type — 实体类型

节点"是什么"。同一 type 的节点共享形状，在图中属于同一几何类别。

| 值 | 形状 | 含义 | 示例 |
|---|---|---|---|
| `drug` | 圆角矩形 | 具体药物或制剂 | 美托洛尔、阿司匹林 |
| `disease` | 菱形 | 疾病或病理状态 | 高血压、感冒 |
| `pathogen` | 菱形 | 病原体（细菌/病毒/真菌） | 流感病毒、金黄色葡萄球菌 |
| `mechanism` | 菱形 | 作用机制或信号通路 | β受体阻滞机制 |
| `ingredient` | 六边形 | 辅料、成分、剂型 | 羟丙甲纤维素 |
| `concept` | 椭圆 | 一般概念、术语、章节知识点 | 生物利用度、首过效应 |
| `service` | 六边形 | 药学服务、合理用药 | 用药交代、用药咨询 |
| `pathway` | 矩形 | 信号通路、受体家族 | 肾素-血管紧张素系统 |
| `indicator` | 椭圆 | 检测指标、检验项目 | ALT、血压 |

**注意**：`disease` 和 `pathogen` 虽然形状相同（菱形），但通过 `category` 边框色区分系统领域。

### data.category — 系统归属

节点"属于哪个系统/领域"。同一 category 的节点共享边框色，形成视觉上的系统分区。

| 值 | 颜色（边框） | 含义 |
|---|---|---|
| `cardiovascular` | 红 | 心血管系统 |
| `respiratory` | 蓝 | 呼吸系统 |
| `digestive` | 绿 | 消化系统 |
| `endocrine` | 橙 | 内分泌系统 |
| `musculoskeletal` | 青 | 肌肉骨骼系统 |
| `anti_infective` | 紫 | 抗感染（抗菌/抗病毒/抗真菌） |
| `anti_tumor` | 粉 | 抗肿瘤 |
| `blood` | 玫瑰红 | 血液系统 |
| `immunology` | 金 | 免疫与抗过敏 |
| `dermatology` | 棕 | 皮肤疾病 |
| `antipyretic` | 浅蓝 | 解热镇痛抗炎 |
| `anti_rheumatic` | 深橙 | 抗风湿 |
| `anti_gout` | 紫红 | 抗痛风 |
| `nutrition` | 灰绿 | 营养与维生素 |
| `diagnostic` | 灰 | 诊断与检验 |
| `pharmacy_practice` | 灰蓝 | 药学综合知识与技能 |

**系统归属的作用**：回答"这个药/疾病/概念属于哪一类系统"的问题。
- 两个都是药，但 `category` 不同 → 形状相同、边框色不同（视觉上形成不同色带）
- 同一系统下，一个是药一个是病原体 → 形状不同、边框色相同（视觉上同色区里的不同形状）

### data.layer — 知识层

节点"处在哪一层"。用于布局分组，决定节点在图中的视觉层次（上下左右分区）。

| 值 | 含义 | 在图中的位置倾向 |
|---|---|---|
| `foundation` | 基础层：生理学、病理学、药理学基础知识 | 图的底层/中心 |
| `system` | 药物系统层：具体药物、制剂、成分、辅料 | 图的中层 |
| `clinical` | 临床层：疾病、诊断、治疗方案 | 图的中上层 |
| `service` | 服务层：用药管理、药品调配、合理用药指导 | 图的边缘/外围 |

**layer vs. category 的区别**：
- `category` = "在哪一个系统"（颜色边框）
- `layer` = "在哪一个层次"（布局分区）
- 两者正交：一个药可以在 `system` 层 + `cardiovascular` 系统；一个疾病在 `clinical` 层 + `respiratory` 系统。

### edges_out — 关系边

节点指向其他节点的边，用于表达知识关系。

| 值 | 含义 | 方向 | 示例 |
|---|---|---|---|
| `isa` | 是个体/实例（具体→抽象） | A → B（A是B的一种） | 美托洛尔 → β受体阻滞剂 |
| `part_of` | 属于整体 | A → B（A是B的一部分） | 抗风湿药 → 解热镇痛抗炎药章节 |
| `mechanism` | 作用机制 | A → B（A通过B发挥作用） | 美托洛尔 → β受体阻滞机制 |
| `causes` | 引起/导致 | A → B（A导致B） | 病原体 → 感染性疾病 |
| `treats` | 治疗 | A → B（A药治疗B病） | 阿司匹林 → 发热 |
| `has` | 含有/具有 | A → B（A含B成分） | 制剂 → 辅料 |
| `relates` | 一般关联 | A → B（A与B相关） | 同领域两个药 |

**边的视觉原则**：
- 不需要为所有"同类"节点都连 `relates` 边——同类关系由 `type` + `category` 的视觉一致性承载即可。
- 边只连真正有知识关联的节点；关联越多边越多，反而视觉噪音越大。
- `reason` 字段用于 hover 时显示边的含义，不需要在图中永久显示所有边标签。
