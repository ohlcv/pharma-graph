// src/parser/frontmatter.ts
// Pure JS frontmatter parser, browser-compatible.
//
// Schema (new, post-migration):
//   id, label, fill, stroke, shape, summary, location, tags, edges_out
//
// 字段说明：
//   fill   — 领域顶层类 IRI（如 cls-drug, cls-classification），决定默认形状/背景色/边框色
//   stroke — 边框样式（auto|glow），显式填写时覆盖 fill 的默认边框
//   shape  — OWL2 实体类型（class/named_individual/object_property/data_property/annotation_property），
//            每个类型对应一个固定几何形状（SHAPE_BY_OWL2）。显式填写时覆盖 fill 的默认形状。
//            留空时使用 fill 的默认形状（可访问 FILL_CONFIG 中的扩展形状如 vee/tag/barrel 等）。
//
// Frontmatter may be either top-level keys or nested under a `data:` block
// (the latter is what the migration script emits). Both shapes are accepted,
// but `data.data.id` would mean a nested-block user error — we resolve it
// safely by treating the nested map as the source of truth when present.

import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import { DEFAULT_EDGE_TYPE } from '../core/edge-types.js';
import type { StrokeType, ShapeType, NodeLocation } from '../core/graph.js';

// --- frontmatter 字段类型 ---

export interface NodeMeta {
  id: string;
  label: string;
  
  // ── 新字段（基于 OWL2）─────────────────────────────────────────────
  /** 领域顶层类 IRI（如 cls-drug, cls-classification, cls-adverse 等）*/
  fill?: string;

  /** 边框样式：auto | flow | glow | fallback（显式填写时覆盖 fill 的默认边框）*/
  stroke?: StrokeType;

  /** OWL2 实体类型（显式填写时覆盖 fill 的默认形状）。
   *  留空时使用 fill 的默认形状（可访问 FILL_CONFIG 中的扩展形状）*/
  shape?: ShapeType;

  /** 简短摘要 */
  shortSummary?: string;
  /** 完整摘要 */
  fullSummary?: string;
  /** 派生字段：优先 shortSummary，否则 fullSummary */
  summary?: string;
  location?: NodeLocation;
}

export interface EdgeDef {
  target: string;
  type: string;
  reason?: string;
}

export interface ParsedFrontmatter extends NodeMeta {
  edges_out?: EdgeDef[];
  tags?: string[];
  body?: string;   // 正文内容（在 frontmatter 分隔线之后）
}

/**
 * Non-fatal issues the parser noticed but decided not to throw on.
 *
 * Issue #14: previously the parser silently dropped malformed edges
 * (missing `target`, non-object entries) so the UI happily rendered a
 * graph with fewer edges than the source files declared. The CLI
 * validator caught the same problems after the fact and complained, so
 * authors got *different* feedback depending on which surface they ran.
 * Now both surfaces get the same structural warnings — the parser emits
 * a `ParseResult` with the cleaned `fm` plus an array of warnings the
 * caller can route to console, the on-screen toast, or the CLI summary.
 */
export interface ParseWarning {
  file: string;
  /** `edges_out[2].target` etc — null when the issue is file-level */
  field: string | null;
  message: string;
  severity: 'error' | 'warning';
}

export interface ParseResult {
  fm: ParsedFrontmatter;
  warnings: ParseWarning[];
}

function parseFrontmatterRaw(raw: string): { data: Record<string, unknown>; content: string } {
  const trimmed = raw.replace(/^\uFEFF/, ''); // Remove BOM
  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)/);
  if (!match) return { data: {}, content: trimmed };
  const yamlBlock = match[1];
  const content = match[2];
  let data: Record<string, unknown> = {};
  try {
    data = yamlParse(yamlBlock) as Record<string, unknown> ?? {};
  } catch {
    // fallback: return empty data
  }
  return { data, content };
}

// ── Public API ─────────────────────────────────────────────────────────────

