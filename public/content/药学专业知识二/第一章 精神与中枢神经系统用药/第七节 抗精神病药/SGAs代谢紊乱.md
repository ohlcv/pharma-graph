---
data:
  id: notion-sga-metabolic
  label: SGAs 代谢紊乱
  essence: notion
  field: pharmacology
  tier: management
  location:
    book: 药学专业知识二
    chapter: 第一章 精神与中枢神经系统用药
    section: 第七节 抗精神病药
    item: SGAs 代谢紊乱
  tags:
    - 抗精神病药
    - 不良反应
    - SGAs
    - 代谢综合征
    - 体重增加
  summary:
    short: SGAs 核心 ADR：代谢紊乱——体重增加+血糖血脂异常；不同药物风险分级差异大。
    full: 第二代抗精神病药核心不良反应：代谢紊乱。第二代药物锥体外系反应轻，主要风险为代谢综合征（体重增加、血糖升高、血脂紊乱），增加糖尿病、心血管疾病风险。氯氮平还可导致粒细胞缺乏症，是其最严重的不良反应。不同药物风险分级差异大：高风险（氯氮平、奥氮平）、中风险（喹硫平、利培酮、帕利哌酮）、低风险（齐拉西酮、阿立哌唑）。
  edges_out:
    - target: second-gen-antipsychotics
      type: isa
      reason: SGAs 核心 ADR 节点
    - target: notion-metabolic-high-risk
      type: prerequisite
      reason: 代谢高风险药物分级
    - target: notion-metabolic-medium-risk
      type: prerequisite
      reason: 代谢中风险药物分级
    - target: notion-metabolic-low-risk
      type: prerequisite
      reason: 代谢低风险药物分级
---

# SGAs 代谢紊乱

## 它在讲什么？

SGAs 核心不良反应——代谢综合征（含体重增加、血糖血脂异常）+ 药物风险分级。

## 整体特征

- 第二代药物锥体外系反应轻
- 主要风险为代谢综合征
- 增加糖尿病、心血管疾病风险
- 不同药物风险分级差异大

## 药物风险分级

| 风险等级 | 药物 |
|---|---|
| 高风险 | 氯氮平、奥氮平 |
| 中风险 | 喹硫平、利培酮、帕利哌酮 |
| 低风险 | 齐拉西酮、阿立哌唑 |

## 它在节里处于什么位置？

它属于抗精神病药节内 SGAs 分类的核心 ADR 节点。