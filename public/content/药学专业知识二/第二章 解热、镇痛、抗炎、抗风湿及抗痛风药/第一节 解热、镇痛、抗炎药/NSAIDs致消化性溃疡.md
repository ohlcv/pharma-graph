---
data:
  id: nsaid-gi-injury
  label: NSAIDs 致消化性溃疡
  essence: concept
  field: pharmacology
  tier: management
  location:
    book: 药学专业知识二
    chapter: 第二章 解热、镇痛、抗炎、抗风湿及抗痛风药
    section: 第一节 解热、镇痛、抗炎药
    tags:
      - NSAIDs
      - 消化性溃疡
      - PPI
      - 胃黏膜保护
  summary:
    short: NSAIDs 通过抑制 COX-1 削弱胃黏膜屏障，是药源性消化性溃疡的主要病因，须联用质子泵抑制剂预防。
    full: NSAIDs 致消化性溃疡的机制：① 抑制胃黏膜 COX-1，削弱前列腺素（特别是 PGE₂）介导的胃黏膜保护屏障（黏液分泌、黏膜血流、上皮细胞保护）；② 直接局部刺激损伤胃黏膜。风险因素：高龄（>65 岁）、既往溃疡史、联合抗凝药/糖皮质激素、剂量大、疗程长。临床表现：上腹不适、恶心、消化不良，严重者出现溃疡、出血、穿孔。预防与治疗：① 优先选用 COX-2 选择性抑制剂（胃肠风险降低）；② 联用质子泵抑制剂（奥美拉唑、雷贝拉唑等）保护胃黏膜；③ 必要时联用胃黏膜保护剂（米索前列醇、硫糖铝）。
  edges_out:
    - target: cox-isoform-function-y2
      type: mechanism
      reason: COX-1 抑制削弱胃黏膜屏障是致病核心
    - target: selective-cox2-inhibitors-y2
      type: relates
      reason: COX-2 选择性抑制可降低胃肠风险
    - target: aspirin
      type: causes
      reason: 阿司匹林是 NSAIDs 致溃疡的高风险药
    - target: peptic-ulcer-disease
      type: specializes
      reason: NSAIDs 致消化性溃疡是消化性溃疡的常见病因
---

# NSAIDs 致消化性溃疡
