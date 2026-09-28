// src/core/layout-worker.ts
// Web Worker: run euler force layout off the main thread.

import cytoscape from 'cytoscape';
import euler from 'cytoscape-euler';

cytoscape.use(euler);

export interface LayoutWorkerRequest {
  nodes: { id: string; x: number; y: number }[];
  edges: { source: string; target: string }[];
  params: Record<string, unknown>;
}

export type LayoutWorkerResponse =
  | { type: 'progress'; elapsedMs: number }
  | { type: 'done'; positions: Record<string, { x: number; y: number }>; elapsedMs: number }
  | { type: 'error'; message: string };

let cy: cytoscape.Core | null = null;

self.onmessage = (ev: MessageEvent<LayoutWorkerRequest>): void => {
  const { nodes, edges, params } = ev.data;
  try {
    runLayout(nodes, edges, params);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    post({ type: 'error', message: msg });
  }
};

function post(msg: LayoutWorkerResponse): void {
  (self as unknown as { postMessage: (m: LayoutWorkerResponse) => void }).postMessage(msg);
}

function runLayout(
  nodes: LayoutWorkerRequest['nodes'],
  edges: LayoutWorkerRequest['edges'],
  params: Record<string, unknown>,
): void {
  const t0 = performance.now();

  // headless cytoscape: data + physics only, no renderer.
  // styleEnabled:false skips all style parsing; euler never reads styles.
  cy = cytoscape({
    headless: true,
    elements: [
      ...nodes.map((n) => ({ data: { id: n.id }, position: { x: n.x, y: n.y } })),
      ...edges.map((e) => ({
        data: { id: e.source + ' ' + e.target, source: e.source, target: e.target },
      })),
    ],
    layout: { name: 'preset' },
    styleEnabled: false,
  });

  // Heartbeat. euler blocks synchronously, so no progress fires until it
  // finishes. This only lets the main thread tell "computing" from "dead".
  const beat = setInterval(() => {
    post({ type: 'progress', elapsedMs: performance.now() - t0 });
  }, 1000);

  cy.one('layoutstop', () => {
    clearInterval(beat);
    const out: Record<string, { x: number; y: number }> = {};
    cy!.nodes().forEach((n) => {
      const p = n.position();
      out[n.id()] = { x: p.x, y: p.y };
    });
    post({ type: 'done', positions: out, elapsedMs: performance.now() - t0 });
    cy!.destroy();
    cy = null;
  });

  // euler options are not in cytoscape's LayoutOptions union
  // (cytoscape.use only registers at runtime), hence the cast.
  cy.layout({
    name: 'euler',
    // animate:false - nothing is drawn in a worker, animation is pure waste.
    // This alone removes the ~16s of per-frame position write-back.
    animate: false,
    randomize: false,
    ...params,
  } as cytoscape.LayoutOptions).run();
}
