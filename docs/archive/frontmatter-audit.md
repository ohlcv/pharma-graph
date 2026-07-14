# Frontmatter 审核报告

> ⚠️ **ARCHIVED — 2026-07-14**：本文档是 ISA 迁移**前**生成的违规清单快照。所有 375 处"has→location 子级"违规已由 [`src/scripts/migrate-isa.ts`](../scripts/migrate-isa.ts) 修复完毕（has 边从 384 降至 0）。当前 frontmatter 校验通过状态见 [migration-report.md](../migration-report.md)。本文档**不再代表当前数据状态**。

> 生成时间：2026/7/14 20:24:06
> 总文件数：223 | 字段完成度：**99%**

## 评分说明

| 符号 | 含义 |
|---|---|
| ❌ | 严重错误（字段缺失、值非法） |
| ⚠️ | 缺失/不完整（字段存在但为空或非标准化） |
| ✅ | 正确 |
| 🔁 | 关系方向违规（见 [ADR-0001]） |

## 总体统计

| 指标 | 数值 |
|---|---|
| ❌ 有严重错误的文件 | 0 / 223 |
| ⚠️ 有警告的文件 | 220 / 223 |
| 🔁 关系方向违规（has↔location 子级） | 375 处 |
| 🔁 双向 has/isa/relates 配对 | 171 处 |
| ⚠️ 非 book 节点缺 isa 边（建议） | 220 处 |
| 字段完成度 | 99% |

---

## 文件明细

> 🔁 列含义：见 `docs/ADR-0001-层级关系统一使用isa方向.md`
> `-无`: 本节点无方向违规

### 药学专业知识一.md

| # | 文件 | id | essence | field | tier | summary | edges | 🔁 | 完成度 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `药学专业知识一.md` | ✅ `pharm-knowledge-1` | ✅ module | ✅ pharmacy_service | ✅ basic | ✅ | ✅ | 🔁×5 | 100% |

### 药学专业知识一

| # | 文件 | id | essence | field | tier | summary | edges | 🔁 | 完成度 |
|---|---|---|---|---|---|---|---|---|---|
| 2 | `药学专业知识一/第一篇 药剂学.md` | ✅ `pharmaceutics-y1` | ✅ module | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | 🔁×5 | 100% |
| 3 | `药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系.md` | ✅ `drug-quality-system-y1` | ✅ module | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 4 | `药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系/第一节 药物与药物制剂.md` | ✅ `drug-preparations-y1` | ✅ section | ✅ pharmaceutics | ✅ drug | ✅ | ⚠️ | -无 | 86% |
| 5 | `药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系/第二节 药品质量与质量体系.md` | ✅ `drug-quality-and-quality-systems` | ✅ section | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 6 | `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用.md` | ✅ `oral-drugs-y1` | ✅ module | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | 🔁×2 | 100% |
| 7 | `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂.md` | ✅ `oral-solid-dosage-forms-y1` | ✅ module | ✅ pharmaceutics | ✅ basic | ✅ | ✅ | 🔁×2 | 100% |
| 8 | `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/生物利用度.md` | ✅ `bioavailability-y1` | ✅ section | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | -无 | 100% |
| 9 | `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/缓释剂型.md` | ✅ `sustained-release-dosage-forms-y1` | ✅ section | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | -无 | 100% |
| 10 | `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/美托洛尔.md` | ✅ `metoprolol` | ✅ medication | ✅ pharmacology | ✅ drug | ✅ | ✅ | -无 | 100% |
| 11 | `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/药物吸收.md` | ✅ `drug-absorption-y1` | ✅ section | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | -无 | 100% |
| 12 | `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/首过效应.md` | ✅ `first-pass-effect` | ✅ notion | ✅ biopharmaceutics | ✅ basic | ✅ | ✅ | 🔁×1 | 100% |
| 13 | `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第二节 口服液体制剂.md` | ✅ `oral-liquid-dosage-forms-y1` | ✅ module | ✅ pharmaceutics | ✅ basic | ✅ | ✅ | -无 | 100% |
| 14 | `药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用.md` | ✅ `topical-mucosal-drugs-y1` | ✅ module | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | 🔁×2 | 100% |
| 15 | `药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用/第一节 皮肤给药制剂.md` | ✅ `topical-drug-delivery-y1` | ✅ module | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | -无 | 100% |
| 16 | `药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用/第二节 黏膜给药制剂.md` | ✅ `mucosal-drug-delivery-y1` | ✅ module | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | -无 | 100% |
| 17 | `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用.md` | ✅ `injection-preparations-y1` | ✅ module | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | 🔁×4 | 100% |
| 18 | `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第一节 注射剂的质量控制.md` | ✅ `injection-quality-control-y1` | ✅ module | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 19 | `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第三节 微粒制剂.md` | ✅ `particulate-injection-preparations-y1` | ✅ module | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 20 | `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第二节 普通注射剂.md` | ✅ `common-injection-preparations-y1` | ✅ module | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 21 | `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第四节 生物技术药物注射剂.md` | ✅ `biotech-drug-injection-y1` | ✅ module | ✅ pharmaceutics | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 22 | `药学专业知识一/第三篇 药物化学.md` | ✅ `medicinal-chemistry-y1` | ✅ module | ✅ medicinal_chemistry | ✅ drug | ✅ | ✅ | 🔁×9 | 100% |
| 23 | `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md` | ✅ `drug-structure-activity-y1` | ✅ module | ✅ medicinal_chemistry | ✅ drug | ✅ | ✅ | 🔁×10 | 100% |
| 24 | `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第一节 药物结构与药物活性.md` | ✅ `structure-activity-drugs-1-y1` | ✅ section | ✅ medicinal_chemistry | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 25 | `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第七节 循环系统疾病药物.md` | ✅ `structure-activity-cardiovascular-y1` | ✅ section | ✅ medicinal_chemistry | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 26 | `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第三节 中枢神经系统药物.md` | ✅ `structure-activity-cns-y1` | ✅ section | ✅ medicinal_chemistry | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 27 | `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第九节 泌尿系统疾病药物.md` | ✅ `structure-activity-urinary-y1` | ✅ section | ✅ medicinal_chemistry | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 28 | `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第二节 药物代谢.md` | ✅ `drug-metabolism-y1` | ✅ section | ✅ pharmacokinetics | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 29 | `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第五节 呼吸系统疾病药物.md` | ✅ `structure-activity-respiratory-y1` | ✅ section | ✅ medicinal_chemistry | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 30 | `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第八节 内分泌系统疾病药物.md` | ✅ `structure-activity-endocrine-y1` | ✅ section | ✅ medicinal_chemistry | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 31 | `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第六节 消化系统疾病药物.md` | ✅ `structure-activity-gi-y1` | ✅ section | ✅ medicinal_chemistry | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 32 | `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第十一节 抗肿瘤药物.md` | ✅ `structure-activity-antitumor-y1` | ✅ section | ✅ medicinal_chemistry | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 33 | `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第十节 抗感染药物.md` | ✅ `structure-activity-antibiotic-y1` | ✅ section | ✅ medicinal_chemistry | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 34 | `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第四节 解热镇痛及非甾体抗炎药物.md` | ✅ `structure-activity-analgesic-y1` | ✅ section | ✅ medicinal_chemistry | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 35 | `药学专业知识一/第二篇 药理与毒理学.md` | ✅ `pharmacology-and-toxicology` | ✅ module | ✅ pharmacology | ✅ service | ✅ | ✅ | 🔁×4 | 100% |
| 36 | `药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全.md` | ✅ `pharmacotoxicology-y1` | ✅ module | ✅ toxicology | ✅ management | ✅ | ✅ | 🔁×2 | 100% |
| 37 | `药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全/第一节 药物毒性与毒副作用.md` | ✅ `drug-toxicity-side-effects-y1` | ✅ section | ✅ toxicology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 38 | `药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全/第二节 药物应用的毒副作用与用药安全.md` | ✅ `drug-application-safety-y1` | ✅ section | ✅ toxicology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 39 | `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用.md` | ✅ `pharmacodynamics-y1` | ✅ module | ✅ pharmacology | ✅ drug | ✅ | ✅ | 🔁×4 | 100% |
| 40 | `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第一节 药物作用的两重性.md` | ✅ `drug-duality-y1` | ✅ section | ✅ pharmacology | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 41 | `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第三节 药物的作用机制与靶点.md` | ✅ `mechanism-target-y1` | ✅ section | ✅ pharmacology | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 42 | `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第二节 药物作用的量效和时效规律与评价.md` | ✅ `dose-time-effect` | ✅ section | ✅ pharmacology | ✅ basic | ✅ | ✅ | 🔁×1 | 100% |
| 43 | `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第五节 遗传药理学与临床合理用药.md` | ✅ `pharmacogenetics-y1` | ✅ section | ✅ pharmacology | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 44 | `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第六节 时辰药理学与临床合理用药.md` | ✅ `chronopharmacology-y1` | ✅ section | ✅ pharmacology | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 45 | `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第四节 药物相互作用.md` | ✅ `drug-interaction-y1` | ✅ section | ✅ pharmacology | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 46 | `药学专业知识一/第五篇 生命药学.md` | ✅ `biopharmaceutics-y1` | ✅ module | ⚠️ — | ✅ basic | ✅ | ✅ | 🔁×5 | 86% |
| 47 | `药学专业知识一/第五篇 生命药学/第二章 生命药学.md` | ✅ `biopharmaceutics-chapter-y1` | ✅ module | ⚠️ — | ✅ basic | ✅ | ✅ | 🔁×5 | 86% |
| 48 | `药学专业知识一/第五篇 生命药学/第二章 生命药学/第一节 人体生物分子的结构与功能.md` | ✅ `biomolecule-structure-function-y1` | ✅ section | ⚠️ — | ✅ basic | ✅ | ✅ | 🔁×1 | 86% |
| 49 | `药学专业知识一/第五篇 生命药学/第二章 生命药学/第三节 感染与免疫.md` | ✅ `infection-immunity-y1` | ✅ section | ⚠️ — | ✅ basic | ✅ | ✅ | 🔁×1 | 86% |
| 50 | `药学专业知识一/第五篇 生命药学/第二章 生命药学/第二节 人体代谢.md` | ✅ `human-metabolism-y1` | ✅ section | ⚠️ — | ✅ basic | ✅ | ✅ | 🔁×1 | 86% |
| 51 | `药学专业知识一/第五篇 生命药学/第二章 生命药学/第四节 病理生理.md` | ✅ `pathophysiology-y1` | ✅ section | ⚠️ — | ✅ basic | ✅ | ✅ | 🔁×1 | 86% |
| 52 | `药学专业知识一/第四篇 药动学.md` | ✅ `pharmacokinetics-y1` | ✅ module | ✅ pharmacokinetics | ✅ drug | ✅ | ✅ | 🔁×4 | 100% |
| 53 | `药学专业知识一/第四篇 药动学/第三章 药物的体内过程.md` | ✅ `drug-disposition-processes` | ✅ module | ✅ pharmacokinetics | ✅ service | ✅ | ✅ | 🔁×2 | 100% |
| 54 | `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第一节 药物与机体的相互作用.md` | ✅ `drug-absorption-process-y1` | ✅ section | ✅ pharmacokinetics | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 55 | `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第三节 药物的分布、代谢与排泄.md` | ✅ `drug-distribution-metabolism-excretion-y1` | ✅ section | ✅ pharmacokinetics | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |
| 56 | `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第二节 药物的吸收.md` | ✅ `drug-absorption-pk-y1` | ✅ section | ✅ pharmacokinetics | ✅ drug | ✅ | ✅ | -无 | 100% |
| 57 | `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第四节 药物动力学与临床应用.md` | ✅ `pk-clinical-application-y1` | ✅ section | ✅ pharmacokinetics | ✅ drug | ✅ | ✅ | 🔁×1 | 100% |

### 药学专业知识二.md

| # | 文件 | id | essence | field | tier | summary | edges | 🔁 | 完成度 |
|---|---|---|---|---|---|---|---|---|---|
| 58 | `药学专业知识二.md` | ✅ `pharm-knowledge-2` | ✅ module | ✅ pharmacy_service | ✅ basic | ✅ | ✅ | -无 | 100% |

### 药学专业知识二

