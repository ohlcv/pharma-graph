/**
 * Build-time content graph + manifest generators.
 *
 * Shared by:
 *   - vite.config.ts  (build hook + HMR)
 *   - scripts/build-graph-data.ts       (manual: just the graph)
 *   - scripts/build-content-manifest.ts (manual: just the manifest)
 *
 * Pure functions: no side effects except writing the two files under public/.
 */

import { readdir, writeFile, stat, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';
import { parse as yamlParse } from 'yaml';

export const CONTENT_DIR = 'public/content';
export const PUBLIC_DIR = 'public';
export const MANIFEST_FILENAME = 'content-manifest.json';
export const SITEMAP_FILENAME = 'sitemap.xml';
export const GRAPH_DATA_FILENAME = 'graph-data.json';

export type EdgeTarget = { target: string; type: string; reason?: string };
export type GraphNode = {
  id: string;
  label: string;
  rel: string;
  // ── 语义层（基于 OWL2）──────────────────────────────────────
  fill?: string;
  stroke?: string;
  shape?: string;
  // ── 摘要 ─────────────────────────────────────────────────
  shortSummary?: string;
  fullSummary?: string;
  summary?: string;
  // ── 分类归属（BFS/DFS 计算得出）───────────────────────────
  depth?: number;
  subtreeRoot?: string;
  weight?: number;
  // ── 位置 & 标签 ───────────────────────────────────────────
  location?: {
    book?: string;
    part?: string;
    chapter?: string;
    section?: string;
    item?: string;
    subsection?: string;
  };
  tags?: string[];
  // ── 边 ───────────────────────────────────────────────────
  edges_out?: EdgeTarget[];
};
export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  reason?: string;
};
export type GraphData = {
  version: 2;
  generated: string;
  stats: { nodes: number; edges: number };
  nodes: GraphNode[];
  edges: GraphEdge[];
};

/**
 * Frontmatter parser for build-time use — delegates to the `yaml` package
 * so we get the same fidelity as the runtime parser in src/parser/frontmatter.ts.
 *
 * Returns all fields needed for graph-data.json (body is intentionally excluded
 * — it's loaded lazily per-node in the detail panel).
 */
