// src/core/spectacle/spectacle-size.ts
// 六个奇观的**唯一**尺寸来源。
//
// 背景：每个 overlay 原来各自写一条 pickRadius 公式，各自一套 clamp 上下限：
//
//   emblem    spread*0.075 → [140, 340]   ┐ 画出的半径还要再乘各自的外沿倍数
//   e8        spread*0.075 → [140, 340]   │ （灯环 / 棱线 / 吸积盘 / 冠幅）
//   tesseract spread*0.052 → [ 96, 230]   │ 于是一屏上最小的 230、最大的 391，
//   portal    spread*0.045 → [ 90, 200]   │ 差了 1.7 倍，看起来"有的很大有的很小"
//   tree      spread*0.26  → [190, 460]   ┘
//
// 而且画法一变（比如给太极八卦外圈再加一环），倍数就悄悄漂了，没人记得同步。
//
// 这里的做法：先定一个**统一视觉半径 V**（一屏上看起来的半径，模型坐标），
// 再按每种形状「自己画的半径 R 会溢出到 V 的多少倍」反推出它该收到的参数：
//
//     param = V / DRAWN_EXTENT[shape]
//
// 于是不管内部怎么画，最终落在画布上的外沿都是同一个 V。加新形状只要在
// DRAWN_EXTENT 里登记一个倍数。
//
// V 本身随图幅缩放但夹在 [200, 300]（模型坐标）：上限 300 是为了不让奇观
// 压过周围真实节点。

export type SpectacleShape = 'emblem' | 'tesseract' | 'tree' | 'e8' | 'portal' | 'jade-capital';

/**
 * 每个形状「画出来的最外沿半径」相对它收到的尺寸参数的倍数。
 *
 * 这些倍数是各 overlay 绘制代码里实际用到的最大 R 倍数（已核对）：
 *   emblem    文字环 / 光晕        → R * 1.15
 *   tesseract 4D 投影的角点        → R * 1.30
 *   e8        240 根的投影外沿      → R * 1.10
 *   portal    吸积盘 reach          → R * 1.25
 *   tree      参数是**高度**，外沿是 H/2 → 0.5
 *   jade-capital 光柱外端 + 城环最外 → R * 1.15（授箓光束瞬态到 -R*1.1，已含余量）
 *
 * 改任何奇观的画法（尤其是最大半径倍数）就要回来改这里，否则它又会
 * 比同伴大一圈或小一圈。
 */
const DRAWN_EXTENT: Record<SpectacleShape, number> = {
  emblem: 1.15,
  tesseract: 1.3,
  tree: 0.5,
  e8: 1.1,
  portal: 1.25,
  'jade-capital': 1.15,
};

/** 视觉半径相对图幅的比例倍率（沿用 emblem/e8 原来调过的那一档）。 */
const SPREAD_RATIO = 0.075 * DRAWN_EXTENT.emblem;
/** 视觉半径下限：图幅很小时不至于缩成一个点。 */
const VISUAL_RADIUS_MIN = 200;
/** 视觉半径上限：再大就压过周围真实节点，喧宾夺主。 */
const VISUAL_RADIUS_MAX = 300;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * 统一的视觉半径 V（模型坐标）。
 *
 * @param spread 图幅：`max(包围盒宽, 包围盒高)`，调用方各自已经算好。
 */
export function spectacleVisualRadius(spread: number): number {
  return clamp(spread * SPREAD_RATIO, VISUAL_RADIUS_MIN, VISUAL_RADIUS_MAX);
}

/**
 * 某个奇观该收到的尺寸参数。
 *
 * 返回值的含义随形状而变，但**视觉外沿一律等于 spectacleVisualRadius**：
 *   - emblem / tesseract / e8 / portal → 半径 R
 *   - tree → 高度 H（它的绘制参数是树高，不是半径）
 *
 * @param spread 图幅
 * @param shape  奇观种类
 */
export function pickSpectacleParam(spread: number, shape: SpectacleShape): number {
  return spectacleVisualRadius(spread) / DRAWN_EXTENT[shape];
}
