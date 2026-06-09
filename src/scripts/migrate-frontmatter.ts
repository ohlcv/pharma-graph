// src/scripts/migrate-frontmatter.ts
// 一次性脚本：将所有 .md 文件的 frontmatter 统一为 docs/frontmatter.md 标准格式
// 用法: npx tsx src/scripts/migrate-frontmatter.ts

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, basename, extname } from 'path';

const CONTENT_DIR = join(process.cwd(), 'content');

const BOOK_NAMES = new Set([
  '药学专业知识一', '药学专业知识二', '药学综合知识与技能',
]);

// 判断路径层级（content 下的第几层子目录）
function getPathDepth(relativePath: string): number {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  // parts[0] = book folder name (depth 1)
  // parts[1] = chapter folder name (depth 2)
  // parts[2] = section folder name (depth 3)
  return parts.length;
}

// 去掉 "第X节 " "第X章 " "第X篇 " 前缀
function stripChapterPrefix(s: string): string {
  // 支持中文数字和阿拉伯数字
  return s.replace(/^(?:第[一二三四五六七八九十零〇百千]+(?:节|章|篇)\s*)+/, '');
}

// 从文件名提取 label（去掉 .md 后缀）
function labelFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, '');
}

// 判断是否已有 data: 包裹层
function hasDataBlock(fm: Record<string, unknown>): boolean {
  return 'data' in fm && typeof fm['data'] === 'object' && fm['data'] !== null;
}

// 解析 top-level fields from frontmatter (before conversion)
interface TopFields {
  id: string;
  label: string;
  type: string;
  category: string;
  summary?: string;
}

function parseTopFields(fm: Record<string, unknown>): TopFields | null {
  if (!('id' in fm)) return null;
  return {
    id: String(fm['id'] ?? '').trim(),
    label: String(fm['label'] ?? '').trim(),
    type: String(fm['type'] ?? '').trim(),
    category: String(fm['category'] ?? '').trim(),
    summary: fm['summary'] !== undefined ? String(fm['summary']).trim() : undefined,
  };
}

// 解析 data block fields
interface DataFields {
  id: string;
  label: string;
  type: string;
  category: string;
}

function parseDataFields(data: Record<string, unknown>): DataFields | null {
  if (!('id' in data)) return null;
  return {
    id: String(data['id'] ?? '').trim(),
    label: String(data['label'] ?? '').trim(),
    type: String(data['type'] ?? '').trim(),
    category: String(data['category'] ?? '').trim(),
  };
}

