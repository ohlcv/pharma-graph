// src/core/node-builder.ts
import fs from 'fs/promises';
import { parseFrontmatter, ParsedFrontmatter } from "../parser/frontmatter.js";
import { NodeData } from "./graph.js";

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
    const node: NodeData = {
      id: fm.id,
      label: fm.label,
      type: fm.type,
      category: fm.category,
      layer: fm.layer,
      summary: fm.summary,
      location: toLocation(fp),
      weight: 1,
    };
    nodes.push(node);
  }

  return nodes;
}

/**
 * 将绝对路径转换为相对于 content/ 的路径
 */
function toLocation(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  const idx = parts.findIndex((p) => p === "content");
  if (idx === -1) return filePath;
  return parts.slice(idx).join("/");
}
