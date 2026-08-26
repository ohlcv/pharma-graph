---
data:
  id: breast-cancer-hr-her2
  label: HR+/HER2-乳腺癌
  essence: illness
  field: pharmacology
  tier: disease
  location:
    book: 药学专业知识二
    chapter: 第六章 血液系统用药
    section: 第五节 骨髓保护药
  tags:
    - 乳腺癌
    - HR阳性
    - HER2阴性
    - CDK4/6抑制剂
    - 内分泌治疗
  summary:
    short: HR+/HER2-乳腺癌是激素受体阳性、HER2阴性的乳腺癌，哌柏西利和瑞波西利的适应证。
    full: HR+/HER2-乳腺癌是指激素受体阳性（ER+和/或PR+）、人表皮生长因子受体2阴性（HER2-）的乳腺癌，是乳腺癌最常见的分子亚型（约占70%）。CDK4/6抑制剂（哌柏西利、瑞波西利）联合内分泌治疗已成为该亚型晚期乳腺癌的一线标准治疗。
  edges_out:
    - target: bone-marrow-protective-drugs
      type: isa
      reason: HR+/HER2-乳腺癌是CDK4/6抑制剂的适应证
    - target: palbociclib
      type: treats
      reason: 哌柏西利用于HR+/HER2-乳腺癌
    - target: ribociclib
      type: treats
      reason: 瑞波西利用于HR+/HER2-乳腺癌
---

# HR+/HER2-乳腺癌

## 它是什么病？

HR+/HER2-乳腺癌是指**激素受体阳性（HR+）、人表皮生长因子受体2阴性（HER2-）**的乳腺癌，是乳腺癌最常见的分子亚型，约占全部乳腺癌的70%。

## 分子特征

| 指标 | 状态 | 意义 |
|---|---|---|
| 激素受体（HR）| 阳性（ER+和/或PR+）| 肿瘤依赖雌激素/孕激素生长 |
| HER2 | 阴性 | 无HER2过表达/扩增 |

## 治疗策略

HR+/HER2-乳腺癌的治疗以**内分泌治疗**为基础：
- 他莫昔芬（TAM）
- 芳香化酶抑制剂（AI）
- 氟维司群

**CDK4/6抑制剂（哌柏西利、瑞波西利）联合内分泌治疗**已成为晚期患者的一线标准治疗，可显著延长无进展生存期（PFS）。

## CDK4/6抑制剂的作用机制

哌柏西利、瑞波西利通过阻滞肿瘤细胞从G1期进入S期，减少癌细胞增殖，与内分泌治疗产生协同效应。

## 它在知识体系里的位置？

HR+/HER2-乳腺癌是哌柏西利和瑞波西利的共同适应证，是CDK4/6抑制剂抗肿瘤用途的代表性疾病。