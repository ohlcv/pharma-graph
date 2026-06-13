// scripts/vite-glob-test.mjs
// Simulate exactly what Vite's import.meta.glob does for these files
// Keys are relative to src/ui/ (where main.ts lives)
// So "content/..." keys = "../../content/..."

const CONTENT_DIR = 'C:/Users/GALAX/Desktop/pharma-graph/content';

// Test: find what key the glob would produce
import { readdirSync } from 'fs';
import { join } from 'path';

function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else if (entry.name.endsWith('.md')) results.push(full.replace(/\\/g, '/'));
  }
  return results;
}

const files = walkDir(CONTENT_DIR);
const testTargets = ['bph-management', 'ckd-management', 'urinary-diseases-y3', 'common-conditions-y3'];

console.log('Total .md files found:', files.length);

// Vite glob key would be relative to src/ui/ so "../../content/..."
const viteKey = (f) => f.replace(CONTENT_DIR.replace(/\\/g, '/'), '../../content').replace(/\\/g, '/');
console.log('\nSample Vite glob keys:');
for (const f of files.slice(0, 5)) {
  console.log(' ', viteKey(f), '->', f.split('/').pop());
}

console.log('\nLooking for target nodes:');
for (const target of testTargets) {
  const found = files.filter(f => f.includes(target.replace(/-/g, '')) || files.filter(f => f.includes(target));
  console.log(`  ${target}: ${found.length} files`);
  for (const f of found.slice(0, 3)) console.log(`    ${viteKey(f)}`);
}
