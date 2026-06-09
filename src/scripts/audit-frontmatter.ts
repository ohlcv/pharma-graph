// src/scripts/audit-frontmatter.ts
// 扫描全部 content/.md 文件的 frontmatter，生成审核打分表 docs/frontmatter-audit.md

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

const CONTENT_DIR = path.resolve('content');
const OUTPUT_FILE = path.resolve('docs/frontmatter-audit.md');

// Schema values
const VALID_TYPES = ['drug', 'disease', 'pathogen', 'mechanism', 'ingredient', 'concept', 'service', 'pathway', 'indicator'];
const VALID_CATEGORIES = [
  'cardiovascular', 'respiratory', 'digestive', 'endocrine',
  'musculoskeletal', 'anti_infective', 'anti_tumor', 'blood',
  'immunology', 'dermatology', 'antipyretic', 'anti_rheumatic',
  'anti_gout', 'nutrition', 'diagnostic', 'pharmacy_practice',
];
const VALID_LAYERS = ['foundation', 'system', 'clinical', 'service'];

function isKebabCase(s: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
}

function extractFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  // Build a flat map of top-level keys and their raw text values
  const topLevel: Record<string, string> = {};
  // Collect all lines (preserve leading whitespace for nesting detection)
  const lines = match[1].split('\n');

  // Detect indentation unit (2 or 4 spaces)
  const indentMatch = lines.find(l => /^\s{2,}/.test(l));
  const indentUnit = indentMatch ? (indentMatch.match(/^(\s+)/)?.[1].length ?? 2) : 2;

  let currentKey: string | null = null;
  let currentValLines: string[] = [];

  for (const rawLine of lines) {
    // Strip CR if present
    const line = rawLine.replace(/\r$/, '');

    // Top-level key
    const topMatch = line.match(/^(\w+):\s*(.*)$/);
    if (topMatch) {
      if (currentKey !== null) {
        topLevel[currentKey] = currentValLines.join('\n').trim();
      }
      currentKey = topMatch[1];
      currentValLines = [];
      const val = topMatch[2];
      if (val) currentValLines.push(val);
    } else {
      // Check if this line is indented (belongs to current key) or new top-level
      const leading = line.match(/^(\s*)/)?.[1] ?? '';
      const isIndented = leading.length >= indentUnit;
      if (isIndented && currentKey !== null) {
        currentValLines.push(line.trimStart());
      }
      // else: blank line or top-level blank — ignore
    }
  }
  if (currentKey !== null) {
    topLevel[currentKey] = currentValLines.join('\n').trim();
  }

  // Parse top-level scalar fields
  const result: Record<string, unknown> = { ...topLevel };

  // If 'data' key exists, parse its nested fields
  if (topLevel['data']) {
    const dataLines = topLevel['data'].split('\n');
    for (const rawLine of dataLines) {
      const line = rawLine.replace(/\r$/, '').trimStart();
      const kvMatch = line.match(/^(\w+):\s*(.*)$/);
      if (kvMatch) {
        result[kvMatch[1]] = kvMatch[2].trim() || undefined;
      }
    }
  }

  return result;
}

interface Score {
  id: number;      // 1=严重错误, 2=缺失/不完整, 3=正确
  label: number;
  type: number;
  category: number;
  layer: number;
  summary: number;
  edges_out: number;
  location: number;
  tags: number;
}

function scoreField(fm: Record<string, unknown>, field: string): number {
  if (field === 'id') {
    const v = fm['id'];
    if (!v) return 1;
    const str = String(v);
    if (!isKebabCase(str)) return 1;
    return 3;
  }
  if (field === 'label') {
    const v = fm['label'];
    if (!v) return 1;
    return 3;
  }
  if (field === 'type') {
    const v = fm['type'];
    if (!v) return 1;
    const str = String(v).toLowerCase();
    if (['book', 'chapter', 'section', 'part'].includes(str)) return 1; // structural, not entity type
    if (VALID_TYPES.includes(str)) return 3;
    return 1;
  }
  if (field === 'category') {
    const v = fm['category'];
    if (!v) return 1;
    const str = String(v).toLowerCase();
    if (VALID_CATEGORIES.includes(str)) return 3;
    return 2; // free-text Chinese category
  }
  if (field === 'layer') {
    const v = fm['layer'];
    if (!v) return 2; // missing — allowed but scored 2
    const str = String(v).toLowerCase();
    if (VALID_LAYERS.includes(str)) return 3;
    return 1; // invalid value
  }
  if (field === 'summary') {
    const v = fm['summary'];
    if (!v) return 2;
    const str = String(v).trim();
    if (str === '{}' || str === '') return 2;
    return 3;
  }
  if (field === 'edges_out') {
    const v = fm['edges_out'];
    if (!v) return 2;
    const str = String(v).trim();
    if (str === '[]') return 2;
    return 3;
  }
  if (field === 'location') {
    const v = fm['location'];
    if (!v) return 2;
    return 3;
  }
  if (field === 'tags') {
    return 3; // optional, just score 3 if absent
  }
  return 2;
}

