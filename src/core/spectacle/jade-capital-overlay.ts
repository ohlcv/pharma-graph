// src/core/spectacle/jade-capital-overlay.ts
// 白玉京（jade-capital）：第六个装饰奇观。
//
// 意象来源：李白五十八岁晚年绝唱《经乱离后天恩流夜郎忆旧游书怀赠江夏韦太守良宰》
// 开篇四句——
//   「天上白玉京，十二楼五城。仙人抚我顶，结发受长生。」
// 世人多只记取开篇四句的缥缈仙气，却不知全诗 830 字大半在写半生失意与家国崩裂。
//
// 架构与另外五个奇观平行（各自独立 canvas、独立 rAF、独立生命周期，无共享基类）。
//
// 视觉构图（2.5D 仰视微俯的浮空仙阙 + 未完成的授箓循环）：
//   1. 悬圃浮山与暗尘（底境）：
//      倒悬的白玉昆仑山体托起整座天宫，横掠流云瑞霭；山体下方是缓慢沉降的
//      暗紫铅灰霜尘（对应「夜郎万里道，西上令人老」「白骨成丘山」）。
//   2. 五城虹桥（中境）：
//      中央「玉清主城」三层汉白玉须弥座城台 + 东西南北四方浮空卫城，五城之间
//      以白玉飞梁虹桥相连；主城正中耸立三层重檐飞角紫微主阙，前立南天门双阙。
//   3. 十二琼楼与周天星盘（外境）：
//      倾角透视的周天十二星次天盘（星纪→析木）环绕五城缓慢公转，十二座重檐
//      飞翘的白玉楼阁（十二楼）沿星盘等分排布，按前后景深分层绘制（后六楼在
//      主阙之后、前六楼在主阙之前），形成一眼可辨的立体浮空宫阙群。
//   4. 未完成的授箓（核心叙事，12 秒纯 t 循环）：
//      - [0, 0.28) 仙人抚我顶：天顶开启仙门光晕，冷白仙光垂直落入仙台孤影；
//      - [0.28, 0.55) 结发：双股灵气（冷玉 + 暖白）自仙台呈双螺旋盘旋交结上升；
//      - [0.55, 0.68) 受长生（差一点圆满）：在天顶汇成全图唯一的暖金长明星与
//        八角星芒道箓金轮，十二楼五城随之辉映至最亮；
//      - [0.68, 1.00) 仙梦破碎：道箓金轮崩裂，化作黯金碎玉循抛物线坠落消散，
//        十二楼与五城同步微黯（玉京同叹），随后新一轮天光再次垂落。

import type cytoscape from 'cytoscape';
import { loadDecorContent } from './decor-content.js';
import { isElementShown } from '../element-visibility.js';
import { pickSpectacleParam } from './spectacle-size.js';

/** 图上这个节点固定用这个 id；内容节点 public/content/装饰奇观/白玉京.md 同名。 */
export const JADE_CAPITAL_ID = 'jade-capital';
const JADE_CLASS = 'jade-capital-node';

/** 授箓循环周期（秒）。 */
const CYCLE = 12;
/** 十二楼：对应十二星次 / 十二时辰。 */
const TOWER_COUNT = 12;
/** 十二星次古名（沿周天星盘排布）。 */
const XING_CI = [
  '星纪',
  '玄枵',
  '娵訾',
  '降娄',
  '大梁',
  '实沈',
  '鹑首',
  '鹑火',
  '鹑尾',
  '寿星',
  '大火',
  '析木',
] as const;
/** 底层沉降霜尘数。 */
const ASH_COUNT = 28;
/** 长明星崩解的黯金碎玉数。 */
const SHARD_COUNT = 14;
/** 周天星盘透视纵横比（2.5D 俯仰角）。 */
const ORBIT_TILT = 0.34;
/** 十二楼公转角速度（弧度/秒）。 */
const ORBIT_SPEED = 0.045;

type Ash = {
  phase: number;
  rate: number;
  driftX: number;
  driftPhase: number;
  size: number;
};

type Shard = {
  vx: number;
  vy: number;
  spin: number;
  size: number;
};

/** 四方卫城相对主城的局部坐标（归一化到 R）与尺寸。 */
const SATELLITE_CITIES: ReadonlyArray<{
  x: number;
  y: number;
  w: number;
  h: number;
  bridgeToX: number;
  bridgeToY: number;
  back: boolean;
}> = [
  // 北卫城（后方高处）
  { x: -0.46, y: -0.14, w: 0.22, h: 0.08, bridgeToX: -0.22, bridgeToY: -0.02, back: true },
  // 东卫城（右侧高处）
  { x: 0.46, y: -0.14, w: 0.22, h: 0.08, bridgeToX: 0.22, bridgeToY: -0.02, back: true },
  // 西卫城（左前侧）
  { x: -0.58, y: 0.12, w: 0.25, h: 0.095, bridgeToX: -0.28, bridgeToY: 0.08, back: false },
  // 南卫城（右前侧）
  { x: 0.58, y: 0.12, w: 0.25, h: 0.095, bridgeToX: 0.28, bridgeToY: 0.08, back: false },
];

function graphSpread(cy: cytoscape.Core): {
  bb: { x1: number; y1: number; x2: number; y2: number };
  spread: number;
} {
  let bb = { x1: -500, y1: -500, x2: 500, y2: 500 };
  try {
    const real = cy.nodes().not('.layer-parent').boundingBox();
    if (Number.isFinite(real.x1) && Number.isFinite(real.y1) && real.w > 0 && real.h > 0) bb = real;
  } catch {
    /* 图还没建好时 boundingBox() 可能抛错，用兜底范围 */
  }
  return { bb, spread: Math.max(bb.x2 - bb.x1, bb.y2 - bb.y1, 400) };
}

/** 白玉京与其它五个奇观同尺寸（统一视觉半径）。 */
function pickRadius(cy: cytoscape.Core): number {
  return pickSpectacleParam(graphSpread(cy).spread, 'jade-capital');
}

function hitboxSize(radius: number): number {
  return radius * 2 * 0.92;
}

