// src/scripts/audit-frontmatter.ts
// 扫描全部 content/.md 文件的 frontmatter，生成审核打分表 docs/frontmatter-audit.md
//
// 检测范围：
//   1) 基础字段分（id/label/essence/field/tier/summary/edges_out/location）
//   2) ADR-0001 关系方向合规（has 仅用于物理组成；层级关系一律用 isa 子→父）
//   3) 双向 has/isa/relates 配对
//   4) 非 book 节点缺少 isa 边（warning 级别）

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { parse as yamlParse } from 'yaml';

const CONTENT_DIR = path.resolve('content');
const OUTPUT_FILE = path.resolve('docs/frontmatter-audit.md');

// ── Schema 值 ──────────────────────────────────────────────────────
const VALID_ESSENCE = [
  'notion', 'medication', 'illness', 'route', 'substance', 'process', 'module', 'section',
  'drug', 'disease', 'pathogen', 'mechanism', 'ingredient', 'concept', 'service', 'pathway', 'indicator',
  'book', 'chapter', 'part',
];
const VALID_FIELD = [
  'pharmaceutics', 'pharmacokinetics', 'medicinal_chemistry', 'pharmacology',
  'toxicology', 'biopharmaceutics', 'clinical_pharmacy', 'pharmacy_service',
  'cardiovascular', 'respiratory', 'digestive', 'endocrine',
  'musculoskeletal', 'anti_infective', 'anti_tumor', 'blood',
  'immunology', 'dermatology', 'antipyretic', 'anti_rheumatic',
  'anti_gout', 'nutrition', 'diagnostic', 'pharmacy_practice',
];
const VALID_TIER = [
  'basic', 'drug', 'disease', 'management', 'service', 'legal',
  'foundation', 'system', 'clinical',
];

const LOC_KEYS = ['book', 'part', 'chapter', 'section', 'point', 'item', 'subsection'] as const;
type LocKey = typeof LOC_KEYS[number];
const LOC_RANK: Record<LocKey, number> = {
  book: 0, part: 1, chapter: 2, section: 3, point: 4, item: 5, subsection: 6,
};

function isKebabCase(s: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
}

// ── Frontmatter 解析 ────────────────────────────────────────────────
interface EdgeDef { target: string; type: string; reason?: string; }
interface ParsedFM {
  id?: string;
  label?: string;
  essence?: string;
  type?: string;
  field?: string;
  category?: string;
  tier?: string;
  layer?: string;
  summary?: string | { short?: string; full?: string };
  location?: Record<string, string>;
  tags?: string[];
  edges_out?: EdgeDef[];
  __hadFrontmatter: boolean;
}

function pickSource(root: Record<string, unknown>): Record<string, unknown> {
  const nested = root['data'];
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : root;
}

function extractFrontmatter(content: string): ParsedFM {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { __hadFrontmatter: false };

  let root: Record<string, unknown> = {};
  try {
    const parsed = yamlParse(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      root = parsed as Record<string, unknown>;
    }
  } catch { /* fallback empty */ }

  const fm = pickSource(root);
  const edgesRaw = (root['edges_out'] as unknown[]) ?? (fm['edges_out'] as unknown[]) ?? [];
  const edges: EdgeDef[] = Array.isArray(edgesRaw)
    ? edgesRaw
        .filter((e): e is Record<string, unknown> =>
          typeof e === 'object' && e !== null && !Array.isArray(e))
        .map(e => ({
          target: String(e['target'] ?? ''),
          type: String(e['type'] ?? 'relates'),
          reason: typeof e['reason'] === 'string' ? e['reason'] : undefined,
        }))
        .filter(e => Boolean(e.target))
    : [];

  const summary = fm['summary'];
  const summaryStr =
    typeof summary === 'string' ? summary :
    typeof summary === 'object' && summary !== null ?
      ((summary as { full?: string }).full ?? (summary as { short?: string }).short ?? '') :
      '';

  return {
    id: typeof fm['id'] === 'string' ? fm['id'] as string : undefined,
    label: typeof fm['label'] === 'string' ? fm['label'] as string : undefined,
    essence: typeof fm['essence'] === 'string' ? fm['essence'] as string : undefined,
    type: typeof fm['type'] === 'string' ? fm['type'] as string : undefined,
    field: typeof fm['field'] === 'string' ? fm['field'] as string : undefined,
    category: typeof fm['category'] === 'string' ? fm['category'] as string : undefined,
    tier: typeof fm['tier'] === 'string' ? fm['tier'] as string : undefined,
    layer: typeof fm['layer'] === 'string' ? fm['layer'] as string : undefined,
    summary: summaryStr,
    location: fm['location'] && typeof fm['location'] === 'object' && !Array.isArray(fm['location'])
      ? (fm['location'] as Record<string, string>)
      : undefined,
    tags: Array.isArray(fm['tags'])
      ? (fm['tags'] as unknown[]).filter((t): t is string => typeof t === 'string')
      : [],
    edges_out: edges,
    __hadFrontmatter: true,
  };
}

