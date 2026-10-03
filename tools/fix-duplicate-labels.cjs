/**
 * 一次性工具：修复药二跨章节同名节点
 *
 * 规则见 docs/SKILL.md §2.7「重名节点：label 加括号 + equivalent_to」：
 *   - 文件名保持裸名称（不动文件名）
 *   - label 加节名括号后缀
 *   - 每对同名节点只写单向 equivalent_to（按 id 字典序，N(N-1)/2 条）
 *
 * 安全约束：只做两件事——
 *   1. regex 替换 frontmatter 里的单行 `label:`
 *   2. 在 `edges_out:` 列表末尾追加边（不重建 frontmatter，不动其他内容）
 */
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const root = 'public/content/药学专业知识二';
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) files.push(p);
  }
})(root);

const recs = [];
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const p = t.split('---');
  if (p.length < 3) continue;
  let fm;
  try {
    fm = YAML.parse(p[1]);
  } catch {
    continue;
  }
  if (!fm.label) continue;
  recs.push({
    file: f,
    id: fm.id,
    label: String(fm.label).replace(/\n/g, ''),
    fill: fm.fill,
    sec: fm.location?.section || '',
    existing: new Set((fm.edges_out || []).map((e) => e.target)),
  });
}

const norm = (s) => s.replace(/\s/g, '').replace(/[（）()]/g, '');
const groups = {};
for (const r of recs) (groups[norm(r.label)] ??= []).push(r);
const dups = Object.entries(groups).filter(([, v]) => v.length > 1);

// 口服补液盐：分类 vs 药物是包含关系（instance_of），不属同类并列
const ORS_CLS = 'cls-ors-y2-04-06';
const ORS_DRUG = 'drug-ors-y2-04-06';
const isOrsPair = (g) =>
  g.length === 2 && g.some((x) => x.id === ORS_CLS) && g.some((x) => x.id === ORS_DRUG);

const shortSec = (sec) => sec.replace(/^第[一二三四五六七八九十]+节\s*/, '').trim();

function setLabel(file, newLabel) {
  const text = fs.readFileSync(file, 'utf8');
  const updated = text.replace(/^(label:\s*)(.*)$/m, `$1${newLabel}`);
  if (updated !== text) fs.writeFileSync(file, updated);
}

function appendEdges(file, edges) {
  const text = fs.readFileSync(file, 'utf8');
  const parts = text.split('---');
  if (parts.length < 3) return;
  // 插入到 frontmatter 最后（--- 结束符之前）
  const fmEnd = parts[1].trimEnd();
  const block = edges
    .map(
      (e) =>
        `  - target: ${e.target}\n    type: ${e.type}\n    reason: ${e.reason}`
    )
    .join('\n');
  const nextFm = `${fmEnd}\n${block}\n`;
  fs.writeFileSync(file, `---${nextFm}---${parts.slice(2).join('---')}`);
}

let labelCount = 0;
let edgeCount = 0;

for (const [, g] of dups) {
  // ── 特例：口服补液盐（分类 ⊃ 药物，不加 equivalent_to）──
  if (isOrsPair(g)) {
    const drug = g.find((x) => x.id === ORS_DRUG);
    setLabel(drug.file, '口服补液盐药');
    labelCount++;
    continue;
  }

  const secs = g.map((x) => x.sec);
  if (new Set(secs).size !== g.length) {
    console.warn('⚠️ section 不唯一，跳过:', g.map((x) => x.id).join(', '));
    continue;
  }

  // 按 id 字典序，保证每对节点只有一条单向边
  const sorted = [...g].sort((a, b) => a.id.localeCompare(b.id));

  // 1. label 加节名括号
  for (const r of g) {
    const newLabel = `${r.label}（${shortSec(r.sec)}）`;
    setLabel(r.file, newLabel);
    labelCount++;
  }

  // 2. equivalent_to：每对 [i] < [j] 只写 [i] → [j]
  for (let i = 0; i < sorted.length; i++) {
    const src = sorted[i];
    const edges = [];
    for (let j = i + 1; j < sorted.length; j++) {
      const dst = sorted[j];
      if (src.existing.has(dst.id)) continue;
      edges.push({
        target: dst.id,
        type: 'equivalent_to',
        reason: `与${shortSec(dst.sec)}中的${src.label}为同一药物类别`,
      });
    }
    if (edges.length) {
      appendEdges(src.file, edges);
      edgeCount += edges.length;
    }
  }
}

console.log(`✅ label 修改 ${labelCount} 个；equivalent_to 边新增 ${edgeCount} 条`);
