---
data:
  id: jakinibs
  label: JAK 激酶抑制剂
  essence: module
  field: pharmacology
  tier: drug
  location:
    book: 药学专业知识二
    chapter: 第二章 解热、镇痛、抗炎、抗风湿及抗痛风药
    section: 第二节 抗风湿药
    tags:
      - JAK
      - 靶向
      - tsDMARDs
      - 类风湿关节炎
      - JAK-STAT
  summary:
    short: JAK 激酶抑制剂通过阻断 JAK-STAT 信号通路抑制炎症，代表药为托法替布和巴瑞替尼，用于类风湿关节炎等。
    full: JAK 激酶是多种细胞因子（IL-6、IFN-γ 等）下游信号转导的关键酶，JAK-STAT 通路在炎症免疫反应中起核心作用。托法替布为第一代 JAK 抑制剂，巴瑞替尼为第二代（对 JAK1/JAK2 选择性更高）。带状疱疹感染风险升高是共性问题；活动性感染、恶性肿瘤患者禁用。
  edges_out:
    - target: bdmards
      type: contains
      reason: JAK 抑制剂是 tsDMARDs 的代表
    - target: tofacitinib
      type: contains
      reason: 托法替布是第一代 JAK 抑制剂代表药
    - target: baricitinib
      type: contains
      reason: 巴瑞替尼是第二代 JAK 抑制剂代表药
---

# JAK 激酶抑制剂
