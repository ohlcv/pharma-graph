// src/core/edge-builder.ts
import fs from 'fs/promises';
import { parseFrontmatter } from "../parser/frontmatter.js";
import { EdgeData } from "./graph.js";

/**
 * 从所有 .md 文件的 edges_out 构建 Cytoscape 边数据，并去重
 */
export async function buildEdges(filePaths: string[]): Promise<EdgeData[]> {
  const rawEdges: EdgeData[] = [];

  for (const fp of filePaths) {
    const raw = await fs.readFile(fp, 'utf-8');
    const fm = parseFrontmatter(raw, fp);

    if (!fm.edges_out || fm.edges_out.length === 0) continue;

    for (const edge of fm.edges_out) {
      rawEdges.push({
        id: `${fm.id}||${edge.target}||${edge.type}`,
        source: fm.id,
        target: edge.target,
        type: edge.type,
        reason: edge.reason,
      });
    }
  }

  return deduplicateEdges(rawEdges);
}

function deduplicateEdges(edges: EdgeData[]): EdgeData[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}
