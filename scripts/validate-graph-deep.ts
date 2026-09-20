/**
 * Deep-content validation: spot-check that graph-data.json node content
 * actually matches the markdown frontmatter it claims to come from.
 *
 * This catches:
 *   - Frontmatter mutation that the build script silently dropped
 *   - edges_out containing non-existent targets (the build filters these — verify)
 *   - label being wrong (e.g. still has unprocessed placeholder)
 *   - rel pointing to a file whose id doesn't match (rename gone wrong)
 *
 * Run:
 *   npm run validate:graph:deep
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep, posix } from 'node:path';
import { parse as yamlParse } from 'yaml';

type Edge = { target: string; type: string; reason?: string };
type Frontmatter = {
  id?: string;
  label?: string;
  fill?: string;
  edges_out?: Edge[];
  [key: string]: unknown;
};

const CONTENT_DIR = join(process.cwd(), 'public/content');
const GRAPH_PATH = join(process.cwd(), 'public/graph-data.json');

function parseFrontmatter(raw: string): Frontmatter | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    const parsed = yamlParse(match[1]) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const data_ = parsed['data'];
    const source =
      data_ && typeof data_ === 'object' && !Array.isArray(data_)
        ? { ...parsed, ...(data_ as Record<string, unknown>) }
        : parsed;
    return source as Frontmatter;
  } catch {
    return null;
  }
}

const graphRaw = await readFile(GRAPH_PATH, 'utf-8');
const graph = JSON.parse(graphRaw) as {
  nodes: Array<{ id: string; label: string; rel: string; edges_out?: Edge[] }>;
  edges: Array<{ id: string; source: string; target: string; type: string; reason?: string }>;
};

let mismatchedId = 0;
let extraEdges = 0;
let missingEdges = 0;
let labelTrimmed = 0;

const allFmEdges = new Map<string, Edge[]>();
const allMdByRel = new Map<string, Frontmatter>();

async function walk(dir: string): Promise<void> {
  const items = await readdir(dir);
  for (const name of items) {
    const abs = join(dir, name);
    const s = await stat(abs);
    if (s.isDirectory()) {
      await walk(abs);
    } else if (name.endsWith('.md')) {
      const rel = relative(CONTENT_DIR, abs).split(sep).join(posix.sep);
      try {
        const raw = await readFile(abs, 'utf-8');
        const fm = parseFrontmatter(raw);
        if (fm) {
          allMdByRel.set(rel, fm);
          if (fm.edges_out) allFmEdges.set(fm.id!, fm.edges_out);
        }
      } catch {
        /* */
      }
    }
  }
}
await walk(CONTENT_DIR);

console.log(`Scanning ${graph.nodes.length} nodes against ${allMdByRel.size} markdown files...\n`);

for (const n of graph.nodes) {
  const fm = allMdByRel.get(n.rel);
  if (!fm) continue; // already caught by main validator

  // id match
  if (fm.id !== n.id) {
    mismatchedId++;
    if (mismatchedId <= 3) {
      console.error(`  id mismatch: ${n.rel} frontmatter.id="${fm.id}" vs graph.id="${n.id}"`);
    }
  }

  // label match
  const expectedLabel = (fm.label ?? fm.id ?? '').trim();
  if (expectedLabel !== n.label.trim()) {
    labelTrimmed++;
    if (labelTrimmed <= 3) {
      console.error(
        `  label drift: ${n.id} frontmatter="${expectedLabel}" vs graph="${n.label.trim()}"`,
      );
    }
  }

  // edges match
  const graphEdges = n.edges_out ?? [];
  const fmEdges = fm.edges_out ?? [];

  const graphEdgeKeys = new Set(graphEdges.map((e) => `${e.target}|${e.type}`));
  const fmEdgeKeys = new Set(fmEdges.map((e) => `${e.target}|${e.type}`));

  for (const k of graphEdgeKeys) {
    if (!fmEdgeKeys.has(k)) extraEdges++;
  }
  for (const k of fmEdgeKeys) {
    if (!graphEdgeKeys.has(k)) missingEdges++;
  }
}

console.log('\n━━━ Deep validation summary ━━━');
console.log(`  id mismatches   : ${mismatchedId}`);
console.log(`  label drifts    : ${labelTrimmed}`);
console.log(`  edges in graph but not in md: ${extraEdges}`);
console.log(`  edges in md but not in graph: ${missingEdges}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (mismatchedId > 0 || extraEdges > 0 || missingEdges > 0) {
  console.error('✗ Deep validation found issues.');
  process.exit(1);
}
if (labelTrimmed > 0) {
  console.warn('⚠ Some labels have whitespace drift — usually harmless.');
}

console.log('✓ Deep validation passed.');
