// src/parser/frontmatter.ts
// 纯 JS frontmatter 解析器，浏览器兼容
import { parse as yamlParse } from 'yaml';

// --- frontmatter 字段类型 ---

export interface NodeMeta {
  id: string;
  label: string;
  type: string;
  category: string;
  layer?: string;  // knowledge layer: foundation / system / clinical / service
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
  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
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

const REQUIRED_FIELDS = ['id', 'type', 'category'];

export function parseFrontmatter(raw: string, filePath: string): ParsedFrontmatter {
  const { data } = parseFrontmatterRaw(raw);

  const rawData = (data['data'] as Record<string, unknown> | undefined) ?? data;

  const missing = REQUIRED_FIELDS.filter((f) => !(f in rawData));
  if (missing.length > 0) {
    throw new Error(`frontmatter 缺少必需字段 [${missing.join(', ')}]，文件: ${filePath}`);
  }

  const id = String(rawData['id'] ?? '').trim();
  if (!id) {
    throw new Error(`frontmatter id 不能为空，文件: ${filePath}`);
  }

  const label =
    getField(rawData, 'label') ??
    getField(data, 'label') ??
    basename(filePath);

  const rawSummary =
    (rawData['summary'] as Record<string, unknown> | string | undefined) ??
    (data['summary'] as Record<string, unknown> | string | undefined);
  const summary =
    typeof rawSummary === 'object' && rawSummary !== null
      ? (getField(rawSummary as Record<string, unknown>, 'short') ??
         getField(rawSummary as Record<string, unknown>, 'full'))
      : typeof rawSummary === 'string'
        ? rawSummary.trim()
        : undefined;

  const edgesRaw = (rawData['edges_out'] as unknown[] | undefined) ??
                   (data['edges_out'] as unknown[] | undefined);
  const edges_out: EdgeDef[] = Array.isArray(edgesRaw)
    ? edgesRaw
        .filter(
          (e): e is Record<string, unknown> =>
            typeof e === 'object' && e !== null && !Array.isArray(e)
        )
        .map((e): EdgeDef => ({
          target: String(e['target'] ?? ''),
          type: String(e['type'] ?? 'related'),
          reason: typeof e['reason'] === 'string' ? e['reason'] : undefined,
        }))
        .filter((e): e is EdgeDef => Boolean(e.target))
    : [];

  const location = (rawData['location'] as Record<string, unknown> | undefined) ??
                   (data['location'] as Record<string, unknown> | undefined);

  const tagsRaw = (rawData['tags'] as unknown[] | undefined) ??
                  (data['tags'] as unknown[] | undefined);
  const tags: string[] = Array.isArray(tagsRaw)
    ? tagsRaw.filter((t): t is string => typeof t === 'string')
    : [];

  return {
    id,
    label,
    type: String(rawData['type']),
    category: String(rawData['category']),
    layer: typeof rawData['layer'] === 'string' ? (rawData['layer'] as string).trim() : undefined,
    summary,
    edges_out: edges_out.length > 0 ? edges_out : undefined,
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
    body: parseFrontmatterRaw(raw).content.trim(),
  };
}