| # | 文件 | id | essence | field | tier | summary | edges | 🔁 | 完成度 |
|---|---|---|---|---|---|---|---|---|---|
| 59 | `药学专业知识二/第一章 精神与中枢神经系统用药.md` | ✅ `cns-drugs-y2` | ✅ module | ✅ pharmacology | ✅ service | ✅ | ✅ | 🔁×7 | 100% |
| 60 | `药学专业知识二/第一章 精神与中枢神经系统用药/第一节 镇静催眠药、中枢肌松药.md` | ✅ `sedative-hypnotics-muscle-relaxants` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 61 | `药学专业知识二/第一章 精神与中枢神经系统用药/第七节 抗精神病药.md` | ✅ `antipsychotic-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 62 | `药学专业知识二/第一章 精神与中枢神经系统用药/第三节 抗抑郁药.md` | ✅ `antidepressant-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 63 | `药学专业知识二/第一章 精神与中枢神经系统用药/第二节 抗癫痫发作药物.md` | ✅ `antiepileptic-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 64 | `药学专业知识二/第一章 精神与中枢神经系统用药/第五节 中枢镇痛药.md` | ✅ `central-analgesics` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 65 | `药学专业知识二/第一章 精神与中枢神经系统用药/第六节 抗帕金森病药.md` | ✅ `antiparkinson-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 66 | `药学专业知识二/第一章 精神与中枢神经系统用药/第四节 抗记忆障碍及改善神经功能药.md` | ✅ `anti-dementia-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 67 | `药学专业知识二/第七章 泌尿系统用药.md` | ✅ `urinary-drugs-y2` | ✅ module | ✅ pharmacology | ✅ service | ✅ | ✅ | 🔁×4 | 100% |
| 68 | `药学专业知识二/第七章 泌尿系统用药/第一节 利尿药.md` | ✅ `section-diuretics` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 69 | `药学专业知识二/第七章 泌尿系统用药/第三节 治疗良性前列腺增生用药.md` | ✅ `bph-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 70 | `药学专业知识二/第七章 泌尿系统用药/第二节 治疗男性勃起功能障碍药.md` | ✅ `erectile-dysfunction-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 71 | `药学专业知识二/第七章 泌尿系统用药/第四节 治疗膀胱过度活动症用药.md` | ✅ `oab-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 72 | `药学专业知识二/第三章 呼吸系统用药.md` | ✅ `respiratory-drugs-y2` | ✅ module | ✅ pharmacology | ✅ service | ✅ | ✅ | 🔁×4 | 100% |
| 73 | `药学专业知识二/第三章 呼吸系统用药/第一节 镇咳药.md` | ✅ `antitussives` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 74 | `药学专业知识二/第三章 呼吸系统用药/第三节 平喘药.md` | ✅ `anti-asthmatic-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 75 | `药学专业知识二/第三章 呼吸系统用药/第二节 祛痰药.md` | ✅ `expectorants` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 76 | `药学专业知识二/第三章 呼吸系统用药/第四节 特发性肺纤维化的治疗药物.md` | ✅ `ipf-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 77 | `药学专业知识二/第九章 抗感染药物.md` | ✅ `antiinfective-drugs-y2` | ✅ module | ✅ pharmacology | ✅ service | ✅ | ✅ | 🔁×17 | 100% |
| 78 | `药学专业知识二/第九章 抗感染药物/第一节 抗菌药物总论.md` | ✅ `antibacterial-general` | ✅ section | ✅ pharmacology | ✅ basic | ✅ | ✅ | 🔁×1 | 100% |
| 79 | `药学专业知识二/第九章 抗感染药物/第七节 喹诺酮类与磺胺类抗菌药物.md` | ✅ `quinolones-sulfonamides` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 80 | `药学专业知识二/第九章 抗感染药物/第三节 头孢菌素类抗菌药物.md` | ✅ `cephalosporins` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 81 | `药学专业知识二/第九章 抗感染药物/第九节 糖肽类与其他抗菌药物.md` | ✅ `glycopeptides` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 82 | `药学专业知识二/第九章 抗感染药物/第二节 青霉素类抗菌药物.md` | ✅ `penicillins` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 83 | `药学专业知识二/第九章 抗感染药物/第五节 氨基糖苷类与四环素类抗菌药物.md` | ✅ `aminoglycosides-tetracyclines` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 84 | `药学专业知识二/第九章 抗感染药物/第八节 硝基呋喃类与硝基咪唑类抗菌药物.md` | ✅ `nitrofurans-nitroimidazoles` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 85 | `药学专业知识二/第九章 抗感染药物/第六节 大环内酯类、林可霉素类与酰胺醇类抗菌药物.md` | ✅ `macrolides` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 86 | `药学专业知识二/第九章 抗感染药物/第十一节 抗真菌药.md` | ✅ `antifungals` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 87 | `药学专业知识二/第九章 抗感染药物/第十七节 抗原虫药和抗蠕虫药.md` | ✅ `antiprotozoal-antihelminthic` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 88 | `药学专业知识二/第九章 抗感染药物/第十三节 抗流感病毒药.md` | ✅ `anti-influenza` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 89 | `药学专业知识二/第九章 抗感染药物/第十二节 抗（人）疱疹病毒药物.md` | ✅ `anti-herpesvirus` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 90 | `药学专业知识二/第九章 抗感染药物/第十五节 抗肝炎病毒药物.md` | ✅ `anti-hepatitis` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 91 | `药学专业知识二/第九章 抗感染药物/第十六节 抗艾滋病病毒药物.md` | ✅ `anti-hiv` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 92 | `药学专业知识二/第九章 抗感染药物/第十四节 抗新型冠状病毒药.md` | ✅ `anti-covid` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 93 | `药学专业知识二/第九章 抗感染药物/第十节 抗结核分枝杆菌药.md` | ✅ `antimycobacterial-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 94 | `药学专业知识二/第九章 抗感染药物/第四节 β-内酰胺酶抑制剂、碳青霉烯类与其他β-内酰胺类抗菌药物.md` | ✅ `beta-lactamase-carbapenems` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 95 | `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药.md` | ✅ `analgesic-antiinflammatory-y2` | ✅ module | ✅ pharmacology | ✅ service | ✅ | ✅ | 🔁×3 | 100% |
| 96 | `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第一节 解热、镇痛、抗炎药.md` | ✅ `antipyretic-analgesic-antiinflammatory` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 97 | `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第三节 抗痛风药.md` | ✅ `antigout-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 98 | `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第二节 抗风湿药.md` | ✅ `anti-inflammatory-antirheumatic-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 99 | `药学专业知识二/第五章 心血管系统用药.md` | ✅ `cardiovascular-drugs-y2` | ✅ module | ✅ pharmacology | ✅ service | ✅ | ✅ | 🔁×5 | 100% |
| 100 | `药学专业知识二/第五章 心血管系统用药/第一节 抗心律失常药.md` | ✅ `section-antiarrhythmics` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 101 | `药学专业知识二/第五章 心血管系统用药/第三节 调节血脂药.md` | ✅ `lipid-regulators` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 102 | `药学专业知识二/第五章 心血管系统用药/第二节 抗高血压药.md` | ✅ `section-antihypertensives` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 103 | `药学专业知识二/第五章 心血管系统用药/第五节 抗心力衰竭药.md` | ✅ `section-antihypertensive-heart-failure` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 104 | `药学专业知识二/第五章 心血管系统用药/第四节 抗心绞痛药.md` | ✅ `section-antianginals` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 105 | `药学专业知识二/第八章 内分泌系统用药.md` | ✅ `endocrine-drugs-y2` | ✅ module | ✅ pharmacology | ✅ service | ✅ | ✅ | 🔁×7 | 100% |
| 106 | `药学专业知识二/第八章 内分泌系统用药/第一节 下丘脑-垂体激素及相关药物.md` | ✅ `hypothalamic-pituitary-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 107 | `药学专业知识二/第八章 内分泌系统用药/第七节 性激素类.md` | ✅ `sex-hormones` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 108 | `药学专业知识二/第八章 内分泌系统用药/第三节 甲状腺激素类药物与抗甲状腺药物.md` | ✅ `thyroid-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 109 | `药学专业知识二/第八章 内分泌系统用药/第二节 肾上腺糖皮质激素类药物.md` | ✅ `glucocorticoids` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 110 | `药学专业知识二/第八章 内分泌系统用药/第五节 调节骨代谢药物.md` | ✅ `bone-metabolism-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 111 | `药学专业知识二/第八章 内分泌系统用药/第六节 减重药.md` | ✅ `weight-management-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 112 | `药学专业知识二/第八章 内分泌系统用药/第四节 胰岛素与其他影响血糖的药物.md` | ✅ `antidiabetic-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 113 | `药学专业知识二/第六章 血液系统用药.md` | ✅ `hematologic-drugs-y2` | ✅ module | ✅ pharmacology | ✅ service | ✅ | ✅ | 🔁×10 | 100% |
| 114 | `药学专业知识二/第六章 血液系统用药/第一节 抗血栓药.md` | ✅ `antithrombotic-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 115 | `药学专业知识二/第六章 血液系统用药/第三节 抗贫血药.md` | ✅ `antianemics` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 116 | `药学专业知识二/第六章 血液系统用药/第二节 抗出血药.md` | ✅ `hemostatic-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 117 | `药学专业知识二/第六章 血液系统用药/第五节 骨髓保护药.md` | ✅ `bone-marrow-protective-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 118 | `药学专业知识二/第六章 血液系统用药/第四节 升白细胞药.md` | ✅ `leukocyte-stimulants` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 119 | `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药.md` | ✅ `nutrition-drugs-y2` | ✅ module | ✅ pharmacology | ✅ service | ✅ | ✅ | 🔁×4 | 100% |
| 120 | `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第一节 糖类、盐类、酸碱平衡调节药.md` | ✅ `fluids-electrolytes` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 121 | `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第三节 肠内营养药.md` | ✅ `ent-nutrition` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 122 | `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第二节 微量元素与维生素.md` | ✅ `vitamins-minerals` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 123 | `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第四节 肠外营养药.md` | ✅ `pn-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 124 | `药学专业知识二/第十三章 皮肤用药及抗过敏用药.md` | ✅ `dermatology-drugs-y2` | ✅ module | ✅ pharmacology | ✅ service | ✅ | ✅ | 🔁×9 | 100% |
| 125 | `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第一节 体外杀寄生虫与皮肤感染治疗药.md` | ✅ `parasitic-skin-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 126 | `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第七节 妇科外用药.md` | ✅ `gynecological-dermatology` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 127 | `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第三节 痤疮治疗药.md` | ✅ `acne-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 128 | `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第九节 抗过敏药.md` | ✅ `antihistamines` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 129 | `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第二节 局部用抗真菌药.md` | ✅ `topical-antifungal` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 130 | `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第五节 治疗白癜风药.md` | ✅ `vitiligo-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 131 | `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第八节 消毒防腐药.md` | ✅ `disinfectants` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 132 | `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第六节 治疗银屑病药.md` | ✅ `psoriasis-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 133 | `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第四节 外用糖皮质激素.md` | ✅ `topical-corticosteroids` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 134 | `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药.md` | ✅ `ent-drugs-y2` | ✅ module | ✅ pharmacology | ✅ service | ✅ | ✅ | 🔁×3 | 100% |
| 135 | `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第一节 眼科用药.md` | ✅ `ophthalmic-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 136 | `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第三节 口腔科用药.md` | ✅ `oral-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 137 | `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第二节 耳鼻咽喉科用药.md` | ✅ `ent-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 138 | `药学专业知识二/第十章 抗肿瘤药.md` | ✅ `antitumor-drugs-y2` | ✅ module | ✅ pharmacology | ✅ service | ✅ | ✅ | 🔁×14 | 100% |
| 139 | `药学专业知识二/第十章 抗肿瘤药/第一节 直接影响DNA结构和功能的药物.md` | ✅ `direct-dna-acting-antitumor` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 140 | `药学专业知识二/第十章 抗肿瘤药/第七节 其他抗肿瘤药物.md` | ✅ `other-antitumor` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 141 | `药学专业知识二/第十章 抗肿瘤药/第三节 干扰转录过程和阻止RNA合成的药物（作用于核酸转录药物）.md` | ✅ `rna-synthesis-antitumor` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 142 | `药学专业知识二/第十章 抗肿瘤药/第二节 干扰核酸生物合成的药物（抗代谢药）.md` | ✅ `antimetabolite-antitumor` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 143 | `药学专业知识二/第十章 抗肿瘤药/第五节 调节体内激素平衡的药物.md` | ✅ `hormonal-antitumor` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 144 | `药学专业知识二/第十章 抗肿瘤药/第六节 生物靶向治疗药物.md` | ✅ `biological-targeted-antitumor` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 145 | `药学专业知识二/第十章 抗肿瘤药/第四节 干扰有丝分裂的药物.md` | ✅ `mitotic-inhibitor-antitumor` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 146 | `药学专业知识二/第四章 消化系统用药.md` | ✅ `gi-drugs-y2` | ✅ module | ✅ pharmacology | ✅ service | ✅ | ✅ | 🔁×7 | 100% |
| 147 | `药学专业知识二/第四章 消化系统用药/第一节 抑酸剂、抗酸药与胃黏膜保护药.md` | ✅ `antiacid-mucosal-protectants` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 148 | `药学专业知识二/第四章 消化系统用药/第七节 助消化药.md` | ✅ `digestive-enzymes` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 149 | `药学专业知识二/第四章 消化系统用药/第三节 止吐药.md` | ✅ `antiemetics` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 150 | `药学专业知识二/第四章 消化系统用药/第二节 解痉药、胃肠动力药与功能性胃肠病治疗药.md` | ✅ `antispasmodic-prokinetic-functional-gi` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 151 | `药学专业知识二/第四章 消化系统用药/第五节 泻药与便秘治疗药.md` | ✅ `laxatives-constipation-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 152 | `药学专业知识二/第四章 消化系统用药/第六节 止泻药、肠道抗感染药、肠道抗炎药.md` | ✅ `antidiarrheal-intestinal-antiinfective-antiinflammatory` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 153 | `药学专业知识二/第四章 消化系统用药/第四节 肝胆疾病用药.md` | ✅ `hepatobiliary-drugs` | ✅ section | ✅ pharmacology | ✅ management | ✅ | ✅ | 🔁×1 | 100% |

### 药学综合知识与技能.md

| # | 文件 | id | essence | field | tier | summary | edges | 🔁 | 完成度 |
|---|---|---|---|---|---|---|---|---|---|
| 154 | `药学综合知识与技能.md` | ✅ `pharm-knowledge-3` | ✅ module | ✅ pharmacy_service | ✅ basic | ✅ | ✅ | 🔁×1 | 100% |

### 药学综合知识与技能

