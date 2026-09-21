// src/ui/debug-bridge.ts
// Installs `window._dbg` — a tiny console-only debugging API used by
// developers and QA. Not a `data-action` because debug tools don't live in
// the UI; they're for the JS console.
//
// The exposed surface:
//   _dbg.overlay()      — toggle the forensic panel
//   _dbg.node(id)       — return style + data for a single node
//   _dbg.selected()     — list currently selected nodes

import cytoscape from 'cytoscape';
import { Renderer } from '../core/renderer.js';
import {
  toggleDebugOverlay,
  debugOverlayActive,
} from './app-debug.js';

declare global {
  interface Window {
    _dbg?: DebugBridge;
  }
}

export interface DebugBridge {
  overlay: () => void;
  node: (id: string) => Record<string, unknown> | string;
  selected: () => Array<{ id: string; label: string; dimmed: boolean }>;
  /** 图谱当前渲染出来的外接矩形（渲染坐标 px）。 */
  bounds: () => { left: number; top: number; right: number; bottom: number; width: number; height: number };
  /** 预览漫游顺序。控制台调用：_dbg.previewSequence() / _dbg.previewSequence('has-dfs') */
  previewSequence: (strategyId?: string) => void;
}

export function installDebugBridge(renderer: Renderer): void {
  const cy: cytoscape.Core = renderer.getCy();

  const bridge: DebugBridge = {
    overlay: () => {
      toggleDebugOverlay(renderer);
    },
    node: (id: string) => {
      const n = cy.getElementById(id);
      if (n.empty()) return `节点 "${id}" 不存在`;
      return {
        id: n.id(),
        label: n.data('label'),
        fill: n.data('fill'),
        weight: n.data('weight'),
        shape: n.style('shape'),
        borderColor: n.style('border-color'),
        borderWidth: n.style('border-width'),
        backgroundColor: n.style('background-color'),
        width: n.renderedWidth(),
        height: n.renderedHeight(),
      };
    },
    selected: () => {
      return cy.$(':selected').nodes().map((n: cytoscape.NodeSingular) => ({
        id: n.id(),
        label: n.data('label'),
        dimmed: n.hasClass('dimmed'),
      }));
    },
    // 顶栏 / 工具栏是浮层，画布铺满视口后节点会伸到它们下面。要看「适应」
    // 有没有把图放进安全区（top 应 ≥ 浮层高度 + padding），读这个最直接。
    bounds: () => {
      const bb = cy.elements().renderedBoundingBox();
      return {
        left: Math.round(bb.x1),
        top: Math.round(bb.y1),
        right: Math.round(bb.x2),
        bottom: Math.round(bb.y2),
        width: Math.round(bb.w),
        height: Math.round(bb.h),
      };
    },
    previewSequence: (strategyId?: string) => {
      import('../core/tour.js').then(({ TourEngine, asStrategy }) => {
        const temp = new TourEngine(cy);
        temp.previewSequence(strategyId ? asStrategy(strategyId) : undefined);
      });
    },
  };

  window._dbg = bridge;
}
