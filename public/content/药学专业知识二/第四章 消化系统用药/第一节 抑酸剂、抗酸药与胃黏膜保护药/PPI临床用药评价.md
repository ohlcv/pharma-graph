---
data:
  id: ppi-clinical
  label: PPI 临床用药评价
  essence: concept
  field: pharmacology
  tier: management
  location:
    book: 药学专业知识二
    chapter: 第四章 消化系统用药
    section: 第一节 抑酸剂、抗酸药与胃黏膜保护药
    tags:
      - PPI
      - 临床评价
      - 餐前30min
      - 肠溶剂型
      - CYP2C19
  summary:
    short: PPI 餐前 30~60 min 整粒肠溶吞服；主要经 CYP2C19 代谢（艾司>奥美>其他）；长期用监测骨折/低镁/感染。
    full: PPI 临床用药评价要点：① 服药要求：肠溶剂型必须餐前 30~60 min 整粒/整片吞服，不可咀嚼压碎（酸性环境会破坏药物）；注射剂用氯化钠稀释，避免酸性葡萄糖；② CYP2C19 抑制强度：艾司奥美拉唑 > 奥美拉唑（影响氯吡格雷激活）；③ 代谢途径：奥美/艾司/兰索拉唑/右兰索拉唑/泮托拉唑主要 CYP2C19；艾普拉唑主要 CYP3A4；安奈拉唑非酶代谢（对 CYP2C19 慢代谢者更稳定）；④ 不良反应：长期用药增加感染（难辨梭菌腹泻、吸入性肺炎）、骨折（髋/脊椎/腕）、低镁血症、高胃泌素血症、维生素 B₁₂ 吸收障碍；⑤ 相互作用：影响氯吡格雷、铁剂、钙剂、维生素 B₁₂ 吸收；⑥ 临床应用：消化性溃疡 4~8 周、GERD 8 周、HP 根除 14 天、卓-艾综合征长期大剂量、应激性溃疡高危人群预防。
  edges_out:
    - target: ppis
      type: describes
      reason: 此概念专门评价 PPI 临床要点
    - target: ppi-clopidogrel-interaction
      type: relates
      reason: 氯吡格雷相互作用是 PPI 关键临床考点
    - target: hp-eradication-quadruple
      type: relates
      reason: HP 四联疗法必含 PPI
    - target: zollinger-ellison
      type: relates
      reason: 卓-艾综合征需长期大剂量 PPI
---

# PPI 临床用药评价