// ── 评分（基础字段分） ─────────────────────────────────────────────
interface Score {
  id: number; label: number; essence: number; field: number; tier: number;
  summary: number; edges_out: number; location: number; tags: number;
}

function scoreField(fm: ParsedFM, field: keyof Score): number {
  if (field === 'id') {
    const v = fm.id;
    if (!v) return 1;
    return isKebabCase(v) ? 3 : 1;
  }
  if (field === 'label') return fm.label ? 3 : 1;
  if (field === 'essence') {
    const v = (fm.essence ?? fm.type ?? '').toLowerCase();
    if (!v) return 2;
    return VALID_ESSENCE.includes(v) ? 3 : 1;
  }
  if (field === 'field') {
    const v = (fm.field ?? fm.category ?? '').toLowerCase();
    if (!v) return 2;
    return VALID_FIELD.includes(v) ? 3 : 2;
  }
  if (field === 'tier') {
    const v = (fm.tier ?? fm.layer ?? '').toLowerCase();
    if (!v) return 2;
    return VALID_TIER.includes(v) ? 3 : 1;
  }
  if (field === 'summary') {
    if (!fm.summary) return 2;
    const s = typeof fm.summary === 'string' ? fm.summary.trim() :
      ((fm.summary as { full?: string }).full ?? (fm.summary as { short?: string }).short ?? '');
    return (s && s !== '{}') ? 3 : 2;
  }
  if (field === 'edges_out') {
    return (fm.edges_out && fm.edges_out.length > 0) ? 3 : 2;
  }
  if (field === 'location') {
    return (fm.location && Object.keys(fm.location).length > 0) ? 3 : 2;
  }
  if (field === 'tags') return 3;
  return 2;
}

function scoreAll(fm: ParsedFM): Score {
  return {
    id: scoreField(fm, 'id'),
    label: scoreField(fm, 'label'),
    essence: scoreField(fm, 'essence'),
    field: scoreField(fm, 'field'),
    tier: scoreField(fm, 'tier'),
    summary: scoreField(fm, 'summary'),
    edges_out: scoreField(fm, 'edges_out'),
    location: scoreField(fm, 'location'),
    tags: scoreField(fm, 'tags'),
  };
}

function scoreTotal(scores: Score[]): number {
  const keys: (keyof Score)[] = ['id', 'label', 'essence', 'field', 'tier', 'summary', 'edges_out', 'location'];
  let correct = 0;
  let total = 0;
  for (const key of keys) {
    for (const s of scores) {
      total++;
      if (s[key] === 3) correct++;
    }
  }
  return Math.round((correct / total) * 100);
}

// ── Location helpers ───────────────────────────────────────────────
function lastLocationKey(loc: Record<string, string> | undefined): LocKey | null {
  if (!loc) return null;
  for (let i = LOC_KEYS.length - 1; i >= 0; i--) {
    const k = LOC_KEYS[i];
    if (loc[k]) return k;
  }
  return null;
}