// 清理 location：移除 undefined、part、point、item、subsection
function cleanLocation(loc: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!loc) return undefined;
  const cleaned: Record<string, string> = {};
  for (const key of ['book', 'chapter', 'section']) {
    const v = loc[key];
    const s = String(v == null ? '' : v).trim();
    if (s !== '' && s !== 'undefined') {
      cleaned[key] = s;
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

// 纯 YAML block → object（简化版，支持本次迁移所需）
function parseYamlBlock(block: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = block.split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;

  const getIndent = (l: string) => l.length - l.trimStart().length;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) { i++; continue; }

    const indent = getIndent(raw);

    if (trimmed.startsWith('- ')) {
      const content = trimmed.slice(2).trim();
      const lastKey = Object.keys(result).at(-1);
      if (!lastKey) { i++; continue; }
      const last = result[lastKey];
      if (Array.isArray(last)) last.push(content);
      else result[lastKey] = [content];
      i++;
    } else if (trimmed.includes(':')) {
      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIdx).trim();
      const rest = trimmed.slice(colonIdx + 1).trim();

      if (rest === '') {
        // nested block follows
        i++;
        if (i < lines.length) {
          const firstIndent = getIndent(lines[i]);
          const sub: Record<string, string> = {};
          while (i < lines.length) {
            const subRaw = lines[i];
            const subTrimmed = subRaw.trim();
            if (!subTrimmed) { i++; continue; }
            const subIndent = getIndent(subRaw);
            if (subIndent <= indent) break;
            if (subTrimmed.startsWith('- ')) { i++; continue; }
            const subColon = subTrimmed.indexOf(':');
            if (subColon > 0) {
              sub[subTrimmed.slice(0, subColon).trim()] = subTrimmed.slice(subColon + 1).trim();
            }
            i++;
          }
          if (Object.keys(sub).length > 0) result[key] = sub;
        }
      } else {
        result[key] = rest.replace(/^["']|["']$/g, '');
        i++;
      }
    } else {
      i++;
    }
  }
  return result;
}

// 纯 YAML block ← object（生成标准格式）
function stringifyYaml(obj: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (obj === null || obj === undefined) return '';
  if (typeof obj === 'string') return obj; // inline value only
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) return JSON.stringify(obj); // fallback
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const lines: string[] = [];
    for (const [k, v] of entries) {
      if (v === undefined || v === null || v === '') continue;
      if (typeof v === 'object' && !Array.isArray(v)) {
        // nested object
        lines.push(`${pad}${k}:`);
        lines.push(...stringifyYaml(v, indent + 1).split('\n').map(l => `${pad}  ${l}`));
      } else {
        const val = typeof v === 'string' ? v : JSON.stringify(v);
        lines.push(`${pad}${k}: ${val}`);
      }
    }
    return lines.join('\n');
  }
  return String(obj);
}

// 通用 frontmatter 反序列化（从文本中提取 data 块和 top-level 块）
// 返回 { dataBlock, topBlock, rest } 其中 rest 是 data block 或 top-level 字段
function parseFrontmatterRaw(text: string): {
  dataBlock: Record<string, unknown>;
  topBlock: Record<string, unknown>;
  afterMarker: string;
} {
  // 去除 BOM
  const clean = text.replace(/^\uFEFF/, '');
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { dataBlock: {}, topBlock: {}, afterMarker: clean };

  const yamlBlock = match[1];
  const afterMarker = match[2];

  // 简单分割 top-level keys（不支持跨行值，但足够处理本次迁移）
  const fm = parseYamlBlock(yamlBlock);
  const dataBlock = (fm['data'] as Record<string, unknown>) ?? {};
  const topBlock = fm; // top-level fields (excluding data: key itself)

  return { dataBlock, topBlock, afterMarker };
}