function getField(data: Record<string, unknown>, ...keys: string[]): string | undefined {
  let val: unknown = data;
  for (const k of keys) {
    if (val && typeof val === 'object' && k in (val as Record<string, unknown>)) {
      val = (val as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return typeof val === 'string' ? val.trim() : undefined;
}

function basename(filepath: string): string {
  const parts = filepath.split(/[/\\]/);
  const last = parts[parts.length - 1];
  return last.replace(/\.md$/i, '');
}

/** 必需的顶级字段 */
const REQUIRED_FIELDS = ['id'];

/**
 * Resolve the source-of-truth object. The new schema nests all metadata
 * under `data:`. If that block exists, we use it; otherwise we read from
 * the root map.
 *
 * Files that mix `data:` with root-level `edges_out` are still readable:
 * the root-level `edges_out` is folded into the nested block before
 * returning. If the nested block already has its own `edges_out`, the
 * root-level copy is dropped (nested wins).
 */
function pickSource(yamlRoot: Record<string, unknown>): Record<string, unknown> {
  const nested = yamlRoot['data'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const block = nested as Record<string, unknown>;
    const rootEdges = yamlRoot['edges_out'];
    const blockHasEdges = 'edges_out' in block && block['edges_out'] != null;
    if (!blockHasEdges && Array.isArray(rootEdges)) {
      block['edges_out'] = rootEdges;
    }
    return block;
  }
  return yamlRoot;
}

/**
 * Like {@link parseFrontmatter} but also returns a list of non-fatal
 * structural warnings (issue #14). Hard errors (missing `id`) still throw.
 *
 * `softFail` controls what happens to warnings inside the legacy
 * `parseFrontmatter` wrapper: when true, warnings are emitted to
 * `console.warn`; when false (default), they're swallowed silently —
 * matching the previous behaviour so existing callers don't break.
 */
export function parseFrontmatterWithWarnings(
  raw: string,
  filePath: string,
  options: { softFail?: boolean } = {},
): ParseResult {
  const { data, content } = parseFrontmatterRaw(raw);
  const fm = pickSource(data);
  const warnings: ParseWarning[] = [];

  const missing = REQUIRED_FIELDS.filter((f) => !(f in fm));
  if (missing.length > 0) {
    throw new Error(`frontmatter 缺少必需字段 [${missing.join(', ')}]，文件: ${filePath}`);
  }

  const id = String(fm['id'] ?? '').trim();
  if (!id) {
    throw new Error(`frontmatter id 不能为空，文件: ${filePath}`);
  }

  const label = getField(fm, 'label') ?? basename(filePath);
  
  const fill = getField(fm, 'fill') ?? '';
  const strokeRaw = getField(fm, 'stroke');
  const shape = getField(fm, 'shape');

  const rawSummary = fm['summary'] as Record<string, unknown> | string | undefined;
  let shortSummary: string | undefined;
  let fullSummary: string | undefined;

  if (typeof rawSummary === 'object' && rawSummary !== null) {
    shortSummary = getField(rawSummary as Record<string, unknown>, 'short');
    fullSummary = getField(rawSummary as Record<string, unknown>, 'full');
  } else if (typeof rawSummary === 'string') {
    shortSummary = rawSummary.trim();
  }

  // summary 派生字段：优先 short，否则 full
  const summary = shortSummary ?? fullSummary;

  // edges_out lives under `data:` in the new schema.
  // the YAML root. `pickSource` already folded the root-level copy into the
  // nested block when needed, so a single `fm['edges_out']` lookup covers
  // both layouts. (Reading `data['edges_out']` directly would be equivalent
  // since `fm === data` when the `data:` block exists.)
  const edgesRaw = (fm['edges_out'] as unknown[] | undefined) ?? [];
  if (!Array.isArray(edgesRaw)) {
    warnings.push({
      file: filePath,
      field: 'edges_out',
      message: `edges_out 必须是数组，得到 ${typeof edgesRaw}，已忽略整个 edges_out`,
      severity: 'warning',
    });
  }
  const sourceEdges = Array.isArray(edgesRaw) ? edgesRaw : [];
  const edges: EdgeDef[] = [];
  sourceEdges.forEach((e, idx) => {
    if (e === null || typeof e !== 'object' || Array.isArray(e)) {
      warnings.push({
        file: filePath,
        field: `edges_out[${idx}]`,
        message: `edges_out[${idx}] 不是对象（得到 ${describe(e)}），已忽略`,
        severity: 'warning',
      });
      return;
    }
    const obj = e as Record<string, unknown>;
    const rawTarget = obj['target'];
    if (rawTarget === undefined || rawTarget === null || String(rawTarget).trim() === '') {
      warnings.push({
        file: filePath,
        field: `edges_out[${idx}].target`,
        message: `edges_out[${idx}].target 为空，已忽略这条边`,
        severity: 'error',
      });
      return;
    }
    const rawType = obj['type'];
    const typeStr = rawType === undefined || rawType === null
      ? DEFAULT_EDGE_TYPE
      : String(rawType).trim() || DEFAULT_EDGE_TYPE;
    const reasonRaw = obj['reason'];
    edges.push({
      target: String(rawTarget).trim(),
      type: typeStr,
      reason: typeof reasonRaw === 'string' ? reasonRaw : undefined,
    });
  });

  const location = fm['location'] as Record<string, unknown> | undefined;
  const tagsRaw = fm['tags'] as unknown[] | undefined;
  const tags: string[] = Array.isArray(tagsRaw)
    ? tagsRaw.filter((t): t is string => typeof t === 'string')
    : [];

  const result: ParseResult = {
    fm: {
      id,
      label,
      fill: fill || undefined,
      stroke: strokeRaw as StrokeType | undefined,
      shape: shape as ShapeType | undefined,
      shortSummary,
      fullSummary,
      summary,
      edges_out: edges.length > 0 ? edges : undefined,
      tags: tags.length > 0 ? tags : undefined,
      location: location
        ? {
            book: getField(location, 'book'),
            part: getField(location, 'part'),
            chapter: getField(location, 'chapter'),
            section: getField(location, 'section'),
            item: getField(location, 'item'),
            subsection: getField(location, 'subsection'),
          }
        : undefined,
      body: content.trim(),
    },
    warnings,
  };

  if (options.softFail) {
    for (const w of warnings) {
      const tag = w.severity === 'error' ? '[error]' : '[warn]';
      // Warnings are returned to the caller (not logged to console).
      // The caller decides how to surface them (UI toast, etc.).
      void tag;
    }
  }

  return result;
}

export function parseFrontmatter(raw: string, filePath: string): ParsedFrontmatter {
  const { fm, warnings } = parseFrontmatterWithWarnings(raw, filePath, { softFail: false });
  if (warnings.length > 0) {
    // Hard errors must propagate (issue #14 contract: the parser never
    // swallows edges that the user wrote — it just forgets about them).
    const fatal = warnings.find((w) => w.severity === 'error');
    if (fatal) {
      throw new Error(`${fatal.message}（文件: ${fatal.file}）`);
    }
    // Non-fatal: keep the old silent behaviour for callers that haven't
    // migrated to parseFrontmatterWithWarnings yet. The fix only takes
    // full effect once validate.ts / graph-manager.ts opt in.
  }
  return fm;
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

// ── Serialisation ─────────────────────────────────────────────────────────────

/** 序列化 ParsedFrontmatter + 正文，回写到 .md 文件的格式。 */
export function stringifyFrontmatter(
  fm: ParsedFrontmatter,
  body: string,
): string {
  const top: Record<string, unknown> = {};

  if (fm.id)              top['id']     = fm.id;
  if (fm.label)           top['label']  = fm.label;
  
  // 新字段（基于 OWL2）
  if (fm.fill)            top['fill']   = fm.fill;
  if (fm.stroke)         top['stroke'] = fm.stroke;
  if (fm.shape)          top['shape']  = fm.shape;
  if (fm.shortSummary || fm.fullSummary) {
    top['summary'] = fm.shortSummary ?? fm.fullSummary;
  }
  if (fm.edges_out?.length) top['edges_out'] = fm.edges_out;
  if (fm.tags?.length)      top['tags']      = fm.tags;

  if (fm.location) {
    const loc: Record<string, unknown> = {};
    if (fm.location.book)       loc['book']       = fm.location.book;
    if (fm.location.part)        loc['part']        = fm.location.part;
    if (fm.location.chapter)     loc['chapter']     = fm.location.chapter;
    if (fm.location.section)    loc['section']    = fm.location.section;
    if (fm.location.item)       loc['item']       = fm.location.item;
    if (fm.location.subsection) loc['subsection'] = fm.location.subsection;
    if (Object.keys(loc).length > 0) top['location'] = loc;
  }

  const yamlStr = yamlStringify(top, { indent: 2, lineWidth: 0 });
  return `---\n${yamlStr}---\n${body}`;
}
