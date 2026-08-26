import { defineConfig, type Plugin } from 'vite';
import { readdir, readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';
import { parse as yamlParse } from 'yaml';

const CONTENT_DIR = 'public/content';
const PUBLIC_DIR = 'public';
const MANIFEST_FILENAME = 'content-manifest.json';
const SITEMAP_FILENAME = 'sitemap.xml';

/**
 * 构建时生成的精简图谱数据 JSON（节点 + 边），注入到 index.html 的
 * <script type="application/json" id="static-graph-data"> 供搜索引擎爬虫
 * 不执行 JS 也能读取全部节点名称和关系。空字符串表示尚未生成。
 */
let staticGraphDataJson = '';

interface StaticNode {
  id: string;
  label: string;
  essence: string;
  field: string;
  tier: string;
}

interface StaticEdge {
  source: string;
  target: string;
  type: string;
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
 * 简化版 frontmatter 解析（构建时用，不依赖 src/parser/frontmatter.ts 的完整警告系统）。
 * 只提取 SEO 需要的字段：id / label / essence / field / tier / edges_out。
 * 与 frontmatter.ts 的 pickSource 逻辑一致：优先读 `data:` 嵌套块，兼容 legacy 顶层 edges_out。
 */
function parseFrontmatterSimple(
  raw: string,
  filePath: string,
): {
  id: string;
  label: string;
  essence: string;
  field: string;
  tier: string;
  edges: Array<{ target: string; type: string }>;
} | null {
  const trimmed = raw.replace(/^\uFEFF/, '');
  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  let data: Record<string, unknown>;
  try {
    data = (yamlParse(match[1]) as Record<string, unknown>) ?? {};
  } catch {
    return null;
  }

  // 处理 data: 嵌套块（与 frontmatter.ts pickSource 一致）
  const nested = data['data'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const block = nested as Record<string, unknown>;
    const rootEdges = data['edges_out'];
    if (!('edges_out' in block) && Array.isArray(rootEdges)) {
      block['edges_out'] = rootEdges;
    }
    data = block;
  }

  const id = String(data['id'] ?? '').trim();
  if (!id) return null;

  const fileBasename = filePath.split(/[/\\]/).pop()?.replace(/\.md$/i, '') ?? id;
  const label =
    (typeof data['label'] === 'string' ? data['label'].trim() : '') || fileBasename;
  const essence = typeof data['essence'] === 'string' ? data['essence'].trim() : '';
  const field = typeof data['field'] === 'string' ? data['field'].trim() : '';
  const tier = typeof data['tier'] === 'string' ? data['tier'].trim() : '';

  const edgesRaw = data['edges_out'];
  const edges: Array<{ target: string; type: string }> = [];
  if (Array.isArray(edgesRaw)) {
    for (const e of edgesRaw) {
      if (e && typeof e === 'object' && !Array.isArray(e)) {
        const obj = e as Record<string, unknown>;
        const target = String(obj['target'] ?? '').trim();
        if (target) {
          edges.push({ target, type: String(obj['type'] ?? '').trim() || 'relates' });
        }
      }
    }
  }

  return { id, label, essence, field, tier, edges };
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
async function buildManifest(): Promise<void> {
  const root = process.cwd();
  const contentRoot = join(root, CONTENT_DIR);
  const publicRoot = join(root, PUBLIC_DIR);
  if (!existsSync(contentRoot)) return;

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
    }
  }
  await walk(contentRoot, 0);
  entries.sort((a, b) => a.rel.localeCompare(b.rel, 'zh'));

  if (!existsSync(publicRoot)) await mkdir(publicRoot, { recursive: true });

  // 1) content-manifest.json
  await writeFile(
    join(publicRoot, MANIFEST_FILENAME),
    JSON.stringify({ files: entries.map(e => e.rel) }, null, 2),
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

  // 3) 静态图谱数据 JSON — 注入 index.html 供爬虫读取（无需执行 JS）
  const nodes: StaticNode[] = [];
  const edges: StaticEdge[] = [];
  for (const e of entries) {
    const raw = await readFile(e.abs, 'utf-8');
    const fm = parseFrontmatterSimple(raw, e.rel);
    if (!fm) continue;
    nodes.push({ id: fm.id, label: fm.label, essence: fm.essence, field: fm.field, tier: fm.tier });
    for (const edge of fm.edges) {
      edges.push({ source: fm.id, target: edge.target, type: edge.type });
    }
  }
  staticGraphDataJson = JSON.stringify({ nodes, edges });
  // 转义 < 防止浏览器误关闭 <script> 标签
  staticGraphDataJson = staticGraphDataJson.replace(/</g, '\\u003c');
}

function contentManifestPlugin(): Plugin {
  return {
    name: 'pharma-graph:content-manifest',
    apply: () => true,
    async buildStart() {
      await buildManifest();
    },
    async handleHotUpdate(ctx) {
      // Re-emit the manifest whenever a markdown file changes — keeps dev
      // in sync without a full server restart.
      if (ctx.file.endsWith('.md')) {
        await buildManifest();
      }
    },
    transformIndexHtml(html: string): string {
      if (!staticGraphDataJson) return html;

      // 解析节点/边数量，用于替换页面可见占位符
      const data = JSON.parse(staticGraphDataJson) as { nodes: unknown[]; edges: unknown[] };
      const nodeCount = String(data.nodes.length);
      const edgeCount = String(data.edges.length);

      let out = html;

      // 1) 注入 JSON 到 <div id="app"> 之前——爬虫不执行 JS 也能读取全部节点和关系
      out = out.replace(
        '<div id="app">',
        `<script type="application/json" id="static-graph-data">${staticGraphDataJson}</script>\n\n<div id="app">`,
      );

      // 2) 替换可见占位符为真实数字（JS 运行后会覆盖，对用户无影响）
      out = out.replace('id="stat-nodes">—<', `id="stat-nodes">${nodeCount}<`);
      out = out.replace('id="stat-edges">—<', `id="stat-edges">${edgeCount}<`);
      out = out.replace('id="bs-stat-nodes">—<', `id="bs-stat-nodes">${nodeCount}<`);
      out = out.replace('id="bs-stat-edges">—<', `id="bs-stat-edges">${edgeCount}<`);

      // 3) 替换"图谱为空"提示——爬虫看到的是真实状态而非空状态
      out = out.replace('图谱为空', '图谱数据已就绪');
      out = out.replace('请选择或添加节点以开始探索', `${nodeCount} 个药学知识节点，${edgeCount} 条关联关系`);

      return out;
    },
  };
}

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [contentManifestPlugin()],
  optimizeDeps: {
    include: [
      'cytoscape',
      'cytoscape-cose-bilkent',
      'cytoscape-dagre',
      'cytoscape-euler',
    ],
  },
});