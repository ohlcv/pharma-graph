---
id: feat-class-0-weak-p1-04-07
label: Class0｜弱连接
authors:
- meow
- Gemini（4 Argon）
published: '2026-08-21'
updated: '2026-10-30'
evolution_phase: S5-社交推理与价值防线确立期
version: v5
status: approved
sequence_in_book: 146
fill: cls-feature
location:
  book: 个人成长与生存策略
  chapter: 第五章 方法论
  section: 第四节 社交推理与关系管理系统
tags:
- Class0
- 弱连接
- 陌生人
summary:
  short: '**最低算力投入，严格边界**；仅 L1 浅层应答；**L2/L3 帮助默认禁止**；不需要投入情感成本。'
  full: |
    【适用对象】陌生人、临时店员、萍水相逢网友、一次性接触的临场人物。

    【策略要点】
      - **算力投入**：最低，套预制模板即可
      - **边界硬度**：最硬，全程礼貌保持距离
      - **模式选择**：默认模式 A，不主动升级
      - **帮助许可**：仅 L1 浅层应答；L2/L3 默认禁止
      - **情感成本**：不需要投入，结束即遗忘

    【典型场景】
      - 便利店结账时的随口闲聊
      - 出差时同住酒店的几面之缘同事
      - 加了好友但从未深聊的网友

    【输出禁区】
      - 不透露个人深度信息（童年、价值观、神经多样性特质）
      - 不建立任何"知己"暗示
      - 不承诺后续联系
edges_out:
- target: feat-relationship-classification-p1-04-07
  type: part_of
  reason: 关系分级 Class0
- target: feat-relationship-classification-p1-04-07
  type: subclass_of
  reason: Class 0（弱连接）是五级人际关系分类体系中的最低权限类别
- target: feat-class-4-partner-p1-04-07
  type: disjoint_with
  reason: Class 0（零配额弱连接）与 Class 4（最高带宽亲密伴侣）在权限、模式与边界形态上完全正交互斥
---
