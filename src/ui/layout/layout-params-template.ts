// src/ui/layout/layout-params-template.ts
// Shared HTML template for one layout-parameter row. Desktop and mobile sheets
// were duplicating this string with only class-prefix differences; this module
// collapses them into one renderer that takes a `Variant` discriminator.
//
// Why a discriminated union instead of two separate functions?
// - `type === 'select'` is the only branch with runtime shape beyond a label
//   + input pair; encoding it as a separate variant catches `options: undefined`
//   in a select call at compile time.
// - `type === 'bool'` overrides `default` to widen from `number` to
//   `boolean | number` so a configuration source can carry `true`/`false` as
//   well as `0`/`1` without a separate codepath.

export type RenderParam =
  | {
      type?: 'range';
      key: string;
      label: string;
      default: number;
      min?: number;
      max?: number;
      step?: number;
      description?: string;
    }
  | { type: 'bool'; key: string; label: string; default: boolean | number; description?: string }
  | {
      type: 'select';
      key: string;
      label: string;
      default: string;
      options: string[];
      description?: string;
    };

/** Which side of the screen is hosting the rendered row. */
export type Variant = 'desktop' | 'mobile';

/** Escape `&`, `"`, `<`, `>` for use inside an HTML attribute value. */
export function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Format a numeric slider value respecting its `step` precision. */
export function fmt(val: number, step: number): string {
  return step < 1 ? val.toFixed(2) : String(val);
}

/**
 * Render a single parameter row to HTML. The `variant` argument picks the
 * class prefix (`param-*` for desktop, `bs-param-*` for the mobile bottom
 * sheet) so the existing CSS keeps targeting the right selectors without
 * changes.
 *
 * Returns the empty string if a range param's stored value parses to NaN —
 * the caller is then responsible for skipping the row.
 */
export function renderParamRow(p: RenderParam, storedValue: string | undefined, variant: Variant): string {
  const isMobile = variant === 'mobile';
  const rowClass = isMobile ? 'bs-param-row' : 'param-row';
  const sliderClass = isMobile ? 'bs-param-slider' : 'param-slider';
  const labelClass = isMobile ? 'bs-param-label' : 'param-label';
  const valId = isMobile ? `bs-pv-${p.key}` : '';
  const titleAttr = p.description ? ` title="${escAttr(p.description)}"` : '';

  if (p.type === 'select') {
    const value = storedValue ?? String(p.default);
    const opts = p.options
      .map((o) => `<option value="${o}"${o === value ? ' selected' : ''}>${o}</option>`)
      .join('');
    const inlineStyle = isMobile
      ? 'style="height:32px;padding:4px 8px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.05);color:var(--text-2);font-size:0.72rem"'
      : '';
    const selectClass = isMobile ? `${sliderClass} param-select` : 'param-select';
    return `<div class="${rowClass}"${titleAttr}><div class="${labelClass}">${p.label}</div><select class="${selectClass}" data-key="${p.key}" ${inlineStyle}>${opts}</select></div>`;
  }

  if (p.type === 'bool') {
    const checked = storedValue !== undefined ? storedValue === '1' : Boolean(p.default);
    const labelStyle = isMobile
      ? 'style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.7rem;color:var(--text-2)"'
      : 'style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.7rem;color:var(--muted)"';
    const boxStyle = isMobile
      ? 'style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer"'
      : 'style="accent-color:var(--accent);cursor:pointer"';
    return `<div class="${rowClass}"${titleAttr}><label ${labelStyle}><input type="checkbox" data-key="${p.key}" ${checked ? 'checked' : ''} ${boxStyle}>${p.label}</label></div>`;
  }

  const val = storedValue !== undefined ? parseFloat(storedValue) : p.default;
  if (Number.isNaN(val)) return '';
  const min = p.min ?? 0;
  const max = p.max ?? 100;
  const pct = ((val - min) / (max - min)) * 100;
  const step = p.step ?? 1;
  const valSpanId = valId ? ` id="${valId}"` : '';
  const valClass = isMobile ? 'bs-param-label__val' : 'param-label__val';
  return `<div class="${rowClass}"${titleAttr}><div class="${labelClass}">${p.label}<span class="${valClass}"${valSpanId}>${fmt(val, step)}</span></div><input type="range" class="${sliderClass}" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${step}" value="${val}" style="background:linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)"></div>`;
}

/**
 * Collect live values from a parameter container's inputs into an overrides
 * map keyed by `data-key`. Inverse of `renderParamRow`.
 *
 * Both branches share the same input set (slider + select + checkbox);
 * the caller only needs to pass the slider selector — desktop uses
 * `.param-slider`, mobile uses `.bs-param-slider:not(.param-select)`.
 */
export function collectParamOverrides(
  container: HTMLElement,
  sliderSelector: string,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  container.querySelectorAll<HTMLInputElement>(sliderSelector).forEach((s) => {
    overrides[s.dataset.key ?? ''] = parseFloat(s.value);
  });
  container.querySelectorAll<HTMLSelectElement>('.param-select').forEach((s) => {
    overrides[s.dataset.key ?? ''] = s.value;
  });
  container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
    if (!cb.dataset.key) return;
    // Only count checkboxes inside a param row, not any checkbox on the page.
    if (!cb.closest('.param-row, .bs-param-row')) return;
    overrides[cb.dataset.key] = cb.checked;
  });
  return overrides;
}
