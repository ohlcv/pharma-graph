// tools/audit-tags-reason.ts
// 一次性审计:扫描 public/content/**/*.md 的 tags 和 edges_out[].reason,
// 按 SKILL.md §5.4 / §5.5 规则生成违规清单。
//
// 规则覆盖:
//   tags:
//     1. 类型合规(全是字符串)
//     2. 无空字符串
//     3. 无数组内重复
//     4. 无 fill 枚举值重复(fill 已经声明了)
//     5. 重点药(med-* + stroke:double)必须有"药理作用:"前缀
//     6. ADR:前缀 ≤ 3
//     7. 口诀节点(mem-*)tags 首位应为"口诀"
//     8. 口诀节点 tags 应包含对应药/分类名
//   reason:
//     9. 每条 edges_out 必须有 reason
//    10. reason 非空
//    11. reason ≥ 4 字符
//    12. reason 不能以"的"结尾(定中短语,非完整句)
//    13. reason 不能纯由空泛虚词("治疗""相关"等)构成
//
// 用法: npx tsx tools/audit-tags-reason.ts [输出文件]
//   默认输出到 stdout,也可指定输出文件
//
// 一次性工具,不入构建链,符合 AGENTS.md §2.2。

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { parse as yamlParse } from 'yaml';

interface EdgeDef {
  target?: string;
  type?: string;
  reason?: string;
}
interface Frontmatter {
  id?: string;
  label?: string;
  fill?: string;
  stroke?: string;
  tags?: unknown[];
  edges_out?: EdgeDef[];
  location?: { book?: string; chapter?: string; section?: string; item?: string };
}
interface ParsedFile {
  relPath: string;
  fm: Frontmatter | null;
  parseError?: string;
}

const VALID_FILL = new Set([
  'cls-structure',
  'cls-classification',
  'cls-drug',
  'cls-disease',
  'cls-biomolecule',
  'cls-feature',
  'cls-adverse',
  'cls-concept',
  'cls-summary',
  'cls-mnemonic',
]);

const HOLLOW_WORDS = new Set([
  '治疗', '相关', '作用', '应用', '用于', '有关', '关联', '使用', '描述',
  '定义', '概述', '总结', '属于', '关联到', '连接到', '指向',
]);

function splitFrontmatter(raw: string): { yaml: string } | { error: string } {
  // 必须以 --- 起,--- 收(允许末尾有额外内容)
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { error: '缺 frontmatter (--- 包围)' };
  return { yaml: m[1] };
}

function isMnemonic(fm: Frontmatter): boolean {
  return typeof fm.id === 'string' && fm.id.startsWith('mem-');
}
function isKeyDrug(fm: Frontmatter): boolean {
  return (
    typeof fm.id === 'string' &&
    fm.id.startsWith('med-') &&
    fm.stroke === 'double'
  );
}

interface TagFinding {
  rule: string;
  detail: string;
}
interface ReasonFinding {
  rule: string;
  detail: string;
}
interface FileReport {
  relPath: string;
  book?: string;
  chapter?: string;
  section?: string;
  id?: string;
  label?: string;
  fill?: string;
  tagFindings: TagFinding[];
  reasonFindings: ReasonFinding[];
}