function scoreAll(fm: Record<string, unknown>): Score {
  return {
    id: scoreField(fm, 'id'),
    label: scoreField(fm, 'label'),
    type: scoreField(fm, 'type'),
    category: scoreField(fm, 'category'),
    layer: scoreField(fm, 'layer'),
    summary: scoreField(fm, 'summary'),
    edges_out: scoreField(fm, 'edges_out'),
    location: scoreField(fm, 'location'),
    tags: scoreField(fm, 'tags'),
  };
}

function scoreToEmoji(s: number): string {
  if (s === 1) return '❌';
  if (s === 2) return '⚠️';
  return '✅';
}

function scoreToLabel(s: number): string {
  if (s === 1) return '错误/严重';
  if (s === 2) return '缺失/不完整';
  return '正确';
}

function scoreTotal(scores: Score[]): number {
  const keys = ['id', 'label', 'type', 'category', 'layer', 'summary', 'edges_out', 'location', 'tags'] as const;
  let correct = 0;
  let total = 0;
  for (const key of keys) {
    for (const s of scores) {
      if (key !== 'tags') total++; // tags is bonus, not counted
      if (s[key] === 3) correct++;
    }
  }
  return Math.round((correct / total) * 100);
}

interface FileResult {
  relPath: string;
  fm: Record<string, unknown>;
  score: Score;
  issues: string[];
}

