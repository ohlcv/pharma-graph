// src/ui/tooltip.ts
// 通用 tooltip 组件 —— 任何元素都能挂一个悬停浮层。
//
// 设计要点：
//   - 浮层 DOM 挂在 body 直属，脱离触发元素的 overflow / backdrop-filter
//     包含块（工具栏就有 overflow-x:auto + backdrop-filter，放内部必被裁剪）。
//   - 一个 trigger 对应一个浮层元素，show/hide 走 class 切换，定位用 fixed
//     坐标（getBoundingClientRect 是视口坐标）。
//   - hover 延迟显示（避免鼠标扫过一排按钮时全部弹出）；移开/点击/滚动即隐藏。
//   - focus/blur 同样触发，键盘用户 Tab 到按钮也能看到说明。
//   - 位置策略：优先下方（触发器常在顶栏，上方空间不够），空间不足按视口
//     边界自动贴边，左右自动夹紧。

export interface TooltipOptions {
  /** 显示前的延迟（ms）。默认 400 —— 扫过一排按钮时不会全部弹出。 */
  delay?: number;
  /** 浮层内容（HTML 字符串）。调用方负责转义不可信内容。 */
  html?: string;
  /** 浮层最大宽度（px）。默认 300。 */
  maxWidth?: number;
  /** 触发器与浮层的间距（px）。默认 8。 */
  gap?: number;
  /** 距视口边缘的最小留白（px）。默认 8。 */
  margin?: number;
  /** 无障碍 label。默认读触发器的 aria-label / textContent。 */
  label?: string;
}

/** 已挂载 tooltip 的句柄。调用 unmount() 解除监听并移除浮层 DOM。 */
export interface TooltipHandle {
  unmount(): void;
  /** 手动显示（用于键盘 focus / 程序化触发的场景）。 */
  show(): void;
  /** 手动隐藏。 */
  hide(): void;
}

let uid = 0;

/**
 * 给 trigger 挂一个 tooltip。
 *
 * @param trigger 触发元素（按钮 / 图标 / 任意 HTMLElement）
 * @param options 浮层内容与定位参数
 */
export function mountTooltip(trigger: HTMLElement, options: TooltipOptions = {}): TooltipHandle {
  const { delay = 400, html = '', maxWidth = 300, gap = 8, margin = 8 } = options;

  const tip = document.createElement('div');
  tip.className = 'ui-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  tip.style.maxWidth = `${maxWidth}px`;
  tip.innerHTML = html;
  document.body.appendChild(tip);

  let timer: ReturnType<typeof setTimeout> | null = null;

  const position = (): void => {
    // 先确保可见，offsetHeight 才是真实高度（hidden 时读数为 0）。
    tip.classList.add('ui-tooltip--visible');
    const r = trigger.getBoundingClientRect();
    const tipH = tip.offsetHeight || 0;
    const tipW = tip.offsetWidth || maxWidth;
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    const centerX = r.left + r.width / 2;
    const left = Math.min(Math.max(centerX, margin + tipW / 2), vw - margin - tipW / 2);

    const belowSpace = vh - r.bottom;
    const aboveSpace = r.top;
    let top: number;
    if (belowSpace >= tipH + gap) {
      top = r.bottom + gap;
    } else if (aboveSpace >= tipH + gap) {
      top = r.top - gap - tipH;
    } else {
      top = belowSpace >= aboveSpace ? r.bottom + gap : r.top - gap - tipH;
    }

    // NaN / Infinity 兜底 —— 非法 CSS 值会被浏览器静默丢弃（style.top 读回空）。
    const safeLeft = Number.isFinite(left) ? left : margin + tipW / 2;
    const safeTop = Number.isFinite(top) ? top : r.bottom + gap;
    const clampedTop = Math.max(margin, Math.min(safeTop, Math.max(margin, vh - tipH - margin)));
    tip.style.setProperty('left', `${safeLeft}px`);
    tip.style.setProperty('top', `${clampedTop}px`);
  };

  const show = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      tip.classList.add('ui-tooltip--visible');
      tip.setAttribute('aria-hidden', 'false');
      position();
    }, delay);
  };

  const hide = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    tip.classList.remove('ui-tooltip--visible');
    tip.setAttribute('aria-hidden', 'true');
  };

  trigger.addEventListener('mouseenter', show);
  trigger.addEventListener('mouseleave', hide);
  trigger.addEventListener('focus', show);
  trigger.addEventListener('blur', hide);
  trigger.addEventListener('click', hide);
  window.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('resize', hide);

  const id = `ui-tooltip-${++uid}`;
  tip.id = id;
  trigger.setAttribute('aria-describedby', id);

  return {
    show,
    hide,
    unmount(): void {
      hide();
      trigger.removeEventListener('mouseenter', show);
      trigger.removeEventListener('mouseleave', hide);
      trigger.removeEventListener('focus', show);
      trigger.removeEventListener('blur', hide);
      trigger.removeEventListener('click', hide);
      window.removeEventListener('scroll', hide);
      window.removeEventListener('resize', hide);
      tip.remove();
    },
  };
}