function stripNodeChrome(node: cytoscape.NodeSingular, size: number): void {
  node.data('stroke', '');
  node.data('defaultStroke', '');
  node.style({
    'background-color': 'rgba(0,0,0,0)',
    'background-opacity': 0,
    'background-fill': 'solid' as const,
    'background-blacken': 0,
    'background-gradient-stop-colors': '',
    'background-gradient-stop-positions': '',
    'background-gradient-direction': '',
    'border-width': 0,
    'border-color': 'rgba(0,0,0,0)',
    'border-opacity': 0,
    'border-style': 'solid' as cytoscape.Css.LineStyle,
    'overlay-color': 'rgba(0,0,0,0)',
    'overlay-opacity': 0,
    'overlay-shape': 'ellipse' as cytoscape.Css.NodeShape,
    'overlay-padding': 0,
    label: '',
    'text-opacity': 0,
    'text-events': 'no' as const,
    width: size,
    height: size,
    'min-width': 1,
    'min-height': 1,
    shape: 'ellipse' as cytoscape.Css.NodeShape,
    padding: 0,
    opacity: 0,
  });
}

export function spawnJadeCapitalNode(cy: cytoscape.Core): cytoscape.NodeSingular {
  const size = hitboxSize(pickRadius(cy));

  const existing = cy.getElementById(JADE_CAPITAL_ID);
  if (existing.nonempty()) {
    existing.addClass(`layer-parent ${JADE_CLASS}`);
    stripNodeChrome(existing, size);
    return existing;
  }

  const { bb } = graphSpread(cy);
  const view = safeViewCenter(cy, bb);
  const node = cy.add({
    group: 'nodes',
    data: { id: JADE_CAPITAL_ID, label: '白玉京' },
    position: view,
    classes: `layer-parent ${JADE_CLASS}`,
  });
  stripNodeChrome(node, size);
  void loadDecorContent(node);
  return node;
}

function safeViewCenter(
  cy: cytoscape.Core,
  bb: { x1: number; y1: number; x2: number; y2: number },
): { x: number; y: number } {
  try {
    const zoom = cy.zoom();
    const pan = cy.pan();
    if (zoom > 0 && Number.isFinite(pan.x) && Number.isFinite(pan.y)) {
      const c = {
        x: (cy.width() / 2 - pan.x) / zoom,
        y: (cy.height() / 2 - pan.y) / zoom,
      };
      const inBounds =
        c.x >= bb.x1 - 500 && c.x <= bb.x2 + 500 && c.y >= bb.y1 - 500 && c.y <= bb.y2 + 500;
      if (inBounds) return c;
    }
  } catch {
    /* 极早期 width/height 还没算出来 */
  }
  return { x: (bb.x1 + bb.x2) / 2, y: (bb.y1 + bb.y2) / 2 };
}

export interface JadeCapitalOverlayOptions {
  container: HTMLElement;
  cy: cytoscape.Core;
  fps?: number;
}

export class JadeCapitalOverlay {
  private readonly cy: cytoscape.Core;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly frameInterval: number;
  private readonly reducedMotion: boolean;

  private readonly ashes: Ash[] = Array.from({ length: ASH_COUNT }, (_, i) => ({
    phase: i / ASH_COUNT,
    rate: 0.045 + (i % 5) * 0.011,
    driftX: (((i * 41) % 100) - 50) / 100, // -0.5 ~ 0.5
    driftPhase: (i * 1.9) % (Math.PI * 2),
    size: 0.005 + (i % 3) * 0.0025,
  }));

  private readonly shards: Shard[] = Array.from({ length: SHARD_COUNT }, (_, i) => {
    const ang = -Math.PI * 0.85 + (i / (SHARD_COUNT - 1)) * Math.PI * 0.7 + ((i % 3) - 1) * 0.08;
    const spd = 0.22 + (i % 4) * 0.075;
    return {
      vx: Math.cos(ang + Math.PI / 2) * spd,
      vy: -0.08 + (i % 3) * 0.05,
      spin: (i % 2 === 0 ? 1 : -1) * (2.2 + (i % 4) * 0.8),
      size: 0.012 + (i % 3) * 0.004,
    };
  });