/** target 是不是在 prefix 的下级 location（更深一级或更多） */
function isLocationUnder(targetLoc: Record<string, string> | undefined, prefixLoc: Record<string, string> | undefined): boolean {
  if (!targetLoc || !prefixLoc) return false;
  const prefLast = lastLocationKey(prefixLoc);
  const tgtLast = lastLocationKey(targetLoc);
  if (!prefLast || !tgtLast) return false;
  if (LOC_RANK[tgtLast] <= LOC_RANK[prefLast]) return false;
  for (let i = 0; i <= LOC_RANK[prefLast]; i++) {
    const k = LOC_KEYS[i];
    if ((targetLoc[k] ?? '') !== (prefixLoc[k] ?? '')) return false;
  }
  return true;
}

// ── FileResult ─────────────────────────────────────────────────────
interface DirIssue {
  relPath: string;
  sourceId: string;
  target: string;
  edgeType: string;
  reason: string;
  severity: 'error' | 'warning';
}
interface BidirPair {
  sourceId: string;
  targetId: string;
  edgeType: string;
  sourceRel: string;
  targetRel: string;
}
interface FileResult {
  relPath: string;
  fm: ParsedFM;
  score: Score;
  baseIssues: string[];
  dirIssues: DirIssue[];
  hasIsaOut: boolean;
}

