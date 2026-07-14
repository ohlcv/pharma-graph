// src/parser/frontmatter.ts
// Pure JS frontmatter parser, browser-compatible.
//
// Schema (new, post-migration):
//   id, label, essence, field, tier, summary, location, tags, edges_out
//
// Frontmatter may be either top-level keys or nested under a `data:` block
// (the latter is what the migration script emits). Both shapes are accepted,
// but `data.data.id` would mean a nested-block user error — we resolve it
// safely by treating the nested map as the source of truth when present.

import { parse as yamlParse } from 'yaml';

// --- frontmatter 字段类型 ---

export interface NodeMeta {
  id: string;
  label: string;
  /** 节点本质（决定形状） */
  essence?: string;
  /** 学科领域（决定边框色） */
  field?: string;
  /** 自然分层（决定填充色） */
  tier?: string;
  summary?: string;
  location?: {
    book?: string;
    part?: string;
    chapter?: string;
    section?: string;
    point?: string;
    item?: string;
    subsection?: string;
  };
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
 * Resolve the source-of-truth object. Migration puts everything under
 * `data:`, so when that block exists we use it; otherwise we read from
 * the root map. Only the new schema (essence/field/tier) is accepted;
 * legacy type/category/layer is not supported here.
 */
function pickSource(yamlRoot: Record<string, unknown>): Record<string, unknown> {
  const nested = yamlRoot['data'];
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : yamlRoot;
}

export function parseFrontmatter(raw: string, filePath: string): ParsedFrontmatter {
  const { data, content } = parseFrontmatterRaw(raw);
  const fm = pickSource(data);

  const missing = REQUIRED_FIELDS.filter((f) => !(f in fm));
  if (missing.length > 0) {
    throw new Error(`frontmatter 缺少必需字段 [${missing.join(', ')}]，文件: ${filePath}`);
  }

  const id = String(fm['id'] ?? '').trim();
  if (!id) {
    throw new Error(`frontmatter id 不能为空，文件: ${filePath}`);
  }

  const label = getField(fm, 'label') ?? basename(filePath);
  const essence = getField(fm, 'essence') ?? '';
  const field   = getField(fm, 'field')   ?? '';
  const tier    = getField(fm, 'tier');

  const rawSummary = fm['summary'] as Record<string, unknown> | string | undefined;
  const summary =
    typeof rawSummary === 'object' && rawSummary !== null
      ? (getField(rawSummary as Record<string, unknown>, 'short') ??
         getField(rawSummary as Record<string, unknown>, 'full'))
      : typeof rawSummary === 'string'
        ? rawSummary.trim()
        : undefined;

  // edges_out typically lives at the YAML root — the migration script puts
  // most fields under `data:` but leaves `edges_out` at the top level. Fall
  // back to the nested map only if the root didn't have it.
  const edgesRaw =
    (data['edges_out'] as unknown[] | undefined) ??
    (fm['edges_out'] as unknown[] | undefined) ??
    [];
  const edges: EdgeDef[] = edgesRaw
    .filter(
      (e): e is Record<string, unknown> =>
        typeof e === 'object' && e !== null && !Array.isArray(e)
    )
    .map((e): EdgeDef => ({
      target: String(e['target'] ?? ''),
      type: String(e['type'] ?? 'related'),
      reason: typeof e['reason'] === 'string' ? e['reason'] : undefined,
    }))
    .filter((e): e is EdgeDef => Boolean(e.target));

  const location = fm['location'] as Record<string, unknown> | undefined;
  const tagsRaw = fm['tags'] as unknown[] | undefined;
  const tags: string[] = Array.isArray(tagsRaw)
    ? tagsRaw.filter((t): t is string => typeof t === 'string')
    : [];

  return {
    id,
    label,
    essence,
    field,
    tier,
    summary,
    edges_out: edges.length > 0 ? edges : undefined,
    tags: tags.length > 0 ? tags : undefined,
    location: location
      ? {
          book: getField(location, 'book'),
          part: getField(location, 'part'),
          chapter: getField(location, 'chapter'),
          section: getField(location, 'section'),
          point: getField(location, 'point'),
          item: getField(location, 'item'),
          subsection: getField(location, 'subsection'),
        }
      : undefined,
    body: content.trim(),
  };
}
