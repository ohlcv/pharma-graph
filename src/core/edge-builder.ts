// src/core/edge-builder.ts
import { parseFrontmatter } from "../parser/frontmatter.js";
import { parseMarkdown } from "../parser/markdown-parser.js";
import { EdgeData } from "./graph.js";

/**
 * 从所有 .md 文件的 edges_out 构建 Cytoscape 边数据，并去重
 */
export async function buildEdges(filePaths: string[]): Promise<EdgeData[]> {
  const rawEdges: EdgeData[] = [];

  for (const fp of filePaths) {
    const meta = await parseMarkdown(fp);
    const fm = parseFrontmatter(meta.rawContent, fp);

    if (!fm.edges_out || fm.edges_out.length === 0) continue;

    for (const edge of fm.edges_out) {
      rawEdges.push({
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
    const key = `${e.source}||${e.target}||${e.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
