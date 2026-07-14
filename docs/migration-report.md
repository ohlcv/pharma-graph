# ISA 迁移报告（DRY-RUN）

> 生成时间：2026/7/14 20:41:13
> 范围：`content/**/*.md`，共 223 个文件

## 转换统计

| 类别 | 数量 |
|---|---|
| 触及文件数 | 217 |
| 父→子 has 删除 | 208 |
| 子→父 has→isa | 167 |
| 同级 has→relates | 9 |
| 异常 has→relates | 0 |
| 保留非 has 边 | 455 |
| 计划追加 isa | 189 |

## 详细变更

### 药学专业知识一.md (`pharm-knowledge-1`)

-   父→子 has 删除: pharm-knowledge-1 --has→ pharmaceutics-y1（子将补 isa）
-   父→子 has 删除: pharm-knowledge-1 --has→ pharmacokinetics-y1（子将补 isa）
-   父→子 has 删除: pharm-knowledge-1 --has→ biopharmaceutics-y1（子将补 isa）
-   父→子 has 删除: pharm-knowledge-1 --has→ medicinal-chemistry-y1（子将补 isa）
-   父→子 has 删除: pharm-knowledge-1 --has→ pharmacology-and-toxicology（子将补 isa）

### 药学专业知识一/第一篇 药剂学.md (`pharmaceutics-y1`)

-   父→子 has 删除: pharmaceutics-y1 --has→ drug-preparations-y1（子将补 isa）
-   父→子 has 删除: pharmaceutics-y1 --has→ drug-quality-system-y1（子将补 isa）
-   父→子 has 删除: pharmaceutics-y1 --has→ oral-drugs-y1（子将补 isa）
-   父→子 has 删除: pharmaceutics-y1 --has→ injection-preparations-y1（子将补 isa）
-   父→子 has 删除: pharmaceutics-y1 --has→ topical-mucosal-drugs-y1（子将补 isa）

### 药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系.md (`drug-quality-system-y1`)

-   父→子 has 删除: drug-quality-system-y1 --has→ drug-quality-and-quality-systems（子将补 isa）

### 药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系/第二节 药品质量与质量体系.md (`drug-quality-and-quality-systems`)

-   子→父 has→isa: drug-quality-and-quality-systems --has→ drug-quality-system-y1

### 药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用.md (`oral-drugs-y1`)

-   父→子 has 删除: oral-drugs-y1 --has→ oral-solid-dosage-forms-y1（子将补 isa）
-   父→子 has 删除: oral-drugs-y1 --has→ oral-liquid-dosage-forms-y1（子将补 isa）

### 药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂.md (`oral-solid-dosage-forms-y1`)

-   父→子 has 删除: oral-solid-dosage-forms-y1 --has→ first-pass-effect（子将补 isa）
-   同级 has→relates: oral-solid-dosage-forms-y1 --has→ bioavailability-y1
-   同级 has→relates: oral-solid-dosage-forms-y1 --has→ sustained-release-dosage-forms-y1
-   父→子 has 删除: oral-solid-dosage-forms-y1 --has→ metoprolol（子将补 isa）

### 药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/生物利用度.md (`bioavailability-y1`)

-   同级 has→relates: bioavailability-y1 --has→ oral-solid-dosage-forms-y1

### 药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/缓释剂型.md (`sustained-release-dosage-forms-y1`)

-   同级 has→relates: sustained-release-dosage-forms-y1 --has→ oral-solid-dosage-forms-y1

### 药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/药物吸收.md (`drug-absorption-y1`)

-   同级 has→relates: drug-absorption-y1 --has→ oral-solid-dosage-forms-y1

### 药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/首过效应.md (`first-pass-effect`)

-   子→父 has→isa: first-pass-effect --has→ oral-solid-dosage-forms-y1

### 药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用.md (`topical-mucosal-drugs-y1`)

-   父→子 has 删除: topical-mucosal-drugs-y1 --has→ topical-drug-delivery-y1（子将补 isa）
-   父→子 has 删除: topical-mucosal-drugs-y1 --has→ mucosal-drug-delivery-y1（子将补 isa）

### 药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用/第一节 皮肤给药制剂.md (`topical-drug-delivery-y1`)

-   同级 has→relates: topical-drug-delivery-y1 --has→ mucosal-drug-delivery-y1

### 药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用/第二节 黏膜给药制剂.md (`mucosal-drug-delivery-y1`)

-   同级 has→relates: mucosal-drug-delivery-y1 --has→ topical-drug-delivery-y1

### 药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用.md (`injection-preparations-y1`)

-   父→子 has 删除: injection-preparations-y1 --has→ injection-quality-control-y1（子将补 isa）
-   父→子 has 删除: injection-preparations-y1 --has→ common-injection-preparations-y1（子将补 isa）
-   父→子 has 删除: injection-preparations-y1 --has→ particulate-injection-preparations-y1（子将补 isa）
-   父→子 has 删除: injection-preparations-y1 --has→ biotech-drug-injection-y1（子将补 isa）

### 药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第一节 注射剂的质量控制.md (`injection-quality-control-y1`)

-   子→父 has→isa: injection-quality-control-y1 --has→ injection-preparations-y1

### 药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第三节 微粒制剂.md (`particulate-injection-preparations-y1`)

-   子→父 has→isa: particulate-injection-preparations-y1 --has→ injection-preparations-y1

### 药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第二节 普通注射剂.md (`common-injection-preparations-y1`)

-   子→父 has→isa: common-injection-preparations-y1 --has→ injection-preparations-y1

### 药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第四节 生物技术药物注射剂.md (`biotech-drug-injection-y1`)

-   子→父 has→isa: biotech-drug-injection-y1 --has→ injection-preparations-y1

### 药学专业知识一/第三篇 药物化学.md (`medicinal-chemistry-y1`)

-   父→子 has 删除: medicinal-chemistry-y1 --has→ structure-activity-cns-y1（子将补 isa）
-   父→子 has 删除: medicinal-chemistry-y1 --has→ structure-activity-analgesic-y1（子将补 isa）
-   父→子 has 删除: medicinal-chemistry-y1 --has→ structure-activity-respiratory-y1（子将补 isa）
-   父→子 has 删除: medicinal-chemistry-y1 --has→ structure-activity-gi-y1（子将补 isa）
-   父→子 has 删除: medicinal-chemistry-y1 --has→ structure-activity-cardiovascular-y1（子将补 isa）
-   父→子 has 删除: medicinal-chemistry-y1 --has→ structure-activity-endocrine-y1（子将补 isa）
-   父→子 has 删除: medicinal-chemistry-y1 --has→ structure-activity-urinary-y1（子将补 isa）
-   父→子 has 删除: medicinal-chemistry-y1 --has→ structure-activity-antibiotic-y1（子将补 isa）
-   父→子 has 删除: medicinal-chemistry-y1 --has→ structure-activity-antitumor-y1（子将补 isa）

### 药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md (`drug-structure-activity-y1`)

-   父→子 has 删除: drug-structure-activity-y1 --has→ structure-activity-cns-y1（子将补 isa）
-   父→子 has 删除: drug-structure-activity-y1 --has→ structure-activity-analgesic-y1（子将补 isa）
-   父→子 has 删除: drug-structure-activity-y1 --has→ structure-activity-respiratory-y1（子将补 isa）
-   父→子 has 删除: drug-structure-activity-y1 --has→ structure-activity-gi-y1（子将补 isa）
-   父→子 has 删除: drug-structure-activity-y1 --has→ structure-activity-cardiovascular-y1（子将补 isa）
-   父→子 has 删除: drug-structure-activity-y1 --has→ structure-activity-endocrine-y1（子将补 isa）
-   父→子 has 删除: drug-structure-activity-y1 --has→ structure-activity-urinary-y1（子将补 isa）
-   父→子 has 删除: drug-structure-activity-y1 --has→ structure-activity-antibiotic-y1（子将补 isa）
-   父→子 has 删除: drug-structure-activity-y1 --has→ structure-activity-antitumor-y1（子将补 isa）
-   父→子 has 删除: drug-structure-activity-y1 --has→ drug-metabolism-y1（子将补 isa）

### 药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第一节 药物结构与药物活性.md (`structure-activity-drugs-1-y1`)

-   子→父 has→isa: structure-activity-drugs-1-y1 --has→ drug-structure-activity-y1

### 药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第七节 循环系统疾病药物.md (`structure-activity-cardiovascular-y1`)

-   子→父 has→isa: structure-activity-cardiovascular-y1 --has→ medicinal-chemistry-y1

### 药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第三节 中枢神经系统药物.md (`structure-activity-cns-y1`)

-   子→父 has→isa: structure-activity-cns-y1 --has→ medicinal-chemistry-y1

### 药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第九节 泌尿系统疾病药物.md (`structure-activity-urinary-y1`)

-   子→父 has→isa: structure-activity-urinary-y1 --has→ medicinal-chemistry-y1

### 药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第二节 药物代谢.md (`drug-metabolism-y1`)

-   子→父 has→isa: drug-metabolism-y1 --has→ drug-structure-activity-y1

### 药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第五节 呼吸系统疾病药物.md (`structure-activity-respiratory-y1`)

-   子→父 has→isa: structure-activity-respiratory-y1 --has→ medicinal-chemistry-y1

### 药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第八节 内分泌系统疾病药物.md (`structure-activity-endocrine-y1`)

-   子→父 has→isa: structure-activity-endocrine-y1 --has→ medicinal-chemistry-y1

### 药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第六节 消化系统疾病药物.md (`structure-activity-gi-y1`)

-   子→父 has→isa: structure-activity-gi-y1 --has→ medicinal-chemistry-y1

### 药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第十一节 抗肿瘤药物.md (`structure-activity-antitumor-y1`)

-   子→父 has→isa: structure-activity-antitumor-y1 --has→ medicinal-chemistry-y1

### 药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第十节 抗感染药物.md (`structure-activity-antibiotic-y1`)

-   子→父 has→isa: structure-activity-antibiotic-y1 --has→ medicinal-chemistry-y1

### 药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第四节 解热镇痛及非甾体抗炎药物.md (`structure-activity-analgesic-y1`)

-   子→父 has→isa: structure-activity-analgesic-y1 --has→ medicinal-chemistry-y1

### 药学专业知识一/第二篇 药理与毒理学.md (`pharmacology-and-toxicology`)

-   父→子 has 删除: pharmacology-and-toxicology --has→ pharmacodynamics-y1（子将补 isa）
-   父→子 has 删除: pharmacology-and-toxicology --has→ pharmacotoxicology-y1（子将补 isa）
-   父→子 has 删除: pharmacology-and-toxicology --has→ pharmacogenetics-y1（子将补 isa）
-   父→子 has 删除: pharmacology-and-toxicology --has→ chronopharmacology-y1（子将补 isa）

### 药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全.md (`pharmacotoxicology-y1`)

-   父→子 has 删除: pharmacotoxicology-y1 --has→ drug-toxicity-side-effects-y1（子将补 isa）
-   父→子 has 删除: pharmacotoxicology-y1 --has→ drug-application-safety-y1（子将补 isa）

### 药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全/第一节 药物毒性与毒副作用.md (`drug-toxicity-side-effects-y1`)

