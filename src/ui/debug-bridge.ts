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
  setDebugActive,
  debugOverlayActive,
  updateForensicPanel,
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
}

export function installDebugBridge(renderer: Renderer): void {
  const cy: cytoscape.Core = renderer.getCy();

  const bridge: DebugBridge = {
    overlay: () => {
      setDebugActive(!debugOverlayActive);
      const btn = document.getElementById('debug-toggle');
      if (btn) btn.classList.toggle('active', debugOverlayActive);
      const panel = document.getElementById('debug-panel');
      if (panel) panel.style.display = debugOverlayActive ? '' : 'none';
      if (debugOverlayActive) {
        updateForensicPanel(renderer);
      }
    },
    node: (id: string) => {
      const n = cy.getElementById(id);
      if (n.empty()) return `节点 "${id}" 不存在`;
      return {
        id: n.id(),
        label: n.data('label'),
        type: n.data('type'),
        category: n.data('category'),
        layer: n.data('layer'),
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
  };

  window._dbg = bridge;
}