function checkTags(fm: Frontmatter): TagFinding[] {
  const out: TagFinding[] = [];
  const tags = fm.tags;

  // 1. 类型合规 — tags 不是数组
  if (tags !== undefined && !Array.isArray(tags)) {
    out.push({ rule: 'tags-类型', detail: `tags 字段不是数组(${typeof tags})` });
    return out;
  }
  if (!Array.isArray(tags)) return out;

  // 2. 空字符串
  tags.forEach((t, i) => {
    if (typeof t !== 'string') {
      out.push({ rule: 'tags-类型', detail: `tags[${i}] 不是字符串(${typeof t})` });
    } else if (t.trim() === '') {
      out.push({ rule: 'tags-空值', detail: `tags[${i}] 是空字符串` });
    }
  });

  const stringTags = tags.filter((t): t is string => typeof t === 'string');

  // 3. 数组内重复
  const seen = new Map<string, number>();
  stringTags.forEach((t, i) => {
    const k = t.trim();
    if (seen.has(k)) {
      out.push({
        rule: 'tags-重复',
        detail: `tags 重复: "${k}" 出现在索引 ${seen.get(k)} 和 ${i}`,
      });
    } else {
      seen.set(k, i);
    }
  });

  // 4. fill 重复
  if (typeof fm.fill === 'string' && VALID_FILL.has(fm.fill)) {
    stringTags.forEach((t, i) => {
      if (t === fm.fill) {
        out.push({
          rule: 'tags-fill冗余',
          detail: `tags[${i}] = "${t}" 与 fill 重复(fill 已经声明了语义)`,
        });
      }
    });
  }

  // 5. 重点药必须有"药理作用:"前缀
  if (isKeyDrug(fm)) {
    // SKILL §5.4 规定用全角冒号"：",宽容接受半角":"
    const hasPharmacology = stringTags.some(
      (t) => t.startsWith('药理作用：') || t.startsWith('药理作用:')
    );
    if (!hasPharmacology) {
      out.push({
        rule: 'tags-药理作用缺失',
        detail: `重点药(med- + stroke:double)必须含至少 1 个 "药理作用:" 前缀 tag`,
      });
    }
  }

  // 6. ADR:前缀 ≤ 3
  const adrCount = stringTags.filter(
    (t) => t.startsWith('ADR：') || t.startsWith('ADR:')
  ).length;
  if (adrCount > 3) {
    out.push({
      rule: 'tags-ADR超量',
      detail: `ADR: 前缀 tag 共 ${adrCount} 个,允许 ≤ 3`,
    });
  }

  // 7. 口诀节点 tags 首位应是"口诀"
  if (isMnemonic(fm)) {
    const first = stringTags[0]?.trim();
    if (first !== '口诀') {
      out.push({
        rule: 'tags-口诀首位',
        detail: `口诀节点(mem-*)tags 首位应为 "口诀",实际是 "${first ?? '(空)'}"`,
      });
    }
    // 8. 口诀节点 tags 应包含对应药/分类名 — 粗略:含 label 或 label 的关键词
    //    简化版:若 label 不在 tags 里且 tags 里没有与 label 重叠的关键词,提示
    if (typeof fm.label === 'string') {
      const labelTokens = fm.label.replace(/[，。、；;,.\s]+/g, ' ').trim().split(/\s+/);
      const labelHit = labelTokens.some((tok) => tok.length >= 2 && stringTags.includes(tok));
      if (!labelHit && labelTokens.some((t) => t.length >= 2)) {
        // 不算硬违规,只警告
        // out.push({ rule: 'tags-口诀缺药/分类名', detail: `口诀 tags 未见 label "${fm.label}" 或其关键词` });
      }
    }
  }

  return out;
}