// 构建标准格式的 frontmatter YAML
function buildFrontmatter(
  dataFields: DataFields,
  location: Record<string, string> | undefined,
  hasSummary: boolean,
  hasEdges: boolean,
  originalSummary?: string,
): string {
  const lines: string[] = [];

  lines.push('---');
  lines.push('data:');
  // 去掉首尾引号，避免 YAML 值为 "xxx" 形式
  const unquote = (s: string) => s.replace(/^["']|["']$/g, '');
  lines.push(`  id: ${unquote(stripChapterPrefix(dataFields.id))}`);
  lines.push(`  label: ${unquote(dataFields.label)}`);
  lines.push(`  type: ${unquote(dataFields.type)}`);
  lines.push(`  category: ${unquote(dataFields.category)}`);

  if (location && Object.keys(location).length > 0) {
    lines.push('');
    lines.push('location:');
    for (const [k, v] of Object.entries(location)) {
      lines.push(`  ${k}: ${v}`);
    }
  }

  lines.push('');
  if (hasSummary) {
    lines.push('summary:');
    lines.push('  short: ');
    lines.push('  full: ');
  } else {
    lines.push('summary: {}');
  }

  lines.push('');
  if (hasEdges) {
    lines.push('edges_out:');
    lines.push('  - target: ');
    lines.push('    type: related');
    lines.push('    reason: ');
  } else {
    lines.push('edges_out: []');
  }

  lines.push('---');
  return lines.join('\n');
}

// 判断 file 是否为知识节点（concept/drug/mechanism）
function isKnowledgeNode(type: string): boolean {
  return ['concept', 'drug', 'mechanism'].includes(type);
}

// Dry-run single file
function dryRunFile(filePath: string): string {
  const text = readFileSync(filePath, 'utf-8');
  const { dataBlock, topBlock } = parseFrontmatterRaw(text);
  const fileName = basename(filePath);
  const relPath = filePath.replace(CONTENT_DIR, '').replace(/^[/\\]/, '').replace(/\\/g, '/');
  const pathParts = relPath.split('/').filter(Boolean);
  const hasData = hasDataBlock(topBlock);

  if (hasData) {
    const data = dataBlock;
    const loc = (data['location'] as Record<string, unknown> | undefined);
    const cleanedLoc = cleanLocation(loc);
    const hasSummary = 'summary' in data;
    const hasEdges = 'edges_out' in data;
    const df: DataFields = {
      id: String(data['id'] ?? pathParts[pathParts.length - 1].replace(/\.md$/i, '')).trim(),
      label: String(data['label'] ?? labelFromFilename(fileName)).trim(),
      type: String(data['type'] ?? '').trim(),
      category: String(data['category'] ?? '').trim(),
    };
    return buildFrontmatter(df, cleanedLoc, hasSummary, hasEdges);
  } else {
    const tf = parseTopFields(topBlock);
    if (!tf) return '[NO ID - SKIP]';
    const fileType = tf.type as string;
    let bookName = '';
    let chapterName = '';
    let sectionName = '';

    if (pathParts.length === 1) {
      bookName = pathParts[0].replace(/\.md$/i, '');
    } else {
      bookName = pathParts[0] ?? '';
      chapterName = pathParts[pathParts.length - 2] ?? '';
      sectionName = pathParts.length >= 3 && pathParts[pathParts.length - 3] !== chapterName
        ? pathParts[pathParts.length - 3] : '';
    }
    const location: Record<string, string> = {};
    if (bookName) location['book'] = bookName;
    if (chapterName) location['chapter'] = chapterName;
    if (sectionName) location['section'] = sectionName;
    let category = tf.category;
    if (!category || category === tf.id) {
      if (fileType === 'book') category = tf.id;
      else if (fileType === 'chapter') category = bookName;
      else if (fileType === 'section') category = chapterName || bookName;
    }
    return buildFrontmatter({ id: tf.id, label: stripChapterPrefix(tf.label || labelFromFilename(fileName)), type: fileType, category: stripChapterPrefix(category) }, location, false, false);
  }
}

// 处理单个文件
function migrateFile(filePath: string): { changed: boolean; reason: string } {
  const text = readFileSync(filePath, 'utf-8');
  const { dataBlock, topBlock } = parseFrontmatterRaw(text);
    const fileName = basename(filePath);
    const relPath = filePath.replace(CONTENT_DIR, '').replace(/^[/\\]/, '').replace(/\\/g, '/');
    const pathParts = relPath.split('/').filter(Boolean);

    const hasData = hasDataBlock(topBlock);

  if (hasData) {
    // Pattern B or C: already has data block
    const data = dataBlock;
    const loc = (data['location'] as Record<string, unknown> | undefined);
    const cleanedLoc = cleanLocation(loc);
    const hasSummary = 'summary' in data;
    const hasEdges = 'edges_out' in data;

    const df: DataFields = {
      id: String(data['id'] ?? '').trim(),
      label: stripChapterPrefix(String(data['label'] ?? '').trim()),
      type: String(data['type'] ?? '').trim(),
      category: stripChapterPrefix(String(data['category'] ?? '').trim()),
    };

    if (!df.id) {
      df.id = pathParts[pathParts.length - 1].replace(/\.md$/i, '');
    }
    if (!df.label) {
      df.label = labelFromFilename(fileName);
    }

    const newFm = buildFrontmatter(df, cleanedLoc, hasSummary, hasEdges);
    writeFileSync(filePath, newFm + '\n' + (text.split(/^---$/m)[2] ?? '').replace(/^\n/, ''), 'utf-8');
    return { changed: true, reason: `Pattern B/C: id=${df.id}, type=${df.type}, location keys=${cleanedLoc ? Object.keys(cleanedLoc).join(',') : 'none'}` };
  } else {
    // Pattern A: top-level fields only
    const tf = parseTopFields(topBlock);
    if (!tf) {
      // No id at all — skip
      return { changed: false, reason: 'No id field, skipped' };
    }

    const fileType = tf.type as string;
    // Derive location from parent directories (more reliable than filename comparison)
    // book-level (content root): path like "药学专业知识二.md"                    → pathParts=["药学专业知识二.md"]
    // book-level (book dir):     path like "药学专业知识一/药剂学.md"             → pathParts=["药学专业知识一","药剂学.md"]
    // chapter-level:              path like "药学专业知识一/药理学/药理学.md"        → pathParts=["药学专业知识一","药理学","药理学.md"]
    // section-level:              path like "药学专业知识一/药理学/第一章/第一章.md"  → pathParts=["药学专业知识一","药理学","第一章","第一章.md"]
    let bookName = '';
    let chapterName = '';
    let sectionName = '';

    if (pathParts.length === 1) {
      // Root-level book file: content/药学专业知识二.md → book = filename without .md
      bookName = pathParts[0].replace(/\.md$/i, '');
    } else {
      bookName = pathParts[0] ?? '';
      chapterName = pathParts[pathParts.length - 2] ?? '';
      sectionName = pathParts.length >= 3 && pathParts[pathParts.length - 3] !== chapterName
        ? pathParts[pathParts.length - 3] : '';
    }

    const location: Record<string, string> = {};
    if (bookName) location['book'] = bookName;
    if (chapterName) location['chapter'] = chapterName;
    if (sectionName) location['section'] = sectionName;

    // Fix category for structural nodes
    let category = tf.category;
    if (!category || category === tf.id) {
      if (fileType === 'book') category = tf.id;
      else if (fileType === 'chapter') category = bookName;
      else if (fileType === 'section') category = chapterName || bookName;
    }

    const df: DataFields = {
      id: tf.id,
      label: stripChapterPrefix(tf.label || labelFromFilename(fileName)),
      type: fileType,
      category: stripChapterPrefix(category),
    };

    const newFm = buildFrontmatter(df, location, false, false, tf.summary);
    const bodyMatch = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
    const body = bodyMatch ? bodyMatch[1] : '';
    writeFileSync(filePath, newFm + '\n' + body, 'utf-8');
    return { changed: true, reason: `Pattern A→std: type=${fileType}, location chapter=${chapterName}, section=${sectionName}` };
  }
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
  const fileArg = process.argv.find((a) => a.startsWith('--file='));
  console.log('Starting frontmatter migration...\n');
  if (dryRun) console.log('[DRY RUN] No files will be modified\n');
  const files = collectMdFiles(CONTENT_DIR);
  console.log(`Found ${files.length} .md files\n`);

  if (fileArg) {
    // Dry-run a specific file
    const rel = fileArg.replace('--file=', '').replace(/\\/g, '/').replace(/^content\//, '');
    const target = join(CONTENT_DIR, rel);
    console.log(`[DRY RUN] ${rel}\n`);
    const preview = dryRunFile(target);
    console.log(preview);
    return;
  }

  let changed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const file of files) {
    try {
      const rel = file.replace(CONTENT_DIR, '').replace(/^[/\\]/, '');
      const result = migrateFile(file);
      if (result.changed) {
        changed++;
        console.log(`[MIGRATED] ${rel}`);
        console.log(`           → ${result.reason}`);
      } else {
        skipped++;
        console.log(`[SKIPPED] ${rel} (${result.reason})`);
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
