// 一次性迁移：为跨章节同名节点的 label 补（节名）后缀
// 依据 docs/SKILL.md §2.7「重名节点：label 加括号 + equivalent_to」：
//   - 文件名保持裸名，只改 frontmatter label
//   - 后缀优先级：节名 → 章名 → location.item
//   - 组内后缀必须唯一；无法唯一区分的组跳过并报告
//   - 纯口诀组（fill: cls-mnemonic）豁免（§2.7 允许 label 相同，用 id 区分）
// 用法：node tools/add-dup-label-suffixes.mjs          # dry-run 预览
//       node tools/add-dup-label-suffixes.mjs --apply  # 实际写入
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const APPLY = process.argv.includes('--apply');
const ROOT = 'public/content';

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p) : e.name.endsWith('.md') && files.push(p);
  }
})(ROOT);

const nodes = [];
for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) continue;
  let fm;
  try {
    fm = YAML.parse(m[1]);
  } catch (e) {
    console.error('YAML 解析失败:', f, e.message);
    continue;
  }
  if (!fm?.label) continue;
  nodes.push({ f, raw, fmStart: m.index, fmBlock: m[1], fm });
}

// 按 label 分组，只看重名组
const groups = new Map();
for (const n of nodes) {
  (groups.get(n.fm.label) ?? groups.set(n.fm.label, []).get(n.fm.label)).push(n);
}

const strip = (s, re) => (s ?? '').replace(re, '').trim();
const planned = []; // { node, oldLabel, newLabel, suffix, basis }
const manual = []; // { label, files, reason }
const skippedMnemonic = [];

for (const [label, members] of groups) {
  if (members.length < 2) continue;
  if (members.every((n) => n.fm.fill === 'cls-mnemonic' || n.fm.id?.startsWith('mem-'))) {
    skippedMnemonic.push({ label, members });
    continue;
  }
  if (members.some((n) => n.fm.fill === 'cls-mnemonic')) {
    manual.push({ label, files: members.map((m) => m.f), reason: '混合组：口诀与非口诀同名' });
    continue;
  }
  // 计算每个成员的后缀：节名 → 章名 → item
  const cands = members.map((n) => {
    const loc = n.fm.location ?? {};
    const sec = strip(loc.section, /^\S*节\s*/);
    if (sec) return { suffix: sec, basis: '节名' };
    const ch = strip(loc.chapter, /^\S*章\s*/);
    if (ch) return { suffix: ch, basis: '章名' };
    if (loc.item) return { suffix: loc.item, basis: 'item' };
    return { suffix: '', basis: 'none' };
  });
  const suffixes = cands.map((c) => c.suffix);
  if (suffixes.some((s) => !s)) {
    manual.push({ label, files: members.map((m) => m.f), reason: '无 location 可用' });
    continue;
  }
  if (new Set(suffixes).size !== suffixes.length) {
    manual.push({ label, files: members.map((m) => m.f), reason: `组内后缀冲突: ${suffixes.join(' / ')}` });
    continue;
  }
  members.forEach((n, i) => planned.push({ node: n, oldLabel: label, newLabel: `${label}（${suffixes[i]}）`, suffix: suffixes[i], basis: cands[i].basis }));
}

// 新 label 与既有 label / 其他组新 label 撞车检查
const existingLabels = new Set(nodes.map((n) => n.fm.label));
const newLabelCount = new Map();
for (const p of planned) newLabelCount.set(p.newLabel, (newLabelCount.get(p.newLabel) ?? 0) + 1);
const safe = [];
const rejected = [];
for (const p of planned) {
  const collides =
    (newLabelCount.get(p.newLabel) > 1 && p.oldLabel !== p.newLabel) ||
    (existingLabels.has(p.newLabel) && p.oldLabel !== p.newLabel);
  collides ? rejected.push(p) : safe.push(p);
}

// 汇总预览
const byGroup = new Map();
for (const p of safe) (byGroup.get(p.oldLabel) ?? byGroup.set(p.oldLabel, []).get(p.oldLabel)).push(p);
console.log(`重名组总数: ${groups.size ? [...groups.values()].filter((g) => g.length > 1).length : 0}`);
console.log(`口诀豁免组: ${skippedMnemonic.length} → ${skippedMnemonic.map((s) => s.label).join('、')}`);
console.log(`待人工处理组: ${manual.length}`);
for (const m of manual) console.log('  [MANUAL]', m.label, '-', m.reason, '\n    ', m.files.join('\n     '));
console.log(`被拒(新label撞车): ${rejected.length}`);
for (const r of rejected) console.log('  [REJECT]', r.oldLabel, '→', r.newLabel, r.node.f);
console.log(`将修改节点数: ${safe.length}（${byGroup.size} 组）`);
for (const [label, ps] of byGroup) {
  console.log(`『${label}』`);
  for (const p of ps) console.log(`   ${p.node.fm.id}  ${p.newLabel}  [${p.basis}]  ${p.node.f.replace(ROOT + '/', '')}`);
}

if (!APPLY) {
  console.log('\n(dry-run，未写入。加 --apply 执行)');
} else {
  let changed = 0;
  for (const p of safe) {
    const { raw, fmBlock } = p.node;
    const start = raw.indexOf(fmBlock);
    const block = fmBlock.replace(/^label:[^\n]*$/m, `label: ${p.newLabel}`);
    if (block === fmBlock) {
      console.error('label 行替换失败:', p.node.f);
      continue;
    }
    fs.writeFileSync(p.node.f, raw.slice(0, start) + block + raw.slice(start + fmBlock.length));
    changed++;
  }
  console.log(`\n已写入 ${changed} 个文件`);
}