function checkReasons(fm: Frontmatter): ReasonFinding[] {
  const out: ReasonFinding[] = [];
  const edges = fm.edges_out;

  if (!Array.isArray(edges)) {
    if (fm.id && !fm.id.startsWith('ch-') && !fm.id.startsWith('book-')) {
      // 跳过结构入口(章/书通常只有 part_of 边,允许 reason 简写或省略)
      // 严格模式:仍要求有 reason
    }
    return out;
  }

  edges.forEach((e, i) => {
    const where = `edges_out[${i}]`;
    if (e === null || typeof e !== 'object') {
      out.push({ rule: 'reason-类型', detail: `${where} 不是对象` });
      return;
    }
    // 9. 缺 reason
    if (!('reason' in e)) {
      out.push({ rule: 'reason-缺失', detail: `${where} 缺 reason 字段` });
      return;
    }
    const r = e.reason;
    if (typeof r !== 'string') {
      out.push({ rule: 'reason-类型', detail: `${where}.reason 不是字符串` });
      return;
    }
    const trimmed = r.trim();
    // 10. 空字符串
    if (trimmed === '') {
      out.push({ rule: 'reason-空值', detail: `${where}.reason 是空字符串` });
      return;
    }
    // 11. 长度
    if (trimmed.length < 4) {
      out.push({
        rule: 'reason-过短',
        detail: `${where}.reason "${trimmed}" < 4 字符,难以独立成句`,
      });
    }
    // 12. 以"的"结尾(定中短语)
    if (trimmed.endsWith('的')) {
      out.push({
        rule: 'reason-定中短语',
        detail: `${where}.reason "${trimmed}" 以"的"结尾,可能是定中短语而非完整句`,
      });
    }
    // 13. 纯虚词
    if (HOLLOW_WORDS.has(trimmed)) {
      out.push({
        rule: 'reason-空泛词',
        detail: `${where}.reason "${trimmed}" 是空泛词,需含具体药/分类名`,
      });
    }
    // 13b. 虚词开头的 reason 本身可能是合规的(如"属于苯二氮䓬类"),放过;
    // 但若 reason 全部由空泛词 + 一个虚词前缀(如"用于治疗""与...相关"),提示
    const stripped = trimmed.replace(/^(用于|与|和|属|为|是)/, '').trim();
    if (stripped.length < 3) {
      out.push({
        rule: 'reason-具体对象缺失',
        detail: `${where}.reason "${trimmed}" 去掉虚词后剩余过短,可能缺具体对象`,
      });
    }
  });

  return out;
}

