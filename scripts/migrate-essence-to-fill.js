#!/usr/bin/env node
/**
 * migrate-essence-to-fill.js
 * 
 * 将旧字段 essence 迁移到新字段 fill/stroke。
 * 
 * 迁移规则：
 *   essence: drug     → fill: cls-drug, stroke: auto
 *   essence: medication → fill: cls-drug, stroke: glow
 *   essence: module  → fill: cls-structure
 *   essence: umbrella-class / strict-class → fill: cls-classification
 *   essence: concept → fill: cls-concept
 *   essence: illness → fill: cls-disease
 *   essence: notion  → fill: cls-feature (或 cls-adverse)
 *   essence: mnemonic → fill: cls-mnemonic
 *   essence: summary → fill: cls-summary
 * 
 * 前缀规则：
 *   med-* → 重点药 → stroke: glow
 *   drug-* → 普通药 → stroke: auto
 *   其他 → stroke: auto
 * 
 * 使用方法：
 *   node scripts/migrate-essence-to-fill.js [--dry-run] [--verbose]
 * 
 * --dry-run   : 只打印更改，不写入文件
 * --verbose   : 打印详细信息
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, extname } from 'path';
import { argv, exit } from 'process';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

// ── 迁移规则 ────────────────────────────────────────────────────────────────

const ESSENCE_TO_FILL = {
  module: 'cls-structure',
  'strict-class': 'cls-classification',
  'umbrella-class': 'cls-classification',
  concept: 'cls-concept',
  medication: 'cls-drug',  // 重点药
  drug: 'cls-drug',
  illness: 'cls-disease',
  notion: 'cls-feature',   // notion 映射到 feature（部分 notion 是不良反应，用 cls-adverse）
  mnemonic: 'cls-mnemonic',
  summary: 'cls-summary',
  table: 'cls-summary',
  note: 'cls-feature',
};

// 重点药前缀（需要 stroke: glow）
const KEY_DRUG_PREFIXES = ['med-', 'drug-'];

function getStrokeFromId(id) {
  // 重点药前缀：med-* 和 drug-* 都有对应的
  // medication 类型通常是重点药，drug 类型是普通药
  // 但在当前系统中，id 前缀并不完全代表重点/普通
  // 所以我们保守处理：只有明确是重点药时才添加 stroke
  if (id && (id.startsWith('med-') || id.startsWith('drug-'))) {
    return 'flow';
  }
  return undefined; // auto
}

// ── YAML 解析 ───────────────────────────────────────────────────────────────

function parseYAMLFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)/);
  if (!match) return { data: {}, content };
  
  const yamlBlock = match[1];
  const body = match[2];
  
  let data;
  try {
    data = yamlParse(yamlBlock) || {};
  } catch (e) {
    console.warn(`  ⚠️  YAML 解析失败: ${e.message}`);
    data = {};
  }
  
  return { data, content, body };
}

// ── 主逻辑 ─────────────────────────────────────────────────────────────────

function migrateFrontmatter(data, filePath) {
  const changes = [];
  const newData = { ...data };
  
  // 处理嵌套结构：data.data 或顶层 data
  let fm = {};
  if (newData.data && typeof newData.data === 'object') {
    // 嵌套结构：{ data: { id, label, essence, ... }, edges_out?, tags? }
    fm = { ...newData.data };
  } else {
    fm = { ...newData };
  }
  
  // 获取 id
  const id = fm.id || '';
  
  // 迁移 essence → fill
  if (fm.essence) {
    const fill = ESSENCE_TO_FILL[fm.essence];
    if (fill) {
      changes.push(`essence '${fm.essence}' → fill '${fill}'`);
      fm.fill = fill;
    } else {
      console.warn(`  ⚠️  未知 essence: ${fm.essence}`);
    }
  }
  
  // 添加 stroke（对于重点药）
  // 根据 id 前缀判断是否是重点药
  const isKeyDrug = id.startsWith('med-');
  if (isKeyDrug) {
    changes.push(`stroke: glow`);
    fm.stroke = 'flow';
  }
  
  return { fm, changes, originalData: newData };
}

function processFile(filePath, options = {}) {
  const { dryRun = false, verbose = false } = options;
  
  if (!existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    return { skipped: 0, migrated: 0, errors: 1 };
  }
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const { data, content: body } = parseYAMLFrontmatter(content);
    
    // 检查是否有 id（在 data.data 或 data 根级）
    const id = data?.data?.id || data?.id;
    if (!id) {
      if (verbose) console.log(`  ⏭️  跳过（无 id）`);
      return { skipped: 1, migrated: 0, errors: 0 };
    }
    
    const { fm, changes, originalData } = migrateFrontmatter(data, filePath);
    
    if (changes.length === 0) {
      if (verbose) console.log(`  ⏭️  无需迁移: ${id}`);
      return { skipped: 1, migrated: 0, errors: 0 };
    }
    
    if (verbose) {
      console.log(`  ✅ ${id}`);
      for (const change of changes) {
        console.log(`     - ${change}`);
      }
    } else {
      console.log(`  ✅ ${id}: ${changes.join(', ')}`);
    }
    
    if (!dryRun) {
      // 重新生成文件
      // 保持原始结构：如果是嵌套的 data: 结构，就保持
      let newContent;
      if (originalData.data && typeof originalData.data === 'object') {
        // 嵌套结构：{ data: { id, label, essence, ... }, edges_out?, tags? }
        const out = { data: fm };
        const yamlStr = yamlStringify(out, { indent: 2, lineWidth: 0 });
        newContent = `---\n${yamlStr}---\n`;
      } else {
        const yamlStr = yamlStringify(fm, { indent: 2, lineWidth: 0 });
        newContent = `---\n${yamlStr}---\n`;
      }
      writeFileSync(filePath, newContent, 'utf-8');
    } else {
      console.log(`     [dry-run: 未写入]`);
    }
    
    return { skipped: 0, migrated: 1, errors: 0 };
  } catch (error) {
    console.error(`  ❌ 错误: ${error.message}`);
    return { skipped: 0, migrated: 0, errors: 1 };
  }
}

function processDirectory(dirPath, options = {}) {
  let stats = { skipped: 0, migrated: 0, errors: 0 };
  
  const entries = readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      const subStats = processDirectory(fullPath, options);
      stats.skipped += subStats.skipped;
      stats.migrated += subStats.migrated;
      stats.errors += subStats.errors;
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      const subStats = processFile(fullPath, options);
      stats.skipped += subStats.skipped;
      stats.migrated += subStats.migrated;
      stats.errors += subStats.errors;
    }
  }
  
  return stats;
}

// ── CLI ────────────────────────────────────────────────────────────────────

const args = argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-n');
const verbose = args.includes('--verbose') || args.includes('-v');
const targetPath = args.find(arg => !arg.startsWith('-')) || 'public/content';

// 处理带空格的路径（CLI 传递时会分割）
// 如果只有一个非选项参数，就用整个命令行来重建路径
const nonOptionArgs = args.filter(arg => !arg.startsWith('-'));
const actualPath = nonOptionArgs.length === 1 
  ? args.slice(args.indexOf(nonOptionArgs[0])).join(' ') 
  : nonOptionArgs.join(' ');

const targetDir = actualPath || 'public/content';

console.log('\n🔄 迁移 essence → fill/stroke');
console.log('='.repeat(60));
console.log(`目标目录: ${targetDir}`);
console.log(`模式: ${dryRun ? 'DRY-RUN (不写入)' : 'LIVE (会写入)'}`);
console.log('');

if (!existsSync(targetDir)) {
  console.error(`❌ 路径不存在: ${targetDir}`);
  exit(1);
}

// 判断是文件还是目录
const targetStat = statSync(targetDir);
let stats;
if (targetStat.isFile()) {
  stats = processFile(targetDir, { dryRun, verbose });
} else {
  stats = processDirectory(targetDir, { dryRun, verbose });
}

console.log('');
console.log('='.repeat(60));
console.log(`📊 结果:`);
console.log(`   迁移: ${stats.migrated} 个文件`);
console.log(`   跳过: ${stats.skipped} 个文件`);
console.log(`   错误: ${stats.errors} 个文件`);

if (dryRun) {
  console.log('');
  console.log('⚠️  这是 dry-run 模式，没有文件被实际修改。');
  console.log('   去掉 --dry-run 参数来执行实际迁移。');
}

console.log('');
