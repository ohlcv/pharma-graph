// scripts/audit-and-fix-ids.ts
// 1. 检查所有 id 是否为英文
// 2. 检查所有 edges_out.target 是否指向真实存在的 id
// 3. 生成修复报告（不自动修改，由用户确认后执行）

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { parse as yamlParse } from 'yaml';

const CONTENT_DIR = path.resolve('public/content');

interface EdgeDef { target: string; type: string; reason?: string; }
interface ParsedFM {
  id?: string;
  label?: string;
  essence?: string;
  level?: string | number;
  summary?: { short?: string; full?: string };
  location?: Record<string, string>;
  tags?: string[];
  edges_out?: EdgeDef[];
}

function parseFile(content: string): ParsedFM & { edgesFromRoot: EdgeDef[] } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { edgesFromRoot: [] };

  let root: Record<string, unknown> = {};
  try {
    const parsed = yamlParse(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      root = parsed as Record<string, unknown>;
    }
  } catch { /* ignore */ }

  const fm = (root['data'] && typeof root['data'] === 'object' && !Array.isArray(root['data']))
    ? (root['data'] as Record<string, unknown>)
    : root;

  const rootEdges = (root['edges_out'] as unknown[]) ?? [];
  const dataEdges = (fm['edges_out'] as unknown[]) ?? [];
  const edgesRaw = rootEdges.length > 0 ? rootEdges : dataEdges;
  const edges: EdgeDef[] = Array.isArray(edgesRaw)
    ? edgesRaw.filter((e): e is Record<string, unknown> =>
        typeof e === 'object' && e !== null && !Array.isArray(e) &&
        typeof e['target'] === 'string')
    : [];

  return { ...(fm as ParsedFM), edgesFromRoot: edges };
}

function isEnglishId(id: string): boolean {
  if (!id) return false;
  return /^[a-zA-Z0-9_\-]+$/.test(id);
}

async function main() {
  const files = await glob('**/*.md', { cwd: CONTENT_DIR, absolute: false });
  files.sort((a, b) => a.localeCompare(b));

  interface NodeInfo {
    file: string;
    id: string;
    label: string;
    edges: EdgeDef[];
  }

  const nodes: NodeInfo[] = [];

  for (const file of files) {
    const fullPath = path.join(CONTENT_DIR, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const fm = parseFile(content);
      const id = fm.id ?? '';
      const label = fm.label ?? '';
      const edges = (fm.edges_out ?? fm.edgesFromRoot) as EdgeDef[];
      nodes.push({ file, id, label, edges });
    } catch (e) {
      nodes.push({ file, id: 'PARSE_ERROR', label: '', edges: [] });
    }
  }

  const allIds = new Set(nodes.map(n => n.id).filter(id => id && id !== 'PARSE_ERROR'));
  const idToNode = new Map(nodes.map(n => [n.id, n]));

  console.log(`\n=== 总览 ===`);
  console.log(`节点总数: ${nodes.length}`);
  console.log(`有效 ID 数: ${allIds.size}`);
  console.log(`ID 重复: ${nodes.length - allIds.size - (nodes.filter(n => !n.id || n.id === 'PARSE_ERROR').length)}`);

  // 问题1: 非英文ID
  const nonEnglishIds = nodes.filter(n => n.id && !isEnglishId(n.id));
  console.log(`\n=== 问题1: 非英文 ID (${nonEnglishIds.length} 个) ===`);
  nonEnglishIds.forEach(n => {
    console.log(`  ❌ ${n.file}`);
    console.log(`     id="${n.id}" label="${n.label}"`);
  });

  // 问题2: 缺失ID
  const missingId = nodes.filter(n => !n.id || n.id === 'PARSE_ERROR');
  console.log(`\n=== 问题2: 缺失或错误 ID (${missingId.length} 个) ===`);
  missingId.forEach(n => {
    console.log(`  ❌ ${n.file} (解析结果: "${n.id}")`);
  });

  // 问题3: ID重复
  const idCount = new Map<string, NodeInfo[]>();
  nodes.forEach(n => {
    if (n.id && n.id !== 'PARSE_ERROR') {
      if (!idCount.has(n.id)) idCount.set(n.id, []);
      idCount.get(n.id)!.push(n);
    }
  });
  const duplicates = [...idCount.entries()].filter(([, v]) => v.length > 1);
  console.log(`\n=== 问题3: ID 重复 (${duplicates.length} 组) ===`);
  duplicates.forEach(([id, arr]) => {
    console.log(`  ❌ id="${id}" 出现 ${arr.length} 次:`);
    arr.forEach(n => console.log(`     - ${n.file} (label="${n.label}")`));
  });

  // 问题4: 悬空边
  const danglingEdges: { file: string; id: string; label: string; edge: EdgeDef }[] = [];
  nodes.forEach(n => {
    n.edges.forEach(edge => {
      if (!allIds.has(edge.target)) {
        danglingEdges.push({ file: n.file, id: n.id, label: n.label, edge });
      }
    });
  });
  console.log(`\n=== 问题4: 悬空边 (${danglingEdges.length} 条) ===`);
  danglingEdges.forEach(({ file, id, label, edge }) => {
    console.log(`  ❌ ${file}`);
    console.log(`     id="${id}" label="${label}" → ${edge.target} (${edge.type})`);
  });

  // 生成修复建议
  console.log(`\n=== 修复建议 ===`);

  // 非英文ID修复建议
  if (nonEnglishIds.length > 0) {
    console.log('\n## 非英文 ID 修复建议:');
    nonEnglishIds.forEach(n => {
      // 简单转换: 中文/拼音 → 英文
      const suggested = suggestEnglishId(n.label, n.file);
      console.log(`  - ${n.file}: "${n.id}" → "${suggested}"`);
    });
  }

  // 悬空边修复建议
  if (danglingEdges.length > 0) {
    console.log('\n## 悬空边修复建议:');
    danglingEdges.forEach(({ file, edge }) => {
      // 找到最接近的候选ID
      const candidates = findSimilarIds(edge.target, allIds);
      console.log(`  - ${file}: "${edge.target}" 无对应节点`);
      if (candidates.length > 0) {
        console.log(`    可能的候选: ${candidates.join(', ')}`);
      }
    });
  }

  // 输出所有ID列表供参考
  console.log(`\n=== 所有有效 ID 列表 ===`);
  [...allIds].sort().forEach(id => console.log(`  ${id}`));

  fs.writeFileSync('docs/audit-report.md', generateReport(nodes, nonEnglishIds, duplicates, danglingEdges, allIds), 'utf8');
  console.log('\n报告已保存到 docs/audit-report.md');
}

