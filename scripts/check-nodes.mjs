// scripts/check-nodes.mjs
// Check component membership and has edges for specific nodes
import { readFileSync, readdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, '..', 'content');

function readFrontmatter(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;
    return yaml.parse(match[1]);
  } catch { return null; }
}

function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else if (entry.name.endsWith('.md')) results.push(full);
  }
  return results;
}

const files = walkDir(CONTENT_DIR);
const allNodes = new Map();
const hasEdges = [];

for (const file of files) {
  const fm = readFrontmatter(file);
  if (!fm?.data?.id) continue;
  const { id, label, location } = fm.data;
  const loc = location || {};
  allNodes.set(id, {
    id, label,
    book: loc.book || '',
    chapter: loc.chapter || '',
    section: loc.section || '',
    file: basename(file)
  });
  const edges = fm.edges_out || [];
  for (const e of edges) {
    hasEdges.push({ source: id, target: e.target, type: e.type });
  }
}

// Build undirected adjacency for connected components
const adj = new Map();
for (const [id] of allNodes) adj.set(id, []);
for (const e of hasEdges) {
  if (e.type === 'has') {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }
}

// Find components
const visited = new Set();
const components = new Map();
let compIdx = 0;
for (const [id] of allNodes) {
  if (!visited.has(id)) {
    const comp = [];
    const q = [id];
    visited.add(id);
    while (q.length) {
      const curr = q.shift();
      comp.push(curr);
      for (const nb of adj.get(curr) || []) {
        if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
      }
    }
    for (const n of comp) components.set(n, compIdx);
    compIdx++;
  }
}

// Check specific nodes
const targets = ['urinary-diseases-y3', 'immune-diseases-y3', 'gi-diseases-y3', 'respiratory-diseases-y3', 'cardiovascular-diseases-y3', 'cns-diseases-y3', 'endocrine-diseases-y3'];
console.log('=== Component & has-edge status ===\n');
for (const id of targets) {
  const n = allNodes.get(id);
  const comp = components.get(id);
  const hasIn = hasEdges.filter(e => e.target === id && e.type === 'has').map(e => e.source);
  const hasOut = hasEdges.filter(e => e.source === id && e.type === 'has').map(e => e.target);
  console.log(`"${n?.label}" [${id}]`);
  console.log(`  book: ${n?.book}  chapter: ${n?.chapter}  section: ${n?.section}`);
  console.log(`  component: ${comp}  (total comps: ${compIdx})`);
  console.log(`  has_in: ${hasIn.length > 0 ? hasIn.join(', ') : 'NONE'}`);
  console.log(`  has_out: ${hasOut.join(', ')}`);
  console.log();
}
