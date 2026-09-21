// 批量修复含 YAML anchor/alias 的文件
// 1. 删除第二个 edges_out: (顶级) 块
// 2. 展开 *alias 引用到第一个 edges_out: 块中
// 3. 清理 &anchor 标记
const fs = require('fs');
const path = require('path');

const root = 'c:/Users/GALAX/Desktop/pharma-graph';

const files = [
  'content/药学专业知识二/第十一章 调节水、电解质、酸碱平衡与营养用药.md',
  'content/药学专业知识二/第二章 解热、镇痛、抗炎、抗风湿及抗痛风药.md',
  'content/药学专业知识二/第六章 血液系统用药.md',
  'content/药学专业知识二/第十章 抗肿瘤药.md',
  'content/药学专业知识二/第八章 内分泌系统用药.md',
  'content/药学专业知识二/第七章 泌尿系统用药.md',
  'content/药学专业知识二/第三章 呼吸系统用药.md',
  'content/药学专业知识二/第四章 消化系统用药.md',
  'content/药学专业知识二/第五章 心血管系统用药.md',
  'content/药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂.md',
  'content/药学专业知识一/第四篇 药动学.md',
  'content/药学专业知识一/第一篇 药剂学/第七章 口服制剂与临床应用/第一节 口服固体制剂/首过效应.md',
  'content/药学综合知识与技能/第四章 用药安全.md',
  'content/药学综合知识与技能/第十五章/肿瘤.md',
  'content/药学综合知识与技能/第十三章/免疫系统常见疾病.md',
  'content/药学综合知识与技能/第六章/常见病症的健康管理.md',
  'content/药学综合知识与技能/第五章/急救、中毒解救及职业防护.md',
  'content/药学综合知识与技能/第二章/处方审核与调剂.md',
  'content/药学综合知识与技能/第三章/用药咨询与药物治疗管理.md',
  'content/药学综合知识与技能/第一章/药学服务与药品管理.md',
  'content/药学专业知识一/第二篇/药理与毒理学/第五章/药物毒性与用药安全.md',
  'content/药学专业知识一/第三篇/药物化学.md',
  'content/药学专业知识一/第三篇/药物化学/第六章/药物的结构与作用.md',
  'content/药学专业知识一/第一篇/药剂学/第一章/药物与药品质量体系.md',
];

function fixFile(fullPath) {
  let content;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch (e) {
    // Try reading as buffer and detect
    const buf = fs.readFileSync(fullPath);
    // Detect if it's GBK
    const str = buf.toString('utf8');
    if (str.includes('\ufffd') || !str.includes('data:')) {
      // Likely GBK, try latin1 as approximation
      content = buf.toString('latin1');
    } else {
      content = str;
    }
  }

  const lines = content.split('\n');

  // 找到 frontmatter 结束行（第二个 ---）
  let dashCount = 0;
  let fmCloseLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      dashCount++;
      if (dashCount === 2) { fmCloseLine = i; break; }
    }
  }
  if (fmCloseLine === -1) return 'NO_FM';

  // 找到 data 块内的 edges_out 开始行和其内部的 anchor 定义
  let dataEdgesStart = -1;
  let anchorLines = {}; // anchorName -> lines of content (without the &anchor line itself)
  for (let i = 0; i < fmCloseLine; i++) {
    const t = lines[i].trim();
    if (t.startsWith('edges_out:')) {
      dataEdgesStart = i;
      // 在这个块里找 anchor 定义
      let depth = 0;
      let itemStart = -1;
      for (let j = i; j < fmCloseLine; j++) {
        const lt = lines[j];
        if (lt.trim().startsWith('edges_out:')) {
          if (depth === 0) { depth = 1; itemStart = -1; }
        }
        const m = lt.trim().match(/^-\s*&(\w+)$/);
        if (m && depth === 1) {
          const anchorName = m[1];
          itemStart = j;
          // 收集这个 item 的后续行（缩进比 dash 更深）
          const baseIndent = lt.match(/^(\s*)/)[1].length;
          const contentLines = [];
          for (let k = j + 1; k < fmCloseLine; k++) {
            const kt = lines[k];
            const ktIndent = kt.match(/^(\s*)/)[1].length;
            if (kt.trim() === '' || (ktIndent > baseIndent && !kt.trim().startsWith('- '))) {
              contentLines.push(lines[k]);
            } else {
              break;
            }
          }
          anchorLines[anchorName] = { dashLine: lines[j], contentLines };
        }
      }
      break;
    }
  }

  if (dataEdgesStart === -1) return 'NO_DATA_EDGES';

  // 找到第二个 edges_out: (frontmatter 之后)
  let topEdgesStart = -1;
  let topEdgesEnd = -1;
  for (let i = fmCloseLine + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('edges_out:')) {
      topEdgesStart = i;
      for (let j = i + 1; j < lines.length; j++) {
        const lt = lines[j];
        if (lt.trim() === '---') { topEdgesEnd = j - 1; break; }
        // 遇到非缩进行
        if (lt.length > 0 && !lt.startsWith(' ') && !lt.startsWith('\t') && !lt.trim().startsWith('-')) {
          topEdgesEnd = j - 1; break;
        }
        if (j === lines.length - 1) topEdgesEnd = j;
      }
      break;
    }
  }

  if (topEdgesStart === -1) return 'NO_TOP_EDGES';

  // 构建第二个 edges_out 块的展开版本
  const topBlock = lines.slice(topEdgesStart, topEdgesEnd + 1);
  const expandedTopLines = [];
  for (const line of topBlock) {
    const aliasMatch = line.trim().match(/^-\s*\*(\w+)$/);
    if (aliasMatch) {
      const aliasName = aliasMatch[1];
      if (anchorLines[aliasName]) {
        const a = anchorLines[aliasName];
        expandedTopLines.push(a.dashLine); // 还原成普通 dash
        expandedTopLines.push(...a.contentLines);
      }
    } else {
      expandedTopLines.push(line);
    }
  }

  // 清理 data edges_out 中的 &anchor 标记
  // 直接修改 lines
  const newLines = [...lines];

  // 清理 anchor 标记（在 data 块内）
  for (let j = dataEdgesStart; j < fmCloseLine; j++) {
    if (newLines[j].trim().match(/^-\s*&(\w+)$/)) {
      newLines[j] = newLines[j].replace(/^(\s*-\s*)&(\w+)/, '$1');
    }
  }

  // 删除第二个 edges_out 块，替换为展开版本
  newLines.splice(topEdgesStart, topEdgesEnd - topEdgesStart + 1, ...expandedTopLines);

  // 验证：只有一处 edges_out
  const joined = newLines.join('\n');
  const count = (joined.match(/^edges_out:/gm) || []).length;
  if (count !== 1) {
    return 'BAD_COUNT:' + count;
  }

  fs.writeFileSync(fullPath, joined, 'utf8');
  return 'OK';
}

let ok = 0, err = 0;
for (const relPath of files) {
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) {
    // Try with backslashes
    const altPath = fullPath.replace(/\//g, '\\');
    if (!fs.existsSync(altPath)) {
      console.log('NOT FOUND: ' + relPath);
      continue;
    }
    const result = fixFile(altPath);
    if (result === 'OK') { console.log('Fixed: ' + relPath); ok++; }
    else { console.log('Error ' + result + ': ' + relPath); err++; }
  } else {
    const result = fixFile(fullPath);
    if (result === 'OK') { console.log('Fixed: ' + relPath); ok++; }
    else { console.log('Error ' + result + ': ' + relPath); err++; }
  }
}
console.log('\nDone: ' + ok + ' fixed, ' + err + ' errors');
