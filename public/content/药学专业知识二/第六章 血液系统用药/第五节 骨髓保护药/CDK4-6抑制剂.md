---
data:
  id: cdk4-6-inhibitors
  label: CDK4/6抑制剂
  essence: module
  field: pharmacology
  tier: drug
  location:
    book: 药学专业知识二
    chapter: 第六章 血液系统用药
    section: 第五节 骨髓保护药
  tags:
    - CDK4/6
    - 细胞周期
    - 骨髓保护
    - G1期阻滞
    - 曲拉西利
    - 哌柏西利
    - 瑞波西利
  summary:
    short: CDK4/6抑制剂通过阻滞骨髓细胞于G1期避免化疗损伤，起到骨髓保护作用。
    full: CDK4/6抑制剂是细胞周期调控的关键药物，通过短暂、可逆地抑制CDK4/6活性，将骨髓造血细胞阻滞在G1期，避免化疗药物对分裂期细胞的损伤。曲拉西利用于骨髓保护；哌柏西利、瑞波西利主要用于乳腺癌治疗。
  edges_out:
    - target: bone-marrow-protective-drugs
      type: isa
      reason: CDK4/6抑制剂属于骨髓保护药
    - target: trilaciclib
      type: contains
      reason: 曲拉西利是CDK4/6抑制剂的骨髓保护代表
    - target: palbociclib
      type: contains
      reason: 哌柏西利是CDK4/6抑制剂的抗肿瘤代表
    - target: ribociclib
      type: contains
      reason: 瑞波西利是CDK4/6抑制剂的抗肿瘤代表
---

# CDK4/6抑制剂

## 这类药是什么？

CDK4/6抑制剂是调控细胞周期的药物。细胞周期蛋白依赖性激酶（CDK）是细胞周期调控的关键酶，其中CDK4/6控制着细胞从G1期进入S期的进程。抑制CDK4/6可把细胞阻滞在G1期。

## 分类与用途

| 药物 | 定位 | 适应证 |
|---|---|---|
| **曲拉西利** | 骨髓保护 | 小细胞肺癌化疗前骨髓保护 |
| **哌柏西利** | 抗肿瘤 | HR+/HER2-乳腺癌 |
| **瑞波西利** | 抗肿瘤 | HR+/HER2-乳腺癌 |

## 作用机制

- **骨髓保护机制**（曲拉西利）：化疗前给药，将骨髓造血细胞阻滞在G1期，避免化疗损伤分裂期细胞
- **抗肿瘤机制**（哌柏西利、瑞波西利）：阻滞肿瘤细胞从G1期进入S期，减少癌细胞增殖

## 用药注意

- 曲拉西利：连续多日给药时，2次给药间隔不超过28小时
- 哌柏西利、瑞波西利：用于乳腺癌治疗，与内分泌药联用

## 它和节的关系？

CDK4/6抑制剂是骨髓保护药的核心分类，曲拉西利专用于骨髓保护，哌柏西利和瑞波西利主要用于抗肿瘤治疗。