-   子→父 has→isa: drug-toxicity-side-effects-y1 --has→ pharmacotoxicology-y1

### 药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全/第二节 药物应用的毒副作用与用药安全.md (`drug-application-safety-y1`)

-   子→父 has→isa: drug-application-safety-y1 --has→ pharmacotoxicology-y1

### 药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用.md (`pharmacodynamics-y1`)

-   父→子 has 删除: pharmacodynamics-y1 --has→ drug-duality-y1（子将补 isa）
-   父→子 has 删除: pharmacodynamics-y1 --has→ dose-time-effect（子将补 isa）
-   父→子 has 删除: pharmacodynamics-y1 --has→ mechanism-target-y1（子将补 isa）
-   父→子 has 删除: pharmacodynamics-y1 --has→ drug-interaction-y1（子将补 isa）

### 药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第一节 药物作用的两重性.md (`drug-duality-y1`)

-   子→父 has→isa: drug-duality-y1 --has→ pharmacodynamics-y1

### 药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第三节 药物的作用机制与靶点.md (`mechanism-target-y1`)

-   子→父 has→isa: mechanism-target-y1 --has→ pharmacodynamics-y1

### 药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第二节 药物作用的量效和时效规律与评价.md (`dose-time-effect`)

-   子→父 has→isa: dose-time-effect --has→ pharmacodynamics-y1

### 药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第五节 遗传药理学与临床合理用药.md (`pharmacogenetics-y1`)

-   子→父 has→isa: pharmacogenetics-y1 --has→ pharmacodynamics-y1

### 药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第六节 时辰药理学与临床合理用药.md (`chronopharmacology-y1`)

-   子→父 has→isa: chronopharmacology-y1 --has→ pharmacodynamics-y1

### 药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第四节 药物相互作用.md (`drug-interaction-y1`)

-   子→父 has→isa: drug-interaction-y1 --has→ pharmacodynamics-y1

### 药学专业知识一/第五篇 生命药学.md (`biopharmaceutics-y1`)

-   父→子 has 删除: biopharmaceutics-y1 --has→ biopharmaceutics-chapter-y1（子将补 isa）
-   父→子 has 删除: biopharmaceutics-y1 --has→ biomolecule-structure-function-y1（子将补 isa）
-   父→子 has 删除: biopharmaceutics-y1 --has→ human-metabolism-y1（子将补 isa）
-   父→子 has 删除: biopharmaceutics-y1 --has→ infection-immunity-y1（子将补 isa）
-   父→子 has 删除: biopharmaceutics-y1 --has→ pathophysiology-y1（子将补 isa）

### 药学专业知识一/第五篇 生命药学/第二章 生命药学.md (`biopharmaceutics-chapter-y1`)

-   子→父 has→isa: biopharmaceutics-chapter-y1 --has→ biopharmaceutics-y1
-   父→子 has 删除: biopharmaceutics-chapter-y1 --has→ biomolecule-structure-function-y1（子将补 isa）
-   父→子 has 删除: biopharmaceutics-chapter-y1 --has→ human-metabolism-y1（子将补 isa）
-   父→子 has 删除: biopharmaceutics-chapter-y1 --has→ infection-immunity-y1（子将补 isa）
-   父→子 has 删除: biopharmaceutics-chapter-y1 --has→ pathophysiology-y1（子将补 isa）

### 药学专业知识一/第五篇 生命药学/第二章 生命药学/第一节 人体生物分子的结构与功能.md (`biomolecule-structure-function-y1`)

-   子→父 has→isa: biomolecule-structure-function-y1 --has→ biopharmaceutics-y1

### 药学专业知识一/第五篇 生命药学/第二章 生命药学/第三节 感染与免疫.md (`infection-immunity-y1`)

-   子→父 has→isa: infection-immunity-y1 --has→ biopharmaceutics-y1

### 药学专业知识一/第五篇 生命药学/第二章 生命药学/第二节 人体代谢.md (`human-metabolism-y1`)

-   子→父 has→isa: human-metabolism-y1 --has→ biopharmaceutics-y1

### 药学专业知识一/第五篇 生命药学/第二章 生命药学/第四节 病理生理.md (`pathophysiology-y1`)

-   子→父 has→isa: pathophysiology-y1 --has→ biopharmaceutics-y1

### 药学专业知识一/第四篇 药动学.md (`pharmacokinetics-y1`)

-   父→子 has 删除: pharmacokinetics-y1 --has→ drug-disposition-processes（子将补 isa）
-   父→子 has 删除: pharmacokinetics-y1 --has→ drug-absorption-process-y1（子将补 isa）
-   父→子 has 删除: pharmacokinetics-y1 --has→ drug-distribution-metabolism-excretion-y1（子将补 isa）
-   父→子 has 删除: pharmacokinetics-y1 --has→ pk-clinical-application-y1（子将补 isa）

### 药学专业知识一/第四篇 药动学/第三章 药物的体内过程.md (`drug-disposition-processes`)

-   父→子 has 删除: drug-disposition-processes --has→ drug-absorption-process-y1（子将补 isa）
-   父→子 has 删除: drug-disposition-processes --has→ drug-distribution-metabolism-excretion-y1（子将补 isa）

### 药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第一节 药物与机体的相互作用.md (`drug-absorption-process-y1`)

-   子→父 has→isa: drug-absorption-process-y1 --has→ pharmacokinetics-y1

### 药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第三节 药物的分布、代谢与排泄.md (`drug-distribution-metabolism-excretion-y1`)

-   子→父 has→isa: drug-distribution-metabolism-excretion-y1 --has→ pharmacokinetics-y1

### 药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第二节 药物的吸收.md (`drug-absorption-pk-y1`)

-   同级 has→relates: drug-absorption-pk-y1 --has→ drug-absorption-process-y1

### 药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第四节 药物动力学与临床应用.md (`pk-clinical-application-y1`)

-   子→父 has→isa: pk-clinical-application-y1 --has→ pharmacokinetics-y1

### 药学专业知识二/第一章 精神与中枢神经系统用药.md (`cns-drugs-y2`)

-   父→子 has 删除: cns-drugs-y2 --has→ sedative-hypnotics-muscle-relaxants（子将补 isa）
-   父→子 has 删除: cns-drugs-y2 --has→ antiepileptic-drugs（子将补 isa）
-   父→子 has 删除: cns-drugs-y2 --has→ antidepressant-drugs（子将补 isa）
-   父→子 has 删除: cns-drugs-y2 --has→ anti-dementia-drugs（子将补 isa）
-   父→子 has 删除: cns-drugs-y2 --has→ central-analgesics（子将补 isa）
-   父→子 has 删除: cns-drugs-y2 --has→ antiparkinson-drugs（子将补 isa）
-   父→子 has 删除: cns-drugs-y2 --has→ antipsychotic-drugs（子将补 isa）

### 药学专业知识二/第一章 精神与中枢神经系统用药/第一节 镇静催眠药、中枢肌松药.md (`sedative-hypnotics-muscle-relaxants`)

-   子→父 has→isa: sedative-hypnotics-muscle-relaxants --has→ cns-drugs-y2

### 药学专业知识二/第一章 精神与中枢神经系统用药/第七节 抗精神病药.md (`antipsychotic-drugs`)

-   子→父 has→isa: antipsychotic-drugs --has→ cns-drugs-y2

### 药学专业知识二/第一章 精神与中枢神经系统用药/第三节 抗抑郁药.md (`antidepressant-drugs`)

-   子→父 has→isa: antidepressant-drugs --has→ cns-drugs-y2

### 药学专业知识二/第一章 精神与中枢神经系统用药/第二节 抗癫痫发作药物.md (`antiepileptic-drugs`)

-   子→父 has→isa: antiepileptic-drugs --has→ cns-drugs-y2

### 药学专业知识二/第一章 精神与中枢神经系统用药/第五节 中枢镇痛药.md (`central-analgesics`)

-   子→父 has→isa: central-analgesics --has→ cns-drugs-y2

### 药学专业知识二/第一章 精神与中枢神经系统用药/第六节 抗帕金森病药.md (`antiparkinson-drugs`)

-   子→父 has→isa: antiparkinson-drugs --has→ cns-drugs-y2

### 药学专业知识二/第一章 精神与中枢神经系统用药/第四节 抗记忆障碍及改善神经功能药.md (`anti-dementia-drugs`)

-   子→父 has→isa: anti-dementia-drugs --has→ cns-drugs-y2

### 药学专业知识二/第七章 泌尿系统用药.md (`urinary-drugs-y2`)

-   父→子 has 删除: urinary-drugs-y2 --has→ section-diuretics（子将补 isa）
-   父→子 has 删除: urinary-drugs-y2 --has→ erectile-dysfunction-drugs（子将补 isa）
-   父→子 has 删除: urinary-drugs-y2 --has→ bph-drugs（子将补 isa）
-   父→子 has 删除: urinary-drugs-y2 --has→ oab-drugs（子将补 isa）

### 药学专业知识二/第七章 泌尿系统用药/第一节 利尿药.md (`section-diuretics`)

-   子→父 has→isa: section-diuretics --has→ urinary-drugs-y2

### 药学专业知识二/第七章 泌尿系统用药/第三节 治疗良性前列腺增生用药.md (`bph-drugs`)

-   子→父 has→isa: bph-drugs --has→ urinary-drugs-y2

### 药学专业知识二/第七章 泌尿系统用药/第二节 治疗男性勃起功能障碍药.md (`erectile-dysfunction-drugs`)

-   子→父 has→isa: erectile-dysfunction-drugs --has→ urinary-drugs-y2

### 药学专业知识二/第七章 泌尿系统用药/第四节 治疗膀胱过度活动症用药.md (`oab-drugs`)

-   子→父 has→isa: oab-drugs --has→ urinary-drugs-y2

### 药学专业知识二/第三章 呼吸系统用药.md (`respiratory-drugs-y2`)

-   父→子 has 删除: respiratory-drugs-y2 --has→ antitussives（子将补 isa）
-   父→子 has 删除: respiratory-drugs-y2 --has→ expectorants（子将补 isa）
-   父→子 has 删除: respiratory-drugs-y2 --has→ anti-asthmatic-drugs（子将补 isa）
-   父→子 has 删除: respiratory-drugs-y2 --has→ ipf-drugs（子将补 isa）

### 药学专业知识二/第三章 呼吸系统用药/第一节 镇咳药.md (`antitussives`)

-   子→父 has→isa: antitussives --has→ respiratory-drugs-y2

### 药学专业知识二/第三章 呼吸系统用药/第三节 平喘药.md (`anti-asthmatic-drugs`)

-   子→父 has→isa: anti-asthmatic-drugs --has→ respiratory-drugs-y2

### 药学专业知识二/第三章 呼吸系统用药/第二节 祛痰药.md (`expectorants`)

-   子→父 has→isa: expectorants --has→ respiratory-drugs-y2

### 药学专业知识二/第三章 呼吸系统用药/第四节 特发性肺纤维化的治疗药物.md (`ipf-drugs`)

-   子→父 has→isa: ipf-drugs --has→ respiratory-drugs-y2

