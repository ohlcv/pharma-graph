const fs = require('fs');
const yaml = require('yaml');
const path = require('path');

const files = [];
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) walk(path.join(dir, e.name));
    else if (e.name.endsWith('.md')) files.push(path.join(dir, e.name));
  }
}
walk('content');

let errors = [];
for (const f of files) {
  try {
    const raw = fs.readFileSync(f, 'utf8');
    const yamlStr = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
    if (!yamlStr) continue;
    yaml.parse(yamlStr);
  } catch (e) {
    errors.push(f);
  }
}

console.log('需要修复的文件:', errors.length);
for (const f of errors) {
  console.log('-', f);
}
