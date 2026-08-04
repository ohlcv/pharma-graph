---
data:
  id: notion-fga-eps
  label: FGAs 锥体外系反应（EPS）
  essence: notion
  field: pharmacology
  tier: management
  location:
    book: 药学专业知识二
    chapter: 第一章 精神与中枢神经系统用药
    section: 第七节 抗精神病药
    item: FGAs 锥体外系反应（EPS）
  tags:
    - 抗精神病药
    - 不良反应
    - 锥体外系反应
    - EPS
    - FGAs
  summary:
    short: FGAs 核心 ADR：锥体外系反应（EPS）——急性肌张力障碍/静坐不能/类PD综合征/迟发性运动障碍。
    full: 第一代抗精神病药核心不良反应：锥体外系反应（EPS）。与阻断黑质-纹状体通路多巴胺 D₂ 受体直接相关，是第一代最突出的不良反应，第二代发生率显著降低。按出现时间与类型分四大类：①急性肌张力障碍（用药后数小时至数天，局部肌群持续性痉挛，如斜颈、动眼危象、牙关紧闭）；②静坐不能（不可控制的坐立不安、反复踱步，伴随主观强烈烦躁感）；③类帕金森综合征（运动迟缓、肌张力增高、静止性震颤、面具脸）；④迟发性运动障碍（长期用药后出现，不自主的刻板运动如吸吮、舔舌、舞蹈样动作，停药后难以逆转，是最严重的远期锥体外系不良反应）。
  edges_out:
    - target: first-gen-antipsychotics
      type: isa
      reason: FGAs 核心 ADR 节点
    - target: notion-fga-acute-dystonia
      type: prerequisite
      reason: 急性肌张力障碍是 EPS 4 类型之一
    - target: notion-fga-akathisia
      type: prerequisite
      reason: 静坐不能是 EPS 4 类型之一
    - target: notion-fga-parkinsonism
      type: prerequisite
      reason: 类帕金森综合征是 EPS 4 类型之一
    - target: notion-fga-tardive-dyskinesia
      type: prerequisite
      reason: 迟发性运动障碍是 EPS 4 类型之一
---

# FGAs 锥体外系反应（EPS）

## 它在讲什么？

FGAs 核心不良反应——锥体外系反应（EPS）的机制、四大类型与临床特征。

## 机制

- 与阻断黑质-纹状体通路多巴胺 D₂ 受体直接相关
- 是第一代最突出的不良反应
- 第二代发生率显著降低

## 四大类型

| 类型 | 出现时间 | 表现 |
|---|---|---|
| 急性肌张力障碍 | 用药后数小时至数天 | 局部肌群持续性痉挛，如斜颈、动眼危象、牙关紧闭 |
| 静坐不能 | 不可控的坐立不安 | 反复踱步，伴随主观强烈烦躁感 |
| 类帕金森综合征 | — | 运动迟缓、肌张力增高、静止性震颤、面具脸 |
| 迟发性运动障碍 | 长期用药后 | 不自主的刻板运动如吸吮、舔舌、舞蹈样动作；停药后难以逆转，是最严重的远期 ADR |

## 它在节里处于什么位置？

它属于抗精神病药节内 FGAs 分类的核心 ADR 节点。