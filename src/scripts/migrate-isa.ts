// src/scripts/migrate-isa.ts
// 按 ADR-0001 把层级边统一为子→父 isa，删父→子 has，把同级/横切 has 改为 relates
// 默认 dry-run：只打报告，不改文件。加 --apply 才落盘。
// 用法：node --import tsx src/scripts/migrate-isa.ts [--apply]

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

const CONTENT_DIR = path.resolve('public/content');
const REPORT_FILE = path.resolve('docs/migration-report.md');
const APPLY = process.argv.includes('--apply');

// location 字段集（来自 docs/frontmatter.md）
const LOC_KEYS = ['book', 'part', 'chapter', 'section', 'subsection', 'item'] as const;
type LocKey = typeof LOC_KEYS[number];
const LOC_RANK: Record<LocKey, number> = Object.fromEntries(LOC_KEYS.map((k, i) => [k, i])) as any;

interface Loc { book?: string; part?: string; chapter?: string; section?: string; subsection?: string; item?: string; }
interface Edge { target: string; type: string; reason?: string; }
interface ParsedFile {
  rel: string;
  raw: string;
  yamlBlock: string;
  body: string;
  root: Record<string, unknown>;   // YAML 根 map（可能含 data:）
  fm:  Record<string, unknown>;    // data: 块或根 map（取非空者）
  id?: string;
  loc: Loc;
  edges: Edge[];                   // 来自根级 edges_out
  hasDataBlock: boolean;
}