// ── ADR-0001 关系方向检测 ───────────────────────────────────────────
function detectDirIssues(r: FileResult, all: FileResult[]): { dirIssues: DirIssue[]; bidirPairs: BidirPair[] } {
  const dirIssues: DirIssue[] = [];
  const bidirPairs: BidirPair[] = [];
  const idIndex = new Map<string, FileResult>();
  for (const x of all) if (x.fm.id) idIndex.set(x.fm.id, x);

  const myId = r.fm.id;
  if (!myId) return { dirIssues, bidirPairs };

  const myLoc = r.fm.location ?? {};

  // 收集"我有资格 isa 的所有上级 id"（可能多个，按层级粒度）
  const myParents: string[] = [];
  for (const [id, other] of idIndex.entries()) {
    if (id === myId) continue;
    if (!other.fm.location) continue;
    const oLast = lastLocationKey(other.fm.location);
    const myLast = lastLocationKey(myLoc);
    if (!oLast || !myLast) continue;
    const oRank = LOC_RANK[oLast];
    const myRank = LOC_RANK[myLast];
    if (oRank >= myRank) continue;
    let prefixMatch = true;
    for (let i = 0; i <= oRank; i++) {
      const k = LOC_KEYS[i];
      if ((myLoc[k] ?? '') !== (other.fm.location[k] ?? '')) {
        prefixMatch = false;
        break;
      }
    }
    if (prefixMatch) myParents.push(id);
  }

  let hasIsaOut = false;

  for (const edge of r.fm.edges_out ?? []) {
    const tgt = edge.target;
    const type = (edge.type ?? '').toLowerCase();
    if (!tgt) continue;

    // 双向配对检查：只在字典序较小的节点 push 一次
    if (idIndex.has(tgt)) {
      const tgtFr = idIndex.get(tgt)!;
      if (myId < tgt) {  // ensure single-direction discovery
        const back = (tgtFr.fm.edges_out ?? []).find(e => e.target === myId);
        if (back) {
          const bt = (back.type ?? '').toLowerCase();
          if (type === bt && (type === 'has' || type === 'isa' || type === 'relates')) {
            bidirPairs.push({
              sourceId: myId,
              targetId: tgt,
              edgeType: type,
              sourceRel: r.relPath,
              targetRel: tgtFr.relPath,
            });
          }
        }
      }
    }

    if (type === 'isa') hasIsaOut = true;

    // has 指向 location 子级 → 违规（应改 isa）
    if (type === 'has') {
      const tgtFr = idIndex.get(tgt);
      if (tgtFr?.fm.location) {
        if (isLocationUnder(tgtFr.fm.location, myLoc)) {
          dirIssues.push({
            relPath: r.relPath,
            sourceId: myId,
            target: tgt,
            edgeType: 'has',
            reason: `has 边指向 location 子级节点（${lastLocationKey(tgtFr.fm.location)}）。修复方法：删除此 has 边，改为在子节点添加 \`- target: ${myId}, type: isa\`。`,
            severity: 'warning',
          });
        } else if (myParents.includes(tgt)) {
          dirIssues.push({
            relPath: r.relPath,
            sourceId: myId,
            target: tgt,
            edgeType: 'has',
            reason: `has 边指向 location 上级节点。应为反向 isa 或 relates。`,
            severity: 'warning',
          });
        }
      }
    }

    // isa 指向 location 子级 → 反向
    if (type === 'isa') {
      const tgtFr = idIndex.get(tgt);
      if (tgtFr?.fm.location && isLocationUnder(tgtFr.fm.location, myLoc)) {
        dirIssues.push({
          relPath: r.relPath,
          sourceId: myId,
          target: tgt,
          edgeType: 'isa',
          reason: `isa 边指向 location 子级节点。isa 必须是子→父。`,
          severity: 'warning',
        });
      }
    }
  }

  r.hasIsaOut = hasIsaOut;
  return { dirIssues, bidirPairs };
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const files = await glob('**/*.md', { cwd: CONTENT_DIR, absolute: false });
  files.sort();

  const results: FileResult[] = [];

  for (const rel of files) {
    const full = path.join(CONTENT_DIR, rel);
    const content = fs.readFileSync(full, 'utf-8');
    const fm = extractFrontmatter(content);

    if (!fm.__hadFrontmatter) {
      results.push({
        relPath: rel,
        fm,
        score: { id: 1, label: 1, essence: 2, field: 2, tier: 2, summary: 2, edges_out: 2, location: 2, tags: 3 },
        baseIssues: ['❌ 无 frontmatter'],
        dirIssues: [],
        hasIsaOut: false,
      });
      continue;
    }

    const score = scoreAll(fm);
    const baseIssues: string[] = [];

    if (score.id === 1) baseIssues.push(`❌ id 错误：\`${fm.id ?? 'N/A'}\`（应为 kebab-case）`);
    if (score.label === 1) baseIssues.push(`❌ label 缺失`);
    const essenceVal = fm.essence ?? fm.type ?? '';
    if (score.essence === 1) baseIssues.push(`❌ essence/type 错误：\`${essenceVal || 'N/A'}\``);
    if (score.essence === 2) baseIssues.push(`⚠️ essence/type 缺失`);
    const fieldVal = fm.field ?? fm.category ?? '';
    if (score.field === 1) baseIssues.push(`❌ field/category 值非法：\`${fieldVal}\``);
    if (score.field === 2) baseIssues.push(`⚠️ field/category 缺失`);
    const tierVal = fm.tier ?? fm.layer ?? '';
    if (score.tier === 1) baseIssues.push(`❌ tier/layer 值非法：\`${tierVal}\``);
    if (score.tier === 2) baseIssues.push(`⚠️ tier/layer 缺失`);
    if (score.summary === 2) baseIssues.push(`⚠️ summary 为空`);
    if (score.edges_out === 2) baseIssues.push(`⚠️ edges_out 为空`);
    if (score.location === 2) baseIssues.push(`⚠️ location 缺失`);

    results.push({ relPath: rel, fm, score, baseIssues, dirIssues: [], hasIsaOut: false });
  }

  // 第一遍：检测 ADR 关系方向 + 双向配对
  const allBidirPairs: BidirPair[] = [];
  for (const r of results) {
    const { dirIssues, bidirPairs } = detectDirIssues(r, results);
    r.dirIssues = dirIssues;
    allBidirPairs.push(...bidirPairs);
  }

  // 第二遍：补一遍"isa 来自父反向"判断（看其他节点是否反向写了 isa 指向我）
  const isaInByNode = new Map<string, boolean>();
  for (const r of results) {
    if (r.hasIsaOut) {
      isaInByNode.set(r.fm.id!, true);
      continue;
    }
    let inboundIsa = false;
    for (const other of results) {
      if (other.fm.id === r.fm.id) continue;
      for (const e of other.fm.edges_out ?? []) {
        if (e.target === r.fm.id && (e.type ?? '').toLowerCase() === 'isa') {
          inboundIsa = true;
          break;
        }
      }
      if (inboundIsa) break;
    }
    isaInByNode.set(r.fm.id ?? '__anon__', inboundIsa);
  }

  // ADR-0001.5: 非 book 根节点建议至少有 1 条 isa 边
  for (const r of results) {
    const id = r.fm.id;
    const loc = r.fm.location ?? {};
    if (!id) continue;
    const isBookRoot = r.fm.essence === 'book' || (lastLocationKey(loc) === 'book');
    if (isBookRoot) continue;
    const hasIsa = r.hasIsaOut || isaInByNode.get(id) === true;
    if (!hasIsa) {
      r.baseIssues.push(`⚠️ (ADR-0001) 非 book 节点无 isa 边，建议补充`);
    }
  }

  // Group by top-level directory
  const groups = new Map<string, FileResult[]>();
  for (const r of results) {
    const parts = r.relPath.split(path.sep);
    const top = parts.length > 1 ? parts[0] : r.relPath;
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top)!.push(r);
  }

  const totalPct = scoreTotal(results.map(r => r.score));
  const errCount = results.filter(r => Object.values(r.score).some(s => s === 1)).length;
  const warnCount = results.filter(r =>
    !Object.values(r.score).some(s => s === 1) &&
    r.baseIssues.some(i => i.startsWith('⚠️'))
  ).length;
  const dirIssueCount = results.reduce((acc, r) => acc + r.dirIssues.length, 0);
  const bidirCount = allBidirPairs.length;
  const noIsaCount = results.filter(r => r.baseIssues.some(i => i.includes('无 isa 边'))).length;

  let md = `# Frontmatter 审核报告\n\n`;
  md += `> 生成时间：${new Date().toLocaleString('zh-CN')}\n`;
  md += `> 总文件数：${results.length} | 字段完成度：**${totalPct}%**\n\n`;
  md += `## 评分说明\n\n`;
  md += `| 符号 | 含义 |\n|---|---|\n`;
  md += `| ❌ | 严重错误（字段缺失、值非法） |\n`;
  md += `| ⚠️ | 缺失/不完整（字段存在但为空或非标准化） |\n`;
  md += `| ✅ | 正确 |\n`;
  md += `| 🔁 | 关系方向违规（见 [ADR-0001]） |\n\n`;

  md += `## 总体统计\n\n`;
  md += `| 指标 | 数值 |\n|---|---|\n`;
  md += `| ❌ 有严重错误的文件 | ${errCount} / ${results.length} |\n`;
  md += `| ⚠️ 有警告的文件 | ${warnCount} / ${results.length} |\n`;
  md += `| 🔁 关系方向违规（has↔location 子级） | ${dirIssueCount} 处 |\n`;
  md += `| 🔁 双向 has/isa/relates 配对 | ${bidirCount} 处 |\n`;
  md += `| ⚠️ 非 book 节点缺 isa 边（建议） | ${noIsaCount} 处 |\n`;
  md += `| 字段完成度 | ${totalPct}% |\n\n`;

  md += `---\n\n`;
  md += `## 文件明细\n\n`;
  md += `> 🔁 列含义：见 \`docs/ADR-0001-层级关系统一使用isa方向.md\`\n`;
  md += `> \`-无\`: 本节点无方向违规\n\n`;

  let rowNo = 0;
  for (const [group, files] of groups) {
    md += `### ${group}\n\n`;
    md += `| # | 文件 | id | essence | field | tier | summary | edges | 🔁 | 完成度 |\n`;
    md += `|---|---|---|---|---|---|---|---|---|---|\n`;
    for (const r of files) {
      rowNo++;
      const keys: (keyof Score)[] = ['id', 'label', 'essence', 'field', 'tier', 'summary', 'edges_out'];
      const correct = keys.filter(k => r.score[k] === 3).length;
      const pct = Math.round((correct / keys.length) * 100);
      const idDisplay = r.score.id === 3
        ? `✅ \`${r.fm.id ?? '—'}\`` : `❌ \`${r.fm.id ?? '—'}\``;
      const essenceVal = (r.fm.essence ?? r.fm.type ?? '—').toString();
      const essenceDisplay = r.score.essence === 3 ? `✅ ${essenceVal}` :
        r.score.essence === 2 ? `⚠️ —` : `❌ ${essenceVal}`;
      const fieldVal = (r.fm.field ?? r.fm.category ?? '—').toString();
      const fieldDisplay = r.score.field === 3 ? `✅ ${fieldVal}` :
        r.score.field === 2 ? `⚠️ —` : `❌ ${fieldVal}`;
      const tierVal = (r.fm.tier ?? r.fm.layer ?? '—').toString();
      const tierDisplay = r.score.tier === 3 ? `✅ ${tierVal}` :
        r.score.tier === 2 ? `⚠️ —` : `❌ ${tierVal}`;
      const sumDisplay = r.score.summary === 3 ? `✅` : `⚠️`;
      const edgeDisplay = r.score.edges_out === 3 ? `✅` : `⚠️`;
      const dirMark = r.dirIssues.length === 0 ? `-无` : `🔁×${r.dirIssues.length}`;
      md += `| ${rowNo} | \`${r.relPath}\` | ${idDisplay} | ${essenceDisplay} | ${fieldDisplay} | ${tierDisplay} | ${sumDisplay} | ${edgeDisplay} | ${dirMark} | ${pct}% |\n`;
    }
    md += `\n`;
  }

  md += `---\n\n`;
  md += `## 待修正问题汇总\n\n`;

  md += `### 基础字段问题\n\n`;
  const baseIssuesAll: { relPath: string; issue: string }[] = [];
  for (const r of results) {
    for (const i of r.baseIssues) {
      if (i.includes('无 isa 边')) continue;
      baseIssuesAll.push({ relPath: r.relPath, issue: i });
    }
  }
  if (baseIssuesAll.length === 0) {
    md += `🎉 无基础字段问题。\n\n`;
  } else {
    md += `共 ${baseIssuesAll.length} 个：\n\n`;
    const byGroup = new Map<string, { relPath: string; issue: string }[]>();
    for (const it of baseIssuesAll) {
      const grp = it.relPath.split(path.sep)[0];
      if (!byGroup.has(grp)) byGroup.set(grp, []);
      byGroup.get(grp)!.push(it);
    }
    for (const [g, items] of byGroup) {
      md += `#### ${g}\n`;
      for (const i of items) md += `- **\`${i.relPath}\`**：${i.issue}\n`;
      md += `\n`;
    }
  }

  md += `### 🔁 ADR-0001 关系方向问题\n\n`;
  md += `> 详见 \`docs/ADR-0001-层级关系统一使用isa方向.md\`。本文按目录分组列出违规边，可直接对照修改。\n\n`;

  md += `#### （a）has 边指向 location 子级（共 ${dirIssueCount} 处）\n\n`;
  if (dirIssueCount > 0) {
    const byGroup = new Map<string, DirIssue[]>();
    for (const it of results.flatMap(r => r.dirIssues)) {
      const grp = it.relPath.split(path.sep)[0];
      if (!byGroup.has(grp)) byGroup.set(grp, []);
      byGroup.get(grp)!.push(it);
    }
    for (const [g, items] of byGroup) {
      md += `##### ${g}\n`;
      for (const it of items) {
        md += `- **\`${it.relPath}\`** → \`${it.target}\`：${it.reason}\n`;
      }
      md += `\n`;
    }
  } else {
    md += `🎉 未发现 has 指向 location 子级节点。\n\n`;
  }

  md += `#### （b）双向 has/isa/relates 配对（共 ${bidirCount} 个边对）\n\n`;
  if (bidirCount > 0) {
    md += `> A→B 与 B→A 同类型边互指，违反 ADR-0001 "禁止双向书写同一关系"。\n\n`;
    md += `| 源节点 → 目标节点 | 类型 |\n|---|---|\n`;
    for (const p of allBidirPairs) {
      md += `| \`${p.sourceRel}\` ↔ \`${p.targetRel}\` | ${p.edgeType} |\n`;
    }
    md += `\n`;
  } else {
    md += `🎉 未发现双向配对。\n\n`;
  }

  const noIsaList = results.filter(r => r.baseIssues.some(i => i.includes('无 isa 边')));
  md += `#### （c）非 book 节点缺 isa 边（共 ${noIsaList.length} 处，建议）\n\n`;
  if (noIsaList.length === 0) {
    md += `🎉 全部非 book 节点都已具备 isa 边。\n\n`;
  } else {
    md += `> 按 ADR-0001 第 5 条执行口径，仅做 warning 提示，不阻断构建。优先在已具有 location 的节点补 isa 边。\n\n`;
    const byGroup = new Map<string, string[]>();
    for (const r of noIsaList) {
      const grp = r.relPath.split(path.sep)[0];
      if (!byGroup.has(grp)) byGroup.set(grp, []);
      byGroup.get(grp)!.push(r.relPath);
    }
    for (const [g, items] of byGroup) {
      md += `##### ${g}\n`;
      for (const p of items) md += `- \`${p}\`\n`;
      md += `\n`;
    }
  }

  md += `---\n\n`;
  md += `## 修复策略（ADR-0001 落地）\n\n`;
  md += `对于 (a)/(b) 类问题，按下述顺序处理：\n\n`;
  md += `1. **确定层级归属**：每个节点的 \`location\` 已经定义了它在树中的位置。\n`;
  md += `2. **删除父→子的 \`has\` 边**：父节点只需靠 location 知道它包含哪些子节点，不用边显式枚举。\n`;
  md += `3. **在子节点加 \`type: isa\` 指父**：保留子→父的链路，确保图谱能自上而下遍历。\n`;
  md += `4. **\`has\` 边全部转化为 \`isa\`**：本项目当前不存在真正的"物理组成" \`has\` 用例（制剂→辅料、人体→器官尚未建模）。所以可以认为所有 \`has\` 都是层级包含，按上面 1/2/3 处理。如果未来引入物理组成场景，可保留这些 \`has\`。\n`;
  md += `5. **删除双向配对中的反向边**：A→B 与 B→A 同类型时，保留语义更准确的那一条（一般保留子→父的 \`isa\`）。\n\n`;

  md += `---\n\n`;
  md += `## 修正进度\n\n`;
  md += `| 状态 | 数量 |\n|---|---|\n`;
  md += `| ❌ 未开始 | ${errCount} |\n`;
  md += `| 🔄 进行中 | 0 |\n`;
  md += `| ✅ 已完成 | ${results.length - errCount} |\n\n`;
  md += `> 每完成一个文件，在此文档对应行标记 ✅ 并更新上方表格。\n`;

  fs.writeFileSync(OUTPUT_FILE, md, 'utf-8');
  console.log(`✅ 审核报告已写入：${OUTPUT_FILE}`);
  console.log(`📊 总文件：${results.length} | ❌严重错误：${errCount} | ⚠️警告：${warnCount} | 完成度：${totalPct}%`);
  console.log(`🔁 ADR 方向：has↔子级 ${dirIssueCount} 处 | 双向配对 ${bidirCount} 处 | 缺 isa ${noIsaCount} 处`);
}

main().catch(e => { console.error(e); process.exit(1); });