### 药学专业知识二/第九章 抗感染药物.md (`antiinfective-drugs-y2`)

-   父→子 has 删除: antiinfective-drugs-y2 --has→ antibacterial-general（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ penicillins（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ cephalosporins（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ beta-lactamase-carbapenems（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ aminoglycosides-tetracyclines（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ macrolides（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ quinolones-sulfonamides（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ nitrofurans-nitroimidazoles（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ glycopeptides（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ antimycobacterial-drugs（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ antifungals（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ anti-herpesvirus（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ anti-influenza（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ anti-covid（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ anti-hepatitis（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ anti-hiv（子将补 isa）
-   父→子 has 删除: antiinfective-drugs-y2 --has→ antiprotozoal-antihelminthic（子将补 isa）

### 药学专业知识二/第九章 抗感染药物/第一节 抗菌药物总论.md (`antibacterial-general`)

-   子→父 has→isa: antibacterial-general --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第七节 喹诺酮类与磺胺类抗菌药物.md (`quinolones-sulfonamides`)

-   子→父 has→isa: quinolones-sulfonamides --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第三节 头孢菌素类抗菌药物.md (`cephalosporins`)

-   子→父 has→isa: cephalosporins --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第九节 糖肽类与其他抗菌药物.md (`glycopeptides`)

-   子→父 has→isa: glycopeptides --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第二节 青霉素类抗菌药物.md (`penicillins`)

-   子→父 has→isa: penicillins --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第五节 氨基糖苷类与四环素类抗菌药物.md (`aminoglycosides-tetracyclines`)

-   子→父 has→isa: aminoglycosides-tetracyclines --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第八节 硝基呋喃类与硝基咪唑类抗菌药物.md (`nitrofurans-nitroimidazoles`)

-   子→父 has→isa: nitrofurans-nitroimidazoles --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第六节 大环内酯类、林可霉素类与酰胺醇类抗菌药物.md (`macrolides`)

-   子→父 has→isa: macrolides --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第十一节 抗真菌药.md (`antifungals`)

-   子→父 has→isa: antifungals --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第十七节 抗原虫药和抗蠕虫药.md (`antiprotozoal-antihelminthic`)

-   子→父 has→isa: antiprotozoal-antihelminthic --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第十三节 抗流感病毒药.md (`anti-influenza`)

-   子→父 has→isa: anti-influenza --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第十二节 抗（人）疱疹病毒药物.md (`anti-herpesvirus`)

-   子→父 has→isa: anti-herpesvirus --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第十五节 抗肝炎病毒药物.md (`anti-hepatitis`)

-   子→父 has→isa: anti-hepatitis --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第十六节 抗艾滋病病毒药物.md (`anti-hiv`)

-   子→父 has→isa: anti-hiv --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第十四节 抗新型冠状病毒药.md (`anti-covid`)

-   子→父 has→isa: anti-covid --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第十节 抗结核分枝杆菌药.md (`antimycobacterial-drugs`)

-   子→父 has→isa: antimycobacterial-drugs --has→ antiinfective-drugs-y2

### 药学专业知识二/第九章 抗感染药物/第四节 β-内酰胺酶抑制剂、碳青霉烯类与其他β-内酰胺类抗菌药物.md (`beta-lactamase-carbapenems`)

-   子→父 has→isa: beta-lactamase-carbapenems --has→ antiinfective-drugs-y2

### 药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药.md (`analgesic-antiinflammatory-y2`)

-   父→子 has 删除: analgesic-antiinflammatory-y2 --has→ antipyretic-analgesic-antiinflammatory（子将补 isa）
-   父→子 has 删除: analgesic-antiinflammatory-y2 --has→ anti-inflammatory-antirheumatic-drugs（子将补 isa）
-   父→子 has 删除: analgesic-antiinflammatory-y2 --has→ antigout-drugs（子将补 isa）

### 药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第一节 解热、镇痛、抗炎药.md (`antipyretic-analgesic-antiinflammatory`)

-   子→父 has→isa: antipyretic-analgesic-antiinflammatory --has→ analgesic-antiinflammatory-y2

### 药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第三节 抗痛风药.md (`antigout-drugs`)

-   子→父 has→isa: antigout-drugs --has→ analgesic-antiinflammatory-y2

### 药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第二节 抗风湿药.md (`anti-inflammatory-antirheumatic-drugs`)

-   子→父 has→isa: anti-inflammatory-antirheumatic-drugs --has→ analgesic-antiinflammatory-y2

### 药学专业知识二/第五章 心血管系统用药.md (`cardiovascular-drugs-y2`)

-   父→子 has 删除: cardiovascular-drugs-y2 --has→ section-antiarrhythmics（子将补 isa）
-   父→子 has 删除: cardiovascular-drugs-y2 --has→ section-antihypertensives（子将补 isa）
-   父→子 has 删除: cardiovascular-drugs-y2 --has→ lipid-regulators（子将补 isa）
-   父→子 has 删除: cardiovascular-drugs-y2 --has→ section-antianginals（子将补 isa）
-   父→子 has 删除: cardiovascular-drugs-y2 --has→ section-antihypertensive-heart-failure（子将补 isa）

### 药学专业知识二/第五章 心血管系统用药/第一节 抗心律失常药.md (`section-antiarrhythmics`)

-   子→父 has→isa: section-antiarrhythmics --has→ cardiovascular-drugs-y2

### 药学专业知识二/第五章 心血管系统用药/第三节 调节血脂药.md (`lipid-regulators`)

-   子→父 has→isa: lipid-regulators --has→ cardiovascular-drugs-y2

### 药学专业知识二/第五章 心血管系统用药/第二节 抗高血压药.md (`section-antihypertensives`)

-   子→父 has→isa: section-antihypertensives --has→ cardiovascular-drugs-y2

### 药学专业知识二/第五章 心血管系统用药/第五节 抗心力衰竭药.md (`section-antihypertensive-heart-failure`)

-   子→父 has→isa: section-antihypertensive-heart-failure --has→ cardiovascular-drugs-y2

### 药学专业知识二/第五章 心血管系统用药/第四节 抗心绞痛药.md (`section-antianginals`)

-   子→父 has→isa: section-antianginals --has→ cardiovascular-drugs-y2

### 药学专业知识二/第八章 内分泌系统用药.md (`endocrine-drugs-y2`)

-   父→子 has 删除: endocrine-drugs-y2 --has→ hypothalamic-pituitary-drugs（子将补 isa）
-   父→子 has 删除: endocrine-drugs-y2 --has→ glucocorticoids（子将补 isa）
-   父→子 has 删除: endocrine-drugs-y2 --has→ thyroid-drugs（子将补 isa）
-   父→子 has 删除: endocrine-drugs-y2 --has→ antidiabetic-drugs（子将补 isa）
-   父→子 has 删除: endocrine-drugs-y2 --has→ bone-metabolism-drugs（子将补 isa）
-   父→子 has 删除: endocrine-drugs-y2 --has→ sex-hormones（子将补 isa）
-   父→子 has 删除: endocrine-drugs-y2 --has→ weight-management-drugs（子将补 isa）

### 药学专业知识二/第八章 内分泌系统用药/第一节 下丘脑-垂体激素及相关药物.md (`hypothalamic-pituitary-drugs`)

-   子→父 has→isa: hypothalamic-pituitary-drugs --has→ endocrine-drugs-y2

### 药学专业知识二/第八章 内分泌系统用药/第七节 性激素类.md (`sex-hormones`)

-   子→父 has→isa: sex-hormones --has→ endocrine-drugs-y2

### 药学专业知识二/第八章 内分泌系统用药/第三节 甲状腺激素类药物与抗甲状腺药物.md (`thyroid-drugs`)

-   子→父 has→isa: thyroid-drugs --has→ endocrine-drugs-y2

### 药学专业知识二/第八章 内分泌系统用药/第二节 肾上腺糖皮质激素类药物.md (`glucocorticoids`)

-   子→父 has→isa: glucocorticoids --has→ endocrine-drugs-y2

### 药学专业知识二/第八章 内分泌系统用药/第五节 调节骨代谢药物.md (`bone-metabolism-drugs`)

-   子→父 has→isa: bone-metabolism-drugs --has→ endocrine-drugs-y2

### 药学专业知识二/第八章 内分泌系统用药/第六节 减重药.md (`weight-management-drugs`)

-   子→父 has→isa: weight-management-drugs --has→ endocrine-drugs-y2

### 药学专业知识二/第八章 内分泌系统用药/第四节 胰岛素与其他影响血糖的药物.md (`antidiabetic-drugs`)

-   子→父 has→isa: antidiabetic-drugs --has→ endocrine-drugs-y2

### 药学专业知识二/第六章 血液系统用药.md (`hematologic-drugs-y2`)

-   父→子 has 删除: hematologic-drugs-y2 --has→ antithrombotic-drugs（子将补 isa）
-   父→子 has 删除: hematologic-drugs-y2 --has→ hemostatic-drugs（子将补 isa）
-   父→子 has 删除: hematologic-drugs-y2 --has→ antianemics（子将补 isa）
-   父→子 has 删除: hematologic-drugs-y2 --has→ leukocyte-stimulants（子将补 isa）
-   父→子 has 删除: hematologic-drugs-y2 --has→ bone-marrow-protective-drugs（子将补 isa）
-   父→子 has 删除: hematologic-drugs-y2 --has→ antithrombotic-drugs（子将补 isa）
-   父→子 has 删除: hematologic-drugs-y2 --has→ hemostatic-drugs（子将补 isa）
-   父→子 has 删除: hematologic-drugs-y2 --has→ antianemics（子将补 isa）
-   父→子 has 删除: hematologic-drugs-y2 --has→ leukocyte-stimulants（子将补 isa）
-   父→子 has 删除: hematologic-drugs-y2 --has→ bone-marrow-protective-drugs（子将补 isa）

### 药学专业知识二/第六章 血液系统用药/第一节 抗血栓药.md (`antithrombotic-drugs`)

-   子→父 has→isa: antithrombotic-drugs --has→ hematologic-drugs-y2

### 药学专业知识二/第六章 血液系统用药/第三节 抗贫血药.md (`antianemics`)

-   子→父 has→isa: antianemics --has→ hematologic-drugs-y2

### 药学专业知识二/第六章 血液系统用药/第二节 抗出血药.md (`hemostatic-drugs`)

-   子→父 has→isa: hemostatic-drugs --has→ hematologic-drugs-y2

### 药学专业知识二/第六章 血液系统用药/第五节 骨髓保护药.md (`bone-marrow-protective-drugs`)

-   子→父 has→isa: bone-marrow-protective-drugs --has→ hematologic-drugs-y2

### 药学专业知识二/第六章 血液系统用药/第四节 升白细胞药.md (`leukocyte-stimulants`)

-   子→父 has→isa: leukocyte-stimulants --has→ hematologic-drugs-y2

### 药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药.md (`nutrition-drugs-y2`)

-   父→子 has 删除: nutrition-drugs-y2 --has→ fluids-electrolytes（子将补 isa）
-   父→子 has 删除: nutrition-drugs-y2 --has→ vitamins-minerals（子将补 isa）
-   父→子 has 删除: nutrition-drugs-y2 --has→ ent-nutrition（子将补 isa）
-   父→子 has 删除: nutrition-drugs-y2 --has→ pn-drugs（子将补 isa）

