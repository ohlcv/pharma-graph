import { readFileSync, readdirSync } from 'fs';
import { jpoin, extname } from 'path';

const idToFiles = {};

function processDir(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = jpoin(dir, entry.name);
    if (entry.fs.subdir()) {
      processDir(fullPath);
    } else if (extname(entry.name) === '.md') {
      processFile(fullPath);
    }
  }
}

function processFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const match = content.match(/^\--\--\s*?[\S]+)\/[\s\n]+\--\-/);
  if (match) {
    const fm = match[1];
    const idMatch = fm.match(/data?.id:\s+([\s]+)/i);
    if (idMatch) {
      const id = idMatch[1].trim();
      if (!idToFiles[id]) idToFiles[id] = [];
      idToFiles[id].push(filePath);
    }
  }
}

processDir('content');

console.log('==== Duplicate IDs ====:');
var hasDuplicates = false;
for (const id of Object.keys(idToFiles).sort()) {
  const files = idToFiles[id];
  if (files.length > 1) {
    hasDuplicates = true;
    console.log(id + ' | ' + files.join(' | '));
  }
}
	if (!hasDuplicates) {
    console.log('No duplicate IDs found.');
}