| # | 文件 | id | essence | field | tier | summary | edges | 🔁 | 完成度 |
|---|---|---|---|---|---|---|---|---|---|
| 155 | `药学综合知识与技能/第一章 药学服务与药品管理.md` | ✅ `pharmacy-services-drug-management` | ✅ module | ✅ pharmacy_service | ✅ service | ✅ | ✅ | 🔁×2 | 100% |
| 156 | `药学综合知识与技能/第一章 药学服务与药品管理/第一节 药学服务与执业药师.md` | ✅ `pharmacy-services-pharmacist` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 157 | `药学综合知识与技能/第一章 药学服务与药品管理/第二节 药品管理.md` | ✅ `drug-management` | ✅ section | ✅ pharmacy_service | ✅ legal | ✅ | ✅ | 🔁×1 | 100% |
| 158 | `药学综合知识与技能/第七章 慢性病管理.md` | ✅ `chronic-disease-management` | ✅ module | ✅ pharmacy_service | ✅ service | ✅ | ✅ | -无 | 100% |
| 159 | `药学综合知识与技能/第三章 用药咨询与药物治疗管理.md` | ✅ `drug-consultation-y3` | ✅ module | ✅ pharmacy_service | ✅ service | ✅ | ✅ | 🔁×4 | 100% |
| 160 | `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第一节 药学信息咨询服务.md` | ✅ `drug-information` | ✅ section | ✅ pharmacy_service | ✅ service | ✅ | ✅ | 🔁×1 | 100% |
| 161 | `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第三节 药物治疗管理.md` | ✅ `mtm` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 162 | `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第二节 疾病管理与健康宣教.md` | ✅ `disease-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 163 | `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第四节 常用医学检查.md` | ✅ `medical-checks` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 164 | `药学综合知识与技能/第九章 心血管系统常见疾病.md` | ✅ `cardiovascular-diseases-y3` | ✅ module | ✅ pharmacy_service | ✅ service | ✅ | ✅ | 🔁×4 | 100% |
| 165 | `药学综合知识与技能/第九章 心血管系统常见疾病/第一节 高血压.md` | ✅ `hypertension-management` | ✅ illness | ✅ pharmacy_service | ✅ disease | ✅ | ✅ | 🔁×1 | 100% |
| 166 | `药学综合知识与技能/第九章 心血管系统常见疾病/第三节 冠状动脉粥样硬化性心脏病.md` | ✅ `coronary-heart-disease` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 167 | `药学综合知识与技能/第九章 心血管系统常见疾病/第二节 血脂异常.md` | ✅ `lipid-disorders-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 168 | `药学综合知识与技能/第九章 心血管系统常见疾病/第四节 心房颤动.md` | ✅ `atrial-fibrillation` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 169 | `药学综合知识与技能/第二章 处方审核与调剂.md` | ✅ `prescription-review-y3` | ✅ module | ✅ pharmacy_service | ✅ service | ✅ | ✅ | 🔁×2 | 100% |
| 170 | `药学综合知识与技能/第二章 处方审核与调剂/第一节 处方审核.md` | ✅ `prescription-review` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 171 | `药学综合知识与技能/第二章 处方审核与调剂/第二节 调剂操作.md` | ✅ `dispensing` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 172 | `药学综合知识与技能/第五章 急救、中毒解救及职业防护.md` | ✅ `chapter-emergency-poisoning` | ✅ module | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×3 | 100% |
| 173 | `药学综合知识与技能/第五章 急救、中毒解救及职业防护/第一节 急救的意义与原则.md` | ✅ `concept-ch5-s1` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 174 | `药学综合知识与技能/第五章 急救、中毒解救及职业防护/第三节 中毒解救.md` | ✅ `concept-ch5-s3` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 175 | `药学综合知识与技能/第五章 急救、中毒解救及职业防护/第二节 常见急症及处置.md` | ✅ `concept-ch5-s2` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 176 | `药学综合知识与技能/第八章 呼吸系统常见疾病.md` | ✅ `respiratory-diseases-y3` | ✅ module | ✅ pharmacy_service | ✅ service | ✅ | ✅ | 🔁×2 | 100% |
| 177 | `药学综合知识与技能/第八章 呼吸系统常见疾病/第一节 哮喘.md` | ✅ `asthma-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 178 | `药学综合知识与技能/第八章 呼吸系统常见疾病/第二节 慢性阻塞性肺疾病.md` | ✅ `copd-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 179 | `药学综合知识与技能/第六章 常见病症的健康管理.md` | ✅ `common-conditions-y3` | ✅ module | ✅ pharmacy_service | ✅ service | ✅ | ✅ | 🔁×7 | 100% |
| 180 | `药学综合知识与技能/第六章 常见病症的健康管理/第一节 发热与疼痛.md` | ✅ `fever-pain` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 181 | `药学综合知识与技能/第六章 常见病症的健康管理/第七节 其他病症.md` | ✅ `other-conditions` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 182 | `药学综合知识与技能/第六章 常见病症的健康管理/第三节 消化系统问题.md` | ✅ `gi-problems` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 183 | `药学综合知识与技能/第六章 常见病症的健康管理/第二节 呼吸系统问题.md` | ✅ `respiratory-problems` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 184 | `药学综合知识与技能/第六章 常见病症的健康管理/第五节 皮肤及黏膜系统问题.md` | ✅ `skin-mucosal` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 185 | `药学综合知识与技能/第六章 常见病症的健康管理/第六节 眼睛问题.md` | ✅ `eye-problems` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 186 | `药学综合知识与技能/第六章 常见病症的健康管理/第四节 泌尿生殖系统问题.md` | ✅ `urogenital-problems` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 187 | `药学综合知识与技能/第十一章 消化系统常见疾病.md` | ✅ `gi-diseases-y3` | ✅ module | ✅ pharmacy_service | ✅ service | ✅ | ✅ | 🔁×4 | 100% |
| 188 | `药学综合知识与技能/第十一章 消化系统常见疾病/第一节 胃食管反流病.md` | ✅ `gerd-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 189 | `药学综合知识与技能/第十一章 消化系统常见疾病/第三节 溃疡性结肠炎.md` | ✅ `ibd-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 190 | `药学综合知识与技能/第十一章 消化系统常见疾病/第二节 消化性溃疡.md` | ✅ `peptic-ulcer-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 191 | `药学综合知识与技能/第十一章 消化系统常见疾病/第四节 慢性病毒性肝炎.md` | ✅ `chronic-hepatitis-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 192 | `药学综合知识与技能/第十三章 免疫系统常见疾病.md` | ✅ `immune-diseases-y3` | ✅ module | ✅ pharmacy_service | ✅ service | ✅ | ✅ | 🔁×2 | 100% |
| 193 | `药学综合知识与技能/第十三章 免疫系统常见疾病/第一节 类风湿关节炎.md` | ✅ `ra-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 194 | `药学综合知识与技能/第十三章 免疫系统常见疾病/第二节 系统性红斑狼疮.md` | ✅ `sle-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 195 | `药学综合知识与技能/第十二章 内分泌系统常见疾病.md` | ✅ `endocrine-diseases-y3` | ✅ module | ✅ pharmacy_service | ✅ service | ✅ | ✅ | 🔁×5 | 100% |
| 196 | `药学综合知识与技能/第十二章 内分泌系统常见疾病/第一节 甲状腺功能亢进症.md` | ✅ `hyperthyroidism-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 197 | `药学综合知识与技能/第十二章 内分泌系统常见疾病/第三节 糖尿病.md` | ✅ `diabetes-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 198 | `药学综合知识与技能/第十二章 内分泌系统常见疾病/第二节 甲状腺功能减退症.md` | ✅ `hypothyroidism-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 199 | `药学综合知识与技能/第十二章 内分泌系统常见疾病/第五节 高尿酸血症与痛风.md` | ✅ `gout-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 200 | `药学综合知识与技能/第十二章 内分泌系统常见疾病/第四节 骨质疏松症.md` | ✅ `osteoporosis-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 201 | `药学综合知识与技能/第十五章 肿瘤.md` | ✅ `tumor-y3` | ✅ module | ✅ pharmacy_service | ✅ service | ✅ | ✅ | 🔁×2 | 100% |
| 202 | `药学综合知识与技能/第十五章 肿瘤/第一节 肿瘤的临床基础.md` | ✅ `tumor-clinical-basis` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 203 | `药学综合知识与技能/第十五章 肿瘤/第三节 肿瘤化疗管理.md` | ✅ `tumor-chemotherapy-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 204 | `药学综合知识与技能/第十五章 肿瘤/第二节 肿瘤的治疗与预防.md` | ✅ `tumor-treatment-prevention` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 205 | `药学综合知识与技能/第十五章 肿瘤/第五节 肿瘤支持治疗管理.md` | ✅ `tumor-supportive-care-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 206 | `药学综合知识与技能/第十五章 肿瘤/第四节 肿瘤靶向治疗管理.md` | ✅ `tumor-targeted-therapy-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 207 | `药学综合知识与技能/第十四章 泌尿系统常见疾病.md` | ✅ `urinary-diseases-y3` | ✅ module | ✅ pharmacy_service | ✅ service | ✅ | ✅ | 🔁×2 | 100% |
| 208 | `药学综合知识与技能/第十四章 泌尿系统常见疾病/第一节 良性前列腺增生症.md` | ✅ `bph-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 209 | `药学综合知识与技能/第十四章 泌尿系统常见疾病/第二节 慢性肾脏病.md` | ✅ `ckd-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 210 | `药学综合知识与技能/第十章 神经精神系统常见疾病.md` | ✅ `cns-diseases-y3` | ✅ module | ✅ pharmacy_service | ✅ service | ✅ | ✅ | 🔁×6 | 100% |
| 211 | `药学综合知识与技能/第十章 神经精神系统常见疾病/第一节 焦虑抑郁.md` | ✅ `anxiety-depression` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 212 | `药学综合知识与技能/第十章 神经精神系统常见疾病/第三节 脑卒中.md` | ✅ `stroke-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 213 | `药学综合知识与技能/第十章 神经精神系统常见疾病/第二节 失眠症.md` | ✅ `insomnia-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 214 | `药学综合知识与技能/第十章 神经精神系统常见疾病/第五节 癫痫.md` | ✅ `epilepsy-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 215 | `药学综合知识与技能/第十章 神经精神系统常见疾病/第六节 痴呆.md` | ✅ `dementia-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 216 | `药学综合知识与技能/第十章 神经精神系统常见疾病/第四节 帕金森病.md` | ✅ `parkinson-management` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 217 | `药学综合知识与技能/第四章 用药安全.md` | ✅ `drug-safety-y3` | ✅ module | ✅ pharmacy_service | ✅ service | ✅ | ✅ | 🔁×3 | 100% |
| 218 | `药学综合知识与技能/第四章 用药安全/第一节 药物警戒.md` | ✅ `pharmacovigilance` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 219 | `药学综合知识与技能/第四章 用药安全/第三节 药源性疾病.md` | ✅ `drug-induced-diseases` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 220 | `药学综合知识与技能/第四章 用药安全/第二节 药品不良反应.md` | ✅ `adverse-drug-reactions` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |
| 221 | `药学综合知识与技能/第四章 用药安全/第五节 特殊人群用药.md` | ✅ `special-population-medications` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ⚠️ | -无 | 86% |
| 222 | `药学综合知识与技能/第四章 用药安全/第六节 免疫抑制患者用药.md` | ✅ `immunosuppressive-patients` | ✅ concept | ✅ pharmacy_service | ✅ management | ✅ | ⚠️ | -无 | 86% |
| 223 | `药学综合知识与技能/第四章 用药安全/第四节 用药错误.md` | ✅ `medication-errors` | ✅ section | ✅ pharmacy_service | ✅ management | ✅ | ✅ | 🔁×1 | 100% |

---

## 待修正问题汇总

### 基础字段问题

共 9 个：

#### 药学专业知识一
- **`药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系/第一节 药物与药物制剂.md`**：⚠️ edges_out 为空
- **`药学专业知识一/第五篇 生命药学.md`**：⚠️ field/category 缺失
- **`药学专业知识一/第五篇 生命药学/第二章 生命药学.md`**：⚠️ field/category 缺失
- **`药学专业知识一/第五篇 生命药学/第二章 生命药学/第一节 人体生物分子的结构与功能.md`**：⚠️ field/category 缺失
- **`药学专业知识一/第五篇 生命药学/第二章 生命药学/第三节 感染与免疫.md`**：⚠️ field/category 缺失
- **`药学专业知识一/第五篇 生命药学/第二章 生命药学/第二节 人体代谢.md`**：⚠️ field/category 缺失
- **`药学专业知识一/第五篇 生命药学/第二章 生命药学/第四节 病理生理.md`**：⚠️ field/category 缺失

#### 药学综合知识与技能
- **`药学综合知识与技能/第四章 用药安全/第五节 特殊人群用药.md`**：⚠️ edges_out 为空
- **`药学综合知识与技能/第四章 用药安全/第六节 免疫抑制患者用药.md`**：⚠️ edges_out 为空

### 🔁 ADR-0001 关系方向问题

> 详见 `docs/ADR-0001-层级关系统一使用isa方向.md`。本文按目录分组列出违规边，可直接对照修改。

#### （a）has 边指向 location 子级（共 375 处）