export function parseFrontmatter(raw: string): {
  id?: string;
  label?: string;
  fill?: string;
  stroke?: string;
  shape?: string;
  shortSummary?: string;
  fullSummary?: string;
  summary?: string;
  location?: {
    book?: string;
    part?: string;
    chapter?: string;
    section?: string;
    item?: string;
    subsection?: string;
  };
  tags?: string[];
  edges_out?: EdgeTarget[];
  [key: string]: unknown;
} | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  try {
    const parsed = yamlParse(match[1]) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return null;

    // Support both root-level fields and `data:` nested block (new schema)
    const data = parsed['data'];
    const source =
      data && typeof data === 'object' && !Array.isArray(data)
        ? { ...parsed, ...(data as Record<string, unknown>) }
        : parsed;

    const fm = source;

    // Resolve summary field: supports `summary: "..."` or `summary: { short: ..., full: ... }`
    const rawSummary = fm['summary'] as Record<string, unknown> | string | undefined;
    let shortSummary: string | undefined;
    let fullSummary: string | undefined;

    if (typeof rawSummary === 'object' && rawSummary !== null) {
      shortSummary = typeof (rawSummary as Record<string, unknown>)['short'] === 'string'
        ? String((rawSummary as Record<string, unknown>)['short']).trim()
        : undefined;
      fullSummary = typeof (rawSummary as Record<string, unknown>)['full'] === 'string'
        ? String((rawSummary as Record<string, unknown>)['full']).trim()
        : undefined;
    } else if (typeof rawSummary === 'string') {
      shortSummary = rawSummary.trim();
    }

    // fallback: top-level `full` takes over if summary.full wasn't provided
    if (fullSummary === undefined) {
      fullSummary = typeof fm['full'] === 'string' ? String(fm['full']).trim() : undefined;
    }

    const summary = shortSummary ?? fullSummary;

    const locationRaw = fm['location'] as Record<string, unknown> | undefined;
    const location = locationRaw && typeof locationRaw === 'object'
      ? {
          book:       typeof locationRaw['book']       === 'string' ? String(locationRaw['book']).trim()       : undefined,
          part:       typeof locationRaw['part']       === 'string' ? String(locationRaw['part']).trim()       : undefined,
          chapter:    typeof locationRaw['chapter']    === 'string' ? String(locationRaw['chapter']).trim()    : undefined,
          section:    typeof locationRaw['section']    === 'string' ? String(locationRaw['section']).trim()    : undefined,
          item:       typeof locationRaw['item']       === 'string' ? String(locationRaw['item']).trim()       : undefined,
          subsection: typeof locationRaw['subsection'] === 'string' ? String(locationRaw['subsection']).trim() : undefined,
        }
      : undefined;

    const tagsRaw = fm['tags'] as unknown[] | undefined;
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw.filter((t): t is string => typeof t === 'string')
      : undefined;

    return {
      id:         typeof fm['id']     === 'string' ? String(fm['id']).trim()                : undefined,
      label:      typeof fm['label']  === 'string' ? String(fm['label']).trim()             : undefined,
      fill:       typeof fm['fill']   === 'string' ? String(fm['fill']).trim()              : undefined,
      stroke:     typeof fm['stroke'] === 'string' ? String(fm['stroke']).trim()            : undefined,
      shape:      typeof fm['shape']  === 'string' ? String(fm['shape']).trim()             : undefined,
      shortSummary,
      fullSummary,
      summary,
      location,
      tags:       tags && tags.length > 0 ? tags : undefined,
      edges_out:  Array.isArray(fm['edges_out']) ? fm['edges_out'] as EdgeTarget[] : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Build pre-generated graph data JSON at build time.
 * Parses all .md files, computes BFS depth + DFS subtree classification,
 * and writes the full graph-data.json so the browser can skip runtime parsing.
 */
export async function buildGraphData(): Promise<{ nodes: number; edges: number }> {
  const root = process.cwd();
  const contentRoot = join(root, CONTENT_DIR);
  const publicRoot = join(root, PUBLIC_DIR);
  if (!existsSync(contentRoot)) {
    console.warn(`[buildGraphData] ${CONTENT_DIR} not found, skipping.`);
    return { nodes: 0, edges: 0 };
  }

  // ── 1. Walk all .md files ─────────────────────────────────────────────────
  const entries: Array<{ rel: string; abs: string }> = [];

  async function walk(dir: string): Promise<void> {
    const items = await readdir(dir);
    for (const name of items) {
      const abs = join(dir, name);
      const s = await stat(abs);
      if (s.isDirectory()) {
        await walk(abs);
      } else if (name.endsWith('.md')) {
        const rel = relative(contentRoot, abs).split(sep).join(posix.sep);
        entries.push({ rel, abs });
      }
    }
  }

  await walk(contentRoot);

  // ── 2. Parse all files ──────────────────────────────────────────────────
  const nodeDataMap = new Map<string, GraphNode>();

  for (const entry of entries) {
    try {
      const raw = await readFile(entry.abs, 'utf-8');
      const fm = parseFrontmatter(raw);

      if (!fm?.id) continue;

      nodeDataMap.set(fm.id as string, {
        id: fm.id as string,
        label: (fm.label as string) ?? (fm.id as string),
        rel: entry.rel,
        fill: fm.fill,
        stroke: fm.stroke,
        shape: fm.shape,
        shortSummary: fm.shortSummary,
        fullSummary: fm.fullSummary,
        summary: fm.summary,
        location: fm.location,
        tags: fm.tags,
        edges_out: fm.edges_out,
      });
    } catch (err) {
      console.warn(`[buildGraphData] Failed to parse ${entry.rel}:`, err);
    }
  }

  // ── 3. Build raw nodes list + edges list ─────────────────────────────────
  const allNodes: GraphNode[] = Array.from(nodeDataMap.values());
  const rawEdges: GraphEdge[] = [];

  for (const node of nodeDataMap.values()) {
    if (node.edges_out && Array.isArray(node.edges_out)) {
      for (const edge of node.edges_out) {
        if (!nodeDataMap.has(edge.target)) continue; // Skip dangling edges
        rawEdges.push({
          id: `${node.id}||${edge.target}||${edge.type}`,
          source: node.id,
          target: edge.target,
          type: edge.type,
          reason: edge.reason,
        });
      }
    }
  }

  // Deduplicate edges
  const seenEdges = new Set<string>();
  const edges = rawEdges.filter((e) => {
    if (seenEdges.has(e.id)) return false;
    seenEdges.add(e.id);
    return true;
  });

  // ── 4. BFS: compute depth from root (reverse BFS from leaves) ──────────
  const nodeIds = new Set(nodeDataMap.keys());

  const outDegree: Record<string, number> = {};
  for (const id of nodeIds) outDegree[id] = 0;
  for (const e of edges) outDegree[e.source] = (outDegree[e.source] ?? 0) + 1;

  const reverseAdj: Record<string, string[]> = {};
  for (const e of edges) {
    if (!reverseAdj[e.target]) reverseAdj[e.target] = [];
    reverseAdj[e.target].push(e.source);
  }

  const leaves: string[] = [];
  for (const id of nodeIds) {
    if (outDegree[id] === 0) leaves.push(id);
  }

  const depth: Record<string, number> = {};
  const queue: string[] = [...leaves];
  for (const leaf of leaves) depth[leaf] = 0;

  let maxDepth = 0;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currDepth = depth[curr];
    for (const parent of reverseAdj[curr] ?? []) {
      if (parent in depth) continue;
      const newDepth = currDepth + 1;
      depth[parent] = newDepth;
      if (newDepth > maxDepth) maxDepth = newDepth;
      queue.push(parent);
    }
  }

  // ── 5. DFS subtree classification ─────────────────────────────────────────
  // Classifiers = nodes with ≥1 instance_of incoming edge
  const instanceIn: Record<string, number> = {};
  for (const id of nodeIds) instanceIn[id] = 0;
  for (const e of edges) {
    if (e.type === 'instance_of') {
      instanceIn[e.target] = (instanceIn[e.target] ?? 0) + 1;
    }
  }

  const forwardAdj: Record<string, string[]> = {};
  for (const e of edges) {
    if (!forwardAdj[e.target]) forwardAdj[e.target] = [];
    forwardAdj[e.target].push(e.source);
  }

  const classifiers = new Set<string>();
  for (const [id, count] of Object.entries(instanceIn)) {
    if (count > 0) classifiers.add(id);
  }

  const parentOf: Record<string, string | undefined> = {};
  for (const id of nodeIds) parentOf[id] = undefined;
  for (const e of edges) parentOf[e.source] = e.target;

  const subtreeRoot: Record<string, string> = {};
  for (const id of nodeIds) {
    if (classifiers.has(id)) {
      subtreeRoot[id] = id;
      continue;
    }
    const visited = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      const parent = parentOf[current];
      if (parent === undefined) break;
      if (classifiers.has(parent)) {
        subtreeRoot[id] = parent;
        break;
      }
      current = parent;
    }
  }

  // DFS from each classifier to mark all descendants
  for (const rootId of classifiers) {
    const visited = new Set<string>();
    const stack: string[] = [rootId];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);
      subtreeRoot[node] = rootId;
      for (const child of forwardAdj[node] ?? []) {
        if (!visited.has(child)) stack.push(child);
      }
    }
  }

  // ── 6. Degree / weight ───────────────────────────────────────────────────
  const degree: Record<string, number> = {};
  for (const id of nodeIds) degree[id] = 0;
  for (const e of edges) {
    degree[e.source] = (degree[e.source] ?? 0) + 1;
    degree[e.target] = (degree[e.target] ?? 0) + 1;
  }

  // ── 7. Assemble final nodes with computed fields ──────────────────────────
  const seenNode = new Set<string>();
  const finalNodes: GraphNode[] = [];

  for (const node of allNodes) {
    if (seenNode.has(node.id)) continue;
    seenNode.add(node.id);

    finalNodes.push({
      ...node,
      depth: depth[node.id] ?? 0,
      subtreeRoot: subtreeRoot[node.id],
      weight: degree[node.id] ?? 1,
    });
  }

  // ── 8. Write output ──────────────────────────────────────────────────────
  const graphData: GraphData = {
    version: 2,
    generated: new Date().toISOString(),
    stats: { nodes: finalNodes.length, edges: edges.length },
    nodes: finalNodes,
    edges,
  };

  if (!existsSync(publicRoot)) await mkdir(publicRoot, { recursive: true });

  await writeFile(
    join(publicRoot, GRAPH_DATA_FILENAME),
    JSON.stringify(graphData),
    'utf-8',
  );

  console.log(
    `[buildGraphData] Generated ${GRAPH_DATA_FILENAME}: ${finalNodes.length} nodes, ${edges.length} edges, maxDepth=${maxDepth}`,
  );
  return { nodes: finalNodes.length, edges: edges.length };
}

