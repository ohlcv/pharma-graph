// src/core/node-builder.ts
import fs from 'fs/promises';
import { parseFrontmatter, ParsedFrontmatter } from "../parser/frontmatter.js";
import { NodeData, NodeLocation } from "./graph.js";

/**
 * Load and parse all frontmatter in parallel, returning a reusable map.
 */
export async function loadAllFrontmatter(filePaths: string[]): Promise<Map<string, ParsedFrontmatter>> {
  const results = await Promise.all(
    filePaths.map(async (fp) => {
      const raw = await fs.readFile(fp, 'utf-8');
      return { fp, fm: parseFrontmatter(raw, fp) };
    })
  );
  return new Map(results.map(({ fp, fm }) => [fp, fm]));
}

/**
 * 将 content/ 下所有 .md 文件映射为 Cytoscape 节点数据
 */
export async function buildNodes(filePaths: string[]): Promise<NodeData[]> {
  const all = await loadAllFrontmatter(filePaths);
  const nodes: NodeData[] = [];

  for (const fp of filePaths) {
    const fm = all.get(fp)!;
    // 新 schema: essence/field/tier；旧 schema 降级到 type/category/layer
    const essence = fm.essence || fm.type || '';
    const field   = fm.field   || fm.category || '';
    const tier    = fm.tier    || fm.layer;
    const node: NodeData = {
      id: fm.id,
      label: fm.label,
      essence,
      field,
      tier,
      // 向后兼容：保留旧字段
      type: essence,
      category: field,
      layer: tier,
      summary: fm.summary,
      location: toLocation(fp),
      weight: 1,
    };
    nodes.push(node);
  }

  return nodes;
}

/**
 * 将绝对路径转换为 NodeLocation 对象
 * content/药学综合知识与技能/第三章/第一节 → { book, part, chapter, section }
 */
function toLocation(filePath: string): NodeLocation {
  const parts = filePath.split(/[/\\]/);
  const idx = parts.findIndex((p) => p === 'content');
  if (idx === -1) return {};
  const slice = parts.slice(idx + 1); // drop 'content'
  return {
    book:      slice[0] ?? undefined,
    part:      slice[1] ?? undefined,
    chapter:   slice[2] ?? undefined,
    section:   slice[3] ?? undefined,
    subsection: slice[4] ?? undefined,
    item:      slice[5] ?? undefined,
  };
}
