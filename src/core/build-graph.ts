// src/core/build-graph.ts
// Pure graph-builder shared between the browser (Vite glob → strings) and
// the Node CLI (fs.readFile). Both paths normalize raw text into
// ParsedFrontmatter, then hand the map off to this module.
//
// This keeps degree computation, edge dedup, dangling-edge detection and
// new-schema field selection in one place. The old type/category/layer
// fallback is intentionally NOT preserved here — content has been migrated,
// and falling back to legacy fields only hides missing data.

import { GraphData, NodeData, EdgeData } from './graph.js';
import { ParsedFrontmatter } from '../parser/frontmatter.js';

export interface BuildOptions {
  /** Set of node IDs considered "known" — edges pointing elsewhere are flagged. */
  knownNodeIds?: Set<string>;
  /** Stream dangling-edge reports to the caller (CLI uses stderr, browser no-ops). */
  onDanglingEdges?: (entries: DanglingEdge[]) => void;
}

export interface DanglingEdge {
  source: string;
  target: string;
  file: string;
}

export interface BuildResult extends GraphData {
  /** Edges whose target points to a node that wasn't in the input. */
  danglingEdges: DanglingEdge[];
  /** Maximum depth seen in the BFS (0 when only the root exists). */
  maxDepth: number;
}

/**
 * Build a GraphData object from a filepath → ParsedFrontmatter map.
 * Pure function — no I/O, no side effects beyond the optional dangling-edge hook.
 */