### 药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第一节 糖类、盐类、酸碱平衡调节药.md (`fluids-electrolytes`)

-   子→父 has→isa: fluids-electrolytes --has→ nutrition-drugs-y2

### 药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第三节 肠内营养药.md (`ent-nutrition`)

-   子→父 has→isa: ent-nutrition --has→ nutrition-drugs-y2

### 药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第二节 微量元素与维生素.md (`vitamins-minerals`)

-   子→父 has→isa: vitamins-minerals --has→ nutrition-drugs-y2

### 药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第四节 肠外营养药.md (`pn-drugs`)

-   子→父 has→isa: pn-drugs --has→ nutrition-drugs-y2

### 药学专业知识二/第十三章 皮肤用药及抗过敏用药.md (`dermatology-drugs-y2`)

-   父→子 has 删除: dermatology-drugs-y2 --has→ parasitic-skin-drugs（子将补 isa）
-   父→子 has 删除: dermatology-drugs-y2 --has→ topical-antifungal（子将补 isa）
-   父→子 has 删除: dermatology-drugs-y2 --has→ acne-drugs（子将补 isa）
-   父→子 has 删除: dermatology-drugs-y2 --has→ topical-corticosteroids（子将补 isa）
-   父→子 has 删除: dermatology-drugs-y2 --has→ vitiligo-drugs（子将补 isa）
-   父→子 has 删除: dermatology-drugs-y2 --has→ psoriasis-drugs（子将补 isa）
-   父→子 has 删除: dermatology-drugs-y2 --has→ gynecological-dermatology（子将补 isa）
-   父→子 has 删除: dermatology-drugs-y2 --has→ disinfectants（子将补 isa）
-   父→子 has 删除: dermatology-drugs-y2 --has→ antihistamines（子将补 isa）

### 药学专业知识二/第十三章 皮肤用药及抗过敏用药/第一节 体外杀寄生虫与皮肤感染治疗药.md (`parasitic-skin-drugs`)

-   子→父 has→isa: parasitic-skin-drugs --has→ dermatology-drugs-y2

### 药学专业知识二/第十三章 皮肤用药及抗过敏用药/第七节 妇科外用药.md (`gynecological-dermatology`)

-   子→父 has→isa: gynecological-dermatology --has→ dermatology-drugs-y2

### 药学专业知识二/第十三章 皮肤用药及抗过敏用药/第三节 痤疮治疗药.md (`acne-drugs`)

-   子→父 has→isa: acne-drugs --has→ dermatology-drugs-y2

### 药学专业知识二/第十三章 皮肤用药及抗过敏用药/第九节 抗过敏药.md (`antihistamines`)

-   子→父 has→isa: antihistamines --has→ dermatology-drugs-y2

### 药学专业知识二/第十三章 皮肤用药及抗过敏用药/第二节 局部用抗真菌药.md (`topical-antifungal`)

-   子→父 has→isa: topical-antifungal --has→ dermatology-drugs-y2

### 药学专业知识二/第十三章 皮肤用药及抗过敏用药/第五节 治疗白癜风药.md (`vitiligo-drugs`)

-   子→父 has→isa: vitiligo-drugs --has→ dermatology-drugs-y2

### 药学专业知识二/第十三章 皮肤用药及抗过敏用药/第八节 消毒防腐药.md (`disinfectants`)

-   子→父 has→isa: disinfectants --has→ dermatology-drugs-y2

### 药学专业知识二/第十三章 皮肤用药及抗过敏用药/第六节 治疗银屑病药.md (`psoriasis-drugs`)

-   子→父 has→isa: psoriasis-drugs --has→ dermatology-drugs-y2

### 药学专业知识二/第十三章 皮肤用药及抗过敏用药/第四节 外用糖皮质激素.md (`topical-corticosteroids`)

-   子→父 has→isa: topical-corticosteroids --has→ dermatology-drugs-y2

### 药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药.md (`ent-drugs-y2`)

-   父→子 has 删除: ent-drugs-y2 --has→ ophthalmic-drugs（子将补 isa）
-   父→子 has 删除: ent-drugs-y2 --has→ ent-drugs（子将补 isa）
-   父→子 has 删除: ent-drugs-y2 --has→ oral-drugs（子将补 isa）

### 药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第一节 眼科用药.md (`ophthalmic-drugs`)

-   子→父 has→isa: ophthalmic-drugs --has→ ent-drugs-y2

### 药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第三节 口腔科用药.md (`oral-drugs`)

-   子→父 has→isa: oral-drugs --has→ ent-drugs-y2

### 药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第二节 耳鼻咽喉科用药.md (`ent-drugs`)

-   子→父 has→isa: ent-drugs --has→ ent-drugs-y2

### 药学专业知识二/第十章 抗肿瘤药.md (`antitumor-drugs-y2`)

-   父→子 has 删除: antitumor-drugs-y2 --has→ direct-dna-acting-antitumor（子将补 isa）
-   父→子 has 删除: antitumor-drugs-y2 --has→ antimetabolite-antitumor（子将补 isa）
-   父→子 has 删除: antitumor-drugs-y2 --has→ rna-synthesis-antitumor（子将补 isa）
-   父→子 has 删除: antitumor-drugs-y2 --has→ mitotic-inhibitor-antitumor（子将补 isa）
-   父→子 has 删除: antitumor-drugs-y2 --has→ hormonal-antitumor（子将补 isa）
-   父→子 has 删除: antitumor-drugs-y2 --has→ biological-targeted-antitumor（子将补 isa）
-   父→子 has 删除: antitumor-drugs-y2 --has→ other-antitumor（子将补 isa）
-   父→子 has 删除: antitumor-drugs-y2 --has→ direct-dna-acting-antitumor（子将补 isa）
-   父→子 has 删除: antitumor-drugs-y2 --has→ antimetabolite-antitumor（子将补 isa）
-   父→子 has 删除: antitumor-drugs-y2 --has→ rna-synthesis-antitumor（子将补 isa）
-   父→子 has 删除: antitumor-drugs-y2 --has→ mitotic-inhibitor-antitumor（子将补 isa）
-   父→子 has 删除: antitumor-drugs-y2 --has→ hormonal-antitumor（子将补 isa）
-   父→子 has 删除: antitumor-drugs-y2 --has→ biological-targeted-antitumor（子将补 isa）
-   父→子 has 删除: antitumor-drugs-y2 --has→ other-antitumor（子将补 isa）

### 药学专业知识二/第十章 抗肿瘤药/第一节 直接影响DNA结构和功能的药物.md (`direct-dna-acting-antitumor`)

-   子→父 has→isa: direct-dna-acting-antitumor --has→ antitumor-drugs-y2

### 药学专业知识二/第十章 抗肿瘤药/第七节 其他抗肿瘤药物.md (`other-antitumor`)

-   子→父 has→isa: other-antitumor --has→ antitumor-drugs-y2

### 药学专业知识二/第十章 抗肿瘤药/第三节 干扰转录过程和阻止RNA合成的药物（作用于核酸转录药物）.md (`rna-synthesis-antitumor`)

-   子→父 has→isa: rna-synthesis-antitumor --has→ antitumor-drugs-y2

### 药学专业知识二/第十章 抗肿瘤药/第二节 干扰核酸生物合成的药物（抗代谢药）.md (`antimetabolite-antitumor`)

-   子→父 has→isa: antimetabolite-antitumor --has→ antitumor-drugs-y2

### 药学专业知识二/第十章 抗肿瘤药/第五节 调节体内激素平衡的药物.md (`hormonal-antitumor`)

-   子→父 has→isa: hormonal-antitumor --has→ antitumor-drugs-y2

### 药学专业知识二/第十章 抗肿瘤药/第六节 生物靶向治疗药物.md (`biological-targeted-antitumor`)

-   子→父 has→isa: biological-targeted-antitumor --has→ antitumor-drugs-y2

### 药学专业知识二/第十章 抗肿瘤药/第四节 干扰有丝分裂的药物.md (`mitotic-inhibitor-antitumor`)

-   子→父 has→isa: mitotic-inhibitor-antitumor --has→ antitumor-drugs-y2

### 药学专业知识二/第四章 消化系统用药.md (`gi-drugs-y2`)

-   父→子 has 删除: gi-drugs-y2 --has→ antiacid-mucosal-protectants（子将补 isa）
-   父→子 has 删除: gi-drugs-y2 --has→ antispasmodic-prokinetic-functional-gi（子将补 isa）
-   父→子 has 删除: gi-drugs-y2 --has→ antiemetics（子将补 isa）
-   父→子 has 删除: gi-drugs-y2 --has→ hepatobiliary-drugs（子将补 isa）
-   父→子 has 删除: gi-drugs-y2 --has→ laxatives-constipation-drugs（子将补 isa）
-   父→子 has 删除: gi-drugs-y2 --has→ antidiarrheal-intestinal-antiinfective-antiinflammatory（子将补 isa）
-   父→子 has 删除: gi-drugs-y2 --has→ digestive-enzymes（子将补 isa）

### 药学专业知识二/第四章 消化系统用药/第一节 抑酸剂、抗酸药与胃黏膜保护药.md (`antiacid-mucosal-protectants`)

-   子→父 has→isa: antiacid-mucosal-protectants --has→ gi-drugs-y2

### 药学专业知识二/第四章 消化系统用药/第七节 助消化药.md (`digestive-enzymes`)

-   子→父 has→isa: digestive-enzymes --has→ gi-drugs-y2

### 药学专业知识二/第四章 消化系统用药/第三节 止吐药.md (`antiemetics`)

-   子→父 has→isa: antiemetics --has→ gi-drugs-y2

### 药学专业知识二/第四章 消化系统用药/第二节 解痉药、胃肠动力药与功能性胃肠病治疗药.md (`antispasmodic-prokinetic-functional-gi`)

-   子→父 has→isa: antispasmodic-prokinetic-functional-gi --has→ gi-drugs-y2

### 药学专业知识二/第四章 消化系统用药/第五节 泻药与便秘治疗药.md (`laxatives-constipation-drugs`)

-   子→父 has→isa: laxatives-constipation-drugs --has→ gi-drugs-y2

### 药学专业知识二/第四章 消化系统用药/第六节 止泻药、肠道抗感染药、肠道抗炎药.md (`antidiarrheal-intestinal-antiinfective-antiinflammatory`)

-   子→父 has→isa: antidiarrheal-intestinal-antiinfective-antiinflammatory --has→ gi-drugs-y2

### 药学专业知识二/第四章 消化系统用药/第四节 肝胆疾病用药.md (`hepatobiliary-drugs`)

-   子→父 has→isa: hepatobiliary-drugs --has→ gi-drugs-y2

### 药学综合知识与技能.md (`pharm-knowledge-3`)

-   父→子 has 删除: pharm-knowledge-3 --has→ chronic-disease-management（子将补 isa）

### 药学综合知识与技能/第一章 药学服务与药品管理.md (`pharmacy-services-drug-management`)

