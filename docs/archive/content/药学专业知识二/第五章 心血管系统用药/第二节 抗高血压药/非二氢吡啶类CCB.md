---
data:
  id: non-dhp-ccb
  label: 非二氢吡啶类CCB
  essence: module
  field: pharmacology
  tier: management
  location:
    book: 药学专业知识二
    chapter: 第五章 心血管系统用药
    section: 第二节 抗高血压药
    subsection: 钙通道阻滞剂（CCB）
    item: 非二氢吡啶类
  tags:
    - 非二氢吡啶类CCB
    - 维拉帕米
    - 地尔硫䓬
    - 抗心律失常
  summary:
    short: 非二氢吡啶类CCB以心脏抑制为主，代表药维拉帕米、地尔硫䓬。
    full: 非二氢吡啶类CCB以心脏抑制作用为主，代表药为维拉帕米和地尔硫䓬。负性频率和负性传导作用最强，主要用于心律失常治疗（房颤心室率控制、阵发性室上速终止），同时用于心绞痛和原发性高血压治疗。典型不良反应为抑制心脏收缩与传导，可致心动过缓、房室传导阻滞。禁忌：二至三度房室传导阻滞、心力衰竭、严重心动过缓。
  edges_out:
    - target: ccb-antihypertensives
      type: isa
      reason: 非二氢吡啶类CCB是CCB大类下属的第二亚类
    - target: hypertension-management
      type: treats
      reason: 非二氢吡啶类CCB用于高血压治疗
    - target: atrial-fibrillation
      type: treats
      reason: 非二氢吡啶类CCB用于房颤心室率控制
    - target: angina-pectoris-disease
      type: treats
      reason: 非二氢吡啶类CCB用于心绞痛治疗
    - target: class-iv-non-dihydropyridine-ccb
      type: relates
      reason: 非二氢吡啶类CCB同时是抗心律失常药节下属的Ⅳ类亚类
---

# 非二氢吡啶类CCB

## 这一组在讲什么？

这一组讲的是 CCB 中以心脏抑制作用为主的非二氢吡啶类药物，代表药为维拉帕米和地尔硫䓬。它们同时在第五章第一节抗心律失常药节下属的Ⅳ类亚类中作为核心代表药。

## 为什么要单独理解它？

因为非二氢吡啶类 CCB 是 CCB 大类下**与二氢吡啶类作用靶点完全不同的亚类**——前者作用于心脏慢反应细胞用于抗心律失常，后者作用于血管平滑肌用于降压。同时它的"心脏抑制"特征决定了**禁忌与二氢吡啶类不同**：二氢吡啶类禁用于低血压/心动过速，非二氢吡啶类禁用于二三度AVB/心衰/严重心动过缓。

## 它主要和什么有关？

它和心肌细胞 L 型钙通道密切相关。代表药：
- **维拉帕米**——心脏抑制最强
- **地尔硫䓬**——作用介于维拉帕米和二氢吡啶类之间

它和第五章第一节抗心律失常药节有大量药物重叠——非二氢吡啶类 CCB 同时是Ⅳ类抗心律失常药。

## 它通常在什么阶段出现？

它出现在理解 CCB 大类之后，是把"心脏作用 vs 血管作用"二分法落到临床的关键节点。

## 它在整套框架里放在哪里？

它位于《药学专业知识二》第五章第二节抗高血压药节下属、CCB 大类下的第二亚类。横跨第五章第一节抗心律失常药节（Ⅳ类）。