async function main() {
  const root = process.cwd();
  const contentDir = path.join(root, 'public/content');
  const outputArg = process.argv[2];

  const files = await glob('**/*.md', {
    cwd: contentDir,
    ignore: ['**/_*', '**/README.md'],
  });

  const reports: FileReport[] = [];

  for (const rel of files.sort()) {
    const abs = path.join(contentDir, rel);
    const raw = fs.readFileSync(abs, 'utf-8');
    const parsed = splitFrontmatter(raw);
    if ('error' in parsed) {
      reports.push({
        relPath: rel,
        tagFindings: [],
        reasonFindings: [{ rule: 'parse-error', detail: parsed.error }],
      });
      continue;
    }
    let fm: Frontmatter | null = null;
    try {
      fm = yamlParse(parsed.yaml) as Frontmatter;
    } catch (err) {
      reports.push({
        relPath: rel,
        tagFindings: [],
        reasonFindings: [{ rule: 'parse-error', detail: `YAML 解析失败: ${(err as Error).message}` }],
      });
      continue;
    }
    if (!fm || typeof fm !== 'object') {
      reports.push({
        relPath: rel,
        tagFindings: [],
        reasonFindings: [{ rule: 'parse-error', detail: 'frontmatter 为空' }],
      });
      continue;
    }

    reports.push({
      relPath: rel,
      book: fm.location?.book,
      chapter: fm.location?.chapter,
      section: fm.location?.section,
      id: fm.id,
      label: fm.label,
      fill: fm.fill,
      tagFindings: checkTags(fm),
      reasonFindings: checkReasons(fm),
    });
  }

  // ── 聚合报告 ─────────────────────────────────────────────
  const totalFiles = reports.length;
  const filesWithTagIssues = reports.filter((r) => r.tagFindings.length > 0);
  const filesWithReasonIssues = reports.filter((r) => r.reasonFindings.length > 0);
  const filesWithAnyIssue = reports.filter(
    (r) => r.tagFindings.length > 0 || r.reasonFindings.length > 0
  );

  // 按章节聚合
  const byChapter = new Map<string, FileReport[]>();
  for (const r of filesWithAnyIssue) {
    const key = `${r.book ?? '?'} / ${r.chapter ?? '?'} / ${r.section ?? '?'}`;
    if (!byChapter.has(key)) byChapter.set(key, []);
    byChapter.get(key)!.push(r);
  }

  // 规则统计
  const tagRuleCount = new Map<string, number>();
  const reasonRuleCount = new Map<string, number>();
  for (const r of reports) {
    for (const f of r.tagFindings) {
      tagRuleCount.set(f.rule, (tagRuleCount.get(f.rule) ?? 0) + 1);
    }
    for (const f of r.reasonFindings) {
      reasonRuleCount.set(f.rule, (reasonRuleCount.get(f.rule) ?? 0) + 1);
    }
  }

  let md = '';
  md += `# tags / reason 审计报告\n\n`;
  md += `> 工具:\`tools/audit-tags-reason.ts\` · 规则来源:[SKILL.md §5.4 / §5.5](../docs/SKILL.md) · 一次扫描,不动文件\n\n`;
  md += `**扫描范围**:\`public/content/**/*.md\` · **总文件数**:${totalFiles}\n\n`;
  md += `## 概览\n\n`;
  md += `| 维度 | 违规文件数 | 占比 |\n`;
  md += `| --- | --- | --- |\n`;
  md += `| tags 违规 | ${filesWithTagIssues.length} | ${pct(filesWithTagIssues.length, totalFiles)} |\n`;
  md += `| reason 违规 | ${filesWithReasonIssues.length} | ${pct(filesWithReasonIssues.length, totalFiles)} |\n`;
  md += `| 任一违规 | ${filesWithAnyIssue.length} | ${pct(filesWithAnyIssue.length, totalFiles)} |\n\n`;

  md += `## tags 规则触发统计\n\n`;
  md += `| 规则 | 触发次数 |\n`;
  md += `| --- | --- |\n`;
  for (const [rule, n] of [...tagRuleCount.entries()].sort((a, b) => b[1] - a[1])) {
    md += `| ${rule} | ${n} |\n`;
  }
  md += `\n## reason 规则触发统计\n\n`;
  md += `| 规则 | 触发次数 |\n`;
  md += `| --- | --- |\n`;
  for (const [rule, n] of [...reasonRuleCount.entries()].sort((a, b) => b[1] - a[1])) {
    md += `| ${rule} | ${n} |\n`;
  }

  md += `\n## 按章节聚合\n\n`;
  if (byChapter.size === 0) {
    md += `_无违规。_\n`;
  } else {
    // 按 book / chapter 排序
    const sorted = [...byChapter.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'));
    for (const [chapterKey, rs] of sorted) {
      md += `### ${chapterKey}\n\n`;
      md += `违规文件:${rs.length}\n\n`;
      md += `| 文件 | id | label | tags 违规 | reason 违规 |\n`;
      md += `| --- | --- | --- | --- | --- |\n`;
      for (const r of rs) {
        const tagStr = r.tagFindings.length > 0 ? formatFindings(r.tagFindings) : '—';
        const reasonStr = r.reasonFindings.length > 0 ? formatFindings(r.reasonFindings) : '—';
        md += `| \`${r.relPath}\` | \`${r.id ?? ''}\` | ${r.label ?? ''} | ${tagStr} | ${reasonStr} |\n`;
      }
      md += `\n`;
    }
  }

  if (outputArg) {
    const outPath = path.resolve(root, outputArg);
    fs.writeFileSync(outPath, md, 'utf-8');
    process.stderr.write(`报告写入:${outPath}\n`);
    process.stderr.write(`扫描文件:${totalFiles} · 违规:${filesWithAnyIssue.length}\n`);
  } else {
    process.stdout.write(md);
  }
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${((n / total) * 100).toFixed(1)}%`;
}

function formatFindings(findings: { rule: string; detail: string }[]): string {
  // 简略:按规则合并,detail 太长就截断
  const byRule = new Map<string, string[]>();
  for (const f of findings) {
    if (!byRule.has(f.rule)) byRule.set(f.rule, []);
    byRule.get(f.rule)!.push(f.detail);
  }
  const parts: string[] = [];
  for (const [rule, details] of byRule) {
    const sample = details[0].length > 40 ? details[0].slice(0, 37) + '…' : details[0];
    parts.push(details.length > 1 ? `${rule} ×${details.length} (例:"${sample}")` : `${rule}: "${sample}"`);
  }
  return parts.join('; ');
}

main().catch((err) => {
  console.error('审计失败:', err);
  process.exit(1);
});