-   父→子 has 删除: pharmacy-services-drug-management --has→ pharmacy-services-pharmacist（子将补 isa）
-   父→子 has 删除: pharmacy-services-drug-management --has→ drug-management（子将补 isa）

### 药学综合知识与技能/第一章 药学服务与药品管理/第一节 药学服务与执业药师.md (`pharmacy-services-pharmacist`)

-   子→父 has→isa: pharmacy-services-pharmacist --has→ pharmacy-services-drug-management

### 药学综合知识与技能/第一章 药学服务与药品管理/第二节 药品管理.md (`drug-management`)

-   子→父 has→isa: drug-management --has→ pharmacy-services-drug-management

### 药学综合知识与技能/第七章 慢性病管理.md (`chronic-disease-management`)

-   同级 has→relates: chronic-disease-management --has→ disease-management

### 药学综合知识与技能/第三章 用药咨询与药物治疗管理.md (`drug-consultation-y3`)

-   父→子 has 删除: drug-consultation-y3 --has→ drug-information（子将补 isa）
-   父→子 has 删除: drug-consultation-y3 --has→ disease-management（子将补 isa）
-   父→子 has 删除: drug-consultation-y3 --has→ mtm（子将补 isa）
-   父→子 has 删除: drug-consultation-y3 --has→ medical-checks（子将补 isa）

### 药学综合知识与技能/第三章 用药咨询与药物治疗管理/第一节 药学信息咨询服务.md (`drug-information`)

-   子→父 has→isa: drug-information --has→ drug-consultation-y3

### 药学综合知识与技能/第三章 用药咨询与药物治疗管理/第三节 药物治疗管理.md (`mtm`)

-   子→父 has→isa: mtm --has→ drug-consultation-y3

### 药学综合知识与技能/第三章 用药咨询与药物治疗管理/第二节 疾病管理与健康宣教.md (`disease-management`)

-   子→父 has→isa: disease-management --has→ drug-consultation-y3

### 药学综合知识与技能/第三章 用药咨询与药物治疗管理/第四节 常用医学检查.md (`medical-checks`)

-   子→父 has→isa: medical-checks --has→ drug-consultation-y3

### 药学综合知识与技能/第九章 心血管系统常见疾病.md (`cardiovascular-diseases-y3`)

-   父→子 has 删除: cardiovascular-diseases-y3 --has→ hypertension-management（子将补 isa）
-   父→子 has 删除: cardiovascular-diseases-y3 --has→ lipid-disorders-management（子将补 isa）
-   父→子 has 删除: cardiovascular-diseases-y3 --has→ coronary-heart-disease（子将补 isa）
-   父→子 has 删除: cardiovascular-diseases-y3 --has→ atrial-fibrillation（子将补 isa）

### 药学综合知识与技能/第九章 心血管系统常见疾病/第一节 高血压.md (`hypertension-management`)

-   子→父 has→isa: hypertension-management --has→ cardiovascular-diseases-y3

### 药学综合知识与技能/第九章 心血管系统常见疾病/第三节 冠状动脉粥样硬化性心脏病.md (`coronary-heart-disease`)

-   子→父 has→isa: coronary-heart-disease --has→ cardiovascular-diseases-y3

### 药学综合知识与技能/第九章 心血管系统常见疾病/第二节 血脂异常.md (`lipid-disorders-management`)

-   子→父 has→isa: lipid-disorders-management --has→ cardiovascular-diseases-y3

### 药学综合知识与技能/第九章 心血管系统常见疾病/第四节 心房颤动.md (`atrial-fibrillation`)

-   子→父 has→isa: atrial-fibrillation --has→ cardiovascular-diseases-y3

### 药学综合知识与技能/第二章 处方审核与调剂.md (`prescription-review-y3`)

-   父→子 has 删除: prescription-review-y3 --has→ prescription-review（子将补 isa）
-   父→子 has 删除: prescription-review-y3 --has→ dispensing（子将补 isa）

### 药学综合知识与技能/第二章 处方审核与调剂/第一节 处方审核.md (`prescription-review`)

-   子→父 has→isa: prescription-review --has→ prescription-review-y3

### 药学综合知识与技能/第二章 处方审核与调剂/第二节 调剂操作.md (`dispensing`)

-   子→父 has→isa: dispensing --has→ prescription-review-y3

### 药学综合知识与技能/第五章 急救、中毒解救及职业防护.md (`chapter-emergency-poisoning`)

-   父→子 has 删除: chapter-emergency-poisoning --has→ concept-ch5-s1（子将补 isa）
-   父→子 has 删除: chapter-emergency-poisoning --has→ concept-ch5-s2（子将补 isa）
-   父→子 has 删除: chapter-emergency-poisoning --has→ concept-ch5-s3（子将补 isa）

### 药学综合知识与技能/第五章 急救、中毒解救及职业防护/第一节 急救的意义与原则.md (`concept-ch5-s1`)

-   子→父 has→isa: concept-ch5-s1 --has→ chapter-emergency-poisoning

### 药学综合知识与技能/第五章 急救、中毒解救及职业防护/第三节 中毒解救.md (`concept-ch5-s3`)

-   子→父 has→isa: concept-ch5-s3 --has→ chapter-emergency-poisoning

### 药学综合知识与技能/第五章 急救、中毒解救及职业防护/第二节 常见急症及处置.md (`concept-ch5-s2`)

-   子→父 has→isa: concept-ch5-s2 --has→ chapter-emergency-poisoning

### 药学综合知识与技能/第八章 呼吸系统常见疾病.md (`respiratory-diseases-y3`)

-   父→子 has 删除: respiratory-diseases-y3 --has→ asthma-management（子将补 isa）
-   父→子 has 删除: respiratory-diseases-y3 --has→ copd-management（子将补 isa）

### 药学综合知识与技能/第八章 呼吸系统常见疾病/第一节 哮喘.md (`asthma-management`)

-   子→父 has→isa: asthma-management --has→ respiratory-diseases-y3

### 药学综合知识与技能/第八章 呼吸系统常见疾病/第二节 慢性阻塞性肺疾病.md (`copd-management`)

-   子→父 has→isa: copd-management --has→ respiratory-diseases-y3

### 药学综合知识与技能/第六章 常见病症的健康管理.md (`common-conditions-y3`)

-   父→子 has 删除: common-conditions-y3 --has→ fever-pain（子将补 isa）
-   父→子 has 删除: common-conditions-y3 --has→ respiratory-problems（子将补 isa）
-   父→子 has 删除: common-conditions-y3 --has→ gi-problems（子将补 isa）
-   父→子 has 删除: common-conditions-y3 --has→ skin-mucosal（子将补 isa）
-   父→子 has 删除: common-conditions-y3 --has→ eye-problems（子将补 isa）
-   父→子 has 删除: common-conditions-y3 --has→ urogenital-problems（子将补 isa）
-   父→子 has 删除: common-conditions-y3 --has→ other-conditions（子将补 isa）

### 药学综合知识与技能/第六章 常见病症的健康管理/第一节 发热与疼痛.md (`fever-pain`)

-   子→父 has→isa: fever-pain --has→ common-conditions-y3

### 药学综合知识与技能/第六章 常见病症的健康管理/第七节 其他病症.md (`other-conditions`)

-   子→父 has→isa: other-conditions --has→ common-conditions-y3

### 药学综合知识与技能/第六章 常见病症的健康管理/第三节 消化系统问题.md (`gi-problems`)

-   子→父 has→isa: gi-problems --has→ common-conditions-y3

### 药学综合知识与技能/第六章 常见病症的健康管理/第二节 呼吸系统问题.md (`respiratory-problems`)

-   子→父 has→isa: respiratory-problems --has→ common-conditions-y3

### 药学综合知识与技能/第六章 常见病症的健康管理/第五节 皮肤及黏膜系统问题.md (`skin-mucosal`)

-   子→父 has→isa: skin-mucosal --has→ common-conditions-y3

### 药学综合知识与技能/第六章 常见病症的健康管理/第六节 眼睛问题.md (`eye-problems`)

-   子→父 has→isa: eye-problems --has→ common-conditions-y3

### 药学综合知识与技能/第六章 常见病症的健康管理/第四节 泌尿生殖系统问题.md (`urogenital-problems`)

-   子→父 has→isa: urogenital-problems --has→ common-conditions-y3

### 药学综合知识与技能/第十一章 消化系统常见疾病.md (`gi-diseases-y3`)

-   父→子 has 删除: gi-diseases-y3 --has→ gerd-management（子将补 isa）
-   父→子 has 删除: gi-diseases-y3 --has→ peptic-ulcer-management（子将补 isa）
-   父→子 has 删除: gi-diseases-y3 --has→ ibd-management（子将补 isa）
-   父→子 has 删除: gi-diseases-y3 --has→ chronic-hepatitis-management（子将补 isa）

### 药学综合知识与技能/第十一章 消化系统常见疾病/第一节 胃食管反流病.md (`gerd-management`)

-   子→父 has→isa: gerd-management --has→ gi-diseases-y3

### 药学综合知识与技能/第十一章 消化系统常见疾病/第三节 溃疡性结肠炎.md (`ibd-management`)

-   子→父 has→isa: ibd-management --has→ gi-diseases-y3

### 药学综合知识与技能/第十一章 消化系统常见疾病/第二节 消化性溃疡.md (`peptic-ulcer-management`)

-   子→父 has→isa: peptic-ulcer-management --has→ gi-diseases-y3

### 药学综合知识与技能/第十一章 消化系统常见疾病/第四节 慢性病毒性肝炎.md (`chronic-hepatitis-management`)

-   子→父 has→isa: chronic-hepatitis-management --has→ gi-diseases-y3

### 药学综合知识与技能/第十三章 免疫系统常见疾病.md (`immune-diseases-y3`)

-   父→子 has 删除: immune-diseases-y3 --has→ ra-management（子将补 isa）
-   父→子 has 删除: immune-diseases-y3 --has→ sle-management（子将补 isa）

### 药学综合知识与技能/第十三章 免疫系统常见疾病/第一节 类风湿关节炎.md (`ra-management`)

-   子→父 has→isa: ra-management --has→ immune-diseases-y3

### 药学综合知识与技能/第十三章 免疫系统常见疾病/第二节 系统性红斑狼疮.md (`sle-management`)

-   子→父 has→isa: sle-management --has→ immune-diseases-y3

### 药学综合知识与技能/第十二章 内分泌系统常见疾病.md (`endocrine-diseases-y3`)

-   父→子 has 删除: endocrine-diseases-y3 --has→ hyperthyroidism-management（子将补 isa）
-   父→子 has 删除: endocrine-diseases-y3 --has→ hypothyroidism-management（子将补 isa）
-   父→子 has 删除: endocrine-diseases-y3 --has→ diabetes-management（子将补 isa）
-   父→子 has 删除: endocrine-diseases-y3 --has→ osteoporosis-management（子将补 isa）
-   父→子 has 删除: endocrine-diseases-y3 --has→ gout-management（子将补 isa）

### 药学综合知识与技能/第十二章 内分泌系统常见疾病/第一节 甲状腺功能亢进症.md (`hyperthyroidism-management`)

-   子→父 has→isa: hyperthyroidism-management --has→ endocrine-diseases-y3

