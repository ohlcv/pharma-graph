// src/parser/frontmatter.ts
// 纯 JS frontmatter 解析器，浏览器兼容

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
}

// ── YAML subset parser (supports nesting, lists, inline objects) ──────────────

function parseYamlBlock(block: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = block.split('\n');
  let i = 0;

  while (i < lines.length && !lines[i].trim()) i++;

  const getIndent = (line: string) => line.length - line.trimStart().length;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith('#')) { i++; continue; }

    const indent = getIndent(raw);

    if (trimmed.startsWith('- ')) {
      const content = trimmed.slice(2).trim();
      const itemIndent = indent;

      if (content.includes(':')) {
        const item: Record<string, unknown> = {};
        const colonIdx = content.indexOf(':');
        item[content.slice(0, colonIdx).trim()] = content.slice(colonIdx + 1).trim();
        i++;

        while (i < lines.length) {
          const nextRaw = lines[i];
          const nextTrimmed = nextRaw.trim();
          if (!nextTrimmed) { i++; continue; }
          const nextIndent = getIndent(nextRaw);
          // Break if dedented to or past the list-marker indent, or if a new key starts at the same indent
          if (nextIndent < itemIndent || (nextIndent === itemIndent && !nextTrimmed.startsWith('- '))) break;
          if (nextTrimmed.startsWith('- ')) break;
          const nextKeyEnd = nextTrimmed.indexOf(':');
          if (nextKeyEnd > 0) {
            item[nextTrimmed.slice(0, nextKeyEnd).trim()] = nextTrimmed.slice(nextKeyEnd + 1).trim();
          }
          i++;
        }

        const lastKey = Object.keys(result).at(-1);
        if (!lastKey) { i++; continue; }
        const last = result[lastKey];
        if (Array.isArray(last)) last.push(item);
        else result[lastKey] = [item];
      } else {
        const lastKey = Object.keys(result).at(-1);
        if (!lastKey) { i++; continue; }
        const last = result[lastKey];
        if (Array.isArray(last)) last.push(content);
        else result[lastKey] = [content];
        i++;
      }
    } else if (trimmed.includes(':')) {
      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIdx).trim();
      const rest = trimmed.slice(colonIdx + 1).trim();

      if (rest === '') {
        i++;
        while (i < lines.length) {
          const nextRaw = lines[i];
          const nextTrimmed = nextRaw.trim();
          if (!nextTrimmed || nextTrimmed.startsWith('#')) { i++; continue; }
          const nextIndent = getIndent(nextRaw);
          const firstIndent = nextIndent;
          if (nextTrimmed.startsWith('- ')) {
            const inner = nextTrimmed.slice(2).trim();
            if (inner.includes(':')) {
              const subObj: Record<string, unknown> = {};
              const subColon = inner.indexOf(':');
              subObj[inner.slice(0, subColon).trim()] = inner.slice(subColon + 1).trim();
              i++;
              while (i < lines.length) {
                const subRaw = lines[i];
                const subTrimmed = subRaw.trim();
                if (!subTrimmed) { i++; continue; }
                const subIndent = getIndent(subRaw);
                if (subIndent <= firstIndent) break;
                const subKeyEnd = subTrimmed.indexOf(':');
                if (subKeyEnd > 0) {
                  subObj[subTrimmed.slice(0, subKeyEnd).trim()] = subTrimmed.slice(subKeyEnd + 1).trim();
                }
                i++;
              }
              if (Array.isArray(result[key])) (result[key] as unknown[]).push(subObj);
              else result[key] = [subObj];
            } else {
              if (Array.isArray(result[key])) (result[key] as unknown[]).push(inner);
              else result[key] = [inner];
              i++;
            }
          } else if (nextIndent > indent) {
            const subCol = nextTrimmed.indexOf(':');
            if (subCol > 0) {
              const subKey = nextTrimmed.slice(0, subCol).trim();
              const subVal = nextTrimmed.slice(subCol + 1).trim();
              // It's a nested key-value block → parse as object (not list)
              if (!result[key] || Array.isArray(result[key])) {
                result[key] = {};
              }
              const obj = result[key] as Record<string, unknown>;
              obj[subKey] = subVal;
              i++;
              while (i < lines.length) {
                const subRaw = lines[i];
                const subTrimmed = subRaw.trim();
                if (!subTrimmed) { i++; continue; }
                const subIndent = getIndent(subRaw);
                if (subIndent <= firstIndent) break;
                const subKeyEnd = subTrimmed.indexOf(':');
                if (subKeyEnd > 0) {
                  const k = subTrimmed.slice(0, subKeyEnd).trim();
                  const v = subTrimmed.slice(subKeyEnd + 1).trim();
                  if (obj[k] === undefined) obj[k] = v; // first occurrence wins, skip siblings
                }
                i++;
              }
            } else {
              i++;
            }
          } else {
            break;
          }
        }
      } else if (rest.startsWith('[') && rest.endsWith(']')) {
        result[key] = rest.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
        i++;
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

// ── Simple frontmatter parser (no gray-matter dependency) ────────────────────

function parseFrontmatterRaw(raw: string): { data: Record<string, unknown>; content: string } {
  const trimmed = raw.replace(/^\uFEFF/, ''); // Remove BOM
  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: trimmed };
  const yamlBlock = match[1];
  const content = match[2];
  const data = parseYamlBlock(yamlBlock);
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

  const rawSummary = rawData['summary'];
  const summary =
    typeof rawSummary === 'object' && rawSummary !== null
      ? (getField(rawData as Record<string, unknown>, 'summary', 'full') ??
         getField(rawData as Record<string, unknown>, 'summary', 'short'))
      : typeof rawSummary === 'string'
        ? rawSummary.trim()
        : undefined;

  const edges_out: EdgeDef[] = Array.isArray(rawData['edges_out'])
    ? (rawData['edges_out'] as unknown[])
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

  const location = rawData['location'] as Record<string, unknown> | undefined;

  return {
    id,
    label,
    type: String(rawData['type']),
    category: String(rawData['category']),
    layer: typeof rawData['layer'] === 'string' ? (rawData['layer'] as string).trim() : undefined,
    summary,
    edges_out: edges_out.length > 0 ? edges_out : undefined,
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
  };
}
