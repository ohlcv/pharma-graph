// src/core/space-data-cache.ts
// 把全图按空间切成多份子图数据缓存。
//
// ## 为什么需要这个
//
// 「多重宇宙」之初是视觉组织——所有 2735 节点都在 cytoscape 里，靠
// `display: none` 把别的空间藏起来。但 cytoscape 的 `:visible` 排除
// `display: none`，euler 力导却**不过滤**——它对 `cy.nodes()` 跑全部，
// 2735 节点的物理模拟在主线程跑 20 秒，移动端直接死。
//
// 现在（产品决策已落定）：没有"全图态"这回事，只渲染当前空间。
// 切空间时把旧空间的节点 remove 掉、新空间的节点 add 进来——
// 物理只算当前空间，性能从 O(全图) 降到 O(当前空间)。
//
// ## 这个模块做什么
//
// 拿到 `GraphData` + `SpaceInfo[]` 后，按 `nodeIds` 把节点切片、把边按
// "两端都在本空间内"切片。所有切片缓存在一个 Map 里，切空间时只取出来
// `cy.add()` 即可——不需要每次重算。
//
// ## 边的处理
//
// `computeSpaces` 是按连通分量切的——同空间的节点彼此连边，跨空间的
// 节点之间没有连边（连通分量的定义）。所以"两端都在新空间"就等于
// "新空间内的全部边"，不会漏也不会错。
//
// ## 传送门不参与
//
// 传送门 `portal-gate` 在内容树里——它在数据缓存里也存在，但**单独保留**
// （不入空间缓存）。它是跨宇宙的：进任何空间都要先把它 add 进去，跟当前
// 空间节点一起 add。原因：它是空间切换的唯一入口，绝不能在某次切换中
// 被 remove 掉。
//
// ## 不存位置
//
// 缓存里只有 `data: { id, label, ... }`——没有 `position`。euler 跑当前
// 空间时会从 halo 起点收敛，给一份新的位置。所以每次切到没访问过的
// 空间，那一次 euler 都会跑——但只跑那一空间，节点数小（药学 2556 /
// 生存策略 175 / 奇观散点 5 左右），不会再卡 20 秒。

import type { GraphData, NodeData, EdgeData } from './graph.js';
import type { SpaceInfo } from './spaces.js';
import { PORTAL_ID } from './spectacle/portal-overlay.js';

export interface SpaceSlice {
  /** 这个空间所有节点。 */
  nodes: NodeData[];
  /** 两端都在这个空间内的边。 */
  edges: EdgeData[];
}

/**
 * 把全图按空间切成几份子图数据。
 *
 * 节点：按 `space.nodeIds` 过滤；不在任何空间里的节点（理论上不该存在）
 * 会被丢到 misc。
 *
 * 边：两端都在同一空间内的，归那个空间；跨空间的——理论上不该存在
 * （连通分量切的就是这个），但作为防御兜底也丢到 misc。
 */
export function sliceGraphBySpace(data: GraphData, spaces: SpaceInfo[]): Map<string, SpaceSlice> {
  const nodeSpace = new Map<string, string>();
  for (const s of spaces) {
    for (const id of s.nodeIds) nodeSpace.set(id, s.id);
  }

  const result = new Map<string, SpaceSlice>();
  for (const s of spaces) {
    result.set(s.id, { nodes: [], edges: [] });
  }

  // 节点按所在空间分桶。传送门单独留下：它跨宇宙，切空间时由调用方单独 add。
  let portalNode: NodeData | null = null;
  for (const n of data.nodes) {
    if (n.id === PORTAL_ID) {
      portalNode = n;
      continue;
    }
    const sid = nodeSpace.get(n.id);
    if (!sid) continue; // 不在任何空间：构造时 computeSpaces 已经兜底成 misc，到这里兜底。
    result.get(sid)!.nodes.push(n);
  }

  // 边按两端所在空间分桶。
  for (const e of data.edges) {
    if (e.source === PORTAL_ID || e.target === PORTAL_ID) continue; // 传送门无连边（防御）
    const s = nodeSpace.get(e.source);
    const t = nodeSpace.get(e.target);
    if (!s || !t) continue;
    if (s !== t) continue; // 跨空间边（连通分量定义上不该有）
    result.get(s)!.edges.push(e);
  }

  // 把传送门单独存起来——切空间时调用方拿走。
  (result as Map<string, SpaceSlice & { portal?: NodeData | null }>).set('__portal__', {
    nodes: [],
    edges: [],
    portal: portalNode,
  } as SpaceSlice & { portal?: NodeData | null });

  return result;
}

/** 取传送门节点（如果内容树里有）——切任何空间都先把这个 add 进去。 */
export function getPortalNode(slice: ReturnType<typeof sliceGraphBySpace>): NodeData | null {
  const entry = slice.get('__portal__') as
    | (SpaceSlice & { portal?: NodeData | null })
    | undefined;
  return entry?.portal ?? null;
}
