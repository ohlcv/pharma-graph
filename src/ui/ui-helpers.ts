// ── Edge tooltip ───────────────────────────────────────────────────────────────

let edgeTooltip: HTMLElement | null = null;

export function initEdgeTooltip(): void {
  if (edgeTooltip) return;
  edgeTooltip = document.createElement('div');
  edgeTooltip.id = 'edge-tooltip';
  edgeTooltip.style.cssText = `
    position:fixed;z-index:9999;background:rgba(15,17,23,0.92);
    border:1px solid rgba(255,255,255,0.12);border-radius:8px;
    padding:6px 10px;font-size:0.72rem;color:#e2e8f0;
    pointer-events:none;max-width:240px;white-space:pre-wrap;
    word-break:break-word;opacity:0;transition:opacity 0.15s;
    font-family:inherit;box-shadow:0 4px 16px rgba(0,0,0,0.4);`;
  document.body.appendChild(edgeTooltip);
}

export function showEdgeTooltip(text: string, x: number, y: number): void {
  if (!edgeTooltip) return;
  edgeTooltip.textContent = text;
  edgeTooltip.style.left = (x + 12) + 'px';
  edgeTooltip.style.top = (y - 12) + 'px';
  edgeTooltip.style.opacity = '1';
}

export function hideEdgeTooltip(): void {
  if (!edgeTooltip) return;
  edgeTooltip.style.opacity = '0';
}

// ── Ripple effect ─────────────────────────────────────────────────────────────

export function spawnNodeRipple(x: number, y: number, color: string): void {
  const ripple = document.createElement('div');
  ripple.className = 'node-ripple';
  ripple.style.left = x + 'px';
  ripple.style.top = y + 'px';
  ripple.style.border = `2px solid ${color}`;
  document.body.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

// ── Zoom indicator ────────────────────────────────────────────────────────────

let zoomIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
let zoomIndicatorDebounce: ReturnType<typeof setTimeout> | null = null;

export function showZoomIndicator(cy: import('cytoscape').Core): void {
  if (zoomIndicatorDebounce !== null) clearTimeout(zoomIndicatorDebounce);
  zoomIndicatorDebounce = setTimeout(() => {
    const el = document.getElementById('zoom-indicator');
    if (!el) return;
    const pct = Math.round(cy.zoom() * 100);
    el.textContent = `${pct}%`;
    el.style.display = '';
    el.style.opacity = '1';
    if (zoomIndicatorTimer) clearTimeout(zoomIndicatorTimer);
    zoomIndicatorTimer = setTimeout(() => {
      if (el) { el.style.opacity = '0'; setTimeout(() => { if (el) el.style.display = 'none'; }, 400); }
    }, 2500);
    zoomIndicatorDebounce = null;
  }, 50);
}

// ── Toast ─────────────────────────────────────────────────────────────────────

export function showToast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span class="toast__dot"></span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.animation = 'toast-out 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 3500);
}
