/**
 * 批量修正全库 frontmatter 和正文格式问题：
 * 1. 正文标题：所有非标准五问格式 → 标准五问格式
 * 2. layer 值：section/chapter → system/clinical
 *
 * 用法：npx tsx src/scripts/batch-fix.ts
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const contentRoot = join(process.cwd(), "content");

// ============ 正文标题替换规则 ============
const allBodyRules: Array<[RegExp, string]> = [
  // Q1 各种变体 → 它是什么？
  [/^## 这一节主要在讲什么[？?]$/gm, "## 它是什么？"],
  [/^## 这一章主要在讲什么[？?]$/gm, "## 它是什么？"],
  [/^## 这一篇主要在讲什么[？?]$/gm, "## 它是什么？"],
  [/^## 这一节讲的是[？?]$/gm, "## 它是什么？"],
  // Q2 各种变体 → 它有什么用...
  [/^## 为什么它是这一块内容的关键入口[？?]$/gm, "## 它有什么用，为什么要理解它？"],
  [/^## 为什么它是整套内容的总入口[？?]$/gm, "## 它有什么用，为什么要理解它？"],
  [/^## 为什么它是药物化学里很重要的一节[？?]$/gm, "## 它有什么用，为什么要理解它？"],
  [/^## 为什么这一节是本章最重要的一节[？?]$/gm, "## 它有什么用，为什么要理解它？"],
  [/^## 为什么这一节在本章里最重要[？?]$/gm, "## 它有什么用，为什么要理解它？"],
  [/^## 为什么这一节在用药实践里很重要[？?]$/gm, "## 它有什么用，为什么要理解它？"],
  [/^## 为什么这一节有特殊意义[？?]$/gm, "## 它有什么用，为什么要理解它？"],
  [/^## 为什么这一章在本篇里最重要[？?]$/gm, "## 它有什么用，为什么要理解它？"],
  [/^## 为什么这一篇是整本书的总入口[？?]$/gm, "## 它有什么用，为什么要理解它？"],
  // Q3 各种变体 → 它主要和什么有关？
  [/^## 它下面通常会展开哪些子主题[？?]$/gm, "## 它主要和什么内容有关？"],
  [/^## 它最容易和哪些内容连起来理解[？?]$/gm, "## 它主要和什么有关？"],
  [/^## 它最容易和哪些内容联系在一起[？?]$/gm, "## 它主要和什么有关？"],
  // Q4 → 它通常在什么阶段出现或被使用？
  [/^## 它通常在什么学习阶段先建立[？?]$/gm, "## 它通常在什么阶段出现或被使用？"],
  [/^## 它通常出现在整个学习路径的什么阶段[？?]$/gm, "## 它通常在什么阶段出现或被使用？"],
  // Q5 → 它在整套书和知识体系里放在哪里？
  [/^## 它在整本书和整张图谱里放在哪里[？?]$/gm, "## 它在整套书和知识体系里放在哪里？"],
  [/^## 它在整本书和知识体系里放在哪里[？?]$/gm, "## 它在整套书和知识体系里放在哪里？"],
];

// layer section → system
const layerSectionRules: Array<[RegExp, string]> = [
  [/^  layer: section$/gm, "  layer: system"],
];
// layer chapter → clinical
const layerChapterRules: Array<[RegExp, string]> = [
  [/^  layer: chapter$/gm, "  layer: clinical"],
];

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkDir(full));
    } else if (extname(entry) === ".md") {
      results.push(full);
    }
  }
  return results;
}

const files = walkDir(contentRoot);
let modified = 0;

for (const file of files) {
  const original = readFileSync(file, "utf-8");
  let content = original;

  // 1. 正文标题替换
  for (const [pattern, replacement] of allBodyRules) {
    content = content.replace(pattern as RegExp, replacement);
  }

  // 2. layer 替换
  const isChapterEntry = /type: chapter/.test(content);
  if (isChapterEntry) {
    for (const [pattern, replacement] of layerChapterRules) {
      content = content.replace(pattern as RegExp, replacement);
    }
  } else {
    for (const [pattern, replacement] of layerSectionRules) {
      content = content.replace(pattern as RegExp, replacement);
    }
  }

  if (content !== original) {
    writeFileSync(file, content, "utf-8");
    modified++;
    console.log(`✅ ${file.replace(process.cwd(), "")}`);
  }
}

console.log(`\n完成：修正 ${modified} / ${files.length} 个文件`);
