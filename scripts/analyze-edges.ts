// scripts/analyze-edges.ts
// Run: npx ts-node --esm scripts/analyze-edges.ts
// or: node --loader ts-node/esm scripts/analyze-edges.ts

import { readFileSync, readdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content');

interface Edge {
  target: string;
  type: string;
  reason?: string;
}

interface NodeData {
  id: string;
  label: string;
  tier?: string;
  essence?: string;
  edges_out?: Edge[];
  location?: {
    book?: string;
    part?: string;
    chapter?: string;
    section?: string;
    item?: string;
  };
}

interface Frontmatter {
  data?: NodeData;
  [key: string]: unknown;
}

function readFrontmatter(filePath: string): Frontmatter | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;
    return parseYaml(match[1]) as Frontmatter;
  } catch {
    return null;
  }
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else if (entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

const files = walkDir(CONTENT_DIR);
const allNodes = new Map<string, { id: string; label: string; file: string; location: string }>();
const allEdges: Array<{ source: string; sourceLabel: string; target: string; type: string; reason?: string; sourceFile: string }> = [];

for (const file of files) {
  const fm = readFrontmatter(file);
  if (!fm?.data?.id) continue;
  const { id, label, edges_out } = fm.data;
  const loc = fm.data.location;
  const locationStr = [loc?.book, loc?.chapter, loc?.section, loc?.item].filter(Boolean).join(' › ');

  allNodes.set(id, { id, label, file, location: locationStr });

  if (edges_out) {
    for (const edge of edges_out) {
      allEdges.push({
        source: id,
        sourceLabel: label,
        target: edge.target,
        type: edge.type,
        reason: edge.reason,
        sourceFile: basename(file),
      });
    }
  }
}

console.log(`Total nodes: ${allNodes.size}`);
console.log(`Total edges: ${allEdges.length}`);
console.log();

// ── 1. Dangling edges (target doesn't exist) ─────────────────────────────────
const dangling = allEdges.filter((e) => !allNodes.has(e.target));
console.log(`=== Dangling edges (${dangling.length}) ===`);
for (const e of dangling) {
  console.log(`  [${e.type}] ${e.sourceLabel} → "${e.target}" (from ${e.sourceFile})`);
}

console.log();

// ── 2. Nodes with no incoming edges ─────────────────────────────────────────
const hasTargets = new Set<string>();
for (const e of allEdges) {
  if (e.type === 'has') hasTargets.add(e.target);
}

const orphans = [...allNodes.values()].filter((n) => !hasTargets.has(n.id));
console.log(`\n=== Orphan nodes — no incoming 'has' edge (${orphans.length}) ===`);
for (const n of orphans) {
  console.log(`  "${n.label}" [${n.id}]  ${n.location}`);
}