function readFile(rel: string): ParsedFile | null {
  const full = path.join(CONTENT_DIR, rel);
  const raw = fs.readFileSync(full, 'utf-8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;

  let root: Record<string, unknown> = {};
  try { root = (yamlParse(m[1]) as Record<string, unknown>) ?? {}; } catch { return null; }

  const nested = root['data'];
  const hasDataBlock = nested && typeof nested === 'object' && !Array.isArray(nested);
  const fm = (hasDataBlock ? (nested as Record<string, unknown>) : root);

  const idRaw = fm['id'];
  const locRaw = fm['location'];
  const loc: Loc = locRaw && typeof locRaw === 'object' && !Array.isArray(locRaw)
    ? (locRaw as Loc) : {};

  const edgesRaw = (root['edges_out'] ?? fm['edges_out']) as unknown[] | undefined;
  const edges: Edge[] = Array.isArray(edgesRaw)
    ? edgesRaw
        .filter((e): e is Record<string, unknown> =>
          typeof e === 'object' && e !== null && !Array.isArray(e))
        .map((e) => ({
          target: String(e['target'] ?? '').trim(),
          type:   String(e['type'] ?? 'relates').trim(),
          reason: typeof e['reason'] === 'string' ? (e['reason'] as string).trim() : undefined,
        }))
        .filter((e) => Boolean(e.target))
    : [];

  return {
    rel, raw, yamlBlock: m[1], body: m[2],
    root, fm, id: typeof idRaw === 'string' ? idRaw.trim() : undefined,
    loc, edges, hasDataBlock,
  };
}

function lastLocKey(loc: Loc): LocKey | null {
  for (let i = LOC_KEYS.length - 1; i >= 0; i--) {
    const k = LOC_KEYS[i];
    if (loc[k]) return k;
  }
  return null;
}

/** t 是否在 p 的 location 子树下（共享前缀 + t 比 p 多一级） */
function isUnder(t: Loc, p: Loc): boolean {
  const tL = lastLocKey(t), pL = lastLocKey(p);
  if (!tL || !pL) return false;
  if (LOC_RANK[tL] <= LOC_RANK[pL]) return false;
  for (let i = 0; i <= LOC_RANK[pL]; i++) {
    const k = LOC_KEYS[i];
    if (t[k] !== p[k]) return false;
  }
  return true;
}

function eqLoc(t: Loc, p: Loc): boolean {
  return lastLocKey(t) === lastLocKey(p) && LOC_KEYS.every(k => t[k] === p[k]);
}

// 把"如何转换"封装成一个函数，方便 dry-run 报告
function planTransform(self: ParsedFile, byId: Map<string, ParsedFile>): {
  newEdges: Edge[];            // self 重写后的 edges_out
  toAddIsa: Array<{ selfId: string; parentId: string; reason?: string }>; // 子节点要追加 isa
  changes: string[];           // 变更说明
} {
  const changes: string[] = [];
  const newEdges: Edge[] = [];

  for (const e of self.edges) {
    if (e.type === 'has') {
      const tgt = byId.get(e.target);
      if (!tgt) {
        // 目标不存在：降级 relates 保留
        changes.push(`  has→relates（target 缺失）: ${e.target}`);
        newEdges.push({ ...e, type: 'relates' });
        continue;
      }
      if (!tgt.loc || lastLocKey(tgt.loc) === null) {
        changes.push(`  has→relates（target 无 location）: ${e.target}`);
        newEdges.push({ ...e, type: 'relates' });
        continue;
      }
      if (!self.loc || lastLocKey(self.loc) === null) {
        changes.push(`  has→relates（自身无 location）: ${e.target}`);
        newEdges.push({ ...e, type: 'relates' });
        continue;
      }
      if (isUnder(tgt.loc, self.loc)) {
        // 父→子：删除，标记子补 isa
        changes.push(`  父→子 has 删除: ${self.id} --has→ ${e.target}（子将补 isa）`);
        // 不 push
        continue;
      }
      if (isUnder(self.loc, tgt.loc)) {
        // 子→父：改为 isa
        changes.push(`  子→父 has→isa: ${self.id} --has→ ${e.target}`);
        newEdges.push({
          target: e.target,
          type:   'isa',
          reason: e.reason,
        });
        continue;
      }
      // 同级或跨分支：降级 relates
      changes.push(`  同级 has→relates: ${self.id} --has→ ${e.target}`);
      newEdges.push({ ...e, type: 'relates' });
      continue;
    }
    newEdges.push(e);
  }

  // 第二轮：检查自己的 edges_out 里是否已经有指父的 isa，没有则补
  const toAddIsa: Array<{ selfId: string; parentId: string; reason?: string }> = [];
  // 这里我们不下结论——"父→子 has 删除"的责任是子节点（子要写 isa）。
  // 收集需要补 isa 的子，由调用方在子节点 plan 时处理。
  return { newEdges, toAddIsa, changes };
}

function planIsaForChildren(self: ParsedFile, byId: Map<string, ParsedFile>): {
  append: Edge[];        // self 需要在 edges_out 末尾追加的 isa
  reasons: string[];
} {
  const append: Edge[] = [];
  const reasons: string[] = [];

  if (!self.id || !self.loc || lastLocKey(self.loc) === null) {
    // 自己没有 location 或 id：不能推断父，跳过
    return { append, reasons };
  }
  // 自己已经写在 edges_out 里指向某个上级？
  const hasIsaToParent = self.edges.some(e => e.type === 'isa');
  if (hasIsaToParent) {
    reasons.push('  已有 isa：跳过自动补');
    return { append, reasons };
  }

  // 寻找 location 直接父节点：location 树上比自己浅 1 级的最近节点
  const myRank = LOC_RANK[lastLocKey(self.loc)!];
  if (myRank === 0) {
    reasons.push('  位于 book 根：不补 isa');
    return { append, reasons };
  }
  const parentRankKey = LOC_KEYS[myRank - 1];
  // 父节点的 location 应满足：共享前 parentRank 的字段，但缺少当前字段
  // —— 实际上父节点可能没有自己的 frontmatter（罕见）。优先在 byId 中按 id 找。
  // 但我们没有 parentId，只知道 location 前缀。所以需要扫描 byId。
  const parentLoc: Loc = {};
  for (let i = 0; i <= LOC_RANK[parentRankKey]; i++) parentLoc[LOC_KEYS[i]] = self.loc[LOC_KEYS[i]];

  let parent: ParsedFile | undefined;
  for (const cand of byId.values()) {
    if (cand.id === self.id) continue;
    if (!cand.loc) continue;
    if (lastLocKey(cand.loc) !== parentRankKey) continue;
    if (LOC_KEYS.slice(0, LOC_RANK[parentRankKey] + 1).every(k => cand.loc[k] === parentLoc[k])) {
      parent = cand;
      break;
    }
  }
  if (!parent || !parent.id) {
    reasons.push(`  未找到 location 父（rank=${parentRankKey}）：跳过`);
    return { append, reasons };
  }
  append.push({ target: parent.id, type: 'isa' });
  reasons.push(`  补 isa: ${self.id} --isa→ ${parent.id}`);
  return { append, reasons };
}

function isEdgeEq(a: Edge, b: Edge): boolean {
  return a.target === b.target && a.type === b.type && (a.reason ?? '') === (b.reason ?? '');
}

function applyTransforms(plans: Map<string, { newEdges: Edge[] }>, appendPlans: Map<string, Edge[]>): void {
  for (const [rel, plan] of plans.entries()) {
    const full = path.join(CONTENT_DIR, rel);
    const f = readFile(rel);
    if (!f) continue;
    const append = appendPlans.get(rel) ?? [];
    // 合并 append，跳过已存在的
    const merged = [...plan.newEdges];
    for (const a of append) {
      if (!merged.some(e => isEdgeEq(e, a))) merged.push(a);
    }
    // 写文件：用 yaml 重写
    const root = { ...f.root };
    // 保留 data: 块内容，去掉旧的 edges_out
    if (f.hasDataBlock) {
      const data = { ...(root['data'] as Record<string, unknown>) };
      delete data['edges_out'];
      root['data'] = data;
    } else {
      delete root['edges_out'];
    }
    if (merged.length > 0) {
      root['edges_out'] = merged;
    } else {
      delete root['edges_out'];
    }
    const yaml = yamlStringify(root, { lineWidth: 0 }).trimEnd();
    const newContent = '---\n' + yaml + '\n---\n' + f.body;
    fs.writeFileSync(full, newContent, 'utf-8');
  }
}

async function main() {
  console.log(APPLY ? '🟢 APPLY 模式：会修改文件' : '🟡 DRY-RUN 模式：不修改文件');
  console.log(`来源：${CONTENT_DIR}\n`);

  const rels = (await glob('**/*.md', { cwd: CONTENT_DIR })).sort();
  const files: ParsedFile[] = [];
  for (const rel of rels) {
    const f = readFile(rel);
    if (f) files.push(f);
  }
  const byId = new Map<string, ParsedFile>();
  for (const f of files) if (f.id) byId.set(f.id, f);

  // 第 1 轮：每文件 plan has 边处理
  const edgePlans = new Map<string, { newEdges: Edge[]; changes: string[] }>();
  const stats = {
    filesTouched: 0,
    parentChildHasDeleted: 0,
    childParentHasToIsa: 0,
    siblingHasToRelates: 0,
    unknownTargetHasToRelates: 0,
    preservedNonHas: 0,
  };

  for (const f of files) {
    const plan = planTransform(f, byId);
    edgePlans.set(f.rel, { newEdges: plan.newEdges, changes: plan.changes });
    if (plan.changes.length > 0) stats.filesTouched++;
    for (const c of plan.changes) {
      if (c.includes('父→子 has 删除')) stats.parentChildHasDeleted++;
      else if (c.includes('子→父 has→isa')) stats.childParentHasToIsa++;
      else if (c.includes('同级 has→relates')) stats.siblingHasToRelates++;
      else if (c.includes('target 缺失') || c.includes('无 location')) stats.unknownTargetHasToRelates++;
    }
    for (const e of plan.newEdges) {
      if (e.type !== 'has') stats.preservedNonHas++;
    }
  }

  // 第 2 轮：补 isa
  const appendPlans = new Map<string, Edge[]>();
  const isaAdded: Array<{ rel: string; from: string; to: string }> = [];
  for (const f of files) {
    const r = planIsaForChildren(f, byId);
    if (r.append.length > 0) appendPlans.set(f.rel, r.append);
    for (const a of r.append) {
      if (f.id && a.target) isaAdded.push({ rel: f.rel, from: f.id, to: a.target });
    }
  }

  console.log('--- 转换统计 ---');
  console.log(`  触及文件数: ${stats.filesTouched}`);
  console.log(`  父→子 has 删除（子将补 isa）: ${stats.parentChildHasDeleted}`);
  console.log(`  子→父 has→isa: ${stats.childParentHasToIsa}`);
  console.log(`  同级 has→relates: ${stats.siblingHasToRelates}`);
  console.log(`  异常 has→relates（target 缺失/无 location）: ${stats.unknownTargetHasToRelates}`);
  console.log(`  保留非 has 边（prerequisite/relates/treats/mechanism/sibling）: ${stats.preservedNonHas}`);
  console.log(`  计划追加 isa 边（子→父）: ${isaAdded.length}`);

  // 写出报告
  let report = `# ISA 迁移报告（${APPLY ? 'APPLY' : 'DRY-RUN'}）\n\n`;
  report += `> 生成时间：${new Date().toLocaleString('zh-CN')}\n`;
  report += `> 范围：\`content/**/*.md\`，共 ${files.length} 个文件\n\n`;
  report += `## 转换统计\n\n`;
  report += `| 类别 | 数量 |\n|---|---|\n`;
  report += `| 触及文件数 | ${stats.filesTouched} |\n`;
  report += `| 父→子 has 删除 | ${stats.parentChildHasDeleted} |\n`;
  report += `| 子→父 has→isa | ${stats.childParentHasToIsa} |\n`;
  report += `| 同级 has→relates | ${stats.siblingHasToRelates} |\n`;
  report += `| 异常 has→relates | ${stats.unknownTargetHasToRelates} |\n`;
  report += `| 保留非 has 边 | ${stats.preservedNonHas} |\n`;
  report += `| 计划追加 isa | ${isaAdded.length} |\n\n`;

  report += `## 详细变更\n\n`;
  let n = 0;
  for (const f of files) {
    const p = edgePlans.get(f.rel);
    if (!p || p.changes.length === 0) continue;
    n++;
    report += `### ${f.rel}${f.id ? ` (\`${f.id}\`)` : ''}\n\n`;
    for (const c of p.changes) report += `- ${c}\n`;
    report += `\n`;
  }
  report += `\n_共 ${n} 个文件的 edges_out 被改写。_\n\n`;

  report += `## 计划追加的 isa 边\n\n`;
  if (isaAdded.length === 0) {
    report += `_(无)_\n`;
  } else {
    report += `| 文件 | from | to |\n|---|---|---|\n`;
    for (const a of isaAdded) report += `| \`${a.rel}\` | \`${a.from}\` | \`${a.to}\` |\n`;
  }
  report += `\n`;

  fs.writeFileSync(REPORT_FILE, report, 'utf-8');
  console.log(`\n📄 报告写入：${REPORT_FILE}`);

  if (APPLY) {
    applyTransforms(edgePlans, appendPlans);
    console.log('✅ 已应用所有转换');
  } else {
    console.log('\n💡 加 --apply 即可落盘');
  }
}

main().catch(e => { console.error(e); process.exit(1); });