async function main() {
  const files = await glob('**/*.md', { cwd: CONTENT_DIR, absolute: false });
  files.sort();

  const results: FileResult[] = [];

  for (const rel of files) {
    const full = path.join(CONTENT_DIR, rel);
    let content = '';
    try {
      content = fs.readFileSync(full, 'utf-8');
    } catch {
      continue;
    }

    const fm = extractFrontmatter(content);
    const dataBlock = fm;

    if (Object.keys(fm).length === 0) {
      results.push({ relPath: rel, fm: {}, score: { id: 1, label: 1, type: 1, category: 1, layer: 2, summary: 2, edges_out: 2, location: 2, tags: 3 }, issues: ['❌ 无 frontmatter'] });
      continue;
    }

    const score = scoreAll(dataBlock);
    const issues: string[] = [];

    // id
    if (score.id === 1) issues.push(`❌ id 错误：\`${fm['id'] ?? 'N/A'}\`（应为 kebab-case 英文）`);
    // label
    if (score.label === 1) issues.push(`❌ label 缺失`);
    // type
    const typeVal = String(dataBlock['type'] ?? '');
    if (score.type === 1) issues.push(`❌ type 错误：\`${typeVal}\`（应为 drug/disease/mechanism/ingredient/concept/service/pathway/indicator）`);
    // category
    const catVal = String(dataBlock['category'] ?? '');
    if (score.category === 2) issues.push(`⚠️ category 为自由文本：\`${catVal}\`（建议改为标准化英文值）`);
    if (score.category === 1) issues.push(`❌ category 缺失`);
    // layer
    if (score.layer === 1) issues.push(`❌ layer 值非法：\`${dataBlock['layer']}\``);
    if (score.layer === 2) issues.push(`⚠️ layer 缺失（建议添加 foundation/system/clinical/service）`);
    // summary
    if (score.summary === 2) issues.push(`⚠️ summary 为空`);
    // edges_out
    if (score.edges_out === 2) issues.push(`⚠️ edges_out 为空`);
    // location
    if (score.location === 2) issues.push(`⚠️ location 缺失`);

    results.push({ relPath: rel, fm: dataBlock, score, issues });
  }

  // Group by top-level directory
  const groups = new Map<string, FileResult[]>();
  for (const r of results) {
    const top = r.relPath.split(path.sep)[0] ?? '其他';
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top)!.push(r);
  }

  const totalPct = scoreTotal(results.map(r => r.score));

  let md = `# Frontmatter 审核报告\n\n`;
  md += `> 生成时间：${new Date().toLocaleString('zh-CN')}\n`;
  md += `> 总文件数：${results.length} | 总体完成度：**${totalPct}%**\n\n`;
  md += `## 评分说明\n\n`;
  md += `| 符号 | 含义 |\n|---|---|\n`;
  md += `| ❌ | 严重错误（字段缺失、值非法） |\n`;
  md += `| ⚠️ | 缺失/不完整（字段存在但为空或非标准化） |\n`;
  md += `| ✅ | 正确 |\n\n`;
  md += `## 总体统计\n\n`;
  md += `| 指标 | 数值 |\n|---|---|\n`;
  const errCount = results.filter(r => r.issues.some(i => i.startsWith('❌'))).length;
  const warnCount = results.filter(r => r.issues.some(i => i.startsWith('⚠️')) && !r.issues.some(i => i.startsWith('❌'))).length;
  md += `| ❌ 有严重错误的文件 | ${errCount} / ${results.length} |\n`;
  md += `| ⚠️ 有警告的文件 | ${warnCount} / ${results.length} |\n`;
  md += `| 字段完成度 | ${totalPct}% |\n\n`;

  md += `---\n\n`;
  md += `## 文件明细\n\n`;

  for (const [group, files] of groups) {
    md += `### ${group}\n\n`;
    md += `| # | 文件 | id | type | category | layer | summary | edges | 完成度 |\n`;
    md += `|---|---|---|---|---|---|---|---|---|\n`;
    for (const [idx, r] of files.entries()) {
      const keys = ['id', 'label', 'type', 'category', 'layer', 'summary', 'edges_out'] as const;
      const correct = keys.filter(k => r.score[k] === 3).length;
      const pct = Math.round((correct / keys.length) * 100);
      const idDisplay = r.score.id === 1 ? `❌ \`${r.fm['id'] ?? '—'}\`` :
                        r.score.id === 2 ? `⚠️ \`${r.fm['id'] ?? '—'}\`` :
                        `✅ \`${r.fm['id'] ?? '—'}\``;
      const typeDisplay = r.score.type === 1 ? `❌ ${r.fm['type']}` : r.score.type === 2 ? `⚠️ ${r.fm['type']}` : `✅ ${r.fm['type']}`;
      const catDisplay = r.score.category === 1 ? `❌ ${r.fm['category']}` : r.score.category === 2 ? `⚠️ ${r.fm['category']}` : `✅ ${r.fm['category']}`;
      const layerDisplay = r.score.layer === 1 ? `❌ ${r.fm['layer'] ?? '—'}` : r.score.layer === 2 ? `⚠️ —` : `✅ ${r.fm['layer']}`;
      const sumDisplay = r.score.summary === 3 ? `✅` : `⚠️`;
      const edgeDisplay = r.score.edges_out === 3 ? `✅` : `⚠️`;
      md += `| ${idx + 1} | \`${r.relPath}\` | ${idDisplay} | ${typeDisplay} | ${catDisplay} | ${layerDisplay} | ${sumDisplay} | ${edgeDisplay} | ${pct}% |\n`;
    }
    md += `\n`;
  }

  md += `---\n\n`;
  md += `## 待修正问题汇总\n\n`;
  const allIssues = results.flatMap(r => r.issues.map(i => `**\`${r.relPath}\`**：${i}`));
  if (allIssues.length === 0) {
    md += `🎉 所有字段均正确，无需修正。\n`;
  } else {
    md += `共 ${allIssues.length} 个问题：\n\n`;
    for (const issue of allIssues) {
      md += `- ${issue}\n`;
    }
  }

  md += `\n---\n\n`;
  md += `## 修正进度\n\n`;
  md += `| 状态 | 数量 |\n|---|---|\n`;
  md += `| ❌ 未开始 | ${errCount} |\n`;
  md += `| 🔄 进行中 | 0 |\n`;
  md += `| ✅ 已完成 | ${results.length - errCount} |\n\n`;
  md += `> 每完成一个文件，在此文档对应行标记 ✅ 并更新上方表格。\n`;

  fs.writeFileSync(OUTPUT_FILE, md, 'utf-8');
  console.log(`✅ 审核报告已写入：${OUTPUT_FILE}`);
  console.log(`📊 总文件：${results.length} | ❌严重错误：${errCount} | ⚠️警告：${warnCount} | 完成度：${totalPct}%`);
}

main().catch(console.error);