### 药学综合知识与技能/第十二章 内分泌系统常见疾病/第三节 糖尿病.md (`diabetes-management`)

-   子→父 has→isa: diabetes-management --has→ endocrine-diseases-y3

### 药学综合知识与技能/第十二章 内分泌系统常见疾病/第二节 甲状腺功能减退症.md (`hypothyroidism-management`)

-   子→父 has→isa: hypothyroidism-management --has→ endocrine-diseases-y3

### 药学综合知识与技能/第十二章 内分泌系统常见疾病/第五节 高尿酸血症与痛风.md (`gout-management`)

-   子→父 has→isa: gout-management --has→ endocrine-diseases-y3

### 药学综合知识与技能/第十二章 内分泌系统常见疾病/第四节 骨质疏松症.md (`osteoporosis-management`)

-   子→父 has→isa: osteoporosis-management --has→ endocrine-diseases-y3

### 药学综合知识与技能/第十五章 肿瘤.md (`tumor-y3`)

-   父→子 has 删除: tumor-y3 --has→ tumor-clinical-basis（子将补 isa）
-   父→子 has 删除: tumor-y3 --has→ tumor-treatment-prevention（子将补 isa）

### 药学综合知识与技能/第十五章 肿瘤/第一节 肿瘤的临床基础.md (`tumor-clinical-basis`)

-   子→父 has→isa: tumor-clinical-basis --has→ tumor-y3

### 药学综合知识与技能/第十五章 肿瘤/第三节 肿瘤化疗管理.md (`tumor-chemotherapy-management`)

-   子→父 has→isa: tumor-chemotherapy-management --has→ tumor-y3

### 药学综合知识与技能/第十五章 肿瘤/第二节 肿瘤的治疗与预防.md (`tumor-treatment-prevention`)

-   子→父 has→isa: tumor-treatment-prevention --has→ tumor-y3

### 药学综合知识与技能/第十五章 肿瘤/第五节 肿瘤支持治疗管理.md (`tumor-supportive-care-management`)

-   子→父 has→isa: tumor-supportive-care-management --has→ tumor-y3

### 药学综合知识与技能/第十五章 肿瘤/第四节 肿瘤靶向治疗管理.md (`tumor-targeted-therapy-management`)

-   子→父 has→isa: tumor-targeted-therapy-management --has→ tumor-y3

### 药学综合知识与技能/第十四章 泌尿系统常见疾病.md (`urinary-diseases-y3`)

-   父→子 has 删除: urinary-diseases-y3 --has→ bph-management（子将补 isa）
-   父→子 has 删除: urinary-diseases-y3 --has→ ckd-management（子将补 isa）

### 药学综合知识与技能/第十四章 泌尿系统常见疾病/第一节 良性前列腺增生症.md (`bph-management`)

-   子→父 has→isa: bph-management --has→ urinary-diseases-y3

### 药学综合知识与技能/第十四章 泌尿系统常见疾病/第二节 慢性肾脏病.md (`ckd-management`)

-   子→父 has→isa: ckd-management --has→ urinary-diseases-y3

### 药学综合知识与技能/第十章 神经精神系统常见疾病.md (`cns-diseases-y3`)

-   父→子 has 删除: cns-diseases-y3 --has→ anxiety-depression（子将补 isa）
-   父→子 has 删除: cns-diseases-y3 --has→ insomnia-management（子将补 isa）
-   父→子 has 删除: cns-diseases-y3 --has→ stroke-management（子将补 isa）
-   父→子 has 删除: cns-diseases-y3 --has→ parkinson-management（子将补 isa）
-   父→子 has 删除: cns-diseases-y3 --has→ epilepsy-management（子将补 isa）
-   父→子 has 删除: cns-diseases-y3 --has→ dementia-management（子将补 isa）

### 药学综合知识与技能/第十章 神经精神系统常见疾病/第一节 焦虑抑郁.md (`anxiety-depression`)

-   子→父 has→isa: anxiety-depression --has→ cns-diseases-y3

### 药学综合知识与技能/第十章 神经精神系统常见疾病/第三节 脑卒中.md (`stroke-management`)

-   子→父 has→isa: stroke-management --has→ cns-diseases-y3

### 药学综合知识与技能/第十章 神经精神系统常见疾病/第二节 失眠症.md (`insomnia-management`)

-   子→父 has→isa: insomnia-management --has→ cns-diseases-y3

### 药学综合知识与技能/第十章 神经精神系统常见疾病/第五节 癫痫.md (`epilepsy-management`)

-   子→父 has→isa: epilepsy-management --has→ cns-diseases-y3

### 药学综合知识与技能/第十章 神经精神系统常见疾病/第六节 痴呆.md (`dementia-management`)

-   子→父 has→isa: dementia-management --has→ cns-diseases-y3

### 药学综合知识与技能/第十章 神经精神系统常见疾病/第四节 帕金森病.md (`parkinson-management`)

-   子→父 has→isa: parkinson-management --has→ cns-diseases-y3

### 药学综合知识与技能/第四章 用药安全.md (`drug-safety-y3`)

-   父→子 has 删除: drug-safety-y3 --has→ pharmacovigilance（子将补 isa）
-   父→子 has 删除: drug-safety-y3 --has→ adverse-drug-reactions（子将补 isa）
-   父→子 has 删除: drug-safety-y3 --has→ medication-errors（子将补 isa）

### 药学综合知识与技能/第四章 用药安全/第一节 药物警戒.md (`pharmacovigilance`)

-   子→父 has→isa: pharmacovigilance --has→ drug-safety-y3

### 药学综合知识与技能/第四章 用药安全/第三节 药源性疾病.md (`drug-induced-diseases`)

-   子→父 has→isa: drug-induced-diseases --has→ drug-safety-y3

### 药学综合知识与技能/第四章 用药安全/第二节 药品不良反应.md (`adverse-drug-reactions`)

-   子→父 has→isa: adverse-drug-reactions --has→ drug-safety-y3

### 药学综合知识与技能/第四章 用药安全/第四节 用药错误.md (`medication-errors`)

-   子→父 has→isa: medication-errors --has→ drug-safety-y3


_共 217 个文件的 edges_out 被改写。_

## 计划追加的 isa 边

