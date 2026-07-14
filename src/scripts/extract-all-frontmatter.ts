// src/scripts/extract-all-frontmatter.ts
// 提取 content/ 下全部 .md 文件的 frontmatter，写入一个 markdown 文档
// 用途：把仓库当前所有 frontmatter 状态聚合成一份单一文档，方便人工审查/讨论
// 用法：node --import tsx src/scripts/extract-all-frontmatter.ts

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { parse as yamlParse } from 'yaml';

const CONTENT_DIR = path.resolve('public/content');
const OUTPUT_FILE = path.resolve('docs/all-frontmatter-extracted.md');

function pickSource(root: Record<string, unknown>): Record<string, unknown> {
  const nested = root['data'];
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : root;
}

interface EdgeDef { target: string; type: string; reason?: string; }
interface ParsedFM {
  id?: string;
  label?: string;
  essence?: string;
  type?: string;
  field?: string;
  category?: string;
  tier?: string;
  layer?: string;
  summary?: string | { short?: string; full?: string };
  location?: Record<string, string>;
  tags?: string[];
  edges_out?: EdgeDef[];
}

function extract(content: string): { fm: ParsedFM; edgesFromRoot: EdgeDef[]; rawYaml: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { fm: {}, edgesFromRoot: [], rawYaml: '' };

  let root: Record<string, unknown> = {};
  try {
    const parsed = yamlParse(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      root = parsed as Record<string, unknown>;
    }
  } catch { /* ignore */ }

  const fm = pickSource(root);

  // edges_out 可在根级，也可在 data: 内
  const rootEdgesRaw = (root['edges_out'] as unknown[]) ?? [];
  const dataEdgesRaw = (fm['edges_out'] as unknown[]) ?? [];
  const edgesRaw = rootEdgesRaw.length > 0 ? rootEdgesRaw : dataEdgesRaw;
  const edges: EdgeDef[] = Array.isArray(edgesRaw)
    ? edgesRaw
        .filter((e): e is Record<string, unknown> =>
          typeof e === 'object' && e !== null && !Array.isArray(e))
        .map(e => ({
          target: String(e['target'] ?? ''),
          type: String(e['type'] ?? 'relates'),
          reason: typeof e['reason'] === 'string' ? e['reason'] : undefined,
        }))
        .filter(e => Boolean(e.target))
    : [];

  const summary = fm['summary'];
  const summaryObj = typeof summary === 'object' && summary !== null
    ? (summary as { short?: string; full?: string })
    : undefined;

  return {
    fm: {
      id: typeof fm['id'] === 'string' ? fm['id'] as string : undefined,
      label: typeof fm['label'] === 'string' ? fm['label'] as string : undefined,
      essence: typeof fm['essence'] === 'string' ? fm['essence'] as string : undefined,
      type: typeof fm['type'] === 'string' ? fm['type'] as string : undefined,
      field: typeof fm['field'] === 'string' ? fm['field'] as string : undefined,
      category: typeof fm['category'] === 'string' ? fm['category'] as string : undefined,
      tier: typeof fm['tier'] === 'string' ? fm['tier'] as string : undefined,
      layer: typeof fm['layer'] === 'string' ? fm['layer'] as string : undefined,
      summary: summaryObj ?? (typeof summary === 'string' ? summary : undefined),
      location: fm['location'] && typeof fm['location'] === 'object' && !Array.isArray(fm['location'])
        ? fm['location'] as Record<string, string>
        : undefined,
      tags: Array.isArray(fm['tags'])
        ? (fm['tags'] as unknown[]).filter((t): t is string => typeof t === 'string')
        : [],
      edges_out: edges,
    },
    edgesFromRoot: edges,
    rawYaml: match[1],
  };
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

async function main() {
  const files = await glob('**/*.md', { cwd: CONTENT_DIR, absolute: false });
  files.sort();

  let md = `# 全部 Frontmatter 提取（原始快照）\n\n`;
  md += `> 生成时间：${new Date().toLocaleString('zh-CN')}\n`;
  md += `> 来源：\`content/**/*.md\`，共 ${files.length} 个文件\n`;
  md += `> 用途：把所有 frontmatter 当前状态聚合成单文档，方便审查与讨论迁移方案\n\n`;
  md += `---\n\n`;
  md += `## 索引（按文件路径排序）\n\n`;

  for (const rel of files) {
    md += `- [\`${rel}\`](#${rel.replace(/[^\w\u4e00-\u9fa5-]/g, '-').toLowerCase()})\n`;
  }
  md += `\n---\n\n`;

  for (const rel of files) {
    const full = path.join(CONTENT_DIR, rel);
    const content = fs.readFileSync(full, 'utf-8');
    const { fm, rawYaml } = extract(content);

    md += `<a id="${rel.replace(/[^\w\u4e00-\u9fa5-]/g, '-').toLowerCase()}"></a>\n`;
    md += `## ${rel}\n\n`;

    md += `### 解析结果\n\n`;

    md += `| 字段 | 值 |\n|---|---|\n`;
    md += `| id | ${fm.id ? `\`${escapeCell(fm.id)}\`` : '_(缺失)_'} |\n`;
    md += `| label | ${fm.label ? escapeCell(fm.label) : '_(缺失)_'} |\n`;
    md += `| essence / type | ${fm.essence ? `\`${fm.essence}\`` : fm.type ? `\`${fm.type}\` _(旧字段)_` : '_(缺失)_'} |\n`;
    md += `| field / category | ${fm.field ? `\`${fm.field}\`` : fm.category ? `\`${fm.category}\` _(旧字段)_` : '_(缺失)_'} |\n`;
    md += `| tier / layer | ${fm.tier ? `\`${fm.tier}\`` : fm.layer ? `\`${fm.layer}\` _(旧字段)_` : '_(缺失)_'} |\n`;
    md += `| location | ${fm.location ? `\`${escapeCell(JSON.stringify(fm.location))}\`` : '_(缺失)_'} |\n`;
    md += `| tags | ${fm.tags && fm.tags.length > 0 ? fm.tags.map(t => `\`${t}\``).join(', ') : '_(空)_'} |\n`;
    if (typeof fm.summary === 'string') {
      md += `| summary | ${escapeCell(fm.summary.slice(0, 200))} |\n`;
    } else if (fm.summary && typeof fm.summary === 'object') {
      md += `| summary.short | ${fm.summary.short ? escapeCell(fm.summary.short.slice(0, 200)) : '_(缺失)_'} |\n`;
      md += `| summary.full | ${fm.summary.full ? escapeCell(fm.summary.full.slice(0, 200)) : '_(缺失)_'} |\n`;
    } else {
      md += `| summary | _(缺失)_ |\n`;
    }
    md += `| edges_out 数 | ${fm.edges_out?.length ?? 0} |\n`;

    md += `\n### edges_out 列表\n\n`;
    if (!fm.edges_out || fm.edges_out.length === 0) {
      md += `_(空)_\n\n`;
    } else {
      md += `| # | target | type | reason |\n|---|---|---|---|\n`;
      fm.edges_out.forEach((e, i) => {
        md += `| ${i + 1} | \`${escapeCell(e.target)}\` | \`${escapeCell(e.type)}\` | ${escapeCell(e.reason ?? '')} |\n`;
      });
      md += `\n`;
    }

    md += `### 原始 YAML\n\n`;
    md += '```yaml\n';
    md += rawYaml;
    if (!rawYaml.endsWith('\n')) md += '\n';
    md += '```\n\n';
    md += `---\n\n`;
  }

  fs.writeFileSync(OUTPUT_FILE, md, 'utf-8');
  console.log(`✅ 已写入：${OUTPUT_FILE}`);
  console.log(`📄 共提取 ${files.length} 个文件的 frontmatter`);
}

main().catch(e => { console.error(e); process.exit(1); });