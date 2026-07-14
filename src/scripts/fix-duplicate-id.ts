/**
 * 批量修复 frontmatter 中重复 id 字段的问题
 * 问题：某些文件的 data.id 字段被写成了 data.id 和 data.id: <hash> 两行
 * 解决：只保留第一行的 id，删除第二行的 hash id
 */

import { globSync } from 'glob';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const CONTENT_DIR = './public/content';

async function fixDuplicateId(filePath: string): Promise<boolean> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  // 查找重复的 id 行（以 4 个空格开头，后面是 id: xxx-hash 格式）
  let duplicateIdIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 检查行是否以 4 个空格开头，并且包含 id: 
    if (line.startsWith('    id: ')) {
      duplicateIdIndex = i;
      break;
    }
  }

  if (duplicateIdIndex === -1) {
    return false;
  }

  console.log(`Found duplicate at line ${duplicateIdIndex + 1}: "${lines[duplicateIdIndex].trim()}"`);

  // 删除重复的 id 行
  lines.splice(duplicateIdIndex, 1);

  await writeFile(filePath, lines.join('\n'), 'utf-8');
  return true;
}

async function main() {
  const files = globSync('**/*.md', { cwd: CONTENT_DIR });
  let fixedCount = 0;

  for (const file of files) {
    const filePath = path.join(CONTENT_DIR, file);
    try {
      const fixed = await fixDuplicateId(filePath);
      if (fixed) {
        console.log(`Fixed: ${file}`);
        fixedCount++;
      }
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
    }
  }

  console.log(`\nTotal files fixed: ${fixedCount}`);
}

main();
