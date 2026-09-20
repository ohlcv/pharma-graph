// src/core/node-shape-outline.ts
// 把 cytoscape 的节点形状（ellipse / hexagon / round-rectangle / tag / ...）
// 转成一圈多边形顶点，供 glow-overlay.ts 沿着"节点真实轮廓"画光晕/流光用。
//
// 不追求跟 cytoscape 内部渲染像素级一致——目的是让光效贴合节点的大致轮廓
// （方的贴方的、六边形贴六边形），不是重新实现一遍几何渲染引擎。圆角是用
// "切角 + 插一个中点"近似出来的，不是真正的圆弧，但描边一画、光效一晕，
// 肉眼分不出来。

export interface Point {
  x: number;
  y: number;
}

const TWO_PI = Math.PI * 2;

function ellipsePoints(halfW: number, halfH: number, n = 40): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    pts.push({ x: Math.cos(a) * halfW, y: Math.sin(a) * halfH });
  }
  return pts;
}

function regularPolygonPoints(sides: number, halfW: number, halfH: number, rotationDeg: number): Point[] {
  const pts: Point[] = [];
  const rot = (rotationDeg * Math.PI) / 180;
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TWO_PI;
    pts.push({ x: Math.cos(a) * halfW, y: Math.sin(a) * halfH });
  }
  return pts;
}

function rectPoints(halfW: number, halfH: number): Point[] {
  // 顺序固定：左上、右上、右下、左下——bottom-round-rectangle 靠这个顺序
  // 知道"下面两个角"是下标 2、3。
  return [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ];
}

function trianglePoints(halfW: number, halfH: number): Point[] {
  return [
    { x: 0, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ];
}

function diamondPoints(halfW: number, halfH: number): Point[] {
  return [
    { x: 0, y: -halfH },
    { x: halfW, y: 0 },
    { x: 0, y: halfH },
    { x: -halfW, y: 0 },
  ];
}

function starPoints(halfW: number, halfH: number): Point[] {
  const pts: Point[] = [];
  const spikes = 5;
  const innerRatio = 0.42;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * TWO_PI - Math.PI / 2;
    const r = i % 2 === 0 ? 1 : innerRatio;
    pts.push({ x: Math.cos(a) * halfW * r, y: Math.sin(a) * halfH * r });
  }
  return pts;
}

/** 书签/标签形：右侧一个尖角（朝右），其余是矩形。 */
function tagPoints(halfW: number, halfH: number): Point[] {
  return [
    { x: halfW, y: 0 },
    { x: halfW * 0.4, y: -halfH },
    { x: -halfW, y: -halfH },
    { x: -halfW, y: halfH },
    { x: halfW * 0.4, y: halfH },
  ];
}

/**
 * 把多边形的角切掉一小段再补一个中点，近似出圆角。
 * cutFrac 是切角长度相对该角两条邻边长度的比例，越大圆角越明显。
 * onlyIndices 传入时只圆化这些下标的角（其余角保持尖锐），不传则全部圆化。
 */
function roundCorners(corners: Point[], cutFrac: number, onlyIndices?: Set<number>): Point[] {
  const n = corners.length;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = corners[(i - 1 + n) % n];
    const cur = corners[i];
    const next = corners[(i + 1) % n];
    if (onlyIndices && !onlyIndices.has(i)) {
      out.push(cur);
      continue;
    }
    const toPrev = { x: prev.x - cur.x, y: prev.y - cur.y };
    const toNext = { x: next.x - cur.x, y: next.y - cur.y };
    const a = { x: cur.x + toPrev.x * cutFrac, y: cur.y + toPrev.y * cutFrac };
    const b = { x: cur.x + toNext.x * cutFrac, y: cur.y + toNext.y * cutFrac };
    const mid = {
      x: cur.x + (toPrev.x + toNext.x) * cutFrac * 0.5,
      y: cur.y + (toPrev.y + toNext.y) * cutFrac * 0.5,
    };
    out.push(a, mid, b);
  }
  return out;
}

const CORNER_CUT = 0.28;

/**
 * 给定 cytoscape 的 shape 名和节点的半宽/半高，返回一圈围绕原点 (0,0) 的
 * 多边形顶点（局部坐标——调用方自己加上 renderedPosition 做平移）。
 *
 * 覆盖 FILL_CONFIG / SHAPE_BY_OWL2 里实际用到的全部形状（round-pentagon /
 * octagon / ellipse / diamond / round-triangle / star / round-hexagon /
 * round-rectangle / bottom-round-rectangle / tag / rectangle / hexagon）。
 * 没列出的冷门形状（vee/barrel/cut-rectangle 等）统一退化成椭圆——比报错
 * 或留白好，代价只是那几种形状的光效不完全贴合轮廓。
 */
export function getNodeOutline(shape: string | undefined, halfW: number, halfH: number): Point[] {
  switch (shape) {
    case 'ellipse':
      return ellipsePoints(halfW, halfH);
    case 'rectangle':
      return rectPoints(halfW, halfH);
    case 'round-rectangle':
    case 'roundrectangle':
      return roundCorners(rectPoints(halfW, halfH), CORNER_CUT);
    case 'bottom-round-rectangle':
    case 'bottomroundrectangle':
      // 只圆下面两个角——对应 rectPoints() 顺序里的下标 2、3。
      return roundCorners(rectPoints(halfW, halfH), CORNER_CUT, new Set([2, 3]));
    case 'hexagon':
      return regularPolygonPoints(6, halfW, halfH, 0);
    case 'round-hexagon':
    case 'roundhexagon':
      return roundCorners(regularPolygonPoints(6, halfW, halfH, 0), CORNER_CUT * 0.6);
    case 'octagon':
      return regularPolygonPoints(8, halfW, halfH, 22.5);
    case 'round-octagon':
    case 'roundoctagon':
      return roundCorners(regularPolygonPoints(8, halfW, halfH, 22.5), CORNER_CUT * 0.5);
    case 'pentagon':
      return regularPolygonPoints(5, halfW, halfH, -90);
    case 'round-pentagon':
    case 'roundpentagon':
      return roundCorners(regularPolygonPoints(5, halfW, halfH, -90), CORNER_CUT * 0.6);
    case 'triangle':
      return trianglePoints(halfW, halfH);
    case 'round-triangle':
    case 'roundtriangle':
      return roundCorners(trianglePoints(halfW, halfH), CORNER_CUT * 0.5);
    case 'diamond':
    case 'rhomboid':
      return diamondPoints(halfW, halfH);
    case 'star':
      return starPoints(halfW, halfH);
    case 'tag':
    case 'round-tag':
    case 'roundtag':
      return tagPoints(halfW, halfH);
    default:
      return ellipsePoints(halfW, halfH);
  }
}

/** 多边形每条边的长度 + 总周长，供沿周长走位用。 */
export function polygonPerimeter(points: Point[]): { segLens: number[]; total: number } {
  const segLens: number[] = [];
  let total = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segLens.push(len);
    total += len;
  }
  return { segLens, total };
}

/** 沿多边形周长走 dist 距离（自动按 total 取模、支持负数），返回该点坐标。 */
export function pointAtPerimeterDistance(
  points: Point[],
  segLens: number[],
  total: number,
  dist: number,
): Point {
  if (total <= 0 || points.length === 0) return points[0] ?? { x: 0, y: 0 };
  let d = dist % total;
  if (d < 0) d += total;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const segLen = segLens[i];
    if (d <= segLen || i === n - 1) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const t = segLen > 0 ? d / segLen : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    d -= segLen;
  }
  return points[0];
}