##### 药学专业知识一.md
- **`药学专业知识一.md`** → `pharmaceutics-y1`：has 边指向 location 子级节点（part）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharm-knowledge-1, type: isa`。
- **`药学专业知识一.md`** → `pharmacokinetics-y1`：has 边指向 location 子级节点（part）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharm-knowledge-1, type: isa`。
- **`药学专业知识一.md`** → `biopharmaceutics-y1`：has 边指向 location 子级节点（part）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharm-knowledge-1, type: isa`。
- **`药学专业知识一.md`** → `medicinal-chemistry-y1`：has 边指向 location 子级节点（part）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharm-knowledge-1, type: isa`。
- **`药学专业知识一.md`** → `pharmacology-and-toxicology`：has 边指向 location 子级节点（part）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharm-knowledge-1, type: isa`。

##### 药学专业知识一
- **`药学专业知识一/第一篇 药剂学.md`** → `drug-preparations-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmaceutics-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学.md`** → `drug-quality-system-y1`：has 边指向 location 子级节点（chapter）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmaceutics-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学.md`** → `oral-drugs-y1`：has 边指向 location 子级节点（chapter）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmaceutics-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学.md`** → `injection-preparations-y1`：has 边指向 location 子级节点（chapter）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmaceutics-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学.md`** → `topical-mucosal-drugs-y1`：has 边指向 location 子级节点（chapter）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmaceutics-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系.md`** → `drug-quality-and-quality-systems`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-quality-system-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系/第二节 药品质量与质量体系.md`** → `drug-quality-system-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用.md`** → `oral-solid-dosage-forms-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: oral-drugs-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用.md`** → `oral-liquid-dosage-forms-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: oral-drugs-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂.md`** → `first-pass-effect`：has 边指向 location 子级节点（item）。修复方法：删除此 has 边，改为在子节点添加 `- target: oral-solid-dosage-forms-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂.md`** → `metoprolol`：has 边指向 location 子级节点（item）。修复方法：删除此 has 边，改为在子节点添加 `- target: oral-solid-dosage-forms-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/首过效应.md`** → `oral-solid-dosage-forms-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用.md`** → `topical-drug-delivery-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: topical-mucosal-drugs-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用.md`** → `mucosal-drug-delivery-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: topical-mucosal-drugs-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用.md`** → `injection-quality-control-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: injection-preparations-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用.md`** → `common-injection-preparations-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: injection-preparations-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用.md`** → `particulate-injection-preparations-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: injection-preparations-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用.md`** → `biotech-drug-injection-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: injection-preparations-y1, type: isa`。
- **`药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第一节 注射剂的质量控制.md`** → `injection-preparations-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第三节 微粒制剂.md`** → `injection-preparations-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第二节 普通注射剂.md`** → `injection-preparations-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第四节 生物技术药物注射剂.md`** → `injection-preparations-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第三篇 药物化学.md`** → `structure-activity-cns-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: medicinal-chemistry-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学.md`** → `structure-activity-analgesic-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: medicinal-chemistry-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学.md`** → `structure-activity-respiratory-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: medicinal-chemistry-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学.md`** → `structure-activity-gi-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: medicinal-chemistry-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学.md`** → `structure-activity-cardiovascular-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: medicinal-chemistry-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学.md`** → `structure-activity-endocrine-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: medicinal-chemistry-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学.md`** → `structure-activity-urinary-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: medicinal-chemistry-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学.md`** → `structure-activity-antibiotic-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: medicinal-chemistry-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学.md`** → `structure-activity-antitumor-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: medicinal-chemistry-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md`** → `structure-activity-cns-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-structure-activity-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md`** → `structure-activity-analgesic-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-structure-activity-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md`** → `structure-activity-respiratory-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-structure-activity-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md`** → `structure-activity-gi-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-structure-activity-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md`** → `structure-activity-cardiovascular-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-structure-activity-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md`** → `structure-activity-endocrine-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-structure-activity-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md`** → `structure-activity-urinary-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-structure-activity-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md`** → `structure-activity-antibiotic-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-structure-activity-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md`** → `structure-activity-antitumor-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-structure-activity-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md`** → `drug-metabolism-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-structure-activity-y1, type: isa`。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第一节 药物结构与药物活性.md`** → `drug-structure-activity-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第七节 循环系统疾病药物.md`** → `medicinal-chemistry-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第三节 中枢神经系统药物.md`** → `medicinal-chemistry-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第九节 泌尿系统疾病药物.md`** → `medicinal-chemistry-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第二节 药物代谢.md`** → `drug-structure-activity-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第五节 呼吸系统疾病药物.md`** → `medicinal-chemistry-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第八节 内分泌系统疾病药物.md`** → `medicinal-chemistry-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第六节 消化系统疾病药物.md`** → `medicinal-chemistry-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第十一节 抗肿瘤药物.md`** → `medicinal-chemistry-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第十节 抗感染药物.md`** → `medicinal-chemistry-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第四节 解热镇痛及非甾体抗炎药物.md`** → `medicinal-chemistry-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第二篇 药理与毒理学.md`** → `pharmacodynamics-y1`：has 边指向 location 子级节点（chapter）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacology-and-toxicology, type: isa`。
- **`药学专业知识一/第二篇 药理与毒理学.md`** → `pharmacotoxicology-y1`：has 边指向 location 子级节点（chapter）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacology-and-toxicology, type: isa`。
- **`药学专业知识一/第二篇 药理与毒理学.md`** → `pharmacogenetics-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacology-and-toxicology, type: isa`。
- **`药学专业知识一/第二篇 药理与毒理学.md`** → `chronopharmacology-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacology-and-toxicology, type: isa`。
- **`药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全.md`** → `drug-toxicity-side-effects-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacotoxicology-y1, type: isa`。
- **`药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全.md`** → `drug-application-safety-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacotoxicology-y1, type: isa`。
- **`药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全/第一节 药物毒性与毒副作用.md`** → `pharmacotoxicology-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全/第二节 药物应用的毒副作用与用药安全.md`** → `pharmacotoxicology-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用.md`** → `drug-duality-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacodynamics-y1, type: isa`。
- **`药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用.md`** → `dose-time-effect`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacodynamics-y1, type: isa`。
- **`药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用.md`** → `mechanism-target-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacodynamics-y1, type: isa`。
- **`药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用.md`** → `drug-interaction-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacodynamics-y1, type: isa`。
- **`药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第一节 药物作用的两重性.md`** → `pharmacodynamics-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第三节 药物的作用机制与靶点.md`** → `pharmacodynamics-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第二节 药物作用的量效和时效规律与评价.md`** → `pharmacodynamics-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第五节 遗传药理学与临床合理用药.md`** → `pharmacodynamics-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第六节 时辰药理学与临床合理用药.md`** → `pharmacodynamics-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第四节 药物相互作用.md`** → `pharmacodynamics-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第五篇 生命药学.md`** → `biopharmaceutics-chapter-y1`：has 边指向 location 子级节点（chapter）。修复方法：删除此 has 边，改为在子节点添加 `- target: biopharmaceutics-y1, type: isa`。
- **`药学专业知识一/第五篇 生命药学.md`** → `biomolecule-structure-function-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: biopharmaceutics-y1, type: isa`。
- **`药学专业知识一/第五篇 生命药学.md`** → `human-metabolism-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: biopharmaceutics-y1, type: isa`。
- **`药学专业知识一/第五篇 生命药学.md`** → `infection-immunity-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: biopharmaceutics-y1, type: isa`。
- **`药学专业知识一/第五篇 生命药学.md`** → `pathophysiology-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: biopharmaceutics-y1, type: isa`。
- **`药学专业知识一/第五篇 生命药学/第二章 生命药学.md`** → `biopharmaceutics-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第五篇 生命药学/第二章 生命药学.md`** → `biomolecule-structure-function-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: biopharmaceutics-chapter-y1, type: isa`。
- **`药学专业知识一/第五篇 生命药学/第二章 生命药学.md`** → `human-metabolism-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: biopharmaceutics-chapter-y1, type: isa`。
- **`药学专业知识一/第五篇 生命药学/第二章 生命药学.md`** → `infection-immunity-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: biopharmaceutics-chapter-y1, type: isa`。
- **`药学专业知识一/第五篇 生命药学/第二章 生命药学.md`** → `pathophysiology-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: biopharmaceutics-chapter-y1, type: isa`。
- **`药学专业知识一/第五篇 生命药学/第二章 生命药学/第一节 人体生物分子的结构与功能.md`** → `biopharmaceutics-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第五篇 生命药学/第二章 生命药学/第三节 感染与免疫.md`** → `biopharmaceutics-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第五篇 生命药学/第二章 生命药学/第二节 人体代谢.md`** → `biopharmaceutics-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第五篇 生命药学/第二章 生命药学/第四节 病理生理.md`** → `biopharmaceutics-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第四篇 药动学.md`** → `drug-disposition-processes`：has 边指向 location 子级节点（chapter）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacokinetics-y1, type: isa`。
- **`药学专业知识一/第四篇 药动学.md`** → `drug-absorption-process-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacokinetics-y1, type: isa`。
- **`药学专业知识一/第四篇 药动学.md`** → `drug-distribution-metabolism-excretion-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacokinetics-y1, type: isa`。
- **`药学专业知识一/第四篇 药动学.md`** → `pk-clinical-application-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacokinetics-y1, type: isa`。
- **`药学专业知识一/第四篇 药动学/第三章 药物的体内过程.md`** → `drug-absorption-process-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-disposition-processes, type: isa`。
- **`药学专业知识一/第四篇 药动学/第三章 药物的体内过程.md`** → `drug-distribution-metabolism-excretion-y1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-disposition-processes, type: isa`。
- **`药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第一节 药物与机体的相互作用.md`** → `pharmacokinetics-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第三节 药物的分布、代谢与排泄.md`** → `pharmacokinetics-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第四节 药物动力学与临床应用.md`** → `pharmacokinetics-y1`：has 边指向 location 上级节点。应为反向 isa 或 relates。

##### 药学专业知识二
- **`药学专业知识二/第一章 精神与中枢神经系统用药.md`** → `sedative-hypnotics-muscle-relaxants`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cns-drugs-y2, type: isa`。
- **`药学专业知识二/第一章 精神与中枢神经系统用药.md`** → `antiepileptic-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cns-drugs-y2, type: isa`。
- **`药学专业知识二/第一章 精神与中枢神经系统用药.md`** → `antidepressant-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cns-drugs-y2, type: isa`。
- **`药学专业知识二/第一章 精神与中枢神经系统用药.md`** → `anti-dementia-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cns-drugs-y2, type: isa`。
- **`药学专业知识二/第一章 精神与中枢神经系统用药.md`** → `central-analgesics`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cns-drugs-y2, type: isa`。
- **`药学专业知识二/第一章 精神与中枢神经系统用药.md`** → `antiparkinson-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cns-drugs-y2, type: isa`。
- **`药学专业知识二/第一章 精神与中枢神经系统用药.md`** → `antipsychotic-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cns-drugs-y2, type: isa`。
- **`药学专业知识二/第一章 精神与中枢神经系统用药/第一节 镇静催眠药、中枢肌松药.md`** → `cns-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第一章 精神与中枢神经系统用药/第七节 抗精神病药.md`** → `cns-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第一章 精神与中枢神经系统用药/第三节 抗抑郁药.md`** → `cns-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第一章 精神与中枢神经系统用药/第二节 抗癫痫发作药物.md`** → `cns-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第一章 精神与中枢神经系统用药/第五节 中枢镇痛药.md`** → `cns-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第一章 精神与中枢神经系统用药/第六节 抗帕金森病药.md`** → `cns-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第一章 精神与中枢神经系统用药/第四节 抗记忆障碍及改善神经功能药.md`** → `cns-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第七章 泌尿系统用药.md`** → `section-diuretics`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: urinary-drugs-y2, type: isa`。
- **`药学专业知识二/第七章 泌尿系统用药.md`** → `erectile-dysfunction-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: urinary-drugs-y2, type: isa`。
- **`药学专业知识二/第七章 泌尿系统用药.md`** → `bph-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: urinary-drugs-y2, type: isa`。
- **`药学专业知识二/第七章 泌尿系统用药.md`** → `oab-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: urinary-drugs-y2, type: isa`。
- **`药学专业知识二/第七章 泌尿系统用药/第一节 利尿药.md`** → `urinary-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第七章 泌尿系统用药/第三节 治疗良性前列腺增生用药.md`** → `urinary-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第七章 泌尿系统用药/第二节 治疗男性勃起功能障碍药.md`** → `urinary-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第七章 泌尿系统用药/第四节 治疗膀胱过度活动症用药.md`** → `urinary-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第三章 呼吸系统用药.md`** → `antitussives`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: respiratory-drugs-y2, type: isa`。
- **`药学专业知识二/第三章 呼吸系统用药.md`** → `expectorants`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: respiratory-drugs-y2, type: isa`。
- **`药学专业知识二/第三章 呼吸系统用药.md`** → `anti-asthmatic-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: respiratory-drugs-y2, type: isa`。
- **`药学专业知识二/第三章 呼吸系统用药.md`** → `ipf-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: respiratory-drugs-y2, type: isa`。
- **`药学专业知识二/第三章 呼吸系统用药/第一节 镇咳药.md`** → `respiratory-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第三章 呼吸系统用药/第三节 平喘药.md`** → `respiratory-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第三章 呼吸系统用药/第二节 祛痰药.md`** → `respiratory-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第三章 呼吸系统用药/第四节 特发性肺纤维化的治疗药物.md`** → `respiratory-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物.md`** → `antibacterial-general`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `penicillins`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `cephalosporins`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `beta-lactamase-carbapenems`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `aminoglycosides-tetracyclines`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `macrolides`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `quinolones-sulfonamides`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `nitrofurans-nitroimidazoles`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `glycopeptides`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `antimycobacterial-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `antifungals`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `anti-herpesvirus`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `anti-influenza`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `anti-covid`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `anti-hepatitis`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `anti-hiv`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物.md`** → `antiprotozoal-antihelminthic`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antiinfective-drugs-y2, type: isa`。
- **`药学专业知识二/第九章 抗感染药物/第一节 抗菌药物总论.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第七节 喹诺酮类与磺胺类抗菌药物.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第三节 头孢菌素类抗菌药物.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第九节 糖肽类与其他抗菌药物.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第二节 青霉素类抗菌药物.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第五节 氨基糖苷类与四环素类抗菌药物.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第八节 硝基呋喃类与硝基咪唑类抗菌药物.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第六节 大环内酯类、林可霉素类与酰胺醇类抗菌药物.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第十一节 抗真菌药.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第十七节 抗原虫药和抗蠕虫药.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第十三节 抗流感病毒药.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第十二节 抗（人）疱疹病毒药物.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第十五节 抗肝炎病毒药物.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第十六节 抗艾滋病病毒药物.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第十四节 抗新型冠状病毒药.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第十节 抗结核分枝杆菌药.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第九章 抗感染药物/第四节 β-内酰胺酶抑制剂、碳青霉烯类与其他β-内酰胺类抗菌药物.md`** → `antiinfective-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药.md`** → `antipyretic-analgesic-antiinflammatory`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: analgesic-antiinflammatory-y2, type: isa`。
- **`药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药.md`** → `anti-inflammatory-antirheumatic-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: analgesic-antiinflammatory-y2, type: isa`。
- **`药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药.md`** → `antigout-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: analgesic-antiinflammatory-y2, type: isa`。
- **`药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第一节 解热、镇痛、抗炎药.md`** → `analgesic-antiinflammatory-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第三节 抗痛风药.md`** → `analgesic-antiinflammatory-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第二节 抗风湿药.md`** → `analgesic-antiinflammatory-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第五章 心血管系统用药.md`** → `section-antiarrhythmics`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cardiovascular-drugs-y2, type: isa`。
- **`药学专业知识二/第五章 心血管系统用药.md`** → `section-antihypertensives`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cardiovascular-drugs-y2, type: isa`。
- **`药学专业知识二/第五章 心血管系统用药.md`** → `lipid-regulators`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cardiovascular-drugs-y2, type: isa`。
- **`药学专业知识二/第五章 心血管系统用药.md`** → `section-antianginals`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cardiovascular-drugs-y2, type: isa`。
- **`药学专业知识二/第五章 心血管系统用药.md`** → `section-antihypertensive-heart-failure`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cardiovascular-drugs-y2, type: isa`。
- **`药学专业知识二/第五章 心血管系统用药/第一节 抗心律失常药.md`** → `cardiovascular-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第五章 心血管系统用药/第三节 调节血脂药.md`** → `cardiovascular-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第五章 心血管系统用药/第二节 抗高血压药.md`** → `cardiovascular-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第五章 心血管系统用药/第五节 抗心力衰竭药.md`** → `cardiovascular-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第五章 心血管系统用药/第四节 抗心绞痛药.md`** → `cardiovascular-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第八章 内分泌系统用药.md`** → `hypothalamic-pituitary-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: endocrine-drugs-y2, type: isa`。
- **`药学专业知识二/第八章 内分泌系统用药.md`** → `glucocorticoids`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: endocrine-drugs-y2, type: isa`。
- **`药学专业知识二/第八章 内分泌系统用药.md`** → `thyroid-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: endocrine-drugs-y2, type: isa`。
- **`药学专业知识二/第八章 内分泌系统用药.md`** → `antidiabetic-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: endocrine-drugs-y2, type: isa`。
- **`药学专业知识二/第八章 内分泌系统用药.md`** → `bone-metabolism-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: endocrine-drugs-y2, type: isa`。
- **`药学专业知识二/第八章 内分泌系统用药.md`** → `sex-hormones`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: endocrine-drugs-y2, type: isa`。
- **`药学专业知识二/第八章 内分泌系统用药.md`** → `weight-management-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: endocrine-drugs-y2, type: isa`。
- **`药学专业知识二/第八章 内分泌系统用药/第一节 下丘脑-垂体激素及相关药物.md`** → `endocrine-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第八章 内分泌系统用药/第七节 性激素类.md`** → `endocrine-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第八章 内分泌系统用药/第三节 甲状腺激素类药物与抗甲状腺药物.md`** → `endocrine-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第八章 内分泌系统用药/第二节 肾上腺糖皮质激素类药物.md`** → `endocrine-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第八章 内分泌系统用药/第五节 调节骨代谢药物.md`** → `endocrine-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第八章 内分泌系统用药/第六节 减重药.md`** → `endocrine-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第八章 内分泌系统用药/第四节 胰岛素与其他影响血糖的药物.md`** → `endocrine-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第六章 血液系统用药.md`** → `antithrombotic-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: hematologic-drugs-y2, type: isa`。
- **`药学专业知识二/第六章 血液系统用药.md`** → `hemostatic-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: hematologic-drugs-y2, type: isa`。
- **`药学专业知识二/第六章 血液系统用药.md`** → `antianemics`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: hematologic-drugs-y2, type: isa`。
- **`药学专业知识二/第六章 血液系统用药.md`** → `leukocyte-stimulants`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: hematologic-drugs-y2, type: isa`。
- **`药学专业知识二/第六章 血液系统用药.md`** → `bone-marrow-protective-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: hematologic-drugs-y2, type: isa`。
- **`药学专业知识二/第六章 血液系统用药.md`** → `antithrombotic-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: hematologic-drugs-y2, type: isa`。
- **`药学专业知识二/第六章 血液系统用药.md`** → `hemostatic-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: hematologic-drugs-y2, type: isa`。
- **`药学专业知识二/第六章 血液系统用药.md`** → `antianemics`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: hematologic-drugs-y2, type: isa`。
- **`药学专业知识二/第六章 血液系统用药.md`** → `leukocyte-stimulants`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: hematologic-drugs-y2, type: isa`。
- **`药学专业知识二/第六章 血液系统用药.md`** → `bone-marrow-protective-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: hematologic-drugs-y2, type: isa`。
- **`药学专业知识二/第六章 血液系统用药/第一节 抗血栓药.md`** → `hematologic-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第六章 血液系统用药/第三节 抗贫血药.md`** → `hematologic-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第六章 血液系统用药/第二节 抗出血药.md`** → `hematologic-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第六章 血液系统用药/第五节 骨髓保护药.md`** → `hematologic-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第六章 血液系统用药/第四节 升白细胞药.md`** → `hematologic-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药.md`** → `fluids-electrolytes`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: nutrition-drugs-y2, type: isa`。
- **`药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药.md`** → `vitamins-minerals`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: nutrition-drugs-y2, type: isa`。
- **`药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药.md`** → `ent-nutrition`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: nutrition-drugs-y2, type: isa`。
- **`药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药.md`** → `pn-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: nutrition-drugs-y2, type: isa`。
- **`药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第一节 糖类、盐类、酸碱平衡调节药.md`** → `nutrition-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第三节 肠内营养药.md`** → `nutrition-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第二节 微量元素与维生素.md`** → `nutrition-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第四节 肠外营养药.md`** → `nutrition-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药.md`** → `parasitic-skin-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: dermatology-drugs-y2, type: isa`。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药.md`** → `topical-antifungal`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: dermatology-drugs-y2, type: isa`。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药.md`** → `acne-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: dermatology-drugs-y2, type: isa`。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药.md`** → `topical-corticosteroids`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: dermatology-drugs-y2, type: isa`。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药.md`** → `vitiligo-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: dermatology-drugs-y2, type: isa`。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药.md`** → `psoriasis-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: dermatology-drugs-y2, type: isa`。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药.md`** → `gynecological-dermatology`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: dermatology-drugs-y2, type: isa`。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药.md`** → `disinfectants`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: dermatology-drugs-y2, type: isa`。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药.md`** → `antihistamines`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: dermatology-drugs-y2, type: isa`。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药/第一节 体外杀寄生虫与皮肤感染治疗药.md`** → `dermatology-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药/第七节 妇科外用药.md`** → `dermatology-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药/第三节 痤疮治疗药.md`** → `dermatology-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药/第九节 抗过敏药.md`** → `dermatology-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药/第二节 局部用抗真菌药.md`** → `dermatology-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药/第五节 治疗白癜风药.md`** → `dermatology-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药/第八节 消毒防腐药.md`** → `dermatology-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药/第六节 治疗银屑病药.md`** → `dermatology-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十三章 皮肤用药及抗过敏用药/第四节 外用糖皮质激素.md`** → `dermatology-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药.md`** → `ophthalmic-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: ent-drugs-y2, type: isa`。
- **`药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药.md`** → `ent-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: ent-drugs-y2, type: isa`。
- **`药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药.md`** → `oral-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: ent-drugs-y2, type: isa`。
- **`药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第一节 眼科用药.md`** → `ent-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第三节 口腔科用药.md`** → `ent-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第二节 耳鼻咽喉科用药.md`** → `ent-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十章 抗肿瘤药.md`** → `direct-dna-acting-antitumor`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antitumor-drugs-y2, type: isa`。
- **`药学专业知识二/第十章 抗肿瘤药.md`** → `antimetabolite-antitumor`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antitumor-drugs-y2, type: isa`。
- **`药学专业知识二/第十章 抗肿瘤药.md`** → `rna-synthesis-antitumor`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antitumor-drugs-y2, type: isa`。
- **`药学专业知识二/第十章 抗肿瘤药.md`** → `mitotic-inhibitor-antitumor`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antitumor-drugs-y2, type: isa`。
- **`药学专业知识二/第十章 抗肿瘤药.md`** → `hormonal-antitumor`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antitumor-drugs-y2, type: isa`。
- **`药学专业知识二/第十章 抗肿瘤药.md`** → `biological-targeted-antitumor`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antitumor-drugs-y2, type: isa`。
- **`药学专业知识二/第十章 抗肿瘤药.md`** → `other-antitumor`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antitumor-drugs-y2, type: isa`。
- **`药学专业知识二/第十章 抗肿瘤药.md`** → `direct-dna-acting-antitumor`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antitumor-drugs-y2, type: isa`。
- **`药学专业知识二/第十章 抗肿瘤药.md`** → `antimetabolite-antitumor`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antitumor-drugs-y2, type: isa`。
- **`药学专业知识二/第十章 抗肿瘤药.md`** → `rna-synthesis-antitumor`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antitumor-drugs-y2, type: isa`。
- **`药学专业知识二/第十章 抗肿瘤药.md`** → `mitotic-inhibitor-antitumor`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antitumor-drugs-y2, type: isa`。
- **`药学专业知识二/第十章 抗肿瘤药.md`** → `hormonal-antitumor`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antitumor-drugs-y2, type: isa`。
- **`药学专业知识二/第十章 抗肿瘤药.md`** → `biological-targeted-antitumor`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antitumor-drugs-y2, type: isa`。
- **`药学专业知识二/第十章 抗肿瘤药.md`** → `other-antitumor`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: antitumor-drugs-y2, type: isa`。
- **`药学专业知识二/第十章 抗肿瘤药/第一节 直接影响DNA结构和功能的药物.md`** → `antitumor-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十章 抗肿瘤药/第七节 其他抗肿瘤药物.md`** → `antitumor-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十章 抗肿瘤药/第三节 干扰转录过程和阻止RNA合成的药物（作用于核酸转录药物）.md`** → `antitumor-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十章 抗肿瘤药/第二节 干扰核酸生物合成的药物（抗代谢药）.md`** → `antitumor-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十章 抗肿瘤药/第五节 调节体内激素平衡的药物.md`** → `antitumor-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十章 抗肿瘤药/第六节 生物靶向治疗药物.md`** → `antitumor-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第十章 抗肿瘤药/第四节 干扰有丝分裂的药物.md`** → `antitumor-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第四章 消化系统用药.md`** → `antiacid-mucosal-protectants`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: gi-drugs-y2, type: isa`。
- **`药学专业知识二/第四章 消化系统用药.md`** → `antispasmodic-prokinetic-functional-gi`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: gi-drugs-y2, type: isa`。
- **`药学专业知识二/第四章 消化系统用药.md`** → `antiemetics`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: gi-drugs-y2, type: isa`。
- **`药学专业知识二/第四章 消化系统用药.md`** → `hepatobiliary-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: gi-drugs-y2, type: isa`。
- **`药学专业知识二/第四章 消化系统用药.md`** → `laxatives-constipation-drugs`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: gi-drugs-y2, type: isa`。
- **`药学专业知识二/第四章 消化系统用药.md`** → `antidiarrheal-intestinal-antiinfective-antiinflammatory`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: gi-drugs-y2, type: isa`。
- **`药学专业知识二/第四章 消化系统用药.md`** → `digestive-enzymes`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: gi-drugs-y2, type: isa`。
- **`药学专业知识二/第四章 消化系统用药/第一节 抑酸剂、抗酸药与胃黏膜保护药.md`** → `gi-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第四章 消化系统用药/第七节 助消化药.md`** → `gi-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第四章 消化系统用药/第三节 止吐药.md`** → `gi-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第四章 消化系统用药/第二节 解痉药、胃肠动力药与功能性胃肠病治疗药.md`** → `gi-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第四章 消化系统用药/第五节 泻药与便秘治疗药.md`** → `gi-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第四章 消化系统用药/第六节 止泻药、肠道抗感染药、肠道抗炎药.md`** → `gi-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学专业知识二/第四章 消化系统用药/第四节 肝胆疾病用药.md`** → `gi-drugs-y2`：has 边指向 location 上级节点。应为反向 isa 或 relates。