/**
 * Escape XML special characters for sitemap <loc> / <lastmod> text nodes.
 */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Encode a content-file path the same way content-loader.ts does so that
 * sitemap URLs match what the app actually fetches (encodeURI + %2B for '+').
 */
function encodeContentPath(rawRel: string): string {
  let encoded = encodeURI(rawRel);
  encoded = encoded.replace(/#/g, '%23').replace(/\?/g, '%3F').replace(/\+/g, '%2B');
  return '/content/' + encoded;
}

/**
 * ISO-8601 date used for <lastmod>. Falls back to build date if mtime unknown.
 */
function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Walk `content/` recursively and emit a JSON manifest of every .md file's
 * public URL. The app `fetch`es this manifest at boot, then parallel-fetches
 * each path — keeping the markdown payloads out of the JS bundle (saves
 * ~600 KB at the cost of one extra round-trip on cold load).
 *
 * Also emits `public/sitemap.xml` with:
 *   • 1 × root URL  (<= homepage priority 1.0)
 *   • N × content URLs, one per .md node (priority scales by path depth:
 *     顶层目录章节 0.9 → 中层 0.8 → 叶子知识点 0.7)
 */
export async function buildManifest(): Promise<{ files: number }> {
  const root = process.cwd();
  const contentRoot = join(root, CONTENT_DIR);
  const publicRoot = join(root, PUBLIC_DIR);
  if (!existsSync(contentRoot)) {
    console.warn(`[buildManifest] ${CONTENT_DIR} not found, skipping.`);
    return { files: 0 };
  }

  type Entry = { rel: string; abs: string; depth: number; mtime: Date };
  const entries: Entry[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    const items = await readdir(dir);
    for (const name of items) {
      const abs = join(dir, name);
      const s = await stat(abs);
      if (s.isDirectory()) {
        await walk(abs, depth + 1);
      } else if (name.endsWith('.md')) {
        const rel = relative(contentRoot, abs).split(sep).join(posix.sep);
        entries.push({ rel, abs, depth, mtime: s.mtime });
      }
      // 无后缀文件/目录（药事管理与法规 这类）被 content-loader 跳过，sitemap 也不收录
    }
  }
  await walk(contentRoot, 0);
  entries.sort((a, b) => a.rel.localeCompare(b.rel, 'zh'));

  if (!existsSync(publicRoot)) await mkdir(publicRoot, { recursive: true });

  // 1) content-manifest.json
  await writeFile(
    join(publicRoot, MANIFEST_FILENAME),
    JSON.stringify({ files: entries.map((e) => e.rel) }, null, 2),
    'utf8',
  );

  // 2) sitemap.xml — 收录根页 + 所有 .md 内容页
  const now = isoDate(new Date());
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
      'xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  );

  // 首页
  lines.push('  <url>');
  lines.push('    <loc>/</loc>');
  lines.push(`    <lastmod>${now}</lastmod>`);
  lines.push('    <changefreq>weekly</changefreq>');
  lines.push('    <priority>1.0</priority>');
  lines.push('  </url>');

  // 内容页：深度越小 → 优先级越高（顶层章节优先）
  for (const e of entries) {
    // depth 按目录层级划分，但 .md 文件名自身也算一级节点
    const tiers = e.rel.split(posix.sep).length; // 比如 "药一/第一篇 药剂学/第一章 xxx.md" → 3
    const priority = tiers <= 1 ? '0.9' : tiers === 2 ? '0.85' : tiers === 3 ? '0.8' : '0.7';
    const changefreq = tiers <= 2 ? 'monthly' : 'yearly';
    const loc = encodeContentPath(e.rel);
    const lastmod = isoDate(e.mtime);
    lines.push('  <url>');
    lines.push(`    <loc>${xmlEscape(loc)}</loc>`);
    lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push(`    <changefreq>${changefreq}</changefreq>`);
    lines.push(`    <priority>${priority}</priority>`);
    lines.push('  </url>');
  }

  lines.push('</urlset>');
  lines.push('');
  await writeFile(join(publicRoot, SITEMAP_FILENAME), lines.join('\n'), 'utf8');

  console.log(
    `[buildManifest] Generated ${MANIFEST_FILENAME} (${entries.length} files) + ${SITEMAP_FILENAME}`,
  );
  return { files: entries.length };
}
