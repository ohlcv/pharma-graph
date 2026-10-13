// tools/migrate-full-to-body.mjs
// 一次性迁移：把 23 个 full >600 字节点的 summary.full 内容移到 frontmatter
// 之后的正文（body），full 置空。
//
// 背景：detail-panel 的正文页签按 `## ` H2 切片渲染（parseBodyQuestions），
// 而《个人成长与生存策略》的 full 用【标签】分段。迁移时把行首【标签】转成
// `## 【标签】`（同行残余文本降级为段首行），已是 H2 结构的（生命之树 /
// E8根系）原样搬移。
//
// 用法：node tools/migrate-full-to-body.mjs [--dry-run]

import fs from 'node:fs';
import yaml from 'yaml';

const FILES = [
  'public/content/个人成长与生存策略/生命之树.md',
  'public/content/个人成长与生存策略/E8根系.md',
  'public/content/个人成长与生存策略/第四章 社交推理框架/平衡原则.md',
  'public/content/个人成长与生存策略/第四章 社交推理框架/case2｜对方期待落空（不是侵害）.md',
  'public/content/个人成长与生存策略/第一章 认知底色/称骨法速查表：四项重量相加.md',
  'public/content/个人成长与生存策略/第四章 社交推理框架/第八节 外部参考模块/使用警示.md',
  'public/content/个人成长与生存策略/第四章 社交推理框架/第八节 外部参考模块/红线预警.md',
  'public/content/个人成长与生存策略/第四章 社交推理框架/④ 双向尊重，接受人与人无法完全互相理解.md',
  'public/content/个人成长与生存策略/第一章 认知底色/频率派与贝叶斯派：先天是先验，不是常数.md',
  'public/content/个人成长与生存策略/第四章 社交推理框架/case1｜真正侵害他人利益.md',
  'public/content/个人成长与生存策略/第四章 社交推理框架/③ 不主动开启博弈.md',
  'public/content/个人成长与生存策略/第四章 社交推理框架/⑤ 边界不是对抗，是自我保护.md',
  'public/content/个人成长与生存策略/第一章 认知底色/布朗分布伦纳生态系统.md',
  'public/content/个人成长与生存策略/第四章 社交推理框架/第八节 外部参考模块/三不要③｜不单方面过度付出.md',
  'public/content/个人成长与生存策略/第四章 社交推理框架/第七节 人际关系分级与策略适配/Class4｜亲密伴侣.md',
  'public/content/个人成长与生存策略/第一章 认知底色/光的路径与人的命运：全遍历之后只有一条轨迹凸显.md',
  'public/content/个人成长与生存策略/第一章 认知底色/致命的自负.md',
  'public/content/个人成长与生存策略/第四章 社交推理框架/⑥ 边界、自身主线与他人利益区分规则.md',
  'public/content/个人成长与生存策略/第四章 社交推理框架/第八节 外部参考模块/场景3｜双方情绪平稳，共同商量安排.md',
  'public/content/个人成长与生存策略/神经多样性生存策略集合.md',
  'public/content/个人成长与生存策略/第一章 认知底色/命理的最终定位：无限全连图上的局域粗粒化.md',
  'public/content/个人成长与生存策略/第四章 社交推理框架/第七节 人际关系分级与策略适配/Class3｜父母直系亲属.md',
  'public/content/个人成长与生存策略/第四章 社交推理框架/第八节 外部参考模块/三不要②｜不争辩口舌输赢.md',
];

/** 行首【标签】切分。配平计数兼容嵌套（如【与【使用警示】的联动】）。 */
function splitTagLine(line) {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '【') depth++;
    else if (ch === '】') {
      depth--;
      if (depth === 0) {
        return { label: line.slice(1, i), rest: line.slice(i + 1).trim() };
      }
    }
  }
  return null; // 不配平，原样保留
}

function fullToBody(full) {
  // 已是 H2 结构（生命之树 / E8根系）→ 原样搬移
  if (/^## /m.test(full)) return full.trimEnd() + '\n';
  const out = [];
  for (const line of full.split('\n')) {
    // 只转换顶格的【标签】行；缩进行（列表项等）不动
    if (line.startsWith('【')) {
      const r = splitTagLine(line);
      if (r) {
        out.push(`## 【${r.label}】`);
        if (r.rest) out.push('', r.rest);
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n').trimEnd() + '\n';
}

const dryRun = process.argv.includes('--dry-run');
let migrated = 0;

for (const f of FILES) {
  const txt = fs.readFileSync(f, 'utf8');
  const m = txt.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)\r?\n?([\s\S]*)$/);
  if (!m) {
    console.error('NO-FRONTMATTER', f);
    process.exitCode = 1;
    continue;
  }
  const doc = yaml.parseDocument(m[2]);
  if (doc.errors.length > 0) {
    console.error('YAML-ERROR', f, doc.errors[0].message);
    process.exitCode = 1;
    continue;
  }
  const full = doc.getIn(['summary', 'full']);
  if (typeof full !== 'string' || !full.trim()) {
    console.log('SKIP(no full)', f);
    continue;
  }
  const existingBody = (m[4] || '').trim();
  const moved = fullToBody(full);
  const newBody = existingBody ? moved + '\n' + existingBody + '\n' : moved;

  doc.setIn(['summary', 'full'], '');
  let front = doc.toString();
  // setIn 对原块标量会序列化成无内容的 `full: |`，规范化为 `full: ''`
  front = front.replace(/^([ \t]*)full:\s*\|[+-]?\s*\n(?:[ \t]*\n)*/m, "$1full: ''\n");
  if (!front.endsWith('\n')) front += '\n';
  const newFile = '---\n' + front + '---\n\n' + newBody;

  if (!dryRun) fs.writeFileSync(f, newFile, 'utf8');

  // 回读自检：YAML 可解析、full 已空、short 保留、body 非空
  const check = dryRun ? newFile : fs.readFileSync(f, 'utf8');
  const m2 = check.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  let ok = false;
  try {
    const d2 = yaml.parse(m2[1]);
    ok =
      d2?.summary?.full === '' &&
      typeof d2?.summary?.short === 'string' &&
      d2.summary.short.length > 0 &&
      (m2[2] || '').trim().length > 0;
  } catch {
    ok = false;
  }
  console.log(
    ok ? 'OK ' : 'BAD',
    `${String(full.length).padStart(5)}→body`,
    f.replace('public/content/个人成长与生存策略/', ''),
  );
  if (!ok) process.exitCode = 1;
  else migrated++;
}
console.log(`\n${dryRun ? '[dry-run] ' : ''}migrated ${migrated}/${FILES.length}`);
