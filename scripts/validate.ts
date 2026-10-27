// scripts/validate.ts
// 校验 content/ 下所有 Markdown 文件的 frontmatter 格式和跨文件引用
import fs from 'fs/promises';
import { scanContentDir } from '../src/parser/content-manager.js';
import { parseFrontmatterWithWarnings } from '../src/parser/frontmatter.js';
import { isValidFill, isValidEdgeType } from '../src/parser/schema.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// VALID_* whitelists live in src/parser/schema.ts. Both validate and
// audit-frontmatter import the same readonly tuples, so the two scripts
// can no longer silently disagree on what counts as a canonical value.

interface ValidationError {
  file: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export async function validate(): Promise<void> {
  console.log('🔍 Running frontmatter validation...\n');

  const contentDir = path.join(ROOT, 'public/content');
  const files = await scanContentDir(contentDir);

  if (files.length === 0) {
    console.warn('⚠️  No .md files found in public/content/');
    return;
  }

  console.log(`   Scanning ${files.length} file(s)...\n`);

  const errors: ValidationError[] = [];
  const allIds = new Set<string>();

  // Pass 1: collect all node IDs and validate structural fields
  for (const fp of files) {
    const raw = await fs.readFile(fp, 'utf-8');
    const relPath = toRelativePath(fp);

    let result: ReturnType<typeof parseFrontmatterWithWarnings>;
    try {
      result = parseFrontmatterWithWarnings(raw, fp);
    } catch (err: any) {
      errors.push({ file: relPath, message: err.message, severity: 'error' });
      continue;
    }
    const { fm, warnings } = result;

    // Surface parser-emitted warnings so the CLI output mirrors what the
    // browser sees (issue #14). The parser decides *structural* problems
    // (missing target, non-object edge); this script keeps *value-list*
    // problems (essence/field/edge-type not in the whitelist).
    for (const w of warnings) {
      errors.push({
        file: relPath,
        field: w.field ?? undefined,
        message: w.message,
        severity: w.severity,
      });
    }

    // Collect node IDs for cross-reference validation
    allIds.add(fm.id);

    // Validate body heading hierarchy (docs/frontmatter.md §3.8)
    errors.push(...validateBodyHeadings(relPath, fm.body ?? ''));

    // Validate fill field (replaces the deprecated essence field)
    if (fm.fill && !isValidFill(fm.fill)) {
      errors.push({
        file: relPath,
        field: 'fill',
        message: `fill 值 "${fm.fill}" 不在已知类型列表中`,
        severity: 'warning',
      });
    }

    // Validate edges_out structure (value-list check stays here; structural
    // issues are already covered by the parser-emitted warnings above).
    if (fm.edges_out && Array.isArray(fm.edges_out)) {
      for (let i = 0; i < fm.edges_out.length; i++) {
        const edge = fm.edges_out[i];

        if (edge.type && !isValidEdgeType(edge.type)) {
          errors.push({
            file: relPath,
            field: `edges_out[${i}].type`,
            message: `edges_out[${i}].type 值 "${edge.type}" 不在已知类型列表中`,
            severity: 'warning',
          });
        }
      }
    }
  }

  // Pass 2: cross-reference — check that all edges_out.target 指向已存在的节点
  for (const fp of files) {
    const raw = await fs.readFile(fp, 'utf-8');
    const relPath = toRelativePath(fp);

    try {
      const { fm } = parseFrontmatterWithWarnings(raw, fp);
      if (!fm.edges_out) continue;

      for (let i = 0; i < fm.edges_out.length; i++) {
        const edge = fm.edges_out[i];
        const target = String(edge.target ?? '').trim();
        if (target && !allIds.has(target)) {
          errors.push({
            file: relPath,
            field: `edges_out[${i}].target`,
            message: `edges_out[${i}].target 指向的节点 id "${target}" 不存在`,
            severity: 'error',
          });
        }
      }
    } catch {
      // Already reported in pass 1
    }
  }

  // Report results
  if (errors.length === 0) {
    console.log('✅ All files passed validation.');
    return;
  }

  const errorCount = errors.filter((e) => e.severity === 'error').length;
  const warnCount = errors.filter((e) => e.severity === 'warning').length;

  if (errorCount > 0) {
    console.error(`❌ ${errorCount} error(s), ${warnCount} warning(s)\n`);
  } else {
    console.warn(`⚠️  ${warnCount} warning(s)\n`);
  }

  for (const err of errors) {
    const icon = err.severity === 'error' ? '❌' : '⚠️ ';
    const location = err.field ? `[${err.field}]` : '';
    console.error(`${icon} ${err.file} ${location}`);
    console.error(`   ${err.message}\n`);
  }

  if (errorCount > 0) {
    process.exit(1);
  }
}

function toRelativePath(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  const idx = parts.findIndex((p) => p === 'content');
  return idx === -1 ? filePath : parts.slice(idx).join('/');
}

interface BodyHeading {
  line: number;
  level: number;
}

// 只认围栏代码块之外的 ATX 标题（``` 里以 # 开头的注释不算标题）
function collectBodyHeadings(body: string): BodyHeading[] {
  const headings: BodyHeading[] = [];
  let inFence = false;
  body.split('\n').forEach((line, index) => {
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = /^(#{1,6}) /.exec(line);
    if (match) headings.push({ line: index + 1, level: match[1].length });
  });
  return headings;
}

function validateBodyHeadings(relPath: string, body: string): ValidationError[] {
  if (!body.trim()) return [];

  const errors: ValidationError[] = [];
  const headings = collectBodyHeadings(body);
  const h1 = headings.filter((h) => h.level === 1);

  if (headings.length === 0) {
    return [
      {
        file: relPath,
        field: 'body',
        message: `正文缺少标题：有正文就必须有且仅有一个 H1（见 docs/frontmatter.md §3.8）`,
        severity: 'error',
      },
    ];
  }

  if (h1.length !== 1) {
    errors.push({
      file: relPath,
      field: 'body',
      message: `正文必须恰好有一个 H1，当前 ${h1.length} 个（见 docs/frontmatter.md §3.8）`,
      severity: 'error',
    });
  } else if (headings[0].line !== h1[0].line) {
    errors.push({
      file: relPath,
      field: 'body',
      message: `H1 必须是正文的第一个标题，当前首个标题在正文第 ${headings[0].line} 行`,
      severity: 'error',
    });
  }

  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      errors.push({
        file: relPath,
        field: 'body',
        message: `标题层级跳级：正文第 ${headings[i - 1].line} 行是 H${headings[i - 1].level}，第 ${headings[i].line} 行直接跳到 H${headings[i].level}`,
        severity: 'error',
      });
      break;
    }
  }

  return errors;
}

// Run if executed directly
validate().catch((err) => {
  console.error('❌ Validation crashed:', err.message);
  process.exit(1);
});