##### 药学综合知识与技能.md
- **`药学综合知识与技能.md`** → `chronic-disease-management`：has 边指向 location 子级节点（chapter）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharm-knowledge-3, type: isa`。

##### 药学综合知识与技能
- **`药学综合知识与技能/第一章 药学服务与药品管理.md`** → `pharmacy-services-pharmacist`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacy-services-drug-management, type: isa`。
- **`药学综合知识与技能/第一章 药学服务与药品管理.md`** → `drug-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: pharmacy-services-drug-management, type: isa`。
- **`药学综合知识与技能/第一章 药学服务与药品管理/第一节 药学服务与执业药师.md`** → `pharmacy-services-drug-management`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第一章 药学服务与药品管理/第二节 药品管理.md`** → `pharmacy-services-drug-management`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第三章 用药咨询与药物治疗管理.md`** → `drug-information`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-consultation-y3, type: isa`。
- **`药学综合知识与技能/第三章 用药咨询与药物治疗管理.md`** → `disease-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-consultation-y3, type: isa`。
- **`药学综合知识与技能/第三章 用药咨询与药物治疗管理.md`** → `mtm`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-consultation-y3, type: isa`。
- **`药学综合知识与技能/第三章 用药咨询与药物治疗管理.md`** → `medical-checks`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-consultation-y3, type: isa`。
- **`药学综合知识与技能/第三章 用药咨询与药物治疗管理/第一节 药学信息咨询服务.md`** → `drug-consultation-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第三章 用药咨询与药物治疗管理/第三节 药物治疗管理.md`** → `drug-consultation-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第三章 用药咨询与药物治疗管理/第二节 疾病管理与健康宣教.md`** → `drug-consultation-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第三章 用药咨询与药物治疗管理/第四节 常用医学检查.md`** → `drug-consultation-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第九章 心血管系统常见疾病.md`** → `hypertension-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cardiovascular-diseases-y3, type: isa`。
- **`药学综合知识与技能/第九章 心血管系统常见疾病.md`** → `lipid-disorders-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cardiovascular-diseases-y3, type: isa`。
- **`药学综合知识与技能/第九章 心血管系统常见疾病.md`** → `coronary-heart-disease`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cardiovascular-diseases-y3, type: isa`。
- **`药学综合知识与技能/第九章 心血管系统常见疾病.md`** → `atrial-fibrillation`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cardiovascular-diseases-y3, type: isa`。
- **`药学综合知识与技能/第九章 心血管系统常见疾病/第一节 高血压.md`** → `cardiovascular-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第九章 心血管系统常见疾病/第三节 冠状动脉粥样硬化性心脏病.md`** → `cardiovascular-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第九章 心血管系统常见疾病/第二节 血脂异常.md`** → `cardiovascular-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第九章 心血管系统常见疾病/第四节 心房颤动.md`** → `cardiovascular-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第二章 处方审核与调剂.md`** → `prescription-review`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: prescription-review-y3, type: isa`。
- **`药学综合知识与技能/第二章 处方审核与调剂.md`** → `dispensing`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: prescription-review-y3, type: isa`。
- **`药学综合知识与技能/第二章 处方审核与调剂/第一节 处方审核.md`** → `prescription-review-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第二章 处方审核与调剂/第二节 调剂操作.md`** → `prescription-review-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第五章 急救、中毒解救及职业防护.md`** → `concept-ch5-s1`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: chapter-emergency-poisoning, type: isa`。
- **`药学综合知识与技能/第五章 急救、中毒解救及职业防护.md`** → `concept-ch5-s2`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: chapter-emergency-poisoning, type: isa`。
- **`药学综合知识与技能/第五章 急救、中毒解救及职业防护.md`** → `concept-ch5-s3`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: chapter-emergency-poisoning, type: isa`。
- **`药学综合知识与技能/第五章 急救、中毒解救及职业防护/第一节 急救的意义与原则.md`** → `chapter-emergency-poisoning`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第五章 急救、中毒解救及职业防护/第三节 中毒解救.md`** → `chapter-emergency-poisoning`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第五章 急救、中毒解救及职业防护/第二节 常见急症及处置.md`** → `chapter-emergency-poisoning`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第八章 呼吸系统常见疾病.md`** → `asthma-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: respiratory-diseases-y3, type: isa`。
- **`药学综合知识与技能/第八章 呼吸系统常见疾病.md`** → `copd-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: respiratory-diseases-y3, type: isa`。
- **`药学综合知识与技能/第八章 呼吸系统常见疾病/第一节 哮喘.md`** → `respiratory-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第八章 呼吸系统常见疾病/第二节 慢性阻塞性肺疾病.md`** → `respiratory-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第六章 常见病症的健康管理.md`** → `fever-pain`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: common-conditions-y3, type: isa`。
- **`药学综合知识与技能/第六章 常见病症的健康管理.md`** → `respiratory-problems`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: common-conditions-y3, type: isa`。
- **`药学综合知识与技能/第六章 常见病症的健康管理.md`** → `gi-problems`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: common-conditions-y3, type: isa`。
- **`药学综合知识与技能/第六章 常见病症的健康管理.md`** → `skin-mucosal`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: common-conditions-y3, type: isa`。
- **`药学综合知识与技能/第六章 常见病症的健康管理.md`** → `eye-problems`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: common-conditions-y3, type: isa`。
- **`药学综合知识与技能/第六章 常见病症的健康管理.md`** → `urogenital-problems`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: common-conditions-y3, type: isa`。
- **`药学综合知识与技能/第六章 常见病症的健康管理.md`** → `other-conditions`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: common-conditions-y3, type: isa`。
- **`药学综合知识与技能/第六章 常见病症的健康管理/第一节 发热与疼痛.md`** → `common-conditions-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第六章 常见病症的健康管理/第七节 其他病症.md`** → `common-conditions-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第六章 常见病症的健康管理/第三节 消化系统问题.md`** → `common-conditions-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第六章 常见病症的健康管理/第二节 呼吸系统问题.md`** → `common-conditions-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第六章 常见病症的健康管理/第五节 皮肤及黏膜系统问题.md`** → `common-conditions-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第六章 常见病症的健康管理/第六节 眼睛问题.md`** → `common-conditions-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第六章 常见病症的健康管理/第四节 泌尿生殖系统问题.md`** → `common-conditions-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十一章 消化系统常见疾病.md`** → `gerd-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: gi-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十一章 消化系统常见疾病.md`** → `peptic-ulcer-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: gi-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十一章 消化系统常见疾病.md`** → `ibd-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: gi-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十一章 消化系统常见疾病.md`** → `chronic-hepatitis-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: gi-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十一章 消化系统常见疾病/第一节 胃食管反流病.md`** → `gi-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十一章 消化系统常见疾病/第三节 溃疡性结肠炎.md`** → `gi-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十一章 消化系统常见疾病/第二节 消化性溃疡.md`** → `gi-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十一章 消化系统常见疾病/第四节 慢性病毒性肝炎.md`** → `gi-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十三章 免疫系统常见疾病.md`** → `ra-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: immune-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十三章 免疫系统常见疾病.md`** → `sle-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: immune-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十三章 免疫系统常见疾病/第一节 类风湿关节炎.md`** → `immune-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十三章 免疫系统常见疾病/第二节 系统性红斑狼疮.md`** → `immune-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十二章 内分泌系统常见疾病.md`** → `hyperthyroidism-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: endocrine-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十二章 内分泌系统常见疾病.md`** → `hypothyroidism-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: endocrine-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十二章 内分泌系统常见疾病.md`** → `diabetes-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: endocrine-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十二章 内分泌系统常见疾病.md`** → `osteoporosis-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: endocrine-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十二章 内分泌系统常见疾病.md`** → `gout-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: endocrine-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十二章 内分泌系统常见疾病/第一节 甲状腺功能亢进症.md`** → `endocrine-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十二章 内分泌系统常见疾病/第三节 糖尿病.md`** → `endocrine-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十二章 内分泌系统常见疾病/第二节 甲状腺功能减退症.md`** → `endocrine-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十二章 内分泌系统常见疾病/第五节 高尿酸血症与痛风.md`** → `endocrine-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十二章 内分泌系统常见疾病/第四节 骨质疏松症.md`** → `endocrine-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十五章 肿瘤.md`** → `tumor-clinical-basis`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: tumor-y3, type: isa`。
- **`药学综合知识与技能/第十五章 肿瘤.md`** → `tumor-treatment-prevention`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: tumor-y3, type: isa`。
- **`药学综合知识与技能/第十五章 肿瘤/第一节 肿瘤的临床基础.md`** → `tumor-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十五章 肿瘤/第三节 肿瘤化疗管理.md`** → `tumor-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十五章 肿瘤/第二节 肿瘤的治疗与预防.md`** → `tumor-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十五章 肿瘤/第五节 肿瘤支持治疗管理.md`** → `tumor-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十五章 肿瘤/第四节 肿瘤靶向治疗管理.md`** → `tumor-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十四章 泌尿系统常见疾病.md`** → `bph-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: urinary-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十四章 泌尿系统常见疾病.md`** → `ckd-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: urinary-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十四章 泌尿系统常见疾病/第一节 良性前列腺增生症.md`** → `urinary-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十四章 泌尿系统常见疾病/第二节 慢性肾脏病.md`** → `urinary-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十章 神经精神系统常见疾病.md`** → `anxiety-depression`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cns-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十章 神经精神系统常见疾病.md`** → `insomnia-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cns-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十章 神经精神系统常见疾病.md`** → `stroke-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cns-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十章 神经精神系统常见疾病.md`** → `parkinson-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cns-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十章 神经精神系统常见疾病.md`** → `epilepsy-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cns-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十章 神经精神系统常见疾病.md`** → `dementia-management`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: cns-diseases-y3, type: isa`。
- **`药学综合知识与技能/第十章 神经精神系统常见疾病/第一节 焦虑抑郁.md`** → `cns-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十章 神经精神系统常见疾病/第三节 脑卒中.md`** → `cns-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十章 神经精神系统常见疾病/第二节 失眠症.md`** → `cns-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十章 神经精神系统常见疾病/第五节 癫痫.md`** → `cns-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十章 神经精神系统常见疾病/第六节 痴呆.md`** → `cns-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第十章 神经精神系统常见疾病/第四节 帕金森病.md`** → `cns-diseases-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第四章 用药安全.md`** → `pharmacovigilance`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-safety-y3, type: isa`。
- **`药学综合知识与技能/第四章 用药安全.md`** → `adverse-drug-reactions`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-safety-y3, type: isa`。
- **`药学综合知识与技能/第四章 用药安全.md`** → `medication-errors`：has 边指向 location 子级节点（section）。修复方法：删除此 has 边，改为在子节点添加 `- target: drug-safety-y3, type: isa`。
- **`药学综合知识与技能/第四章 用药安全/第一节 药物警戒.md`** → `drug-safety-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第四章 用药安全/第三节 药源性疾病.md`** → `drug-safety-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第四章 用药安全/第二节 药品不良反应.md`** → `drug-safety-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。
- **`药学综合知识与技能/第四章 用药安全/第四节 用药错误.md`** → `drug-safety-y3`：has 边指向 location 上级节点。应为反向 isa 或 relates。

#### （b）双向 has/isa/relates 配对（共 171 个边对）

> A→B 与 B→A 同类型边互指，违反 ADR-0001 "禁止双向书写同一关系"。

| 源节点 → 目标节点 | 类型 |
|---|---|
| `药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系/第二节 药品质量与质量体系.md` ↔ `药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系.md` | has |
| `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂.md` ↔ `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/缓释剂型.md` | has |
| `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/生物利用度.md` ↔ `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂.md` | has |
| `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/首过效应.md` ↔ `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂.md` | has |
| `药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用/第二节 黏膜给药制剂.md` ↔ `药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用/第一节 皮肤给药制剂.md` | has |
| `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用.md` ↔ `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第一节 注射剂的质量控制.md` | has |
| `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用.md` ↔ `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第三节 微粒制剂.md` | has |
| `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第二节 普通注射剂.md` ↔ `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用.md` | has |
| `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第四节 生物技术药物注射剂.md` ↔ `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用.md` | has |
| `药学专业知识一/第三篇 药物化学.md` ↔ `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第三节 中枢神经系统药物.md` | has |
| `药学专业知识一/第三篇 药物化学.md` ↔ `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第四节 解热镇痛及非甾体抗炎药物.md` | has |
| `药学专业知识一/第三篇 药物化学.md` ↔ `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第五节 呼吸系统疾病药物.md` | has |
| `药学专业知识一/第三篇 药物化学.md` ↔ `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第六节 消化系统疾病药物.md` | has |
| `药学专业知识一/第三篇 药物化学.md` ↔ `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第七节 循环系统疾病药物.md` | has |
| `药学专业知识一/第三篇 药物化学.md` ↔ `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第八节 内分泌系统疾病药物.md` | has |
| `药学专业知识一/第三篇 药物化学.md` ↔ `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第九节 泌尿系统疾病药物.md` | has |
| `药学专业知识一/第三篇 药物化学.md` ↔ `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第十节 抗感染药物.md` | has |
| `药学专业知识一/第三篇 药物化学.md` ↔ `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第十一节 抗肿瘤药物.md` | has |
| `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第二节 药物代谢.md` ↔ `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md` | has |
| `药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全/第一节 药物毒性与毒副作用.md` ↔ `药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全.md` | has |
| `药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全/第二节 药物应用的毒副作用与用药安全.md` ↔ `药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全.md` | has |
| `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第一节 药物作用的两重性.md` ↔ `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用.md` | has |
| `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第三节 药物的作用机制与靶点.md` ↔ `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用.md` | has |
| `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第二节 药物作用的量效和时效规律与评价.md` ↔ `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用.md` | has |
| `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第四节 药物相互作用.md` ↔ `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用.md` | has |
| `药学专业知识一/第五篇 生命药学.md` ↔ `药学专业知识一/第五篇 生命药学/第二章 生命药学/第二节 人体代谢.md` | has |
| `药学专业知识一/第五篇 生命药学.md` ↔ `药学专业知识一/第五篇 生命药学/第二章 生命药学/第三节 感染与免疫.md` | has |
| `药学专业知识一/第五篇 生命药学.md` ↔ `药学专业知识一/第五篇 生命药学/第二章 生命药学/第四节 病理生理.md` | has |
| `药学专业知识一/第五篇 生命药学/第二章 生命药学.md` ↔ `药学专业知识一/第五篇 生命药学.md` | has |
| `药学专业知识一/第五篇 生命药学/第二章 生命药学/第一节 人体生物分子的结构与功能.md` ↔ `药学专业知识一/第五篇 生命药学.md` | has |
| `药学专业知识一/第四篇 药动学.md` ↔ `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第四节 药物动力学与临床应用.md` | has |
| `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第一节 药物与机体的相互作用.md` ↔ `药学专业知识一/第四篇 药动学.md` | has |
| `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第三节 药物的分布、代谢与排泄.md` ↔ `药学专业知识一/第四篇 药动学.md` | has |
| `药学专业知识二/第一章 精神与中枢神经系统用药.md` ↔ `药学专业知识二/第一章 精神与中枢神经系统用药/第一节 镇静催眠药、中枢肌松药.md` | has |
| `药学专业知识二/第一章 精神与中枢神经系统用药/第七节 抗精神病药.md` ↔ `药学专业知识二/第一章 精神与中枢神经系统用药.md` | has |
| `药学专业知识二/第一章 精神与中枢神经系统用药/第三节 抗抑郁药.md` ↔ `药学专业知识二/第一章 精神与中枢神经系统用药.md` | has |
| `药学专业知识二/第一章 精神与中枢神经系统用药/第二节 抗癫痫发作药物.md` ↔ `药学专业知识二/第一章 精神与中枢神经系统用药.md` | has |
| `药学专业知识二/第一章 精神与中枢神经系统用药/第五节 中枢镇痛药.md` ↔ `药学专业知识二/第一章 精神与中枢神经系统用药.md` | has |
| `药学专业知识二/第一章 精神与中枢神经系统用药/第六节 抗帕金森病药.md` ↔ `药学专业知识二/第一章 精神与中枢神经系统用药.md` | has |
| `药学专业知识二/第一章 精神与中枢神经系统用药/第四节 抗记忆障碍及改善神经功能药.md` ↔ `药学专业知识二/第一章 精神与中枢神经系统用药.md` | has |
| `药学专业知识二/第七章 泌尿系统用药/第一节 利尿药.md` ↔ `药学专业知识二/第七章 泌尿系统用药.md` | has |
| `药学专业知识二/第七章 泌尿系统用药/第三节 治疗良性前列腺增生用药.md` ↔ `药学专业知识二/第七章 泌尿系统用药.md` | has |
| `药学专业知识二/第七章 泌尿系统用药/第二节 治疗男性勃起功能障碍药.md` ↔ `药学专业知识二/第七章 泌尿系统用药.md` | has |
| `药学专业知识二/第七章 泌尿系统用药/第四节 治疗膀胱过度活动症用药.md` ↔ `药学专业知识二/第七章 泌尿系统用药.md` | has |
| `药学专业知识二/第三章 呼吸系统用药/第一节 镇咳药.md` ↔ `药学专业知识二/第三章 呼吸系统用药.md` | has |
| `药学专业知识二/第三章 呼吸系统用药/第三节 平喘药.md` ↔ `药学专业知识二/第三章 呼吸系统用药.md` | has |
| `药学专业知识二/第三章 呼吸系统用药/第二节 祛痰药.md` ↔ `药学专业知识二/第三章 呼吸系统用药.md` | has |
| `药学专业知识二/第三章 呼吸系统用药/第四节 特发性肺纤维化的治疗药物.md` ↔ `药学专业知识二/第三章 呼吸系统用药.md` | has |
| `药学专业知识二/第九章 抗感染药物.md` ↔ `药学专业知识二/第九章 抗感染药物/第二节 青霉素类抗菌药物.md` | has |
| `药学专业知识二/第九章 抗感染药物.md` ↔ `药学专业知识二/第九章 抗感染药物/第三节 头孢菌素类抗菌药物.md` | has |
| `药学专业知识二/第九章 抗感染药物.md` ↔ `药学专业知识二/第九章 抗感染药物/第四节 β-内酰胺酶抑制剂、碳青霉烯类与其他β-内酰胺类抗菌药物.md` | has |
| `药学专业知识二/第九章 抗感染药物.md` ↔ `药学专业知识二/第九章 抗感染药物/第六节 大环内酯类、林可霉素类与酰胺醇类抗菌药物.md` | has |
| `药学专业知识二/第九章 抗感染药物.md` ↔ `药学专业知识二/第九章 抗感染药物/第七节 喹诺酮类与磺胺类抗菌药物.md` | has |
| `药学专业知识二/第九章 抗感染药物.md` ↔ `药学专业知识二/第九章 抗感染药物/第八节 硝基呋喃类与硝基咪唑类抗菌药物.md` | has |
| `药学专业知识二/第九章 抗感染药物.md` ↔ `药学专业知识二/第九章 抗感染药物/第九节 糖肽类与其他抗菌药物.md` | has |
| `药学专业知识二/第九章 抗感染药物.md` ↔ `药学专业知识二/第九章 抗感染药物/第十节 抗结核分枝杆菌药.md` | has |
| `药学专业知识二/第九章 抗感染药物.md` ↔ `药学专业知识二/第九章 抗感染药物/第十七节 抗原虫药和抗蠕虫药.md` | has |
| `药学专业知识二/第九章 抗感染药物/第一节 抗菌药物总论.md` ↔ `药学专业知识二/第九章 抗感染药物.md` | has |
| `药学专业知识二/第九章 抗感染药物/第五节 氨基糖苷类与四环素类抗菌药物.md` ↔ `药学专业知识二/第九章 抗感染药物.md` | has |
| `药学专业知识二/第九章 抗感染药物/第十一节 抗真菌药.md` ↔ `药学专业知识二/第九章 抗感染药物.md` | has |
| `药学专业知识二/第九章 抗感染药物/第十三节 抗流感病毒药.md` ↔ `药学专业知识二/第九章 抗感染药物.md` | has |
| `药学专业知识二/第九章 抗感染药物/第十二节 抗（人）疱疹病毒药物.md` ↔ `药学专业知识二/第九章 抗感染药物.md` | has |
| `药学专业知识二/第九章 抗感染药物/第十五节 抗肝炎病毒药物.md` ↔ `药学专业知识二/第九章 抗感染药物.md` | has |
| `药学专业知识二/第九章 抗感染药物/第十六节 抗艾滋病病毒药物.md` ↔ `药学专业知识二/第九章 抗感染药物.md` | has |
| `药学专业知识二/第九章 抗感染药物/第十四节 抗新型冠状病毒药.md` ↔ `药学专业知识二/第九章 抗感染药物.md` | has |
| `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药.md` ↔ `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第一节 解热、镇痛、抗炎药.md` | has |
| `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药.md` ↔ `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第二节 抗风湿药.md` | has |
| `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药.md` ↔ `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第三节 抗痛风药.md` | has |
| `药学专业知识二/第五章 心血管系统用药.md` ↔ `药学专业知识二/第五章 心血管系统用药/第一节 抗心律失常药.md` | has |
| `药学专业知识二/第五章 心血管系统用药.md` ↔ `药学专业知识二/第五章 心血管系统用药/第二节 抗高血压药.md` | has |
| `药学专业知识二/第五章 心血管系统用药.md` ↔ `药学专业知识二/第五章 心血管系统用药/第三节 调节血脂药.md` | has |
| `药学专业知识二/第五章 心血管系统用药.md` ↔ `药学专业知识二/第五章 心血管系统用药/第四节 抗心绞痛药.md` | has |
| `药学专业知识二/第五章 心血管系统用药.md` ↔ `药学专业知识二/第五章 心血管系统用药/第五节 抗心力衰竭药.md` | has |
| `药学专业知识二/第八章 内分泌系统用药.md` ↔ `药学专业知识二/第八章 内分泌系统用药/第一节 下丘脑-垂体激素及相关药物.md` | has |
| `药学专业知识二/第八章 内分泌系统用药.md` ↔ `药学专业知识二/第八章 内分泌系统用药/第二节 肾上腺糖皮质激素类药物.md` | has |
| `药学专业知识二/第八章 内分泌系统用药.md` ↔ `药学专业知识二/第八章 内分泌系统用药/第三节 甲状腺激素类药物与抗甲状腺药物.md` | has |
| `药学专业知识二/第八章 内分泌系统用药.md` ↔ `药学专业知识二/第八章 内分泌系统用药/第七节 性激素类.md` | has |
| `药学专业知识二/第八章 内分泌系统用药.md` ↔ `药学专业知识二/第八章 内分泌系统用药/第六节 减重药.md` | has |
| `药学专业知识二/第八章 内分泌系统用药/第五节 调节骨代谢药物.md` ↔ `药学专业知识二/第八章 内分泌系统用药.md` | has |
| `药学专业知识二/第八章 内分泌系统用药/第四节 胰岛素与其他影响血糖的药物.md` ↔ `药学专业知识二/第八章 内分泌系统用药.md` | has |
| `药学专业知识二/第六章 血液系统用药.md` ↔ `药学专业知识二/第六章 血液系统用药/第二节 抗出血药.md` | has |
| `药学专业知识二/第六章 血液系统用药.md` ↔ `药学专业知识二/第六章 血液系统用药/第四节 升白细胞药.md` | has |
| `药学专业知识二/第六章 血液系统用药.md` ↔ `药学专业知识二/第六章 血液系统用药/第二节 抗出血药.md` | has |
| `药学专业知识二/第六章 血液系统用药.md` ↔ `药学专业知识二/第六章 血液系统用药/第四节 升白细胞药.md` | has |
| `药学专业知识二/第六章 血液系统用药/第一节 抗血栓药.md` ↔ `药学专业知识二/第六章 血液系统用药.md` | has |
| `药学专业知识二/第六章 血液系统用药/第三节 抗贫血药.md` ↔ `药学专业知识二/第六章 血液系统用药.md` | has |
| `药学专业知识二/第六章 血液系统用药/第五节 骨髓保护药.md` ↔ `药学专业知识二/第六章 血液系统用药.md` | has |
| `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药.md` ↔ `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第二节 微量元素与维生素.md` | has |
| `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药.md` ↔ `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第四节 肠外营养药.md` | has |
| `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第一节 糖类、盐类、酸碱平衡调节药.md` ↔ `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药.md` | has |
| `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第三节 肠内营养药.md` ↔ `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药.md` | has |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药.md` ↔ `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第一节 体外杀寄生虫与皮肤感染治疗药.md` | has |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药.md` ↔ `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第二节 局部用抗真菌药.md` | has |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药.md` ↔ `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第四节 外用糖皮质激素.md` | has |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药.md` ↔ `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第五节 治疗白癜风药.md` | has |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药.md` ↔ `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第六节 治疗银屑病药.md` | has |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药.md` ↔ `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第七节 妇科外用药.md` | has |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药.md` ↔ `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第八节 消毒防腐药.md` | has |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第三节 痤疮治疗药.md` ↔ `药学专业知识二/第十三章 皮肤用药及抗过敏用药.md` | has |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第九节 抗过敏药.md` ↔ `药学专业知识二/第十三章 皮肤用药及抗过敏用药.md` | has |
| `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药.md` ↔ `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第一节 眼科用药.md` | has |
| `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药.md` ↔ `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第三节 口腔科用药.md` | has |
| `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第二节 耳鼻咽喉科用药.md` ↔ `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药.md` | has |
| `药学专业知识二/第十章 抗肿瘤药.md` ↔ `药学专业知识二/第十章 抗肿瘤药/第一节 直接影响DNA结构和功能的药物.md` | has |
| `药学专业知识二/第十章 抗肿瘤药.md` ↔ `药学专业知识二/第十章 抗肿瘤药/第三节 干扰转录过程和阻止RNA合成的药物（作用于核酸转录药物）.md` | has |
| `药学专业知识二/第十章 抗肿瘤药.md` ↔ `药学专业知识二/第十章 抗肿瘤药/第四节 干扰有丝分裂的药物.md` | has |
| `药学专业知识二/第十章 抗肿瘤药.md` ↔ `药学专业知识二/第十章 抗肿瘤药/第五节 调节体内激素平衡的药物.md` | has |
| `药学专业知识二/第十章 抗肿瘤药.md` ↔ `药学专业知识二/第十章 抗肿瘤药/第六节 生物靶向治疗药物.md` | has |
| `药学专业知识二/第十章 抗肿瘤药.md` ↔ `药学专业知识二/第十章 抗肿瘤药/第七节 其他抗肿瘤药物.md` | has |
| `药学专业知识二/第十章 抗肿瘤药.md` ↔ `药学专业知识二/第十章 抗肿瘤药/第一节 直接影响DNA结构和功能的药物.md` | has |
| `药学专业知识二/第十章 抗肿瘤药.md` ↔ `药学专业知识二/第十章 抗肿瘤药/第三节 干扰转录过程和阻止RNA合成的药物（作用于核酸转录药物）.md` | has |
| `药学专业知识二/第十章 抗肿瘤药.md` ↔ `药学专业知识二/第十章 抗肿瘤药/第四节 干扰有丝分裂的药物.md` | has |
| `药学专业知识二/第十章 抗肿瘤药.md` ↔ `药学专业知识二/第十章 抗肿瘤药/第五节 调节体内激素平衡的药物.md` | has |
| `药学专业知识二/第十章 抗肿瘤药.md` ↔ `药学专业知识二/第十章 抗肿瘤药/第六节 生物靶向治疗药物.md` | has |
| `药学专业知识二/第十章 抗肿瘤药.md` ↔ `药学专业知识二/第十章 抗肿瘤药/第七节 其他抗肿瘤药物.md` | has |
| `药学专业知识二/第十章 抗肿瘤药/第二节 干扰核酸生物合成的药物（抗代谢药）.md` ↔ `药学专业知识二/第十章 抗肿瘤药.md` | has |
| `药学专业知识二/第四章 消化系统用药.md` ↔ `药学专业知识二/第四章 消化系统用药/第四节 肝胆疾病用药.md` | has |
| `药学专业知识二/第四章 消化系统用药.md` ↔ `药学专业知识二/第四章 消化系统用药/第五节 泻药与便秘治疗药.md` | has |
| `药学专业知识二/第四章 消化系统用药/第一节 抑酸剂、抗酸药与胃黏膜保护药.md` ↔ `药学专业知识二/第四章 消化系统用药.md` | has |
| `药学专业知识二/第四章 消化系统用药/第七节 助消化药.md` ↔ `药学专业知识二/第四章 消化系统用药.md` | has |
| `药学专业知识二/第四章 消化系统用药/第三节 止吐药.md` ↔ `药学专业知识二/第四章 消化系统用药.md` | has |
| `药学专业知识二/第四章 消化系统用药/第二节 解痉药、胃肠动力药与功能性胃肠病治疗药.md` ↔ `药学专业知识二/第四章 消化系统用药.md` | has |
| `药学专业知识二/第四章 消化系统用药/第六节 止泻药、肠道抗感染药、肠道抗炎药.md` ↔ `药学专业知识二/第四章 消化系统用药.md` | has |
| `药学综合知识与技能/第一章 药学服务与药品管理.md` ↔ `药学综合知识与技能/第一章 药学服务与药品管理/第一节 药学服务与执业药师.md` | has |
| `药学综合知识与技能/第一章 药学服务与药品管理/第二节 药品管理.md` ↔ `药学综合知识与技能/第一章 药学服务与药品管理.md` | has |
| `药学综合知识与技能/第三章 用药咨询与药物治疗管理.md` ↔ `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第一节 药学信息咨询服务.md` | has |
| `药学综合知识与技能/第三章 用药咨询与药物治疗管理.md` ↔ `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第三节 药物治疗管理.md` | has |
| `药学综合知识与技能/第三章 用药咨询与药物治疗管理.md` ↔ `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第四节 常用医学检查.md` | has |
| `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第二节 疾病管理与健康宣教.md` ↔ `药学综合知识与技能/第三章 用药咨询与药物治疗管理.md` | has |
| `药学综合知识与技能/第九章 心血管系统常见疾病.md` ↔ `药学综合知识与技能/第九章 心血管系统常见疾病/第一节 高血压.md` | has |
| `药学综合知识与技能/第九章 心血管系统常见疾病.md` ↔ `药学综合知识与技能/第九章 心血管系统常见疾病/第二节 血脂异常.md` | has |
| `药学综合知识与技能/第九章 心血管系统常见疾病.md` ↔ `药学综合知识与技能/第九章 心血管系统常见疾病/第三节 冠状动脉粥样硬化性心脏病.md` | has |
| `药学综合知识与技能/第九章 心血管系统常见疾病/第四节 心房颤动.md` ↔ `药学综合知识与技能/第九章 心血管系统常见疾病.md` | has |
| `药学综合知识与技能/第二章 处方审核与调剂/第一节 处方审核.md` ↔ `药学综合知识与技能/第二章 处方审核与调剂.md` | has |
| `药学综合知识与技能/第二章 处方审核与调剂/第二节 调剂操作.md` ↔ `药学综合知识与技能/第二章 处方审核与调剂.md` | has |
| `药学综合知识与技能/第五章 急救、中毒解救及职业防护.md` ↔ `药学综合知识与技能/第五章 急救、中毒解救及职业防护/第一节 急救的意义与原则.md` | has |
| `药学综合知识与技能/第五章 急救、中毒解救及职业防护.md` ↔ `药学综合知识与技能/第五章 急救、中毒解救及职业防护/第二节 常见急症及处置.md` | has |
| `药学综合知识与技能/第五章 急救、中毒解救及职业防护.md` ↔ `药学综合知识与技能/第五章 急救、中毒解救及职业防护/第三节 中毒解救.md` | has |
| `药学综合知识与技能/第八章 呼吸系统常见疾病/第一节 哮喘.md` ↔ `药学综合知识与技能/第八章 呼吸系统常见疾病.md` | has |
| `药学综合知识与技能/第八章 呼吸系统常见疾病/第二节 慢性阻塞性肺疾病.md` ↔ `药学综合知识与技能/第八章 呼吸系统常见疾病.md` | has |
| `药学综合知识与技能/第六章 常见病症的健康管理.md` ↔ `药学综合知识与技能/第六章 常见病症的健康管理/第一节 发热与疼痛.md` | has |
| `药学综合知识与技能/第六章 常见病症的健康管理.md` ↔ `药学综合知识与技能/第六章 常见病症的健康管理/第二节 呼吸系统问题.md` | has |
| `药学综合知识与技能/第六章 常见病症的健康管理.md` ↔ `药学综合知识与技能/第六章 常见病症的健康管理/第三节 消化系统问题.md` | has |
| `药学综合知识与技能/第六章 常见病症的健康管理.md` ↔ `药学综合知识与技能/第六章 常见病症的健康管理/第五节 皮肤及黏膜系统问题.md` | has |
| `药学综合知识与技能/第六章 常见病症的健康管理.md` ↔ `药学综合知识与技能/第六章 常见病症的健康管理/第六节 眼睛问题.md` | has |
| `药学综合知识与技能/第六章 常见病症的健康管理.md` ↔ `药学综合知识与技能/第六章 常见病症的健康管理/第四节 泌尿生殖系统问题.md` | has |
| `药学综合知识与技能/第六章 常见病症的健康管理.md` ↔ `药学综合知识与技能/第六章 常见病症的健康管理/第七节 其他病症.md` | has |
| `药学综合知识与技能/第十一章 消化系统常见疾病.md` ↔ `药学综合知识与技能/第十一章 消化系统常见疾病/第二节 消化性溃疡.md` | has |
| `药学综合知识与技能/第十一章 消化系统常见疾病.md` ↔ `药学综合知识与技能/第十一章 消化系统常见疾病/第三节 溃疡性结肠炎.md` | has |
| `药学综合知识与技能/第十一章 消化系统常见疾病/第一节 胃食管反流病.md` ↔ `药学综合知识与技能/第十一章 消化系统常见疾病.md` | has |
| `药学综合知识与技能/第十一章 消化系统常见疾病/第四节 慢性病毒性肝炎.md` ↔ `药学综合知识与技能/第十一章 消化系统常见疾病.md` | has |
| `药学综合知识与技能/第十三章 免疫系统常见疾病.md` ↔ `药学综合知识与技能/第十三章 免疫系统常见疾病/第一节 类风湿关节炎.md` | has |
| `药学综合知识与技能/第十三章 免疫系统常见疾病.md` ↔ `药学综合知识与技能/第十三章 免疫系统常见疾病/第二节 系统性红斑狼疮.md` | has |
| `药学综合知识与技能/第十二章 内分泌系统常见疾病.md` ↔ `药学综合知识与技能/第十二章 内分泌系统常见疾病/第一节 甲状腺功能亢进症.md` | has |
| `药学综合知识与技能/第十二章 内分泌系统常见疾病.md` ↔ `药学综合知识与技能/第十二章 内分泌系统常见疾病/第二节 甲状腺功能减退症.md` | has |
| `药学综合知识与技能/第十二章 内分泌系统常见疾病.md` ↔ `药学综合知识与技能/第十二章 内分泌系统常见疾病/第四节 骨质疏松症.md` | has |
| `药学综合知识与技能/第十二章 内分泌系统常见疾病.md` ↔ `药学综合知识与技能/第十二章 内分泌系统常见疾病/第五节 高尿酸血症与痛风.md` | has |
| `药学综合知识与技能/第十二章 内分泌系统常见疾病/第三节 糖尿病.md` ↔ `药学综合知识与技能/第十二章 内分泌系统常见疾病.md` | has |
| `药学综合知识与技能/第十五章 肿瘤/第一节 肿瘤的临床基础.md` ↔ `药学综合知识与技能/第十五章 肿瘤.md` | has |
| `药学综合知识与技能/第十五章 肿瘤/第二节 肿瘤的治疗与预防.md` ↔ `药学综合知识与技能/第十五章 肿瘤.md` | has |
| `药学综合知识与技能/第十四章 泌尿系统常见疾病/第一节 良性前列腺增生症.md` ↔ `药学综合知识与技能/第十四章 泌尿系统常见疾病.md` | has |
| `药学综合知识与技能/第十四章 泌尿系统常见疾病/第二节 慢性肾脏病.md` ↔ `药学综合知识与技能/第十四章 泌尿系统常见疾病.md` | has |
| `药学综合知识与技能/第十章 神经精神系统常见疾病.md` ↔ `药学综合知识与技能/第十章 神经精神系统常见疾病/第二节 失眠症.md` | has |
| `药学综合知识与技能/第十章 神经精神系统常见疾病.md` ↔ `药学综合知识与技能/第十章 神经精神系统常见疾病/第三节 脑卒中.md` | has |
| `药学综合知识与技能/第十章 神经精神系统常见疾病.md` ↔ `药学综合知识与技能/第十章 神经精神系统常见疾病/第四节 帕金森病.md` | has |
| `药学综合知识与技能/第十章 神经精神系统常见疾病.md` ↔ `药学综合知识与技能/第十章 神经精神系统常见疾病/第五节 癫痫.md` | has |
| `药学综合知识与技能/第十章 神经精神系统常见疾病.md` ↔ `药学综合知识与技能/第十章 神经精神系统常见疾病/第六节 痴呆.md` | has |
| `药学综合知识与技能/第十章 神经精神系统常见疾病/第一节 焦虑抑郁.md` ↔ `药学综合知识与技能/第十章 神经精神系统常见疾病.md` | has |
| `药学综合知识与技能/第四章 用药安全.md` ↔ `药学综合知识与技能/第四章 用药安全/第一节 药物警戒.md` | has |
| `药学综合知识与技能/第四章 用药安全.md` ↔ `药学综合知识与技能/第四章 用药安全/第四节 用药错误.md` | has |
| `药学综合知识与技能/第四章 用药安全/第二节 药品不良反应.md` ↔ `药学综合知识与技能/第四章 用药安全.md` | has |

