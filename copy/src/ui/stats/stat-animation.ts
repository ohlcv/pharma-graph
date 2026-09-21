// src/ui/stats/stat-animation.ts
// Count-up interpolation for stat card values. Pure utility — no DOM touching
// beyond writing to the element passed in.

interface CountUpState {
  startTime: number;
  from: number;
  to: number;
  duration: number;
  el: HTMLElement;
  id: string;
}

const _activeAnimations = new Map<string, CountUpState>();

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function animateCountUp(id: string, to: number, el: HTMLElement, duration = 220): void {
  if (_activeAnimations.has(id)) _activeAnimations.delete(id);
  const from = parseInt(el.textContent ?? '0', 10) || 0;
  if (from === to) return;

  const state: CountUpState = { startTime: performance.now(), from, to, duration, el, id };
  _activeAnimations.set(id, state);

  function tick(now: number) {
    const s = _activeAnimations.get(id);
    if (!s || s !== state) return;

    const elapsed = now - s.startTime;
    const t = Math.min(elapsed / s.duration, 1);
    const value = Math.round(s.from + (s.to - s.from) * easeOut(t));
    s.el.textContent = String(value);

    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      _activeAnimations.delete(id);
    }
  }
  requestAnimationFrame(tick);
}

/**
 * Write `val` to the element with `id`. Animates if `animate` is true and `val`
 * parses to a finite integer.
 */
export function setStat(id: string, val: string, animate = true): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (animate) {
    const num = parseInt(val, 10);
    if (!isNaN(num)) animateCountUp(id, num, el);
  } else {
    el.textContent = val;
  }
}
