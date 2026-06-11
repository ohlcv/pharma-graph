// src/scripts/migrate-frontmatter.ts
// 将所有 .md 文件的 frontmatter 统一为新格式：location/tags/summary 移入 data: 块内
// 新顺序: id → label → type → category → layer → location → tags → summary
// edges_out 保持在根级
// 用法: npx tsx src/scripts/migrate-frontmatter.ts [--dry-run]

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

const CONTENT_DIR = join(process.cwd(), 'content');

function stripChapterPrefix(s: string): string {
  return s.replace(/^(?:第[一二三四五六七八九十零〇百千]+(?:节|章|篇)\s*)+/, '');
}

function labelFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, '');
}

function unquote(s: string): string {
  return String(s).replace(/^["']|["']$/g, '');
}

// 提取 frontmatter YAML block
function extractYamlBlock(text: string): { yamlBlock: string; body: string } {
  const clean = text.replace(/^\uFEFF/, '');
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { yamlBlock: '', body: clean };
  return { yamlBlock: match[1], body: match[2] };
}

interface TopFields {
  id: string;
  label: string;
  type: string;
  category: string;
  layer?: string;
  location?: Record<string, string>;
  tags?: string[];
  summary?: { short?: string; full?: string };
  edges_out?: Array<{ target: string; type: string; reason?: string }>;
}

// 从任意位置提取字段（data块内优先，否则根级）
function getField(root: Record<string, unknown>, key: string): unknown {
  const keys = key.split('.');
  let val: unknown = root;
  for (const k of keys) {
    if (val && typeof val === 'object' && k in (val as Record<string, unknown>)) {
      val = (val as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return val;
}

// 清理 location：只保留非空字段
function cleanLocation(loc: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!loc) return undefined;
  const cleaned: Record<string, string> = {};
  for (const key of ['book', 'part', 'chapter', 'section', 'subsection', 'item']) {
    const v = loc[key];
    const s = String(v == null ? '' : v).trim();
    if (s !== '' && s !== 'undefined') {
      cleaned[key] = s;
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

// 收集 tags
function collectTags(fm: Record<string, unknown>): string[] {
  const raw = getField(fm, 'tags') as unknown[] | undefined;
  if (!raw) return [];
  return raw.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean);
}

// 收集 edges_out
function collectEdges(fm: Record<string, unknown>): Array<{ target: string; type: string; reason?: string }> {
  const raw = getField(fm, 'edges_out') as unknown[] | undefined;
  if (!raw) return [];
  return raw
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null && !Array.isArray(e))
    .map((e) => ({
      target: String(e['target'] ?? '').trim(),
      type: String(e['type'] ?? 'relates').trim(),
      reason: typeof e['reason'] === 'string' ? (e['reason'] as string).trim() : undefined,
    }))
    .filter((e): e is { target: string; type: string; reason?: string } => Boolean(e.target));
}

// 收集 summary
function collectSummary(fm: Record<string, unknown>): { short?: string; full?: string } {
  const raw = getField(fm, 'summary');
  if (!raw) return {};
  if (typeof raw === 'string') return { short: raw.trim() };
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return {
      short: typeof obj['short'] === 'string' ? (obj['short'] as string).trim() : undefined,
      full: typeof obj['full'] === 'string' ? (obj['full'] as string).trim() : undefined,
    };
  }
  return {};
}

// 构建标准 frontmatter（新格式）
function buildFrontmatter(opts: {
  id: string;
  label: string;
  type: string;
  category: string;
  layer?: string;
  location?: Record<string, string>;
  tags?: string[];
  summaryShort?: string;
  summaryFull?: string;
  edgesOut?: Array<{ target: string; type: string; reason?: string }>;
}): string {
  const dataLines: string[] = [];

  dataLines.push(`  id: ${unquote(stripChapterPrefix(opts.id))}`);
  dataLines.push(`  label: ${unquote(opts.label)}`);
  dataLines.push(`  type: ${unquote(opts.type)}`);
  dataLines.push(`  category: ${unquote(stripChapterPrefix(opts.category))}`);

  if (opts.layer) {
    dataLines.push(`  layer: ${opts.layer}`);
  }

  if (opts.location && Object.keys(opts.location).length > 0) {
    dataLines.push('');
    dataLines.push('  location:');
    for (const [k, v] of Object.entries(opts.location)) {
      dataLines.push(`    ${k}: ${v}`);
    }
  }

  if (opts.tags && opts.tags.length > 0) {
    dataLines.push('');
    dataLines.push('  tags:');
    for (const tag of opts.tags) {
      dataLines.push(`    - ${tag}`);
    }
  }

  if (opts.summaryShort || opts.summaryFull) {
    dataLines.push('');
    dataLines.push('  summary:');
    if (opts.summaryShort) dataLines.push(`    short: ${opts.summaryShort}`);
    if (opts.summaryFull) dataLines.push(`    full: ${opts.summaryFull}`);
  } else {
    dataLines.push('  summary: {}');
  }

  const lines: string[] = ['---', 'data:'];
  lines.push(...dataLines);
  lines.push('');
  if (opts.edgesOut && opts.edgesOut.length > 0) {
    lines.push('edges_out:');
    for (const edge of opts.edgesOut) {
      lines.push(`  - target: ${edge.target}`);
      lines.push(`    type: ${edge.type}`);
      if (edge.reason) lines.push(`    reason: ${edge.reason}`);
    }
  } else {
    lines.push('edges_out: []');
  }
  lines.push('---');
  return lines.join('\n');
}

// 迁移单个文件
function migrateFile(filePath: string): { changed: boolean; reason: string } {
  const text = readFileSync(filePath, 'utf-8');
  const { yamlBlock, body } = extractYamlBlock(text);
  if (!yamlBlock) return { changed: false, reason: 'No frontmatter found' };

  const fm = yamlParse(yamlBlock) as Record<string, unknown>;

  // data块内优先
  const dataBlock = (fm['data'] as Record<string, unknown> | undefined) ?? {};
  const effective = Object.keys(dataBlock).length > 0 ? dataBlock : fm;

  // 提取必需字段
  const id = String(getField(effective, 'id') ?? getField(fm, 'id') ?? '').trim();
  if (!id) return { changed: false, reason: 'No id field' };

  const label = unquote(String(getField(effective, 'label') ?? getField(fm, 'label') ?? labelFromFilename(basename(filePath)))).trim();
  const type = unquote(String(getField(effective, 'type') ?? getField(fm, 'type') ?? '')).trim();
  const category = unquote(String(getField(effective, 'category') ?? getField(fm, 'category') ?? '')).trim();
  const layer = typeof (getField(effective, 'layer') ?? getField(fm, 'layer')) === 'string'
    ? String(getField(effective, 'layer') ?? getField(fm, 'layer')).trim()
    : undefined;

  // location 和 tags 优先从 data 块取，没有再从根级取
  const locData = (getField(effective, 'location') ?? getField(fm, 'location')) as Record<string, unknown> | undefined;
  const location = cleanLocation(locData);
  const tags = collectTags(Object.keys(dataBlock).length > 0 ? { ...fm, ...dataBlock } : fm);
  const summary = collectSummary(Object.keys(dataBlock).length > 0 ? { ...fm, ...dataBlock } : fm);
  const edgesOut = collectEdges(fm);

  const newFm = buildFrontmatter({
    id,
    label,
    type,
    category,
    layer: layer || undefined,
    location,
    tags: tags.length > 0 ? tags : undefined,
    summaryShort: summary.short,
    summaryFull: summary.full,
    edgesOut: edgesOut.length > 0 ? edgesOut : undefined,
  });

  writeFileSync(filePath, newFm + '\n' + body, 'utf-8');
  return {
    changed: true,
    reason: `id=${id}, type=${type || '?'}, location=${location ? Object.keys(location).join(',') : 'none'}, tags=${tags.length}, edges=${edgesOut.length}`,
  };
}

// 递归收集所有 .md 文件
function collectMdFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectMdFiles(full));
      } else if (entry.isFile() && /\.(md|MD)$/.test(entry.name)) {
        results.push(full);
      }
    }
  } catch {
    // ignore
  }
  return results;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log('Starting frontmatter migration (new format: location/tags/summary inside data:)\n');
  if (dryRun) console.log('[DRY RUN] No files will be modified\n');

  const files = collectMdFiles(CONTENT_DIR);
  console.log(`Found ${files.length} .md files\n`);

  let changed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const file of files) {
    try {
      const rel = file.replace(CONTENT_DIR, '').replace(/^[/\\]/, '');
      if (dryRun) {
        const text = readFileSync(file, 'utf-8');
        const { yamlBlock } = extractYamlBlock(text);
        if (!yamlBlock) { console.log(`[SKIP] ${rel} (no frontmatter)`); skipped++; continue; }
        const fm = yamlParse(yamlBlock) as Record<string, unknown>;
        const dataBlock = (fm['data'] as Record<string, unknown> | undefined) ?? {};
        const effective = Object.keys(dataBlock).length > 0 ? dataBlock : fm;
        const id = String(getField(effective, 'id') ?? '').trim();
        console.log(`[OK] ${rel} → id=${id || '?'}`);
      } else {
        const result = migrateFile(file);
        if (result.changed) {
          changed++;
          console.log(`[MIGRATED] ${rel}`);
          console.log(`           → ${result.reason}`);
        } else {
          skipped++;
          console.log(`[SKIPPED] ${rel} (${result.reason})`);
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      errors.push(`${file}: ${err}`);
      console.error(`[ERROR] ${file}: ${err}`);
    }
  }

  console.log(`\nDone: ${changed} migrated, ${skipped} skipped, ${errors.length} errors`);
  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) console.log('  ' + e);
  }
}

main();
