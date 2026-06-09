// src/core/edge-builder.ts
import { loadAllFrontmatter } from "./node-builder.js";
import { EdgeData } from "./graph.js";

/**
 * 从所有 .md 文件的 edges_out 构建 Cytoscape 边数据，并去重
 * @param knownNodeIds 可选。给出已知节点 ID 集合后，target 不在集合内的边会被静默跳过并打印警告。
 */
export async function buildEdges(
  filePaths: string[],
  knownNodeIds?: Set<string>,
): Promise<EdgeData[]> {
  const all = await loadAllFrontmatter(filePaths);
  const rawEdges: EdgeData[] = [];

  for (const fp of filePaths) {
    const fm = all.get(fp)!;
    if (!fm.edges_out || fm.edges_out.length === 0) continue;

    for (const edge of fm.edges_out) {
      if (knownNodeIds && !knownNodeIds.has(edge.target)) {
        console.warn(
          `[edge-builder] 跳过悬空边: source=${fm.id} target=${edge.target} (目标节点不存在)`,
        );
        continue;
      }
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
