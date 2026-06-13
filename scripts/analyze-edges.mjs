// scripts/analyze-edges.mjs
// Run: node scripts/analyze-edges.mjs
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';

const thisFile = fileURLToPath(import.meta.url);
const scriptDir = dirname(thisFile);
const CONTENT_DIR = join(process.cwd(), 'content');

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
const allEdges = [];

for (const file of files) {
  const fm = readFrontmatter(file);
  if (!fm?.data?.id) continue;
  const { id, label } = fm.data;
  const edges_out = fm.edges_out || [];
  const loc = fm.data.location || {};
  const locationStr = [loc.book, loc.chapter, loc.section, loc.item].filter(Boolean).join(' > ');

  allNodes.set(id, { id, label, file, location: locationStr });

  if (edges_out) {
    for (const edge of edges_out) {
      allEdges.push({ source: id, sourceLabel: label, target: edge.target, type: edge.type, sourceFile: basename(file) });
    }
  }
}

console.log(`Total nodes: ${allNodes.size}`);
console.log(`Total edges: ${allEdges.length}\n`);

// Dangling edges
const dangling = allEdges.filter((e) => !allNodes.has(e.target));
console.log(`=== Dangling edges (${dangling.length}) ===`);
for (const e of dangling) {
  console.log(`  [${e.type}] "${e.sourceLabel}" -> "${e.target}"  (from ${e.sourceFile})`);
}

// Orphan nodes (no incoming has edge)
const hasTargets = new Set();
for (const e of allEdges) { if (e.type === 'has') hasTargets.add(e.target); }

const orphans = [...allNodes.values()].filter((n) => !hasTargets.has(n.id));
console.log(`\n=== Orphan nodes -- no incoming 'has' edge (${orphans.length}) ===`);
for (const n of orphans) {
  console.log(`  "${n.label}" [${n.id}]  ${n.location}`);
}

// Write results
const outPath = join(scriptDir, 'edge-analysis.json');
writeFileSync(outPath, JSON.stringify({
  dangling: dangling.map(e => ({ source: e.source, sourceLabel: e.sourceLabel, target: e.target, type: e.type, sourceFile: e.sourceFile })),
  orphans: orphans.map(o => ({ id: o.id, label: o.label, location: o.location, file: o.file }))
}, null, 2));
console.log(`\nResults written to scripts/edge-analysis.json`);
