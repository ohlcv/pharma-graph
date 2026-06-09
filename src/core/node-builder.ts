// src/core/node-builder.ts
import fs from 'fs/promises';
import { parseFrontmatter } from "../parser/frontmatter.js";
import { NodeData } from "./graph.js";

/**
 * 将 content/ 下所有 .md 文件映射为 Cytoscape 节点数据
 */
export async function buildNodes(filePaths: string[]): Promise<NodeData[]> {
  const nodes: NodeData[] = [];

  for (const fp of filePaths) {
    const raw = await fs.readFile(fp, 'utf-8');
    const fm = parseFrontmatter(raw, fp);

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
