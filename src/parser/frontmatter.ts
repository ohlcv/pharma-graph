// src/parser/frontmatter.ts
// 纯 JS frontmatter 解析器，浏览器兼容
import { parse as yamlParse } from 'yaml';

// --- frontmatter 字段类型 ---

export interface NodeMeta {
  id: string;
  label: string;
  /** 节点本质（决定形状），新字段为 essence，旧字段为 type */
  essence?: string;
  /** 学科领域（决定填充色），新字段为 field，旧字段为 category */
  field?: string;
  /** 自然分层（决定边框色），新字段为 tier，旧字段为 layer */
  tier?: string;
  type?: string;     // 旧字段
  category?: string; // 旧字段
  layer?: string;    // 旧字段
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

/** 必需的顶级字段（新 schema 使用 essence/field/tier，兼容旧 schema 的 type/category/layer） */
const REQUIRED_FIELDS = ['id'];

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

  // ── essence（新）/ type（旧）：取 essence，不存在则降级到 type ──
  const essence =
    getField(rawData, 'essence') ??
    getField(data, 'essence') ??
    getField(rawData, 'type') ??
    getField(data, 'type') ??
    '';

  // ── field（新）/ category（旧）：取 field，不存在则降级到 category ──
  const field =
    getField(rawData, 'field') ??
    getField(data, 'field') ??
    getField(rawData, 'category') ??
    getField(data, 'category') ??
    '';

  // ── tier（新）/ layer（旧）：取 tier，不存在则降级到 layer ──
  const tier =
    getField(rawData, 'tier') ??
    getField(data, 'tier') ??
    getField(rawData, 'layer') ??
    getField(data, 'layer') ??
    undefined;

  const rawSummary =
    (rawData['summary'] as Record<string, unknown> | string | undefined) ??
    (data['summary'] as Record<string, unknown> | string | undefined);
  // 优先取 summary.short（简短定义），其次 full（完整解释），最后直接取字符串
  const summary =
    typeof rawSummary === 'object' && rawSummary !== null
      ? (getField(rawSummary as Record<string, unknown>, 'short') ??
         getField(rawSummary as Record<string, unknown>, 'full'))
      : typeof rawSummary === 'string'
        ? rawSummary.trim()
        : undefined;

  const edgesRaw = (rawData['edges_out'] as unknown[] | undefined) ??
                   (data['edges_out'] as unknown[] | undefined) ?? [];

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
    essence,
    field,
    tier: tier ?? undefined,
    // 旧字段也保留，方便直接引用
    type: essence,
    category: field,
    layer: tier,
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
    body: parseFrontmatterRaw(raw).content.trim(),
  };
}
