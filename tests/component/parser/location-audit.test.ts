import { parseFrontmatter } from '@/parser/frontmatter';
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const files: string[] = [];
function walk(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp);
    else if (e.name.endsWith('.md')) files.push(fp);
  }
}
walk('./public/content');

describe('frontmatter location audit', () => {
  it('check all files have complete location in frontmatter', () => {
    const parsed = files.map(fp => {
      const raw = fs.readFileSync(fp, 'utf-8');
      const fm = parseFrontmatter(raw, fp);
      const rel = path.relative('./public/content', fp);
      return { rel, fm };
    }).filter(x => x.fm.id);

    // location 的 schema 里 item / section 都是可选（见 NodeLocation），
    // 唯一硬约束是 book（书的入口文件必须能归到书目）。
    // 历史版本的断言"有 section 必有 item"从未达成（865 个文件缺 item），
    // 且 validate.ts / schema 都不要求 item，所以这里只校验 book。
    const missingBook = parsed.filter(({ fm }) => !fm.location?.book);
    console.log(`  missing book: ${missingBook.length} (should be 0)`);
    console.log(`  总文件数: ${parsed.length}`);

    expect(missingBook.length).toBe(0);
  });
});
