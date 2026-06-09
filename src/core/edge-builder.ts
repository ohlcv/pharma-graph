// src/core/edge-builder.ts
import { loadAllFrontmatter } from "./node-builder.js";
import { EdgeData } from "./graph.js";

/**
 * 从所有 .md 文件的 edges_out 构建 Cytoscape 边数据，并去重
 * @param knownNodeIds 给出已知节点 ID 集合后，target 不在集合内的边会被报错并跳过。
 */
export async function buildEdges(
  filePaths: string[],
  knownNodeIds?: Set<string>,
): Promise<EdgeData[]> {
  const all = await loadAllFrontmatter(filePaths);
  const rawEdges: EdgeData[] = [];
  const danglingEdges: { source: string; target: string; file: string }[] = [];

  for (const fp of filePaths) {
    const fm = all.get(fp)!;
    if (!fm.edges_out || fm.edges_out.length === 0) continue;

    for (const edge of fm.edges_out) {
      if (knownNodeIds && !knownNodeIds.has(edge.target)) {
        danglingEdges.push({ source: fm.id, target: edge.target, file: fp });
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

  if (danglingEdges.length > 0) {
    console.error(`\n[edge-builder] 发现 ${danglingEdges.length} 条悬空边（target 节点不存在）:`);
    for (const { source, target, file } of danglingEdges) {
      const rel = file.replace(/\\/g, '/').replace('content/', '');
      console.error(`  - [${rel}] ${source} → ${target}`);
    }
    console.error('');
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
