// scripts/fix-invalid-tiers2.ts
// 修正第二批 tier/layer 非法值 + id 非法值
import fs from 'fs/promises';
import path from 'path';

const TIER_MAP: Record<string, string> = {
  safety:      'management',
  mechanism:    'drug',
  biological:  'basic',
  kinetics:    'drug',
  application: 'service',
};

const ID_MAP: Record<string, string> = {
  'anti-HIV':   'anti-hiv',
  'anti-COVID': 'anti-covid',
};

const contentDir = path.join(process.cwd(), 'content');

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else if (e.name.endsWith('.md')) files.push(full);
  }
  return files;
}

const files = await walk(contentDir);
let tierFixed = 0;
let layerFixed = 0;
let idFixed = 0;

for (const fp of files) {
  let content = await fs.readFile(fp, 'utf-8');
  let modified = false;

  // Fix tier: values
  content = content.replace(/^(\s*)tier:\s*(\S+)\s*$/gm, (_, indent, val) => {
    if (val in TIER_MAP) { tierFixed++; modified = true; return `${indent}tier: ${TIER_MAP[val]}`; }
    return _; // not captured in replace
  });

  // Fix layer: values (same map, different field name)
  content = content.replace(/^(\s*)layer:\s*(\S+)\s*$/gm, (_, indent, val) => {
    if (val in TIER_MAP) { layerFixed++; modified = true; return `${indent}layer: ${TIER_MAP[val]}`; }
    return _;
  });

  // Fix id values (id: and target: fields)
  for (const [oldId, newId] of Object.entries(ID_MAP)) {
    if (content.includes(oldId)) {
      content = content.replace(new RegExp(`(^\\s*(?:id|target):\\s*)${oldId}($)`, 'gm'), `$1${newId}$2`);
      idFixed++;
      modified = true;
    }
  }

  if (modified) {
    await fs.writeFile(fp, content, 'utf-8');
  }
}

console.log(`Done. tier fixes: ${tierFixed}, layer fixes: ${layerFixed}, id fixes: ${idFixed}`);