| 文件 | from | to |
|---|---|---|
| `药学专业知识一/第一篇 药剂学.md` | `pharmaceutics-y1` | `pharm-knowledge-1` |
| `药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系.md` | `drug-quality-system-y1` | `pharmaceutics-y1` |
| `药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系/第一节 药物与药物制剂.md` | `drug-preparations-y1` | `drug-quality-system-y1` |
| `药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系/第二节 药品质量与质量体系.md` | `drug-quality-and-quality-systems` | `drug-quality-system-y1` |
| `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用.md` | `oral-drugs-y1` | `pharmaceutics-y1` |
| `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂.md` | `oral-solid-dosage-forms-y1` | `oral-drugs-y1` |
| `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/生物利用度.md` | `bioavailability-y1` | `oral-drugs-y1` |
| `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/缓释剂型.md` | `sustained-release-dosage-forms-y1` | `oral-drugs-y1` |
| `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/药物吸收.md` | `drug-absorption-y1` | `oral-drugs-y1` |
| `药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第二节 口服液体制剂.md` | `oral-liquid-dosage-forms-y1` | `oral-drugs-y1` |
| `药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用.md` | `topical-mucosal-drugs-y1` | `pharmaceutics-y1` |
| `药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用/第一节 皮肤给药制剂.md` | `topical-drug-delivery-y1` | `topical-mucosal-drugs-y1` |
| `药学专业知识一/第一篇 药剂学/第九章 皮肤和黏膜给药途径制剂与临床应用/第二节 黏膜给药制剂.md` | `mucosal-drug-delivery-y1` | `topical-mucosal-drugs-y1` |
| `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用.md` | `injection-preparations-y1` | `pharmaceutics-y1` |
| `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第一节 注射剂的质量控制.md` | `injection-quality-control-y1` | `injection-preparations-y1` |
| `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第三节 微粒制剂.md` | `particulate-injection-preparations-y1` | `injection-preparations-y1` |
| `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第二节 普通注射剂.md` | `common-injection-preparations-y1` | `injection-preparations-y1` |
| `药学专业知识一/第一篇 药剂学/第八章 注射剂与临床应用/第四节 生物技术药物注射剂.md` | `biotech-drug-injection-y1` | `injection-preparations-y1` |
| `药学专业知识一/第三篇 药物化学.md` | `medicinal-chemistry-y1` | `pharm-knowledge-1` |
| `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md` | `drug-structure-activity-y1` | `medicinal-chemistry-y1` |
| `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第一节 药物结构与药物活性.md` | `structure-activity-drugs-1-y1` | `drug-structure-activity-y1` |
| `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第七节 循环系统疾病药物.md` | `structure-activity-cardiovascular-y1` | `drug-structure-activity-y1` |
| `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第三节 中枢神经系统药物.md` | `structure-activity-cns-y1` | `drug-structure-activity-y1` |
| `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第九节 泌尿系统疾病药物.md` | `structure-activity-urinary-y1` | `drug-structure-activity-y1` |
| `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第二节 药物代谢.md` | `drug-metabolism-y1` | `drug-structure-activity-y1` |
| `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第五节 呼吸系统疾病药物.md` | `structure-activity-respiratory-y1` | `drug-structure-activity-y1` |
| `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第八节 内分泌系统疾病药物.md` | `structure-activity-endocrine-y1` | `drug-structure-activity-y1` |
| `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第六节 消化系统疾病药物.md` | `structure-activity-gi-y1` | `drug-structure-activity-y1` |
| `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第十一节 抗肿瘤药物.md` | `structure-activity-antitumor-y1` | `drug-structure-activity-y1` |
| `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第十节 抗感染药物.md` | `structure-activity-antibiotic-y1` | `drug-structure-activity-y1` |
| `药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用/第四节 解热镇痛及非甾体抗炎药物.md` | `structure-activity-analgesic-y1` | `drug-structure-activity-y1` |
| `药学专业知识一/第二篇 药理与毒理学.md` | `pharmacology-and-toxicology` | `pharm-knowledge-1` |
| `药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全.md` | `pharmacotoxicology-y1` | `pharmacology-and-toxicology` |
| `药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全/第一节 药物毒性与毒副作用.md` | `drug-toxicity-side-effects-y1` | `pharmacotoxicology-y1` |
| `药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全/第二节 药物应用的毒副作用与用药安全.md` | `drug-application-safety-y1` | `pharmacotoxicology-y1` |
| `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用.md` | `pharmacodynamics-y1` | `pharmacology-and-toxicology` |
| `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第一节 药物作用的两重性.md` | `drug-duality-y1` | `pharmacodynamics-y1` |
| `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第三节 药物的作用机制与靶点.md` | `mechanism-target-y1` | `pharmacodynamics-y1` |
| `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第二节 药物作用的量效和时效规律与评价.md` | `dose-time-effect` | `pharmacodynamics-y1` |
| `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第五节 遗传药理学与临床合理用药.md` | `pharmacogenetics-y1` | `pharmacodynamics-y1` |
| `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第六节 时辰药理学与临床合理用药.md` | `chronopharmacology-y1` | `pharmacodynamics-y1` |
| `药学专业知识一/第二篇 药理与毒理学/第四章 药物对机体的作用/第四节 药物相互作用.md` | `drug-interaction-y1` | `pharmacodynamics-y1` |
| `药学专业知识一/第五篇 生命药学.md` | `biopharmaceutics-y1` | `pharm-knowledge-1` |
| `药学专业知识一/第五篇 生命药学/第二章 生命药学.md` | `biopharmaceutics-chapter-y1` | `biopharmaceutics-y1` |
| `药学专业知识一/第五篇 生命药学/第二章 生命药学/第一节 人体生物分子的结构与功能.md` | `biomolecule-structure-function-y1` | `biopharmaceutics-chapter-y1` |
| `药学专业知识一/第五篇 生命药学/第二章 生命药学/第三节 感染与免疫.md` | `infection-immunity-y1` | `biopharmaceutics-chapter-y1` |
| `药学专业知识一/第五篇 生命药学/第二章 生命药学/第二节 人体代谢.md` | `human-metabolism-y1` | `biopharmaceutics-chapter-y1` |
| `药学专业知识一/第五篇 生命药学/第二章 生命药学/第四节 病理生理.md` | `pathophysiology-y1` | `biopharmaceutics-chapter-y1` |
| `药学专业知识一/第四篇 药动学.md` | `pharmacokinetics-y1` | `pharm-knowledge-1` |
| `药学专业知识一/第四篇 药动学/第三章 药物的体内过程.md` | `drug-disposition-processes` | `pharmacokinetics-y1` |
| `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第一节 药物与机体的相互作用.md` | `drug-absorption-process-y1` | `drug-disposition-processes` |
| `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第三节 药物的分布、代谢与排泄.md` | `drug-distribution-metabolism-excretion-y1` | `drug-disposition-processes` |
| `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第二节 药物的吸收.md` | `drug-absorption-pk-y1` | `drug-disposition-processes` |
| `药学专业知识一/第四篇 药动学/第三章 药物的体内过程/第四节 药物动力学与临床应用.md` | `pk-clinical-application-y1` | `drug-disposition-processes` |
| `药学专业知识二/第一章 精神与中枢神经系统用药/第一节 镇静催眠药、中枢肌松药.md` | `sedative-hypnotics-muscle-relaxants` | `cns-drugs-y2` |
| `药学专业知识二/第一章 精神与中枢神经系统用药/第七节 抗精神病药.md` | `antipsychotic-drugs` | `cns-drugs-y2` |
| `药学专业知识二/第一章 精神与中枢神经系统用药/第三节 抗抑郁药.md` | `antidepressant-drugs` | `cns-drugs-y2` |
| `药学专业知识二/第一章 精神与中枢神经系统用药/第二节 抗癫痫发作药物.md` | `antiepileptic-drugs` | `cns-drugs-y2` |
| `药学专业知识二/第一章 精神与中枢神经系统用药/第五节 中枢镇痛药.md` | `central-analgesics` | `cns-drugs-y2` |
| `药学专业知识二/第一章 精神与中枢神经系统用药/第六节 抗帕金森病药.md` | `antiparkinson-drugs` | `cns-drugs-y2` |
| `药学专业知识二/第一章 精神与中枢神经系统用药/第四节 抗记忆障碍及改善神经功能药.md` | `anti-dementia-drugs` | `cns-drugs-y2` |
| `药学专业知识二/第七章 泌尿系统用药/第一节 利尿药.md` | `section-diuretics` | `urinary-drugs-y2` |
| `药学专业知识二/第七章 泌尿系统用药/第三节 治疗良性前列腺增生用药.md` | `bph-drugs` | `urinary-drugs-y2` |
| `药学专业知识二/第七章 泌尿系统用药/第二节 治疗男性勃起功能障碍药.md` | `erectile-dysfunction-drugs` | `urinary-drugs-y2` |
| `药学专业知识二/第七章 泌尿系统用药/第四节 治疗膀胱过度活动症用药.md` | `oab-drugs` | `urinary-drugs-y2` |
| `药学专业知识二/第三章 呼吸系统用药/第一节 镇咳药.md` | `antitussives` | `respiratory-drugs-y2` |
| `药学专业知识二/第三章 呼吸系统用药/第三节 平喘药.md` | `anti-asthmatic-drugs` | `respiratory-drugs-y2` |
| `药学专业知识二/第三章 呼吸系统用药/第二节 祛痰药.md` | `expectorants` | `respiratory-drugs-y2` |
| `药学专业知识二/第三章 呼吸系统用药/第四节 特发性肺纤维化的治疗药物.md` | `ipf-drugs` | `respiratory-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第一节 抗菌药物总论.md` | `antibacterial-general` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第七节 喹诺酮类与磺胺类抗菌药物.md` | `quinolones-sulfonamides` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第三节 头孢菌素类抗菌药物.md` | `cephalosporins` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第九节 糖肽类与其他抗菌药物.md` | `glycopeptides` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第二节 青霉素类抗菌药物.md` | `penicillins` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第五节 氨基糖苷类与四环素类抗菌药物.md` | `aminoglycosides-tetracyclines` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第八节 硝基呋喃类与硝基咪唑类抗菌药物.md` | `nitrofurans-nitroimidazoles` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第六节 大环内酯类、林可霉素类与酰胺醇类抗菌药物.md` | `macrolides` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第十一节 抗真菌药.md` | `antifungals` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第十七节 抗原虫药和抗蠕虫药.md` | `antiprotozoal-antihelminthic` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第十三节 抗流感病毒药.md` | `anti-influenza` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第十二节 抗（人）疱疹病毒药物.md` | `anti-herpesvirus` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第十五节 抗肝炎病毒药物.md` | `anti-hepatitis` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第十六节 抗艾滋病病毒药物.md` | `anti-hiv` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第十四节 抗新型冠状病毒药.md` | `anti-covid` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第十节 抗结核分枝杆菌药.md` | `antimycobacterial-drugs` | `antiinfective-drugs-y2` |
| `药学专业知识二/第九章 抗感染药物/第四节 β-内酰胺酶抑制剂、碳青霉烯类与其他β-内酰胺类抗菌药物.md` | `beta-lactamase-carbapenems` | `antiinfective-drugs-y2` |
| `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第一节 解热、镇痛、抗炎药.md` | `antipyretic-analgesic-antiinflammatory` | `analgesic-antiinflammatory-y2` |
| `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第三节 抗痛风药.md` | `antigout-drugs` | `analgesic-antiinflammatory-y2` |
| `药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药/第二节 抗风湿药.md` | `anti-inflammatory-antirheumatic-drugs` | `analgesic-antiinflammatory-y2` |
| `药学专业知识二/第五章 心血管系统用药/第一节 抗心律失常药.md` | `section-antiarrhythmics` | `cardiovascular-drugs-y2` |
| `药学专业知识二/第五章 心血管系统用药/第三节 调节血脂药.md` | `lipid-regulators` | `cardiovascular-drugs-y2` |
| `药学专业知识二/第五章 心血管系统用药/第二节 抗高血压药.md` | `section-antihypertensives` | `cardiovascular-drugs-y2` |
| `药学专业知识二/第五章 心血管系统用药/第五节 抗心力衰竭药.md` | `section-antihypertensive-heart-failure` | `cardiovascular-drugs-y2` |
| `药学专业知识二/第五章 心血管系统用药/第四节 抗心绞痛药.md` | `section-antianginals` | `cardiovascular-drugs-y2` |
| `药学专业知识二/第八章 内分泌系统用药/第一节 下丘脑-垂体激素及相关药物.md` | `hypothalamic-pituitary-drugs` | `endocrine-drugs-y2` |
| `药学专业知识二/第八章 内分泌系统用药/第七节 性激素类.md` | `sex-hormones` | `endocrine-drugs-y2` |
| `药学专业知识二/第八章 内分泌系统用药/第三节 甲状腺激素类药物与抗甲状腺药物.md` | `thyroid-drugs` | `endocrine-drugs-y2` |
| `药学专业知识二/第八章 内分泌系统用药/第二节 肾上腺糖皮质激素类药物.md` | `glucocorticoids` | `endocrine-drugs-y2` |
| `药学专业知识二/第八章 内分泌系统用药/第五节 调节骨代谢药物.md` | `bone-metabolism-drugs` | `endocrine-drugs-y2` |
| `药学专业知识二/第八章 内分泌系统用药/第六节 减重药.md` | `weight-management-drugs` | `endocrine-drugs-y2` |
| `药学专业知识二/第八章 内分泌系统用药/第四节 胰岛素与其他影响血糖的药物.md` | `antidiabetic-drugs` | `endocrine-drugs-y2` |
| `药学专业知识二/第六章 血液系统用药/第一节 抗血栓药.md` | `antithrombotic-drugs` | `hematologic-drugs-y2` |
| `药学专业知识二/第六章 血液系统用药/第三节 抗贫血药.md` | `antianemics` | `hematologic-drugs-y2` |
| `药学专业知识二/第六章 血液系统用药/第二节 抗出血药.md` | `hemostatic-drugs` | `hematologic-drugs-y2` |
| `药学专业知识二/第六章 血液系统用药/第五节 骨髓保护药.md` | `bone-marrow-protective-drugs` | `hematologic-drugs-y2` |
| `药学专业知识二/第六章 血液系统用药/第四节 升白细胞药.md` | `leukocyte-stimulants` | `hematologic-drugs-y2` |
| `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第一节 糖类、盐类、酸碱平衡调节药.md` | `fluids-electrolytes` | `nutrition-drugs-y2` |
| `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第三节 肠内营养药.md` | `ent-nutrition` | `nutrition-drugs-y2` |
| `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第二节 微量元素与维生素.md` | `vitamins-minerals` | `nutrition-drugs-y2` |
| `药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药/第四节 肠外营养药.md` | `pn-drugs` | `nutrition-drugs-y2` |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第一节 体外杀寄生虫与皮肤感染治疗药.md` | `parasitic-skin-drugs` | `dermatology-drugs-y2` |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第七节 妇科外用药.md` | `gynecological-dermatology` | `dermatology-drugs-y2` |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第三节 痤疮治疗药.md` | `acne-drugs` | `dermatology-drugs-y2` |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第九节 抗过敏药.md` | `antihistamines` | `dermatology-drugs-y2` |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第二节 局部用抗真菌药.md` | `topical-antifungal` | `dermatology-drugs-y2` |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第五节 治疗白癜风药.md` | `vitiligo-drugs` | `dermatology-drugs-y2` |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第八节 消毒防腐药.md` | `disinfectants` | `dermatology-drugs-y2` |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第六节 治疗银屑病药.md` | `psoriasis-drugs` | `dermatology-drugs-y2` |
| `药学专业知识二/第十三章 皮肤用药及抗过敏用药/第四节 外用糖皮质激素.md` | `topical-corticosteroids` | `dermatology-drugs-y2` |
| `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第一节 眼科用药.md` | `ophthalmic-drugs` | `ent-drugs-y2` |
| `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第三节 口腔科用药.md` | `oral-drugs` | `ent-drugs-y2` |
| `药学专业知识二/第十二章 眼科用药、耳鼻咽喉科用药及口腔科用药/第二节 耳鼻咽喉科用药.md` | `ent-drugs` | `ent-drugs-y2` |
| `药学专业知识二/第十章 抗肿瘤药/第一节 直接影响DNA结构和功能的药物.md` | `direct-dna-acting-antitumor` | `antitumor-drugs-y2` |
| `药学专业知识二/第十章 抗肿瘤药/第七节 其他抗肿瘤药物.md` | `other-antitumor` | `antitumor-drugs-y2` |
| `药学专业知识二/第十章 抗肿瘤药/第三节 干扰转录过程和阻止RNA合成的药物（作用于核酸转录药物）.md` | `rna-synthesis-antitumor` | `antitumor-drugs-y2` |
| `药学专业知识二/第十章 抗肿瘤药/第二节 干扰核酸生物合成的药物（抗代谢药）.md` | `antimetabolite-antitumor` | `antitumor-drugs-y2` |
| `药学专业知识二/第十章 抗肿瘤药/第五节 调节体内激素平衡的药物.md` | `hormonal-antitumor` | `antitumor-drugs-y2` |
| `药学专业知识二/第十章 抗肿瘤药/第六节 生物靶向治疗药物.md` | `biological-targeted-antitumor` | `antitumor-drugs-y2` |
| `药学专业知识二/第十章 抗肿瘤药/第四节 干扰有丝分裂的药物.md` | `mitotic-inhibitor-antitumor` | `antitumor-drugs-y2` |
| `药学专业知识二/第四章 消化系统用药/第一节 抑酸剂、抗酸药与胃黏膜保护药.md` | `antiacid-mucosal-protectants` | `gi-drugs-y2` |
| `药学专业知识二/第四章 消化系统用药/第七节 助消化药.md` | `digestive-enzymes` | `gi-drugs-y2` |
| `药学专业知识二/第四章 消化系统用药/第三节 止吐药.md` | `antiemetics` | `gi-drugs-y2` |
| `药学专业知识二/第四章 消化系统用药/第二节 解痉药、胃肠动力药与功能性胃肠病治疗药.md` | `antispasmodic-prokinetic-functional-gi` | `gi-drugs-y2` |
| `药学专业知识二/第四章 消化系统用药/第五节 泻药与便秘治疗药.md` | `laxatives-constipation-drugs` | `gi-drugs-y2` |
| `药学专业知识二/第四章 消化系统用药/第六节 止泻药、肠道抗感染药、肠道抗炎药.md` | `antidiarrheal-intestinal-antiinfective-antiinflammatory` | `gi-drugs-y2` |
| `药学专业知识二/第四章 消化系统用药/第四节 肝胆疾病用药.md` | `hepatobiliary-drugs` | `gi-drugs-y2` |
| `药学综合知识与技能/第一章 药学服务与药品管理/第一节 药学服务与执业药师.md` | `pharmacy-services-pharmacist` | `pharmacy-services-drug-management` |
| `药学综合知识与技能/第一章 药学服务与药品管理/第二节 药品管理.md` | `drug-management` | `pharmacy-services-drug-management` |
| `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第一节 药学信息咨询服务.md` | `drug-information` | `drug-consultation-y3` |
| `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第三节 药物治疗管理.md` | `mtm` | `drug-consultation-y3` |
| `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第二节 疾病管理与健康宣教.md` | `disease-management` | `drug-consultation-y3` |
| `药学综合知识与技能/第三章 用药咨询与药物治疗管理/第四节 常用医学检查.md` | `medical-checks` | `drug-consultation-y3` |
| `药学综合知识与技能/第九章 心血管系统常见疾病/第一节 高血压.md` | `hypertension-management` | `cardiovascular-diseases-y3` |
| `药学综合知识与技能/第九章 心血管系统常见疾病/第三节 冠状动脉粥样硬化性心脏病.md` | `coronary-heart-disease` | `cardiovascular-diseases-y3` |
| `药学综合知识与技能/第九章 心血管系统常见疾病/第二节 血脂异常.md` | `lipid-disorders-management` | `cardiovascular-diseases-y3` |
| `药学综合知识与技能/第九章 心血管系统常见疾病/第四节 心房颤动.md` | `atrial-fibrillation` | `cardiovascular-diseases-y3` |
| `药学综合知识与技能/第二章 处方审核与调剂/第一节 处方审核.md` | `prescription-review` | `prescription-review-y3` |
| `药学综合知识与技能/第二章 处方审核与调剂/第二节 调剂操作.md` | `dispensing` | `prescription-review-y3` |
| `药学综合知识与技能/第五章 急救、中毒解救及职业防护/第一节 急救的意义与原则.md` | `concept-ch5-s1` | `chapter-emergency-poisoning` |
| `药学综合知识与技能/第五章 急救、中毒解救及职业防护/第三节 中毒解救.md` | `concept-ch5-s3` | `chapter-emergency-poisoning` |
| `药学综合知识与技能/第五章 急救、中毒解救及职业防护/第二节 常见急症及处置.md` | `concept-ch5-s2` | `chapter-emergency-poisoning` |
| `药学综合知识与技能/第八章 呼吸系统常见疾病/第一节 哮喘.md` | `asthma-management` | `respiratory-diseases-y3` |
| `药学综合知识与技能/第八章 呼吸系统常见疾病/第二节 慢性阻塞性肺疾病.md` | `copd-management` | `respiratory-diseases-y3` |
| `药学综合知识与技能/第六章 常见病症的健康管理/第一节 发热与疼痛.md` | `fever-pain` | `common-conditions-y3` |
| `药学综合知识与技能/第六章 常见病症的健康管理/第七节 其他病症.md` | `other-conditions` | `common-conditions-y3` |
| `药学综合知识与技能/第六章 常见病症的健康管理/第三节 消化系统问题.md` | `gi-problems` | `common-conditions-y3` |
| `药学综合知识与技能/第六章 常见病症的健康管理/第二节 呼吸系统问题.md` | `respiratory-problems` | `common-conditions-y3` |
| `药学综合知识与技能/第六章 常见病症的健康管理/第五节 皮肤及黏膜系统问题.md` | `skin-mucosal` | `common-conditions-y3` |
| `药学综合知识与技能/第六章 常见病症的健康管理/第六节 眼睛问题.md` | `eye-problems` | `common-conditions-y3` |
| `药学综合知识与技能/第六章 常见病症的健康管理/第四节 泌尿生殖系统问题.md` | `urogenital-problems` | `common-conditions-y3` |
| `药学综合知识与技能/第十一章 消化系统常见疾病/第一节 胃食管反流病.md` | `gerd-management` | `gi-diseases-y3` |
| `药学综合知识与技能/第十一章 消化系统常见疾病/第三节 溃疡性结肠炎.md` | `ibd-management` | `gi-diseases-y3` |
| `药学综合知识与技能/第十一章 消化系统常见疾病/第二节 消化性溃疡.md` | `peptic-ulcer-management` | `gi-diseases-y3` |
| `药学综合知识与技能/第十一章 消化系统常见疾病/第四节 慢性病毒性肝炎.md` | `chronic-hepatitis-management` | `gi-diseases-y3` |
| `药学综合知识与技能/第十三章 免疫系统常见疾病/第一节 类风湿关节炎.md` | `ra-management` | `immune-diseases-y3` |
| `药学综合知识与技能/第十三章 免疫系统常见疾病/第二节 系统性红斑狼疮.md` | `sle-management` | `immune-diseases-y3` |
| `药学综合知识与技能/第十二章 内分泌系统常见疾病/第一节 甲状腺功能亢进症.md` | `hyperthyroidism-management` | `endocrine-diseases-y3` |
| `药学综合知识与技能/第十二章 内分泌系统常见疾病/第三节 糖尿病.md` | `diabetes-management` | `endocrine-diseases-y3` |
| `药学综合知识与技能/第十二章 内分泌系统常见疾病/第二节 甲状腺功能减退症.md` | `hypothyroidism-management` | `endocrine-diseases-y3` |
| `药学综合知识与技能/第十二章 内分泌系统常见疾病/第五节 高尿酸血症与痛风.md` | `gout-management` | `endocrine-diseases-y3` |
| `药学综合知识与技能/第十二章 内分泌系统常见疾病/第四节 骨质疏松症.md` | `osteoporosis-management` | `endocrine-diseases-y3` |
| `药学综合知识与技能/第十五章 肿瘤/第一节 肿瘤的临床基础.md` | `tumor-clinical-basis` | `tumor-y3` |
| `药学综合知识与技能/第十五章 肿瘤/第三节 肿瘤化疗管理.md` | `tumor-chemotherapy-management` | `tumor-y3` |
| `药学综合知识与技能/第十五章 肿瘤/第二节 肿瘤的治疗与预防.md` | `tumor-treatment-prevention` | `tumor-y3` |
| `药学综合知识与技能/第十五章 肿瘤/第五节 肿瘤支持治疗管理.md` | `tumor-supportive-care-management` | `tumor-y3` |
| `药学综合知识与技能/第十五章 肿瘤/第四节 肿瘤靶向治疗管理.md` | `tumor-targeted-therapy-management` | `tumor-y3` |
| `药学综合知识与技能/第十四章 泌尿系统常见疾病/第一节 良性前列腺增生症.md` | `bph-management` | `urinary-diseases-y3` |
| `药学综合知识与技能/第十四章 泌尿系统常见疾病/第二节 慢性肾脏病.md` | `ckd-management` | `urinary-diseases-y3` |
| `药学综合知识与技能/第十章 神经精神系统常见疾病/第一节 焦虑抑郁.md` | `anxiety-depression` | `cns-diseases-y3` |
| `药学综合知识与技能/第十章 神经精神系统常见疾病/第三节 脑卒中.md` | `stroke-management` | `cns-diseases-y3` |
| `药学综合知识与技能/第十章 神经精神系统常见疾病/第二节 失眠症.md` | `insomnia-management` | `cns-diseases-y3` |
| `药学综合知识与技能/第十章 神经精神系统常见疾病/第五节 癫痫.md` | `epilepsy-management` | `cns-diseases-y3` |
| `药学综合知识与技能/第十章 神经精神系统常见疾病/第六节 痴呆.md` | `dementia-management` | `cns-diseases-y3` |
| `药学综合知识与技能/第十章 神经精神系统常见疾病/第四节 帕金森病.md` | `parkinson-management` | `cns-diseases-y3` |
| `药学综合知识与技能/第四章 用药安全/第一节 药物警戒.md` | `pharmacovigilance` | `drug-safety-y3` |
| `药学综合知识与技能/第四章 用药安全/第三节 药源性疾病.md` | `drug-induced-diseases` | `drug-safety-y3` |
| `药学综合知识与技能/第四章 用药安全/第二节 药品不良反应.md` | `adverse-drug-reactions` | `drug-safety-y3` |
| `药学综合知识与技能/第四章 用药安全/第五节 特殊人群用药.md` | `special-population-medications` | `drug-safety-y3` |
| `药学综合知识与技能/第四章 用药安全/第四节 用药错误.md` | `medication-errors` | `drug-safety-y3` |

