// src/core/layout-worker-client.ts
// 主线程侧封装：在 Worker 里跑 euler，拿到坐标后一次性回填到 cytoscape。
//
// 设计要点：
//   - **必须有兜底**。Worker 可能因任何原因失败（构造失败、超时、浏览器
//     不支持 module worker）。任一情况都要能退回同步布局，否则图永远不出。
//   - **回填是一次性的**，不是逐帧。这是本方案的全部价值：主线程在布局
//     期间完全空闲，拿到结果后写 1182 个 position 只需几毫秒。
//   - 保留原动画路径作为 fallback（`runLayoutInWorker` 返回 null 时调用方
//     应退回 `finishStreamingLayout` 的同步分支）。

import type cytoscape from 'cytoscape';
import type { LayoutWorkerRequest, LayoutWorkerResponse } from './layout-worker.js';

export interface WorkerLayoutResult {
  positions: Record<string, { x: number; y: number }>;
  elapsedMs: number;
}

/** Worker 布局的总时长上限。headless 实测 4s，留 10s 余量。 */
const WORKER_TIMEOUT_MS = 15000;

/**
 * 在 Worker 里算布局。
 *
 * @param onProgress 每次心跳回调（用于「正在计算 Xs」的提示）
 * @returns 成功返回坐标表；**任何**失败路径都返回 null，由调用方退回同步布局。
 *          永不 throw —— 让失败只表现为「退���」，不让它炸掉整个加载流程。
 */
export async function runLayoutInWorker(
  cy: cytoscape.Core,
  params: Record<string, unknown>,
  onProgress?: (elapsedMs: number) => void,
): Promise<WorkerLayoutResult | null> {
  if (typeof Worker === 'undefined') return null;

  let worker: Worker;
  try {
    worker = new Worker(new URL('./layout-worker.ts', import.meta.url), {
      type: 'module',
    });
  } catch {
    // 构造失败：环境不支持 module worker
    return null;
  }

  const nodes: LayoutWorkerRequest['nodes'] = [];
  const edges: LayoutWorkerRequest['edges'] = [];

  try {
    cy.nodes().forEach((n) => {
      if (n.hasClass('layer-parent')) return; // 装饰节点由 overlay 自管位置
      const p = n.position();
      nodes.push({ id: n.id(), x: p.x, y: p.y });
    });
    cy.edges().forEach((e) => {
      const s = e.source();
      const t = e.target();
      if (s.hasClass('layer-parent') || t.hasClass('layer-parent')) return;
      edges.push({ source: s.id(), target: t.id() });
    });
  } catch {
    worker.terminate();
    return null;
  }

  const request: LayoutWorkerRequest = { nodes, edges, params };

  return new Promise<WorkerLayoutResult | null>((resolve) => {
    let settled = false;
    const finish = (r: WorkerLayoutResult | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        worker.terminate();
      } catch {
        /* 已退出 */
      }
      resolve(r);
    };

    const timer = setTimeout(() => finish(null), WORKER_TIMEOUT_MS);

    worker.onmessage = (ev: MessageEvent<LayoutWorkerResponse>): void => {
      const msg = ev.data;
      if (msg.type === 'progress') {
        onProgress?.(msg.elapsedMs);
        return;
      }
      if (msg.type === 'error') {
        console.warn('[layout-worker] 计算失败，退回同步布局：', msg.message);
        finish(null);
        return;
      }
      // done
      applyPositions(cy, msg.positions);
      finish({ positions: msg.positions, elapsedMs: msg.elapsedMs });
    };

    worker.onerror = (e): void => {
      console.warn('[layout-worker] Worker 异常，退回同步布局：', e.message);
      finish(null);
    };

    worker.postMessage(request);
  });
}

/**
 * 把 Worker 算出的坐标写回 cytoscape。
 *
 * 用 `batch()` 包起来：1182 次 position() 写入若逐个触发渲染/通知，
 * 会把主线程占掉一整帧；batch 让它们合并成一次。
 */
function applyPositions(
  cy: cytoscape.Core,
  positions: Record<string, { x: number; y: number }>,
): void {
  cy.batch(() => {
    for (const id in positions) {
      const n = cy.getElementById(id);
      if (n.empty()) continue;
      const p = positions[id];
      n.position({ x: p.x, y: p.y });
    }
  });
}
