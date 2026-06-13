// scripts/fix-invalid-tiers.ts
// 把非法的 tier 值（formulation/quality/structure/pharmacokinetics/metabolism）替换为 drug
import fs from 'fs/promises';
import path from 'path';

const INVALID = new Set(['formulation', 'quality', 'structure', 'pharmacokinetics', 'metabolism']);
const REPLACEMENT = 'drug';

const contentDir = path.join(process.cwd(), 'content');

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (e.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

const files = await walk(contentDir);
let changed = 0;

for (const fp of files) {
  let content = await fs.readFile(fp, 'utf-8');
  let modified = false;
  const lines = content.split('\n').map((line) => {
    const m = line.match(/^(\s*)tier:\s*(\S+)\s*$/);
    if (m && INVALID.has(m[2])) {
      modified = true;
      changed++;
      return `${m[1]}tier: ${REPLACEMENT}`;
    }
    return line;
  });
  if (modified) {
    await fs.writeFile(fp, lines.join('\n'), 'utf-8');
    const rel = path.relative(process.cwd(), fp);
    console.log(`  ${rel}: tier: ${content.match(/tier:\s*(\S+)/)?.[1]} -> ${REPLACEMENT}`);
  }
}

console.log(`\nDone. ${changed} files updated.`);