#### （c）非 book 节点缺 isa 边（共 220 处，建议）

> 按 ADR-0001 第 5 条执行口径，仅做 warning 提示，不阻断构建。优先在已具有 location 的节点补 isa 边。

##### 药学专业知识一
- `药学专业知识一/第一篇 药剂学.md`
- `药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系.md`
- `药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系/第一节 药物与药物制剂.md`
- `药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系/第二节 药品质量与质量体系.md`
- `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用.md`
- `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂.md`
- `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/生物利用度.md`
- `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/缓释剂型.md`
- `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/美托洛尔.md`
- `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/药物吸收.md`
- `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/首过效应.md`
- `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第二节 口服液体制剂.md`
- `药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用.md`
- `药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用/第一节 皮肤给药制剂.md`
- `药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用/第二节 黏膜给药制剂.md`
- `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用.md`
- `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第一节 注射剂的质量控制.md`
- `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第三节 微粒制剂.md`
- `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第二节 普通注射剂.md`
- `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第四节 生物技术药物注射剂.md`
- `药学专业知识一/第三篇 药物化学.md`
- `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md`
- `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第一节 药物结构与药物活性.md`
- `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第七节 循环系统疾病药物.md`
- `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第三节 中枢神经系统药物.md`
- `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第九节 泌尿系统疾病药物.md`
- `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第二节 药物代谢.md`
- `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第五节 呼吸系统疾病药物.md`
- `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第八节 内分泌系统疾病药物.md`
- `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第六节 消化系统疾病药物.md`
- `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第十一节 抗肿瘤药物.md`
- `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第十节 抗感染药物.md`
- `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第四节 解热镇痛及非甾体抗炎药物.md`
- `药学专业知识一/第二篇 药理与毒理学.md`
- `药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全.md`
- `药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全/第一节 药物毒性与毒副作用.md`
- `药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全/第二节 药物应用的毒副作用与用药安全.md`
- `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用.md`
- `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第一节 药物作用的两重性.md`
- `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第三节 药物的作用机制与靶点.md`
- `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第二节 药物作用的量效和时效规律与评价.md`
- `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第五节 遗传药理学与临床合理用药.md`
- `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第六节 时辰药理学与临床合理用药.md`
- `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第四节 药物相互作用.md`
- `药学专业知识一/第五篇 生命药学.md`
- `药学专业知识一/第五篇 生命药学/第二章 生命药学.md`
- `药学专业知识一/第五篇 生命药学/第二章 生命药学/第一节 人体生物分子的结构与功能.md`
- `药学专业知识一/第五篇 生命药学/第二章 生命药学/第三节 感染与免疫.md`
- `药学专业知识一/第五篇 生命药学/第二章 生命药学/第二节 人体代谢.md`
- `药学专业知识一/第五篇 生命药学/第二章 生命药学/第四节 病理生理.md`
- `药学专业知识一/第四篇 药动学.md`
- `药学专业知识一/第四篇 药动学/第三章 药物的体内过程.md`
- `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第一节 药物与机体的相互作用.md`
- `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第三节 药物的分布、代谢与排泄.md`
- `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第二节 药物的吸收.md`
- `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第四节 药物动力学与临床应用.md`

