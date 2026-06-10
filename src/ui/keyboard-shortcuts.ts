import cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';

export interface ShortcutCallbacks {
  fitGraph: () => void;
  randomize: () => void;
  toggleTour: () => void;
  tourPause: () => void;
  closeNodePanel: () => void;
  tourStop: () => void;
}

export function initShortcuts(cy: Core, callbacks: ShortcutCallbacks): void {
  document.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        cy.$(':selected').remove();
        break;
      case 'Escape':
        cy.$(':selected').unselect();
        callbacks.closeNodePanel();
        if (callbacks.tourStop) callbacks.tourStop();
        break;
      case 'f':
      case 'F':
        callbacks.fitGraph();
        break;
      case 'r':
      case 'R':
        callbacks.randomize();
        break;
      case 't':
      case 'T':
        callbacks.toggleTour();
        break;
      case 'a':
      case 'A':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); cy.nodes().not('.layer-parent').select(); }
        break;
      case 'p':
      case 'P':
        callbacks.tourPause();
        break;
    }
  });
}
