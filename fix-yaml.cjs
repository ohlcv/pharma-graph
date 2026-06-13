const fs = require('fs');

const files = [
  'content/药学专业知识一/第一篇 药剂学/第一章 药物与药品质量体系.md',
  'content/药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/首过效应.md',
  'content/药学专业知识一/第三篇 药物化学/第六章 药物的结构与作用.md',
  'content/药学专业知识一/第三篇 药物化学.md',
  'content/药学专业知识一/第二篇 药理与毒理学/第五章 药物毒性与用药安全.md',
  'content/药学综合知识与技能/第一章 药学服务与药品管理.md',
  'content/药学综合知识与技能/第三章 用药咨询与药物治疗管理.md',
  'content/药学综合知识与技能/第二章 处方审核与调剂.md',
  'content/药学综合知识与技能/第五章 急救、中毒解救及职业防护.md',
  'content/药学综合知识与技能/第六章 常见病症的健康管理.md',
  'content/药学综合知识与技能/第十三章 免疫系统常见疾病.md',
  'content/药学综合知识与技能/第十五章 肿瘤.md',
  'content/药学综合知识与技能/第四章 用药安全.md'
];

let fixed = 0;
for (const f of files) {
  try {
    let raw = fs.readFileSync(f, 'utf8');
    let original = raw;

    // 在 summary.full 块后面（缩进6个空格）- target: 前面插入 edges_out:
    // 匹配: "    full: ...\n    - target:"
    raw = raw.replace(
      /^(    full: [^$\n]+\.)\n {6}(- target:)/gm,
      '$1\nedges_out:\n  $2'
    );

    if (raw !== original) {
      fs.writeFileSync(f, raw);
      fixed++;
      console.log('已修复:', f);
    }
  } catch (e) {
    console.log('错误:', f, e.message);
  }
}
console.log('总计修复:', fixed, '个文件');