##### 药学专业知识二
- `药学专业知识二/第一章 精神与中枢神经系统用药.md`
- `药学专业知识二/第一章 精神与中枢神经系统用药/第一节 镇静催眠药、中枢肌松药.md`
- `药学专业知识二/第一章 精神与中枢神经系统用药/第七节 抗精神病药.md`
- `药学专业知识二/第一章 精神与中枢神经系统用药/第三节 抗抑郁药.md`
- `药学专业知识二/第一章 精神与中枢神经系统用药/第二节 抗癫痫发作药物.md`
- `药学专业知识二/第一章 精神与中枢神经系统用药/第五节 中枢镇痛药.md`
- `药学专业知识二/第一章 精神与中枢神经系统用药/第六节 抗帕金森病药.md`
- `药学专业知识二/第一章 精神与中枢神经系统用药/第四节 抗记忆障碍及改善神经功能药.md`
- `药学专业知识二/第七章 泌尿系统用药.md`
- `药学专业知识二/第七章 泌尿系统用药/第一节 利尿药.md`
- `药学专业知识二/第七章 泌尿系统用药/第三节 治疗良性前列腺增生用药.md`
- `药学专业知识二/第七章 泌尿系统用药/第二节 治疗男性勃起功能障碍药.md`
- `药学专业知识二/第七章 泌尿系统用药/第四节 治疗膀胱过度活动症用药.md`
- `药学专业知识二/第三章 呼吸系统用药.md`
- `药学专业知识二/第三章 呼吸系统用药/第一节 镇咳药.md`
- `药学专业知识二/第三章 呼吸系统用药/第三节 平喘药.md`
- `药学专业知识二/第三章 呼吸系统用药/第二节 祛痰药.md`
- `药学专业知识二/第三章 呼吸系统用药/第四节 特发性肺纤维化的治疗药物.md`
- `药学专业知识二/第九章 抗感染药物.md`
- `药学专业知识二/第九章 抗感染药物/第一节 抗菌药物总论.md`
- `药学专业知识二/第九章 抗感染药物/第七节 喹诺酮类与磺胺类抗菌药物.md`
- `药学专业知识二/第九章 抗感染药物/第三节 头孢菌素类抗菌药物.md`
- `药学专业知识二/第九章 抗感染药物/第九节 糖肽类与其他抗菌药物.md`
- `药学专业知识二/第九章 抗感染药物/第二节 青霉素类抗菌药物.md`
- `药学专业知识二/第九章 抗感染药物/第五节 氨基糖苷类与四环素类抗菌药物.md`
- `药学专业知识二/第九章 抗感染药物/第八节 硝基呋喃类与硝基咪唑类抗菌药物.md`
- `药学专业知识二/第九章 抗感染药物/第六节 大环内酯类、林可霉素类与酰胺醇类抗菌药物.md`
- `药学专业知识二/第九章 抗感染药物/第十一节 抗真菌药.md`
- `药学专业知识二/第九章 抗感染药物/第十七节 抗原虫药和抗蠕虫药.md`
- `药学专业知识二/第九章 抗感染药物/第十三节 抗流感病毒药.md`
- `药学专业知识二/第九章 抗感染药物/第十二节 抗（人）疱疹病毒药物.md`
- `药学专业知识二/第九章 抗感染药物/第十五节 抗肝炎病毒药物.md`
- `药学专业知识二/第九章 抗感染药物/第十六节 抗艾滋病病毒药物.md`
- `药学专业知识二/第九章 抗感染药物/第十四节 抗新型冠状病毒药.md`
- `药学专业知识二/第九章 抗感染药物/第十节 抗结核分枝杆菌药.md`
- `药学专业知识二/第九章 抗感染药物/第四节 β-内酰胺酶抑制剂、碳青霉烯类与其他β-内酰胺类抗菌药物.md`
- `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药.md`
- `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第一节 解热、镇痛、抗炎药.md`
- `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第三节 抗痛风药.md`
- `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第二节 抗风湿药.md`
- `药学专业知识二/第五章 心血管系统用药.md`
- `药学专业知识二/第五章 心血管系统用药/第一节 抗心律失常药.md`
- `药学专业知识二/第五章 心血管系统用药/第三节 调节血脂药.md`
- `药学专业知识二/第五章 心血管系统用药/第二节 抗高血压药.md`
- `药学专业知识二/第五章 心血管系统用药/第五节 抗心力衰竭药.md`
- `药学专业知识二/第五章 心血管系统用药/第四节 抗心绞痛药.md`
- `药学专业知识二/第八章 内分泌系统用药.md`
- `药学专业知识二/第八章 内分泌系统用药/第一节 下丘脑-垂体激素及相关药物.md`
- `药学专业知识二/第八章 内分泌系统用药/第七节 性激素类.md`
- `药学专业知识二/第八章 内分泌系统用药/第三节 甲状腺激素类药物与抗甲状腺药物.md`
- `药学专业知识二/第八章 内分泌系统用药/第二节 肾上腺糖皮质激素类药物.md`
- `药学专业知识二/第八章 内分泌系统用药/第五节 调节骨代谢药物.md`
- `药学专业知识二/第八章 内分泌系统用药/第六节 减重药.md`
- `药学专业知识二/第八章 内分泌系统用药/第四节 胰岛素与其他影响血糖的药物.md`
- `药学专业知识二/第六章 血液系统用药.md`
- `药学专业知识二/第六章 血液系统用药/第一节 抗血栓药.md`
- `药学专业知识二/第六章 血液系统用药/第三节 抗贫血药.md`
- `药学专业知识二/第六章 血液系统用药/第二节 抗出血药.md`
- `药学专业知识二/第六章 血液系统用药/第五节 骨髓保护药.md`
- `药学专业知识二/第六章 血液系统用药/第四节 升白细胞药.md`
- `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药.md`
- `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第一节 糖类、盐类、酸碱平衡调节药.md`
- `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第三节 肠内营养药.md`
- `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第二节 微量元素与维生素.md`
- `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第四节 肠外营养药.md`
- `药学专业知识二/第十三章 皮肤用药及抗过敏用药.md`
- `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第一节 体外杀寄生虫与皮肤感染治疗药.md`
- `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第七节 妇科外用药.md`
- `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第三节 痤疮治疗药.md`
- `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第九节 抗过敏药.md`
- `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第二节 局部用抗真菌药.md`
- `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第五节 治疗白癜风药.md`
- `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第八节 消毒防腐药.md`
- `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第六节 治疗银屑病药.md`
- `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第四节 外用糖皮质激素.md`
- `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药.md`
- `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第一节 眼科用药.md`
- `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第三节 口腔科用药.md`
- `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第二节 耳鼻咽喉科用药.md`
- `药学专业知识二/第十章 抗肿瘤药.md`
- `药学专业知识二/第十章 抗肿瘤药/第一节 直接影响DNA结构和功能的药物.md`
- `药学专业知识二/第十章 抗肿瘤药/第七节 其他抗肿瘤药物.md`
- `药学专业知识二/第十章 抗肿瘤药/第三节 干扰转录过程和阻止RNA合成的药物（作用于核酸转录药物）.md`
- `药学专业知识二/第十章 抗肿瘤药/第二节 干扰核酸生物合成的药物（抗代谢药）.md`
- `药学专业知识二/第十章 抗肿瘤药/第五节 调节体内激素平衡的药物.md`
- `药学专业知识二/第十章 抗肿瘤药/第六节 生物靶向治疗药物.md`
- `药学专业知识二/第十章 抗肿瘤药/第四节 干扰有丝分裂的药物.md`
- `药学专业知识二/第四章 消化系统用药.md`
- `药学专业知识二/第四章 消化系统用药/第一节 抑酸剂、抗酸药与胃黏膜保护药.md`
- `药学专业知识二/第四章 消化系统用药/第七节 助消化药.md`
- `药学专业知识二/第四章 消化系统用药/第三节 止吐药.md`
- `药学专业知识二/第四章 消化系统用药/第二节 解痉药、胃肠动力药与功能性胃肠病治疗药.md`
- `药学专业知识二/第四章 消化系统用药/第五节 泻药与便秘治疗药.md`
- `药学专业知识二/第四章 消化系统用药/第六节 止泻药、肠道抗感染药、肠道抗炎药.md`
- `药学专业知识二/第四章 消化系统用药/第四节 肝胆疾病用药.md`