  private modelRadius = 140;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  private rafId: number | null = null;
  private startedAt = 0;
  private lastDrawAt = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  constructor(options: JadeCapitalOverlayOptions) {
    this.cy = options.cy;
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    spawnJadeCapitalNode(this.cy);
    this.modelRadius = pickRadius(this.cy);

    const container = options.container;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-jade-capital-overlay', '');
    Object.assign(this.canvas.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);
    container.insertBefore(this.canvas, container.firstChild);

    this.ctx = this.canvas.getContext('2d');
    this.syncSize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.syncSize();
        if (this.reducedMotion) this.draw(CYCLE * 0.62);
      });
      this.resizeObserver.observe(container);
    }
    document.addEventListener('visibilitychange', this.onVisibility);

    if (this.reducedMotion) {
      // 静态模式定格在顶点长明星最亮、十二楼五城交相辉映的瞬间（phase = 0.62）
      this.draw(CYCLE * 0.62);
    } else {
      this.start();
    }
  }

  destroy(): void {
    this.pause();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.remove();
    const node = this.cy.getElementById(JADE_CAPITAL_ID);
    if (node.nonempty() && node.hasClass(JADE_CLASS) && node.hasClass('layer-parent')) {
      this.cy.remove(node);
    }
  }

  private syncSize(): void {
    const container = this.canvas.parentElement;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.cssWidth && h === this.cssHeight && dpr === this.dpr) return;
    this.cssWidth = w;
    this.cssHeight = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  private start(): void {
    this.startedAt = performance.now();
    this.lastDrawAt = 0;
    this.pause();
    this.rafId = requestAnimationFrame(this.tick);
  }

  private pause(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private resume(): void {
    if (this.rafId === null && !this.reducedMotion) this.rafId = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    this.rafId = requestAnimationFrame(this.tick);
    if (now - this.lastDrawAt < this.frameInterval) return;
    this.lastDrawAt = now;
    this.draw((now - this.startedAt) / 1000);
  };

  // ── 绘制主循环 ──────────────────────────────────────────────────────────

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    const node = this.cy.getElementById(JADE_CAPITAL_ID);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    if (node.empty() || !isElementShown(node)) return;

    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    const R = Math.max(this.modelRadius * zoom, 8);
    const rx = p.x;
    const ry = p.y;

    const reach = R * 1.18 + 24;
    if (
      rx + reach < 0 ||
      rx - reach > this.cssWidth ||
      ry + reach < 0 ||
      ry - reach > this.cssHeight
    )
      return;

    const phase = (t % CYCLE) / CYCLE; // 0..1 授箓循环
    // 玉京叹息包络：在 [0.55, 0.68) 长明星凝聚时微亮（1.12），
    // 在 [0.68, 1.0) 破碎陨落时下探 38%（0.62），其余时段为 1.0。
    let sigh = 1;
    if (phase >= 0.55 && phase < 0.68) {
      const u = (phase - 0.55) / 0.13;
      sigh = 1 + 0.14 * Math.sin(u * Math.PI);
    } else if (phase >= 0.68) {
      const u = (phase - 0.68) / 0.32;
      sigh = 1 - 0.38 * Math.sin(u * Math.PI);
    }

    // 整座仙阙极其轻微的浮空呼吸（上下浮动约 0.012R）
    const floatY = this.reducedMotion ? 0 : Math.sin(t * 0.7) * R * 0.012;

    ctx.save();
    ctx.translate(rx, ry + floatY);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. 背景仙穹柔光（玉清境天幕光晕）
    this.drawCelestialAura(ctx, R, sigh, phase);

    // 2. 底层：暗紫铅灰粒子沉降（人间乱离与夜郎万里道的劫灰）
    this.drawFallingAsh(ctx, R, t);

    // 3. 浮空昆仑玉山根基（倒悬山体，托起五城十二楼）
    this.drawFloatingMountainBase(ctx, R, sigh);

    // 4. 周天星盘与后景 6 座琼楼（位于主城后方，sin(angle) < 0）
    this.drawAstrolabeAndTowers(ctx, R, t, sigh, 'back');

    // 5. 五城之「后方二卫城」与飞梁虹桥
    this.drawSatelliteCities(ctx, R, sigh, true);

    // 6. 中央主城（玉清宫坛）+ 紫微三层重檐主阙
    this.drawCentralCitadelAndPalace(ctx, R, sigh, phase);

    // 7. 核心叙事：未完成的授箓（抚顶 → 结发 → 长明星 → 破碎陨落）
    this.drawOrdination(ctx, R, t, phase);

    // 8. 南天门双阙（前景子母阙）+ 五城之「前方二卫城」
    this.drawSouthHeavenGate(ctx, R, sigh);
    this.drawSatelliteCities(ctx, R, sigh, false);

    // 9. 前景 6 座琼楼（sin(angle) >= 0）+ 缭绕瑞云
    this.drawAstrolabeAndTowers(ctx, R, t, sigh, 'front');
    this.drawCloudBands(ctx, R, t, sigh);

    ctx.restore();
  }

  // ── 1. 天幕仙气光晕 ────────────────────────────────────────────────────

  private drawCelestialAura(
    ctx: CanvasRenderingContext2D,
    R: number,
    sigh: number,
    phase: number,
  ): void {
    const grad = ctx.createRadialGradient(0, -R * 0.1, R * 0.04, 0, 0, R * 1.05);
    const warmBoost = phase >= 0.52 && phase < 0.7 ? Math.sin(((phase - 0.52) / 0.18) * Math.PI) : 0;
    grad.addColorStop(
      0,
      `rgba(${Math.round(190 + 60 * warmBoost)}, ${Math.round(228 + 15 * warmBoost)}, 248, ${0.16 * sigh})`,
    );
    grad.addColorStop(0.48, `rgba(148, 198, 232, ${0.08 * sigh})`);
    grad.addColorStop(0.78, `rgba(88, 74, 122, 0.04)`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.05, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // ── 2. 底层劫灰沉降 ────────────────────────────────────────────────────

  private drawFallingAsh(ctx: CanvasRenderingContext2D, R: number, t: number): void {
    ctx.beginPath();
    for (const a of this.ashes) {
      const u = (t * a.rate + a.phase) % 1;
      // 从城台下方 y = +0.16R 缓缓沉降到 y = +0.92R
      const ay = R * (0.16 + u * 0.76);
      const spread = 0.65 * (1 - u * 0.35);
      const ax = a.driftX * R * spread + R * 0.025 * Math.sin(t * 0.6 + a.driftPhase);
      if (Math.sin(u * Math.PI) <= 0.08) continue;
      const sz = Math.max(0.6, R * a.size);
      ctx.moveTo(ax + sz, ay);
      ctx.arc(ax, ay, sz, 0, Math.PI * 2);
    }
    ctx.fillStyle = 'rgba(138, 118, 168, 0.28)';
    ctx.fill();
  }

  // ── 3. 浮空昆仑悬圃山体（倒悬玉山根基）────────────────────────────────

  private drawFloatingMountainBase(
    ctx: CanvasRenderingContext2D,
    R: number,
    sigh: number,
  ): void {
    // 主城底部的倒棱锥浮空玉山（分左中右多个折面，营造立体晶石山根）
    const topY = R * 0.14;
    const tipY = R * 0.68;

    // 暗面填充
    const bodyGrad = ctx.createLinearGradient(0, topY, 0, tipY);
    bodyGrad.addColorStop(0, `rgba(165, 210, 235, ${0.26 * sigh})`);
    bodyGrad.addColorStop(0.55, `rgba(96, 136, 175, ${0.16 * sigh})`);
    bodyGrad.addColorStop(1, 'rgba(58, 48, 82, 0)');

    ctx.beginPath();
    ctx.moveTo(-R * 0.38, topY);
    ctx.lineTo(-R * 0.24, R * 0.36);
    ctx.lineTo(-R * 0.12, R * 0.31);
    ctx.lineTo(0, tipY);
    ctx.lineTo(R * 0.12, R * 0.31);
    ctx.lineTo(R * 0.24, R * 0.36);
    ctx.lineTo(R * 0.38, topY);
    ctx.closePath();
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // 山体折面棱线（单 path 合并 stroke）
    ctx.beginPath();
    // 外轮廓与内部晶面脊线
    ctx.moveTo(-R * 0.38, topY);
    ctx.lineTo(-R * 0.18, R * 0.42);
    ctx.lineTo(0, tipY);
    ctx.lineTo(R * 0.18, R * 0.42);
    ctx.lineTo(R * 0.38, topY);
    // 中脊线
    ctx.moveTo(0, topY);
    ctx.lineTo(0, tipY);
    // 左右副脊
    ctx.moveTo(-R * 0.18, topY);
    ctx.lineTo(-R * 0.08, R * 0.48);
    ctx.moveTo(R * 0.18, topY);
    ctx.lineTo(R * 0.08, R * 0.48);
    ctx.strokeStyle = `rgba(205, 232, 248, ${0.28 * sigh})`;
    ctx.lineWidth = Math.max(0.7, R * 0.0045);
    ctx.stroke();
  }

  // ── 4 & 9. 周天十二星次天盘 + 十二楼（前后景分层）──────────────────────

  private drawAstrolabeAndTowers(
    ctx: CanvasRenderingContext2D,
    R: number,
    t: number,
    sigh: number,
    layer: 'back' | 'front',
  ): void {
    const orbitRx = R * 0.86;
    const orbitRy = orbitRx * ORBIT_TILT;
    const outerRx = R * 0.98;
    const outerRy = outerRx * ORBIT_TILT;
    const centerY = R * 0.02;
    const rot = this.reducedMotion ? 0.25 : t * ORBIT_SPEED;

    // 椭圆天盘轨道弧（后半圈 [π, 2π]，前半圈 [0, π]）
    const startAng = layer === 'back' ? Math.PI : 0;
    const endAng = layer === 'back' ? Math.PI * 2 : Math.PI;
    const ringAlpha = (layer === 'back' ? 0.22 : 0.42) * sigh;

    ctx.beginPath();
    ctx.ellipse(0, centerY, orbitRx, orbitRy, 0, startAng, endAng);
    ctx.ellipse(0, centerY, outerRx, outerRy, 0, startAng, endAng);
    ctx.strokeStyle = `rgba(210, 236, 250, ${ringAlpha})`;
    ctx.lineWidth = Math.max(0.8, R * 0.005);
    ctx.stroke();

    // 收集属于当前层（前/后）的楼阁索引，并按 y 坐标从后往前排序以保证遮挡自然
    const indices: { idx: number; ang: number; sinA: number; cosA: number }[] = [];
    for (let i = 0; i < TOWER_COUNT; i++) {
      const ang = (i / TOWER_COUNT) * Math.PI * 2 + rot;
      const sinA = Math.sin(ang);
      const isBack = sinA < 0;
      if ((layer === 'back' && isBack) || (layer === 'front' && !isBack)) {
        indices.push({ idx: i, ang, sinA, cosA: Math.cos(ang) });
      }
    }
    indices.sort((a, b) => a.sinA - b.sinA);

    // 先画星盘辐射刻度与十二星次铭文（仅当缩放足够看清时画文字）
    if (R >= 70) {
      const fontSize = Math.max(6, R * 0.042);
      ctx.font = `${fontSize}px "Songti SC","STSong","Noto Serif SC",serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const item of indices) {
        const depthScale = 0.82 + 0.18 * ((item.sinA + 1) / 2);
        const tx = item.cosA * ((orbitRx + outerRx) * 0.5);
        const ty = centerY + item.sinA * ((orbitRy + outerRy) * 0.5);
        ctx.fillStyle = `rgba(225, 240, 252, ${(layer === 'back' ? 0.34 : 0.62) * sigh * depthScale})`;
        ctx.fillText(XING_CI[item.idx], tx, ty);
      }
    }

    // 逐座绘制「十二楼」：带重檐飞角、玉柱与莲台基座的古典琼楼
    for (const item of indices) {
      const depthNorm = (item.sinA + 1) / 2; // 0(最远) .. 1(最近)
      const scale = 0.72 + 0.34 * depthNorm;
      const tx = item.cosA * orbitRx;
      const ty = centerY + item.sinA * orbitRy;
      const alpha = (0.48 + 0.44 * depthNorm) * sigh;
      this.drawJadeTower(ctx, tx, ty, R * 0.115 * scale, R * 0.155 * scale, alpha);
    }
  }

  /**
   * 绘制单座「白玉琼楼」（双层重檐飞角楼阁 + 浮空基座）。
   * (cx, baseY) 为楼阁底座中心，w 为基准翼展，h 为楼高。
   */
  private drawJadeTower(
    ctx: CanvasRenderingContext2D,
    cx: number,
    baseY: number,
    w: number,
    h: number,
    alpha: number,
  ): void {
    // 1) 浮空莲台小基座與下垂晶锥
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.42, baseY);
    ctx.lineTo(cx + w * 0.42, baseY);
    ctx.lineTo(cx + w * 0.28, baseY + h * 0.14);
    ctx.lineTo(cx, baseY + h * 0.32);
    ctx.lineTo(cx - w * 0.28, baseY + h * 0.14);
    ctx.closePath();
    ctx.fillStyle = `rgba(180, 218, 240, ${alpha * 0.28})`;
    ctx.fill();

    // 2) 一层与二层屋身及斗拱填充
    const eave1Y = baseY - h * 0.46;
    const eave2Y = baseY - h * 0.82;
    const apexY = baseY - h;

    ctx.fillStyle = `rgba(215, 238, 250, ${alpha * 0.22})`;
    ctx.fillRect(cx - w * 0.28, eave1Y, w * 0.56, h * 0.46);
    ctx.fillRect(cx - w * 0.2, eave2Y, w * 0.4, h * 0.36);

    // 3) 双层飞檐翘角（中国古建标志性的凹曲屋面 + 上挑檐角）与玉柱
    ctx.beginPath();
    // 底座横栏
    ctx.moveTo(cx - w * 0.44, baseY);
    ctx.lineTo(cx + w * 0.44, baseY);
    // 一层四根玉柱
    for (const px of [-0.26, -0.09, 0.09, 0.26]) {
      ctx.moveTo(cx + w * px, baseY);
      ctx.lineTo(cx + w * px, eave1Y);
    }
    // 一层飞檐（下层宽檐，两端微翘）
    ctx.moveTo(cx - w * 0.54, eave1Y - h * 0.06);
    ctx.quadraticCurveTo(cx - w * 0.22, eave1Y + h * 0.04, cx, eave1Y - h * 0.14);
    ctx.quadraticCurveTo(cx + w * 0.22, eave1Y + h * 0.04, cx + w * 0.54, eave1Y - h * 0.06);
    // 二层玉柱
    ctx.moveTo(cx - w * 0.18, eave1Y - h * 0.05);
    ctx.lineTo(cx - w * 0.18, eave2Y);
    ctx.moveTo(cx + w * 0.18, eave1Y - h * 0.05);
    ctx.lineTo(cx + w * 0.18, eave2Y);
    // 二层飞檐（上层攒尖重檐，飞翘更高）
    ctx.moveTo(cx - w * 0.44, eave2Y - h * 0.07);
    ctx.quadraticCurveTo(cx - w * 0.16, eave2Y + h * 0.03, cx, apexY);
    ctx.quadraticCurveTo(cx + w * 0.16, eave2Y + h * 0.03, cx + w * 0.44, eave2Y - h * 0.07);
    // 宝顶攒尖刹杆
    ctx.moveTo(cx, apexY);
    ctx.lineTo(cx, apexY - h * 0.14);

    ctx.strokeStyle = `rgba(232, 245, 255, ${alpha * 0.92})`;
    ctx.lineWidth = Math.max(0.8, w * 0.045);
    ctx.stroke();

    // 4) 楼心微暖宫灯点缀（让每座玉楼有呼吸感）
    const lanternR = Math.max(0.8, w * 0.055);
    ctx.beginPath();
    ctx.arc(cx, eave1Y + h * 0.2, lanternR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 236, 195, ${alpha * 0.65})`;
    ctx.fill();
  }

  // ── 5 & 8b. 五城之「四方卫城」与白玉飞梁虹桥 ─────────────────────────────

  private drawSatelliteCities(
    ctx: CanvasRenderingContext2D,
    R: number,
    sigh: number,
    backOnly: boolean,
  ): void {
    for (const c of SATELLITE_CITIES) {
      if (c.back !== backOnly) continue;
      const cx = c.x * R;
      const cy = c.y * R;
      const hw = (c.w * R) / 2;
      const hh = (c.h * R) / 2;
      const bx = c.bridgeToX * R;
      const by = c.bridgeToY * R;
      const alpha = (c.back ? 0.52 : 0.72) * sigh;

      // 1) 连接主城的白玉飞梁虹桥（双道拱弧）
      const midX = (cx + bx) * 0.5;
      const midY = Math.min(cy, by) - R * 0.045;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(midX, midY, bx, by);
      ctx.moveTo(cx, cy + R * 0.012);
      ctx.quadraticCurveTo(midX, midY + R * 0.014, bx, by + R * 0.012);
      ctx.strokeStyle = `rgba(215, 238, 252, ${alpha * 0.65})`;
      ctx.lineWidth = Math.max(0.8, R * 0.005);
      ctx.stroke();

      // 2) 卫城须弥座城台 + 底部悬石
      ctx.beginPath();
      ctx.moveTo(cx - hw, cy);
      ctx.lineTo(cx + hw, cy);
      ctx.lineTo(cx + hw * 0.78, cy + hh);
      ctx.lineTo(cx, cy + hh * 2.2);
      ctx.lineTo(cx - hw * 0.78, cy + hh);
      ctx.closePath();
      ctx.fillStyle = `rgba(185, 222, 242, ${alpha * 0.28})`;
      ctx.fill();

      // 城墙垛口与城台轮廓线
      ctx.beginPath();
      ctx.moveTo(cx - hw, cy);
      ctx.lineTo(cx + hw, cy);
      ctx.lineTo(cx + hw * 0.82, cy + hh);
      ctx.lineTo(cx - hw * 0.82, cy + hh);
      ctx.closePath();
      // 城台上的小阙亭轮廓
      const pw = hw * 0.55;
      const ph = hh * 1.15;
      ctx.moveTo(cx - pw * 0.7, cy);
      ctx.lineTo(cx - pw * 0.7, cy - ph * 0.65);
      ctx.moveTo(cx + pw * 0.7, cy);
      ctx.lineTo(cx + pw * 0.7, cy - ph * 0.65);
      ctx.moveTo(cx - pw * 1.05, cy - ph * 0.72);
      ctx.quadraticCurveTo(cx, cy - ph * 0.45, cx + pw * 1.05, cy - ph * 0.72);
      ctx.moveTo(cx - pw * 1.05, cy - ph * 0.72);
      ctx.quadraticCurveTo(cx - pw * 0.3, cy - ph * 0.65, cx, cy - ph * 1.1);
      ctx.quadraticCurveTo(cx + pw * 0.3, cy - ph * 0.65, cx + pw * 1.05, cy - ph * 0.72);

      ctx.strokeStyle = `rgba(228, 244, 255, ${alpha * 0.85})`;
      ctx.lineWidth = Math.max(0.8, R * 0.0055);
      ctx.stroke();
    }
  }

  // ── 6. 中央玉清主城 + 三层重檐紫微主阙 ─────────────────────────────────

  private drawCentralCitadelAndPalace(
    ctx: CanvasRenderingContext2D,
    R: number,
    sigh: number,
    phase: number,
  ): void {
    // ── A. 中央三层汉白玉须弥座主城台（y: 0.02R ~ 0.15R）──
    const baseTopY = R * 0.02;
    const tiers = [
      { y1: baseTopY, y2: R * 0.06, hw1: R * 0.32, hw2: R * 0.34 },
      { y1: R * 0.06, y2: R * 0.1, hw1: R * 0.36, hw2: R * 0.38 },
      { y1: R * 0.1, y2: R * 0.145, hw1: R * 0.4, hw2: R * 0.38 },
    ];

    ctx.beginPath();
    for (const tr of tiers) {
      ctx.moveTo(-tr.hw1, tr.y1);
      ctx.lineTo(tr.hw1, tr.y1);
      ctx.lineTo(tr.hw2, tr.y2);
      ctx.lineTo(-tr.hw2, tr.y2);
      ctx.closePath();
    }
    ctx.fillStyle = `rgba(195, 228, 248, ${0.24 * sigh})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(230, 245, 255, ${0.72 * sigh})`;
    ctx.lineWidth = Math.max(0.9, R * 0.006);
    ctx.stroke();

    // 中央登仙御阶（正中丹陛台阶，带九级横纹）
    const stairW1 = R * 0.065;
    const stairW2 = R * 0.095;
    ctx.beginPath();
    ctx.moveTo(-stairW1, baseTopY);
    ctx.lineTo(-stairW2, R * 0.16);
    ctx.lineTo(stairW2, R * 0.16);
    ctx.lineTo(stairW1, baseTopY);
    for (let s = 1; s <= 5; s++) {
      const u = s / 6;
      const sy = baseTopY + u * (R * 0.16 - baseTopY);
      const sw = stairW1 + u * (stairW2 - stairW1);
      ctx.moveTo(-sw, sy);
      ctx.lineTo(sw, sy);
    }
    ctx.fillStyle = `rgba(225, 242, 255, ${0.32 * sigh})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(235, 248, 255, ${0.78 * sigh})`;
    ctx.lineWidth = Math.max(0.7, R * 0.0045);
    ctx.stroke();

    // ── B. 紫微主阙（中央三层重檐庑殿大殿，背衬授箓仙台）──
    // 大殿刻意用半透明白玉线框 + 清透填充，既立住宏伟的宫阙剪影，又不会遮挡
    // 前方正在发生的「抚顶 → 结发 → 受长生」光束。
    const hallBaseY = baseTopY;
    const e1Y = -R * 0.12;
    const e2Y = -R * 0.24;
    const e3Y = -R * 0.35;
    const ridgeY = -R * 0.42;

    // 殿身清透玉色填充
    ctx.beginPath();
    ctx.rect(-R * 0.22, e1Y, R * 0.44, hallBaseY - e1Y);
    ctx.rect(-R * 0.16, e2Y, R * 0.32, e1Y - e2Y);
    ctx.rect(-R * 0.11, e3Y, R * 0.22, e2Y - e3Y);
    ctx.fillStyle = `rgba(190, 225, 245, ${0.14 * sigh})`;
    ctx.fill();

    // 三层重檐飞角与殿柱（单 path 描绘盛唐重檐大殿轮廓）
    ctx.beginPath();
    // 一层廊柱（6 根）
    for (const px of [-0.2, -0.12, -0.05, 0.05, 0.12, 0.2]) {
      ctx.moveTo(R * px, hallBaseY);
      ctx.lineTo(R * px, e1Y);
    }
    // 二层廊柱（4 根）
    for (const px of [-0.14, -0.06, 0.06, 0.14]) {
      ctx.moveTo(R * px, e1Y);
      ctx.lineTo(R * px, e2Y);
    }
    // 三层廊柱（2 根）
    ctx.moveTo(-R * 0.09, e2Y);
    ctx.lineTo(-R * 0.09, e3Y);
    ctx.moveTo(R * 0.09, e2Y);
    ctx.lineTo(R * 0.09, e3Y);

    // 第一重飞檐（最宽，两侧如翼展开）
    this.traceSweepingRoof(ctx, 0, e1Y, R * 0.31, R * 0.17, R * 0.055);
    // 第二重飞檐
    this.traceSweepingRoof(ctx, 0, e2Y, R * 0.23, R * 0.12, R * 0.05);
    // 第三重飞檐（正脊 + 鸱吻 + 宝珠顶）
    this.traceSweepingRoof(ctx, 0, e3Y, R * 0.16, R * 0.065, R * 0.07);
    // 正脊横线与两端鸱吻翘起
    ctx.moveTo(-R * 0.075, ridgeY - R * 0.012);
    ctx.quadraticCurveTo(0, ridgeY + R * 0.006, R * 0.075, ridgeY - R * 0.012);
    // 中央火焰宝珠刹顶
    ctx.moveTo(0, ridgeY);
    ctx.lineTo(0, ridgeY - R * 0.045);

    ctx.strokeStyle = `rgba(232, 246, 255, ${0.82 * sigh})`;
    ctx.lineWidth = Math.max(1, R * 0.0075);
    ctx.stroke();

    // ── C. 仙台孤影（白玉京仙台中央仰望天门的谪仙人剪影）──
    // 立在御阶顶端 (0, baseTopY)，高约 0.065R，正在等待授箓
    const figFootY = baseTopY;
    const figHeadY = baseTopY - R * 0.058;
    const headGlow = phase < 0.68 ? 0.92 : 0.6;
    ctx.beginPath();
    // 头部
    ctx.arc(0, figHeadY, Math.max(1.2, R * 0.011), 0, Math.PI * 2);
    // 宽袖长袍身躯
    ctx.moveTo(0, figHeadY + R * 0.012);
    ctx.lineTo(-R * 0.02, figFootY);
    ctx.lineTo(R * 0.02, figFootY);
    ctx.closePath();
    ctx.fillStyle = `rgba(240, 248, 255, ${headGlow * sigh})`;
    ctx.fill();
  }

  /** 在当前 path 中追加一层中国古典凹曲重檐（含下檐线、两侧飞翘翼角与斜脊）。 */
  private traceSweepingRoof(
    ctx: CanvasRenderingContext2D,
    cx: number,
    eaveY: number,
    halfSpan: number,
    ridgeHalfSpan: number,
    roofHeight: number,
  ): void {
    const leftTipX = cx - halfSpan;
    const rightTipX = cx + halfSpan;
    const tipY = eaveY - roofHeight * 0.38; // 飞檐翘起高度
    const topY = eaveY - roofHeight;
    // 屋檐底弧（中间微垂、两端高挑）
    ctx.moveTo(leftTipX, tipY);
    ctx.quadraticCurveTo(cx, eaveY + roofHeight * 0.18, rightTipX, tipY);
    // 左侧垂脊（从正脊左端连向左侧飞檐翘角）
    ctx.moveTo(cx - ridgeHalfSpan, topY);
    ctx.quadraticCurveTo(cx - halfSpan * 0.62, eaveY - roofHeight * 0.15, leftTipX, tipY);
    // 右侧垂脊
    ctx.moveTo(cx + ridgeHalfSpan, topY);
    ctx.quadraticCurveTo(cx + halfSpan * 0.62, eaveY - roofHeight * 0.15, rightTipX, tipY);
    // 上沿正脊连线
    ctx.moveTo(cx - ridgeHalfSpan, topY);
    ctx.lineTo(cx + ridgeHalfSpan, topY);
  }

  // ── 8a. 南天门前景双阙（汉唐子母阙，左右夹峙御阶前）────────────────────

  private drawSouthHeavenGate(
    ctx: CanvasRenderingContext2D,
    R: number,
    sigh: number,
  ): void {
    const gateY = R * 0.12;
    const gateX = R * 0.19;
    const qw = R * 0.055;
    const qh = R * 0.15;

    ctx.beginPath();
    for (const dir of [-1, 1] as const) {
      const x = dir * gateX;
      // 母阙台基与柱身
      ctx.moveTo(x - qw * 0.5, gateY);
      ctx.lineTo(x - qw * 0.42, gateY - qh);
      ctx.lineTo(x + qw * 0.42, gateY - qh);
      ctx.lineTo(x + qw * 0.5, gateY);
      // 母阙飞檐
      ctx.moveTo(x - qw * 0.85, gateY - qh * 1.08);
      ctx.quadraticCurveTo(x, gateY - qh * 0.92, x + qw * 0.85, gateY - qh * 1.08);
      ctx.moveTo(x - qw * 0.85, gateY - qh * 1.08);
      ctx.quadraticCurveTo(x, gateY - qh * 1.28, x + qw * 0.85, gateY - qh * 1.08);
      // 外侧附带的低矮子阙
      const subX = x + dir * qw * 0.68;
      const subH = qh * 0.62;
      ctx.moveTo(subX - qw * 0.28, gateY);
      ctx.lineTo(subX - qw * 0.24, gateY - subH);
      ctx.lineTo(subX + qw * 0.24, gateY - subH);
      ctx.lineTo(subX + qw * 0.28, gateY);
      ctx.moveTo(subX - qw * 0.52, gateY - subH * 1.08);
      ctx.quadraticCurveTo(subX, gateY - subH * 0.95, subX + qw * 0.52, gateY - subH * 1.08);
    }
    ctx.strokeStyle = `rgba(225, 242, 255, ${0.76 * sigh})`;
    ctx.lineWidth = Math.max(0.8, R * 0.0055);
    ctx.stroke();
  }

  // ── 9b. 流云瑞霭（横掠五城与山根的动态云带）────────────────────────────

  private drawCloudBands(
    ctx: CanvasRenderingContext2D,
    R: number,
    t: number,
    sigh: number,
  ): void {
    const clouds = [
      { y: R * 0.19, w: R * 0.36, speed: 0.18, phase: 0.0 },
      { y: R * 0.28, w: R * 0.28, speed: -0.14, phase: 2.1 },
      { y: -R * 0.04, w: R * 0.24, speed: 0.11, phase: 4.2 },
    ];
    ctx.beginPath();
    for (const c of clouds) {
      const drift = this.reducedMotion ? 0 : Math.sin(t * c.speed + c.phase) * R * 0.18;
      const cx = drift;
      const cy = c.y;
      ctx.moveTo(cx - c.w, cy);
      ctx.quadraticCurveTo(cx - c.w * 0.35, cy - R * 0.022, cx, cy);
      ctx.quadraticCurveTo(cx + c.w * 0.35, cy + R * 0.022, cx + c.w, cy);
    }
    ctx.strokeStyle = `rgba(210, 235, 252, ${0.22 * sigh})`;
    ctx.lineWidth = Math.max(1.2, R * 0.012);
    ctx.stroke();
  }

  // ── 7. 核心叙事：未完成的授箓（抚顶 → 结发 → 受长生 → 破碎陨落）────────

  private drawOrdination(
    ctx: CanvasRenderingContext2D,
    R: number,
    t: number,
    phase: number,
  ): void {
    const zenithY = -R * 0.82; // 九天仙门顶点
    const targetY = -R * 0.03; // 仙台谪仙头顶

    // 顶部常驻一道微弱的「九天仙门」椭圆光轮（授箓来处）
    ctx.beginPath();
    ctx.ellipse(0, zenithY, R * 0.16, R * 0.042, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(220, 240, 255, 0.28)';
    ctx.lineWidth = Math.max(0.8, R * 0.005);
    ctx.stroke();

    if (phase < 0.28) {
      // ── 阶段 1：仙人抚我顶（九天垂光落向仙台孤影）──
      const p = phase / 0.28; // 0..1
      const ease = 1 - Math.pow(1 - p, 2);
      const headY = zenithY + ease * (targetY - zenithY);

      // 垂落光柱（上淡下亮）
      const grad = ctx.createLinearGradient(0, zenithY, 0, headY);
      grad.addColorStop(0, 'rgba(210, 235, 255, 0.05)');
      grad.addColorStop(0.7, `rgba(220, 242, 255, ${0.45 + 0.35 * p})`);
      grad.addColorStop(1, `rgba(255, 248, 225, ${0.75 + 0.25 * p})`);
      ctx.beginPath();
      ctx.moveTo(0, zenithY);
      ctx.lineTo(0, headY);
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(1.4, R * 0.015);
      ctx.stroke();

      // 光束前锋灵珠
      const orbR = Math.max(1.5, R * 0.022 * (0.7 + 0.3 * p));
      ctx.beginPath();
      ctx.arc(0, headY, orbR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 250, 235, 0.92)';
      ctx.fill();

      // 触顶瞬间的灌顶涟漪（p > 0.75）
      if (p > 0.72) {
        const rp = (p - 0.72) / 0.28;
        ctx.beginPath();
        ctx.ellipse(0, targetY, R * 0.14 * rp, R * 0.045 * rp, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 245, 215, ${0.75 * (1 - rp)})`;
        ctx.lineWidth = Math.max(0.8, R * 0.006);
        ctx.stroke();
      }
    } else if (phase < 0.55) {
      // ── 阶段 2：结发（双股仙气自仙台呈双螺旋盘旋交结而上）──
      const p = (phase - 0.28) / 0.27; // 0..1
      const curTopY = targetY + p * (zenithY - targetY);
      const turns = Math.PI * 4.5 * p;
      const maxArmR = R * 0.12;
      const steps = 20;

      // 股一（冰玉色）与股二（暖白玉色）各自成束上升，向天顶收束
      for (let arm = 0; arm < 2; arm++) {
        const ph = arm * Math.PI;
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const y = targetY + (curTopY - targetY) * u;
          // 底部与顶部略收拢、中段饱满的纺锤包络
          const env = Math.sin(u * Math.PI * 0.88 + 0.12) * (1 - 0.45 * p * u);
          const ang = turns * u + ph;
          const x = Math.cos(ang) * maxArmR * env;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle =
          arm === 0 ? 'rgba(185, 232, 255, 0.78)' : 'rgba(255, 242, 210, 0.78)';
        ctx.lineWidth = Math.max(1.1, R * 0.011);
        ctx.stroke();

        // 螺旋顶端结发星点
        const topEnv = Math.sin(Math.PI * 0.88 + 0.12) * (1 - 0.45 * p);
        const topX = Math.cos(turns + ph) * maxArmR * topEnv;
        const dotR = Math.max(1.2, R * 0.016);
        ctx.beginPath();
        ctx.arc(topX, curTopY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = arm === 0 ? 'rgba(220, 245, 255, 0.92)' : 'rgba(255, 245, 220, 0.92)';
        ctx.fill();
      }
    } else if (phase < 0.68) {
      // ── 阶段 3：受长生（顶点汇成暖白长明星 + 道箓金章，全图唯一暖金峰值）──
      const p = (phase - 0.55) / 0.13; // 0..1
      const pulse = Math.sin(p * Math.PI);
      const starR = Math.max(2, R * (0.042 + 0.022 * pulse));

      ctx.save();
      // 暖金辉光与道箓外环
      ctx.shadowColor = 'rgba(255, 225, 150, 0.85)';
      ctx.shadowBlur = starR * 3.2;

      // 道箓金章圆环（即将受箓圆满的象征）
      ctx.beginPath();
      ctx.arc(0, zenithY, starR * 2.1, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 232, 175, ${0.45 + 0.4 * pulse})`;
      ctx.lineWidth = Math.max(0.9, R * 0.006);
      ctx.stroke();

      // 十字星芒（长明星的四道锋芒）
      const rayL = starR * (2.8 + 0.8 * pulse);
      ctx.beginPath();
      ctx.moveTo(-rayL, zenithY);
      ctx.lineTo(rayL, zenithY);
      ctx.moveTo(0, zenithY - rayL);
      ctx.lineTo(0, zenithY + rayL);
      ctx.strokeStyle = `rgba(255, 245, 215, ${0.65 + 0.3 * pulse})`;
      ctx.lineWidth = Math.max(1, R * 0.008);
      ctx.stroke();

      // 长明星核心
      ctx.beginPath();
      ctx.arc(0, zenithY, starR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 246, 220, ${0.85 + 0.15 * pulse})`;
      ctx.fill();
      ctx.restore();

      // 刚刚汇合尚未散尽的双螺旋余韵
      ctx.beginPath();
      for (let arm = 0; arm < 2; arm++) {
        const ph = arm * Math.PI;
        for (let s = 0; s <= 12; s++) {
          const u = s / 12;
          const y = targetY + (zenithY - targetY) * u;
          const env = Math.sin(u * Math.PI) * (1 - u * 0.7);
          const x = Math.cos(Math.PI * 4.5 * u + ph) * R * 0.11 * env;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = `rgba(235, 244, 255, ${0.38 * (1 - p)})`;
      ctx.lineWidth = Math.max(0.8, R * 0.007);
      ctx.stroke();

      // 即将崩裂的瞬间（p > 0.82）浮现一道裂纹
      if (p > 0.8) {
        ctx.beginPath();
        ctx.moveTo(-starR * 1.4, zenithY - starR * 0.8);
        ctx.lineTo(0, zenithY);
        ctx.lineTo(starR * 1.5, zenithY + starR * 0.9);
        ctx.strokeStyle = 'rgba(120, 80, 40, 0.85)';
        ctx.lineWidth = Math.max(1, R * 0.007);
        ctx.stroke();
      }
    } else {
      // ── 阶段 4：仙梦破碎（长明星崩解为黯金碎玉陨落，长生未降临）──
      const p = (phase - 0.68) / 0.32; // 0..1
      const gravity = 1.05;

      // 崩裂初瞬的残环扩散（p < 0.35）
      if (p < 0.35) {
        const rp = p / 0.35;
        ctx.beginPath();
        ctx.arc(0, zenithY, R * (0.08 + 0.18 * rp), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(215, 180, 110, ${0.55 * (1 - rp)})`;
        ctx.lineWidth = Math.max(0.8, R * 0.006);
        ctx.stroke();
      }

      // 14 枚黯金菱形碎玉循重力抛物线坠落
      ctx.beginPath();
      for (let i = 0; i < this.shards.length; i++) {
        const sh = this.shards[i];
        const x = sh.vx * p * R;
        const y = zenithY + (sh.vy * p + 0.5 * gravity * p * p) * R * 1.45;
        const sz = Math.max(0.9, R * sh.size * (1 - p * 0.45));
        const rot = p * sh.spin + i;
        const dx = Math.cos(rot) * sz;
        const dy = Math.sin(rot) * sz;
        const nx = -dy * 0.55;
        const ny = dx * 0.55;
        // 绘成旋转的碎玉菱片而非普通圆点
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(x + nx, y + ny);
        ctx.lineTo(x - dx, y - dy);
        ctx.lineTo(x - nx, y - ny);
        ctx.closePath();
      }
      ctx.fillStyle = `rgba(208, 172, 102, ${0.78 * (1 - p * 0.88)})`;
      ctx.fill();
    }
  }
}

export function createJadeCapitalOverlay(
  options: JadeCapitalOverlayOptions,
): JadeCapitalOverlay {
  return new JadeCapitalOverlay(options);
}
