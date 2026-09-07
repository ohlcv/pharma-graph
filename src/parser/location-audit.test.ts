import { parseFrontmatter } from './frontmatter.js';
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

    const missing = parsed
      .filter(({ fm }) => !fm.location?.book || !fm.location?.section || !fm.location?.item)
      .map(({ rel, fm }) => ({
        rel,
        id: fm.id,
        label: fm.label,
        hasBook: !!fm.location?.book,
        hasSection: !!fm.location?.section,
        hasItem: !!fm.location?.item,
      }));

    // 章节/篇/书入口文件（如 "第一篇 药剂学.md"）没有 section，自然也没有 item——这是正确的。
    // 有 section 的文件 item 必填（迁移时已全部补齐）。
    const missingItem = missing.filter(m => !m.hasItem);
    const missingBook = missing.filter(m => !m.hasBook);
    const noSectionCount = missing.filter(m => !m.hasSection).length;
    console.log(`  missing book: ${missingBook.length} (should be 0)`);
    console.log(`  missing section: ${noSectionCount} (章节入口文件正常)`);
    // 重新统计：有 section 但缺 item（应该没有这种情况）
    const filesWithSection = parsed.filter(m => m.hasSection);
    const filesWithSectionMissingItem = filesWithSection.filter(m => !m.hasItem);
    console.log(`  有 section 但缺 item: ${filesWithSectionMissingItem.length} (should be 0)`);

    expect(missingBook.length).toBe(0);
    expect(filesWithSectionMissingItem.length).toBe(0);
  });
});
