const fs = require('fs');
const yaml = require('yaml');
const path = require('path');

// 需要修复的文件列表
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
  'content/药学综合知识与技能/第十五章 肿瘤.md'
];

let fixed = 0;
let stillErrors = [];

for (const f of files) {
  try {
    const raw = fs.readFileSync(f, 'utf8');
    
    // 检查是否仍然有错误
    try {
      const yamlStr = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
      if (yamlStr) yaml.parse(yamlStr);
      continue; // 如果没有错误，跳过
    } catch (e) {
      // 继续修复
    }
    
    let modified = raw;
    
    // 修复: summary.full 结束后直接跟 - target: 的情况
    // 在 full: ...\n    - target: 前插入 edges_out:
    modified = modified.replace(
      /(    full: [^$\n]+\.[^$\n]*)\n    (- target:)/g,
      '$1\nedges_out:\n  $2'
    );
    
    // 修复: summary.short 结束后直接跟 - target: 的情况
    modified = modified.replace(
      /(    short: [^$\n]+\.[^$\n]*)\n    (- target:)/g,
      '$1\nedges_out:\n  $2'
    );
    
    if (modified !== raw) {
      fs.writeFileSync(f, modified);
      fixed++;
      console.log('已修复:', f);
      
      // 验证
      try {
        const yamlStr = modified.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
        yaml.parse(yamlStr);
        console.log('  ✓ YAML 验证通过');
      } catch (e) {
        console.log('  ✗ 仍然有错误:', e.message.substring(0, 60));
        stillErrors.push(f);
      }
    }
  } catch (e) {
    console.log('文件错误:', f, e.message);
  }
}

console.log('\n总计修复:', fixed, '个文件');
if (stillErrors.length > 0) {
  console.log('仍有错误:', stillErrors.length, '个');
}