##### 药学综合知识与技能
- `药学综合知识与技能/第一章 药学服务与药品管理.md`
- `药学综合知识与技能/第一章 药学服务与药品管理/第一节 药学服务与执业药师.md`
- `药学综合知识与技能/第一章 药学服务与药品管理/第二节 药品管理.md`
- `药学综合知识与技能/第七章 慢性病管理.md`
- `药学综合知识与技能/第三章 用药咨询与药物治疗管理.md`
- `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第一节 药学信息咨询服务.md`
- `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第三节 药物治疗管理.md`
- `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第二节 疾病管理与健康宣教.md`
- `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第四节 常用医学检查.md`
- `药学综合知识与技能/第九章 心血管系统常见疾病.md`
- `药学综合知识与技能/第九章 心血管系统常见疾病/第一节 高血压.md`
- `药学综合知识与技能/第九章 心血管系统常见疾病/第三节 冠状动脉粥样硬化性心脏病.md`
- `药学综合知识与技能/第九章 心血管系统常见疾病/第二节 血脂异常.md`
- `药学综合知识与技能/第九章 心血管系统常见疾病/第四节 心房颤动.md`
- `药学综合知识与技能/第二章 处方审核与调剂.md`
- `药学综合知识与技能/第二章 处方审核与调剂/第一节 处方审核.md`
- `药学综合知识与技能/第二章 处方审核与调剂/第二节 调剂操作.md`
- `药学综合知识与技能/第五章 急救、中毒解救及职业防护.md`
- `药学综合知识与技能/第五章 急救、中毒解救及职业防护/第一节 急救的意义与原则.md`
- `药学综合知识与技能/第五章 急救、中毒解救及职业防护/第三节 中毒解救.md`
- `药学综合知识与技能/第五章 急救、中毒解救及职业防护/第二节 常见急症及处置.md`
- `药学综合知识与技能/第八章 呼吸系统常见疾病.md`
- `药学综合知识与技能/第八章 呼吸系统常见疾病/第一节 哮喘.md`
- `药学综合知识与技能/第八章 呼吸系统常见疾病/第二节 慢性阻塞性肺疾病.md`
- `药学综合知识与技能/第六章 常见病症的健康管理.md`
- `药学综合知识与技能/第六章 常见病症的健康管理/第一节 发热与疼痛.md`
- `药学综合知识与技能/第六章 常见病症的健康管理/第七节 其他病症.md`
- `药学综合知识与技能/第六章 常见病症的健康管理/第三节 消化系统问题.md`
- `药学综合知识与技能/第六章 常见病症的健康管理/第二节 呼吸系统问题.md`
- `药学综合知识与技能/第六章 常见病症的健康管理/第五节 皮肤及黏膜系统问题.md`
- `药学综合知识与技能/第六章 常见病症的健康管理/第六节 眼睛问题.md`
- `药学综合知识与技能/第六章 常见病症的健康管理/第四节 泌尿生殖系统问题.md`
- `药学综合知识与技能/第十一章 消化系统常见疾病.md`
- `药学综合知识与技能/第十一章 消化系统常见疾病/第一节 胃食管反流病.md`
- `药学综合知识与技能/第十一章 消化系统常见疾病/第三节 溃疡性结肠炎.md`
- `药学综合知识与技能/第十一章 消化系统常见疾病/第二节 消化性溃疡.md`
- `药学综合知识与技能/第十一章 消化系统常见疾病/第四节 慢性病毒性肝炎.md`
- `药学综合知识与技能/第十三章 免疫系统常见疾病.md`
- `药学综合知识与技能/第十三章 免疫系统常见疾病/第一节 类风湿关节炎.md`
- `药学综合知识与技能/第十三章 免疫系统常见疾病/第二节 系统性红斑狼疮.md`
- `药学综合知识与技能/第十二章 内分泌系统常见疾病.md`
- `药学综合知识与技能/第十二章 内分泌系统常见疾病/第一节 甲状腺功能亢进症.md`
- `药学综合知识与技能/第十二章 内分泌系统常见疾病/第三节 糖尿病.md`
- `药学综合知识与技能/第十二章 内分泌系统常见疾病/第二节 甲状腺功能减退症.md`
- `药学综合知识与技能/第十二章 内分泌系统常见疾病/第五节 高尿酸血症与痛风.md`
- `药学综合知识与技能/第十二章 内分泌系统常见疾病/第四节 骨质疏松症.md`
- `药学综合知识与技能/第十五章 肿瘤.md`
- `药学综合知识与技能/第十五章 肿瘤/第一节 肿瘤的临床基础.md`
- `药学综合知识与技能/第十五章 肿瘤/第三节 肿瘤化疗管理.md`
- `药学综合知识与技能/第十五章 肿瘤/第二节 肿瘤的治疗与预防.md`
- `药学综合知识与技能/第十五章 肿瘤/第五节 肿瘤支持治疗管理.md`
- `药学综合知识与技能/第十五章 肿瘤/第四节 肿瘤靶向治疗管理.md`
- `药学综合知识与技能/第十四章 泌尿系统常见疾病.md`
- `药学综合知识与技能/第十四章 泌尿系统常见疾病/第一节 良性前列腺增生症.md`
- `药学综合知识与技能/第十四章 泌尿系统常见疾病/第二节 慢性肾脏病.md`
- `药学综合知识与技能/第十章 神经精神系统常见疾病.md`
- `药学综合知识与技能/第十章 神经精神系统常见疾病/第一节 焦虑抑郁.md`
- `药学综合知识与技能/第十章 神经精神系统常见疾病/第三节 脑卒中.md`
- `药学综合知识与技能/第十章 神经精神系统常见疾病/第二节 失眠症.md`
- `药学综合知识与技能/第十章 神经精神系统常见疾病/第五节 癫痫.md`
- `药学综合知识与技能/第十章 神经精神系统常见疾病/第六节 痴呆.md`
- `药学综合知识与技能/第十章 神经精神系统常见疾病/第四节 帕金森病.md`
- `药学综合知识与技能/第四章 用药安全.md`
- `药学综合知识与技能/第四章 用药安全/第一节 药物警戒.md`
- `药学综合知识与技能/第四章 用药安全/第三节 药源性疾病.md`
- `药学综合知识与技能/第四章 用药安全/第二节 药品不良反应.md`
- `药学综合知识与技能/第四章 用药安全/第五节 特殊人群用药.md`
- `药学综合知识与技能/第四章 用药安全/第六节 免疫抑制患者用药.md`
- `药学综合知识与技能/第四章 用药安全/第四节 用药错误.md`

---

## 修复策略（ADR-0001 落地）

对于 (a)/(b) 类问题，按下述顺序处理：

1. **确定层级归属**：每个节点的 `location` 已经定义了它在树中的位置。
2. **删除父→子的 `has` 边**：父节点只需靠 location 知道它包含哪些子节点，不用边显式枚举。
3. **在子节点加 `type: isa` 指父**：保留子→父的链路，确保图谱能自上而下遍历。
4. **`has` 边全部转化为 `isa`**：本项目当前不存在真正的"物理组成" `has` 用例（制剂→辅料、人体→器官尚未建模）。所以可以认为所有 `has` 都是层级包含，按上面 1/2/3 处理。如果未来引入物理组成场景，可保留这些 `has`。
5. **删除双向配对中的反向边**：A→B 与 B→A 同类型时，保留语义更准确的那一条（一般保留子→父的 `isa`）。

---

## 修正进度

| 状态 | 数量 |
|---|---|
| ❌ 未开始 | 0 |
| 🔄 进行中 | 0 |
| ✅ 已完成 | 223 |

> 每完成一个文件，在此文档对应行标记 ✅ 并更新上方表格。
