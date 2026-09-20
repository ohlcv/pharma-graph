/**
 * Validation script for public/graph-data.json.
 *
 * Checks:
 *   1. JSON parses cleanly
 *   2. Required top-level fields present (version, generated, stats, nodes, edges)
 *   3. version === 2 (matches the format consumers expect)
 *   4. stats.nodes === nodes.length and stats.edges === edges.length
 *   5. all node ids are unique
 *   6. all edge ids are unique
 *   7. every edge.source and edge.target exists in nodes
 *   8. every node.rel exists as a file under public/content/
 *   9. every .md file under public/content/ (with valid frontmatter id) appears in nodes
 *  10. node.label is non-empty (should default to id when missing)
 *  11. edge shape: { id, source, target, type } all non-empty
 *  12. dangling edge reference counts (edges pointing to non-existent ids)
 *
 * Run:
 *   npm run check:graph -- --validate
 *
 * Exit 0 = clean, 1 = issues found.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep, posix } from 'node:path';
import { parse as yamlParse } from 'yaml';

const strict = process.argv.includes('--validate');

type Edge = { id: string; source: string; target: string; type: string; reason?: string };
type Node = { id: string; label: string; rel: string; edges_out?: Edge[] };
type GraphData = {
  version: number;
  generated: string;
  stats: { nodes: number; edges: number };
  nodes: Node[];
  edges: Edge[];
};

const CONTENT_DIR = join(process.cwd(), 'public/content');
const GRAPH_PATH = join(process.cwd(), 'public/graph-data.json');

const errors: string[] = [];
const warnings: string[] = [];

function fail(msg: string) {
  errors.push(msg);
  console.error(`  ✗ ${msg}`);
}
function pass(msg: string) {
  console.log(`  ✓ ${msg}`);
}
function warn(msg: string) {
  warnings.push(msg);
  console.warn(`  ⚠ ${msg}`);
}

// ─── 1. JSON parses ─────────────────────────────────────────────────────
let raw: string;
let data: GraphData;
try {
  raw = await readFile(GRAPH_PATH, 'utf-8');
  data = JSON.parse(raw) as GraphData;
  pass('JSON parses');
} catch (err) {
  fail(`JSON parse failed: ${(err as Error).message}`);
  process.exit(1);
}

// ─── 2. Top-level fields ───────────────────────────────────────────────
const required = ['version', 'generated', 'stats', 'nodes', 'edges'] as const;
for (const f of required) {
  if (!(f in data)) fail(`missing top-level field: ${f}`);
}
if (errors.length === 0) pass('all required top-level fields present');

// ─── 3. version ────────────────────────────────────────────────────────
if (data.version !== 2) fail(`version=${data.version}, expected 2`);
else pass('version = 2');

// ─── 4. stats vs array lengths ─────────────────────────────────────────
if (data.stats.nodes !== data.nodes.length) {
  fail(`stats.nodes=${data.stats.nodes} but nodes.length=${data.nodes.length}`);
} else pass(`stats.nodes = nodes.length = ${data.nodes.length}`);

if (data.stats.edges !== data.edges.length) {
  fail(`stats.edges=${data.stats.edges} but edges.length=${data.edges.length}`);
} else pass(`stats.edges = edges.length = ${data.edges.length}`);

// ─── 5. Node id uniqueness ─────────────────────────────────────────────
const idSet = new Set<string>();
const idDupes = new Map<string, number>();
for (const n of data.nodes) {
  if (!n.id) {
    fail(`node missing id (rel=${n.rel})`);
    continue;
  }
  idDupes.set(n.id, (idDupes.get(n.id) ?? 0) + 1);
  idSet.add(n.id);
}
const idDupesList = [...idDupes.entries()].filter(([, c]) => c > 1);
if (idDupesList.length > 0) {
  fail(
    `${idDupesList.length} duplicate node ids: ${idDupesList
      .slice(0, 5)
      .map(([id, c]) => `${id}×${c}`)
      .join(', ')}`,
  );
} else pass(`all ${idSet.size} node ids unique`);

// ─── 6. Edge id uniqueness ─────────────────────────────────────────────
const edgeIdSet = new Set<string>();
const edgeDupes = new Set<string>();
for (const e of data.edges) {
  if (!e.id) {
    fail(`edge missing id (source=${e.source} target=${e.target})`);
    continue;
  }
  if (edgeIdSet.has(e.id)) edgeDupes.add(e.id);
  edgeIdSet.add(e.id);
}
if (edgeDupes.size > 0)
  fail(`${edgeDupes.size} duplicate edge ids (e.g. ${[...edgeDupes].slice(0, 3).join(', ')})`);
else pass(`all ${edgeIdSet.size} edge ids unique`);

// ─── 7. Edge references resolve ────────────────────────────────────────
let dangling = 0;
const danglingExamples: string[] = [];
for (const e of data.edges) {
  if (!idSet.has(e.source) || !idSet.has(e.target)) {
    dangling++;
    if (danglingExamples.length < 5) {
      danglingExamples.push(`${e.source} -> ${e.target}`);
    }
  }
}
if (dangling > 0)
  fail(`${dangling} dangling edge references (e.g. ${danglingExamples.join(', ')})`);
else pass(`all edge source/target resolve to existing nodes`);

// ─── 8. Every node.rel exists as a file ────────────────────────────────
let missingFiles = 0;
const missingFileExamples: string[] = [];
for (const n of data.nodes) {
  if (!n.rel) {
    fail(`node ${n.id} missing rel`);
    continue;
  }
  const abs = join(CONTENT_DIR, n.rel.split(posix.sep).join(sep));
  try {
    const s = await stat(abs);
    if (!s.isFile()) {
      missingFiles++;
      if (missingFileExamples.length < 5) missingFileExamples.push(`${n.id} (not a file: ${abs})`);
    }
  } catch {
    missingFiles++;
    if (missingFileExamples.length < 5) missingFileExamples.push(`${n.id} (no such file: ${abs})`);
  }
}
if (missingFiles > 0)
  fail(
    `${missingFiles} nodes reference non-existent files (e.g. ${missingFileExamples.join(', ')})`,
  );
else pass(`all ${data.nodes.length} node.rel paths exist on disk`);

// ─── 9. Every .md file (with id frontmatter) appears in nodes ──────────
const idFromRel = new Map(data.nodes.map((n) => [n.rel, n.id]));
let orphanMd = 0;
const orphanExamples: string[] = [];
const allMd: string[] = [];

async function walk(dir: string): Promise<void> {
  const items = await readdir(dir);
  for (const name of items) {
    const abs = join(dir, name);
    const s = await stat(abs);
    if (s.isDirectory()) {
      await walk(abs);
    } else if (name.endsWith('.md')) {
      const rel = relative(CONTENT_DIR, abs).split(sep).join(posix.sep);
      allMd.push(rel);

      // Check if it has an id in frontmatter — if so, must be in graph
      try {
        const raw = await readFile(abs, 'utf-8');
        const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!match) continue;
        const parsed = yamlParse(match[1]) as Record<string, unknown> | null;
        const data_ = parsed?.['data'];
        const source =
          data_ && typeof data_ === 'object' && !Array.isArray(data_)
            ? { ...parsed, ...(data_ as Record<string, unknown>) }
            : parsed;
        const id = source?.['id'] as string | undefined;
        if (id && !idFromRel.has(rel)) {
          orphanMd++;
          if (orphanExamples.length < 5) orphanExamples.push(`${rel} (id=${id})`);
        }
      } catch {
        // already warned at build time
      }
    }
  }
}
await walk(CONTENT_DIR);

if (orphanMd > 0)
  fail(
    `${orphanMd} .md files with frontmatter id are not in graph-data.json (e.g. ${orphanExamples.join(', ')})`,
  );
else
  pass(
    `all .md files with frontmatter id appear in graph (${allMd.length} total .md files scanned)`,
  );

// ─── 10. Node labels non-empty ─────────────────────────────────────────
let emptyLabels = 0;
const emptyLabelExamples: string[] = [];
for (const n of data.nodes) {
  if (!n.label || !n.label.trim()) {
    emptyLabels++;
    if (emptyLabelExamples.length < 5) emptyLabelExamples.push(n.id);
  }
}
if (emptyLabels > 0)
  fail(`${emptyLabels} nodes have empty labels (e.g. ${emptyLabelExamples.join(', ')})`);
else pass(`all ${data.nodes.length} node labels non-empty`);

// ─── 11. Edge shape ────────────────────────────────────────────────────
let malformedEdges = 0;
for (const e of data.edges) {
  if (!e.source || !e.target || !e.type) {
    malformedEdges++;
    if (malformedEdges <= 3) warn(`malformed edge: ${JSON.stringify(e).slice(0, 120)}`);
  }
}
if (malformedEdges > 0) fail(`${malformedEdges} edges missing source/target/type`);
else pass(`all ${data.edges.length} edges have source/target/type`);

// ─── 12. Orphan / dangling edge count ─────────────────────────────────
const outgoingEdges = new Map<string, number>();
for (const e of data.edges) {
  outgoingEdges.set(e.source, (outgoingEdges.get(e.source) ?? 0) + 1);
}
const orphanedNodes = data.nodes.filter((n) => !outgoingEdges.has(n.id));
warn(`${orphanedNodes.length} nodes have no outgoing edges (sink nodes, e.g. leaves)`);

// ─── 13. Spot check labels match frontmatter ──────────────────────────
let labelMismatch = 0;
const labelMismatchExamples: string[] = [];
for (const n of data.nodes) {
  const abs = join(CONTENT_DIR, n.rel.split(posix.sep).join(sep));
  try {
    const raw = await readFile(abs, 'utf-8');
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) continue;
    const parsed = yamlParse(match[1]) as Record<string, unknown> | null;
    const data_ = parsed?.['data'];
    const source =
      data_ && typeof data_ === 'object' && !Array.isArray(data_)
        ? { ...parsed, ...(data_ as Record<string, unknown>) }
        : parsed;
    const fmLabel = (source?.['label'] as string | undefined)?.trim();
    if (fmLabel && fmLabel !== n.label) {
      labelMismatch++;
      if (labelMismatchExamples.length < 5) {
        labelMismatchExamples.push(`${n.id}: graph="${n.label}" frontmatter="${fmLabel}"`);
      }
    }
  } catch {
    // file read failed, already caught earlier
  }
}
if (labelMismatch > 0)
  fail(
    `${labelMismatch} node labels disagree with frontmatter (e.g. ${labelMismatchExamples.join('; ')})`,
  );
else pass(`all graph labels match their source frontmatter`);

// ─── 14. Edge counts look reasonable ───────────────────────────────────
const totalEdgesOut = data.nodes.reduce((s, n) => s + (n.edges_out?.length ?? 0), 0);
if (totalEdgesOut !== data.edges.length) {
  warn(
    `sum of edges_out across nodes (${totalEdgesOut}) != edges array length (${data.edges.length}) — usually means dangling edges were filtered`,
  );
} else pass(`edges_out totals consistent with edges array`);

// ─── Summary ───────────────────────────────────────────────────────────
console.log('');
console.log('━'.repeat(60));
console.log(`graph-data.json  ·  ${data.nodes.length} nodes / ${data.edges.length} edges`);
console.log(`generated at    ·  ${data.generated}`);
console.log(`errors          ·  ${errors.length}`);
console.log(`warnings        ·  ${warnings.length}`);
console.log('━'.repeat(60));

if (errors.length > 0) {
  console.error('\nFAILED');
  process.exit(strict ? 1 : 0); // strict exits 1, default just logs
}

if (strict) {
  console.log('\n✓ All validation checks passed.');
  process.exit(0);
}

console.log('\n✓ All validation checks passed (non-strict mode).');
process.exit(0);