function suggestEnglishId(label: string, file: string): string {
  // 常见中文词根映射
  const map: Record<string, string> = {
    '药学专业知识一': 'book-yaoxue-yi',
    '药学专业知识二': 'book-yaoxue-er',
    '药学综合知识与技能': 'book-yaoxue-zonghe',
    '精神与中枢神经系统用药': 'cns-drugs',
    '第一章': 'chapter-01',
    '第二章': 'chapter-02',
    '第三章': 'chapter-03',
    '第四章': 'chapter-04',
    '第五章': 'chapter-05',
    '第六章': 'chapter-06',
    '第七章': 'chapter-07',
    '第八章': 'chapter-08',
    '第九章': 'chapter-09',
    '第十章': 'chapter-10',
    '第十一章': 'chapter-11',
    '第十二章': 'chapter-12',
    '第十三章': 'chapter-13',
    '第十四章': 'chapter-14',
    '第十五章': 'chapter-15',
  };

  if (map[label]) return map[label];

  // 通用生成: 取章节/文件名
  const parts = file.replace(/\.md$/, '').split('/');
  const name = parts[parts.length - 1];
  return name
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-')
    .replace(/[\u4e00-\u9fa5]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .substring(0, 40);
}

function findSimilarIds(target: string, allIds: Set<string>): string[] {
  const t = target.toLowerCase();
  return [...allIds]
    .filter(id => {
      const i = id.toLowerCase();
      return i.includes(t.substring(0, Math.min(5, t.length))) ||
             t.includes(i.substring(0, Math.min(5, i.length)));
    })
    .slice(0, 5);
}

function generateReport(nodes: any[], nonEnglishIds: any[], duplicates: any[], danglingEdges: any[], allIds: Set<string>): string {
  let md = '# 节点审计报告\n\n';
  md += `> 生成于 ${new Date().toLocaleString('zh-CN')}\n\n`;

  md += `## 总览\n\n`;
  md += `- 节点总数: ${nodes.length}\n`;
  md += `- 有效 ID 数: ${allIds.size}\n`;
  md += `- 非英文 ID: ${nonEnglishIds.length} 个\n`;
  md += `- ID 重复: ${duplicates.length} 组\n`;
  md += `- 悬空边: ${danglingEdges.length} 条\n\n`;

  md += `## 非英文 ID\n\n`;
  if (nonEnglishIds.length === 0) {
    md += `✅ 无\n\n`;
  } else {
    nonEnglishIds.forEach(n => {
      const suggested = suggestEnglishId(n.label, n.file);
      md += `- **${n.file}**\n`;
      md += `  - 当前 id: \`${n.id}\`\n`;
      md += `  - label: ${n.label}\n`;
      md += `  - 建议改为: \`${suggested}\`\n\n`;
    });
  }

  md += `## ID 重复\n\n`;
  if (duplicates.length === 0) {
    md += `✅ 无\n\n`;
  } else {
    duplicates.forEach(([id, arr]) => {
      md += `- id=\`${id}\` (${arr.length} 次)\n`;
      arr.forEach((n: any) => md += `  - ${n.file} (label="${n.label}")\n`);
      md += '\n';
    });
  }

  md += `## 悬空边\n\n`;
  if (danglingEdges.length === 0) {
    md += `✅ 无\n\n`;
  } else {
    danglingEdges.forEach(({ file, id, label, edge }) => {
      md += `- **${file}**\n`;
      md += `  - 节点 id: \`${id}\` (${label})\n`;
      md += `  - 边: → ${edge.target} (${edge.type})\n`;
      const candidates = findSimilarIds(edge.target, allIds);
      if (candidates.length > 0) {
        md += `  - 可能的候选: ${candidates.map(c => `\`${c}\``).join(', ')}\n`;
      }
      md += '\n';
    });
  }

  return md;
}

main().catch(console.error);
