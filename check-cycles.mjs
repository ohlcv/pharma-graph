// 检查图中的环和自环
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse as yamlParse } from 'yaml';

function walkDir(dir) {
  const files = [];
  try {
    readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkDir(full));
      } else if (entry.name.endsWith('.md')) {
        files.push(full);
      }
    });
  } catch (e) {}
  return files;
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)/);
  if (!match) return { data: {}, content: raw };
  try {
    return { data: yamlParse(match[1]) || {}, content: match[2] };
  } catch (e) {
    return { data: {}, content: raw };
  }
}

const files = walkDir('./content');
const nodeIds = new Set();
const edges = [];

// 收集所有节点和边
files.forEach(fp => {
  const raw = readFileSync(fp, 'utf-8');
  const { data } = parseFrontmatter(raw);
  const fmData = data.data || data;

  if (fmData.id) {
    nodeIds.add(fmData.id);
  }

  const edgesOut = fmData.edges_out || data.edges_out || [];
  edgesOut.forEach(e => {
    if (typeof e === 'object' && e !== null && e.target) {
      edges.push({
        source: fmData.id,
        target: e.target
      });
    }
  });
});

console.log(`节点数量: ${nodeIds.size}`);
console.log(`边数量: ${edges.length}`);

// 检查自环
console.log('\n=== 自环 (source === target) ===');
edges.forEach(e => {
  if (e.source === e.target) {
    console.log(`  自环: ${e.source}`);
  }
});

// 检查悬空边（target 不存在）
console.log('\n=== 悬空边 (target 不存在) ===');
edges.forEach(e => {
  if (!nodeIds.has(e.target)) {
    console.log(`  悬空: ${e.source} → ${e.target}`);
  }
});

// 检查互指（A → B 且 B → A）
console.log('\n=== 互指边 (A → B 且 B → A) ===');
const adj = new Map();
edges.forEach(e => {
  if (!adj.has(e.source)) adj.set(e.source, new Set());
  adj.get(e.source).add(e.target);
});

edges.forEach(e => {
  if (adj.has(e.target) && adj.get(e.target).has(e.source)) {
    if (e.source < e.target) { // 只打印一次
      console.log(`  互指: ${e.source} ↔ ${e.target}`);
    }
  }
});

// 检查三元环
console.log('\n=== 三元环 ===');
const cycles = new Set();
edges.forEach(e1 => {
  if (adj.has(e1.target)) {
    adj.get(e1.target).forEach(e2 => {
      if (adj.has(e2.target) && adj.get(e2.target).has(e1.source)) {
        const cycle = [e1.source, e1.target, e2.target].sort().join(' → ');
        cycles.add(cycle);
      }
    });
  }
});
cycles.forEach(c => console.log(`  ${c}`));

if (cycles.size === 0) {
  console.log('  (无)');
}