export function buildGraph(
  frontmatters: Map<string, ParsedFrontmatter>,
  options: BuildOptions = {},
): BuildResult {
  // First pass — collect node IDs (file id present?) and raw edges.
  const nodeIds = new Set<string>();
  const rawEdges: EdgeData[] = [];
  const danglingEdges: DanglingEdge[] = [];
  const knownIds = options.knownNodeIds;

  for (const [fp, fm] of frontmatters) {
    if (!fm.id) continue;
    nodeIds.add(fm.id);

    if (!fm.edges_out) continue;
    for (const edge of fm.edges_out) {
      if (knownIds && !knownIds.has(edge.target)) {
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

  // Deduplicate edges (same source+target+type).
  const seenEdge = new Set<string>();
  const edges: EdgeData[] = [];
  for (const e of rawEdges) {
    if (seenEdge.has(e.id)) continue;
    seenEdge.add(e.id);
    edges.push(e);
  }

  // Degree = total connections (in + out).
  const degree: Record<string, number> = {};
  for (const id of nodeIds) degree[id] = 0;
  for (const e of edges) {
    degree[e.source] = (degree[e.source] ?? 0) + 1;
    degree[e.target] = (degree[e.target] ?? 0) + 1;
  }

  // ── BFS: compute depth from root (center = 0) ─────────────────────────────────
  //
  // Edges follow part_of / subclass_of semantics: child → parent (A part_of B means
  // A is a child of B, stored as edges_out from A pointing to B).
  //
  // Therefore we run REVERSE BFS:
  //   1. Find leaves (out-degree = 0, nodes that nothing points to)
  //   2. Walk backwards along edge direction (parent → child) toward roots
  //   3. Leaves get depth=0, their parents depth=1, grandparents depth=2 …
  //      → The root "执业药师考试体系" ends up with the highest depth.
  //
  // The spectrum color (gold center vs hue wheel) is just visual convention:
  // we label it 0=gold-center and 1-6=depth rings so users can orient by
  // any consistent convention. Reversing the label is a one-line cosmetic change.

  // Build forward adjacency (source → targets) for degree computation
  const outDegree: Record<string, number> = {};
  for (const id of nodeIds) outDegree[id] = 0;
  for (const e of edges) outDegree[e.source] = (outDegree[e.source] ?? 0) + 1;

  // Reverse adjacency (target → sources): for walking FROM leaves TOWARD roots.
  // Initialize lazily so dangling-edge targets (not in nodeIds) are also covered.
  const reverseAdj: Record<string, string[]> = {};
  const getReverseChildren = (target: string): string[] => {
    if (!(target in reverseAdj)) reverseAdj[target] = [];
    return reverseAdj[target];
  };
  for (const e of edges) {
    getReverseChildren(e.target).push(e.source);
  }

  // Leaves = nodes with out-degree = 0 (nothing points from them to a parent)
  const leaves: string[] = [];
  for (const id of nodeIds) {
    if (outDegree[id] === 0) leaves.push(id);
  }

  // Reverse BFS from leaves, walking "up" the tree toward the root
  // (which has the most ancestors, i.e. the deepest reverse BFS depth).
  const depth: Record<string, number> = {};
  const queue: string[] = [];
  for (const leaf of leaves) {
    depth[leaf] = 0;
    queue.push(leaf);
  }

  let maxDepth = 0;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currDepth = depth[curr];
    for (const parent of getReverseChildren(curr)) {
      if (parent in depth) continue; // already visited
      const newDepth = currDepth + 1;
      depth[parent] = newDepth;
      if (newDepth > maxDepth) maxDepth = newDepth;
      queue.push(parent);
    }
  }

  // Map raw BFS depth to ring depth: root=0, deeper=larger numbers.
  // This matches the "ring from center" mental model (center=0, rings outward).
  const ringDepth: Record<string, number> = {};
  for (const [id, raw] of Object.entries(depth)) {
    ringDepth[id] = raw;
  }

  // ── Subtree classification (pure structure, no essence checking) ─────────────
  //
  // Classifier nodes: nodes that receive at least one instance_of edge.
  // Their descendants (reached by walking forward along any edge direction)
  // all belong to the same subtree and share the classifier's border color.
  //
  // Algorithm:
  //   1. Identify all classifiers (node has ≥1 instance_of incoming edge).
  //   2. For each node, walk UP the parent chain to find its nearest
  //      classifier ancestor (the subtree root).
  //   3. Run a DFS from each classifier to mark ALL descendants, so even
  //      intermediate nodes (not directly below a leaf) are labeled.
  //   4. Nodes with no classifier ancestor keep subtreeRoot = undefined
  //      and fall back to depth-based border color.

  const instanceIn: Record<string, number> = {};
  for (const id of nodeIds) instanceIn[id] = 0;
  for (const e of edges) {
    if (e.type === 'instance_of') {
      instanceIn[e.target] = (instanceIn[e.target] ?? 0) + 1;
    }
  }

  // Forward adjacency (parent → children): for DFS from classifier roots.
  // Lazy init so dangling-edge targets (not in nodeIds) are also covered.
  const forwardAdj: Record<string, string[]> = {};
  const getChildrenOf = (parent: string): string[] => {
    if (!(parent in forwardAdj)) forwardAdj[parent] = [];
    return forwardAdj[parent];
  };
  // For edge source → target (source is child of target), store source under target's key
  for (const e of edges) getChildrenOf(e.target).push(e.source);

  // Step 1: Classifiers are nodes with ≥1 instance_of incoming edge
  const classifiers = new Set<string>();
  for (const [id, count] of Object.entries(instanceIn)) {
    if (count > 0) classifiers.add(id);
  }

  // Step 2: For each node, walk UP the parent chain to find nearest classifier.
  // Edge direction: source → target means source is child of target.
  // Pre-build parent-of map for O(1) parent lookup; visited set guards
  // against cycles (disjoint_with, equivalent_to, etc.) and dangling edges.
  const parentOf: Record<string, string | undefined> = {};
  for (const id of nodeIds) parentOf[id] = undefined;
  for (const e of edges) parentOf[e.source] = e.target; // last-write wins if multi-parent

  const subtreeRoot: Record<string, string> = {};
  for (const id of nodeIds) {
    if (classifiers.has(id)) {
      subtreeRoot[id] = id; // classifier owns itself
      continue;
    }
    // Walk up: each node points to its parent via parentOf[]
    const visited = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      const parent = parentOf[current];
      if (parent === undefined) break; // no parent (root or dangling)
      if (classifiers.has(parent)) {
        subtreeRoot[id] = parent;
        break;
      }
      current = parent;
    }
  }

  // Step 3: DFS from each classifier to mark all descendants
  // (handles nodes that are internal to a subtree but not directly under a leaf)
  for (const root of classifiers) {
    const visited = new Set<string>();
    const stack: string[] = [root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);
      subtreeRoot[node] = root;
      for (const child of getChildrenOf(node)) {
        if (!visited.has(child)) stack.push(child);
      }
    }
  }

  // Second pass — build nodes with degree-derived weight and BFS-computed depth.
  const nodes: NodeData[] = [];
  const seenNode = new Set<string>();
  for (const [fp, fm] of frontmatters) {
    if (!fm.id || seenNode.has(fm.id)) continue;
    seenNode.add(fm.id);
    nodes.push({
      id: fm.id,
      label: fm.label,
      essence: fm.essence ?? '',
      depth: ringDepth[fm.id] ?? 0,
      subtreeRoot: subtreeRoot[fm.id],
      shortSummary: fm.shortSummary,
      fullSummary: fm.fullSummary,
      summary: fm.summary,
      location: fm.location,
      tags: fm.tags,
      body: fm.body,
      // The browser path keys these `../../content/<rel>...`; the CLI uses
      // absolute or repo-relative paths. Strip the well-known prefix when
      // present, otherwise fall back to whatever the caller supplied so we
      // never silently lose the file context.
      sourcePath: fp.startsWith('../../content/') ? fp.slice('../../content/'.length) : fp,
      weight: degree[fm.id] ?? 1,
    });
  }

  if (danglingEdges.length > 0 && options.onDanglingEdges) {
    options.onDanglingEdges(danglingEdges);
  }

  return { nodes, edges, danglingEdges, maxDepth };
}
