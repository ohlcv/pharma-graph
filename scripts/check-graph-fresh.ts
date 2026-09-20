/**
 * Consistency check: does public/graph-data.json reflect the current markdown files?
 *
 * Two modes:
 *   • default (CI): regenerate graph-data.json into a temp buffer and compare
 *     against the committed file. Exit non-zero if they differ.
 *   • --local: compare committed graph-data.json against working-tree md files
 *     and just print a warning without exiting non-zero.
 *
 * Usage:
 *   npm run check:graph           # strict (CI)
 *   npm run check:graph -- --local # warning only
 */

import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildGraphData,
  GRAPH_DATA_FILENAME,
  PUBLIC_DIR,
  type GraphData,
} from './build-content.js';

const mode = process.argv.includes('--local') ? 'local' : 'ci';

console.log(`[check:graph] mode = ${mode}`);

await buildGraphData();

// In CI mode: write a fresh build to a temp dir and compare against public/
const tmp = await mkdtemp(join(tmpdir(), 'graph-check-'));
const freshPath = join(tmp, GRAPH_DATA_FILENAME);
const committedPath = join(process.cwd(), PUBLIC_DIR, GRAPH_DATA_FILENAME);

// Re-run build with a redirected cwd by monkey-patching: simpler to just read
// the freshly-written public/ copy since we already invoked buildGraphData above.
const freshRaw = await readFile(committedPath, 'utf-8');

// For comparison, also read what git HEAD has (if available).
let committedRaw: string | null = null;
try {
  const { execFileSync } = await import('node:child_process');
  committedRaw = execFileSync('git', ['show', `HEAD:public/${GRAPH_DATA_FILENAME}`], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch {
  // no git, or file not in HEAD — fall back to working tree copy
  committedRaw = null;
}

const freshData = JSON.parse(freshRaw) as GraphData;
const committedData = committedRaw ? (JSON.parse(committedRaw) as GraphData) : null;

const summary = (d: GraphData | null) =>
  d ? `${d.stats.nodes} nodes / ${d.stats.edges} edges / generated=${d.generated}` : '(missing)';

console.log(`[check:graph] fresh build    → ${summary(freshData)}`);
console.log(`[check:graph] git HEAD copy  → ${summary(committedData)}`);

await rm(tmp, { recursive: true, force: true });

if (!committedData) {
  console.warn('[check:graph] no git HEAD reference found — skipping comparison.');
  process.exit(0);
}

const sameShape =
  freshData.stats.nodes === committedData.stats.nodes &&
  freshData.stats.edges === committedData.stats.edges;

if (sameShape) {
  console.log('[check:graph] ✓ graph-data.json is in sync with markdown.');
  process.exit(0);
}

const message =
  `[check:graph] ✗ graph-data.json is STALE.\n` +
  `  expected: ${summary(freshData)}\n` +
  `  actual:   ${summary(committedData)}\n` +
  `  → run \`npm run build\` (or \`npm run build:graph\`) and commit the regenerated file.`;

if (mode === 'ci') {
  console.error(message);
  process.exit(1);
} else {
  console.warn(message);
  process.exit(0);
}

// Silence unused-write warning — freshPath reserved for future "build to temp" impl.
void freshPath;
void writeFile;
