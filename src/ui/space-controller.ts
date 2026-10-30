// src/ui/space-controller.ts
// 空间传送：图谱被分成若干互不连通的空间（药学宇宙 / 生存策略宇宙 / 奇观散点），
// 传送门是它们之间的唯一通路。
//
// 本模块负责"怎么切空间 + 怎么飞过去"，不负责虫洞长什么样（那是
// core/spectacle/portal-overlay.ts）。分工与另外四个奇观一致：core 画，
// ui 管交互与相机。
//
// 空间归属是**推导**出来的，不写进 frontmatter（ADR-0003 已经否决过 universe
// 字段：父链已经隐含了，再存一份只是多一个会漏改的地方）。所以第四个体系
// 出现时只要在 config.ts 的 UNIVERSE_ROOTS 加一行 id，这里零改动。

import type cytoscape from 'cytoscape';
import {
  computeSpaces,
  computeFitTarget,
  MISC_SPACE_ID,
  type SpaceInfo,
  type FitTarget,
} from '../core/spaces.js';
import { planSeparation } from '../core/space-layout.js';
import { UNIVERSE_ROOTS } from '../core/config.js';
import { isElementShown } from '../core/element-visibility.js';
import { CLASSES, FIT_PADDING, topChromeHeight } from '../core/renderer.js';
import { PORTAL_ID } from '../core/spectacle/portal-overlay.js';
import { showToast } from './ui-helpers.js';
import { getActiveSpaceId, setActiveSpace, registerEnsureVisible } from './space-state.js';

const MENU_ID = 'space-menu';
const LIST_ID = 'space-menu-list';
const DETAIL_BTN_ID = 'space-menu-detail';
const CLOSE_BTN_ID = 'space-menu-close';

/** 传送飞行动画时长：比漫游(600ms)长一档，让"跨越空间"有分量。 */
const TRAVEL_DURATION = 900;
/** 左右下三边的取景留白（CSS px）——**直接复用「适应视图」的 FIT_PADDING**。
 *  两边取不同口径的后果是真实反馈：爆炸结束后镜头停在 0.0399，而用户按一下
 *  「适应」变成 0.0475，同一张图两种"刚好装下"，看着就是缩放不对。 */
const FIT_INSET = FIT_PADDING;
/** 顶部让开浮层的高度：同样是「适应」那套实测（顶栏 + 工具栏的 bottom），
 *  不是写死的 96px——大屏模式下两条 bar 都不在，实测值自然归零。 */
function topInset(): number {
  return topChromeHeight() + FIT_INSET;
}
/** 到达空间后缩放下限。取 cytoscape 自己的 minZoom（renderer.ts），也就是
 *  "刚好能取完"——再往上夹就把空间裁掉一块，用户会以为空间里只有这么多。 */
const MIN_TRAVEL_ZOOM = 0.02;
/** 上限：只有一个节点的空间（比如纯装饰）不该被放大到糊。 */
const MAX_TRAVEL_ZOOM = 1.2;
/** 打开菜单后的点击豁免窗口：人手不可能在看到菜单后 40ms 内再点一次。 */
const OPEN_CLICK_GRACE_MS = 40;

export interface SpaceControllerOptions {
  /** 传送门详情按钮——由 main.ts 接到 DetailPanel.show(PORTAL_ID)。 */
  onShowPortalDetail?: () => void;
  /** 空间切换后刷新统计卡片（图谱状态 / 底部抽屉里的计数）。 */
  onSpaceChange?: (spaceId: string | null) => void;
  /**
   * 切空间时由 main.ts 替换 cy 里的元素：
   *   1. remove 旧空间的所有节点 + 边
   *   2. add 新空间的节点 + 边（来自 space-data-cache）
   *   3. add 传送门节点（跨宇宙常驻）
   *   4. 跑一次 euler（只算当前空间）
   *
   * 这条路径负责性能：只渲染当前空间的节点，euler 也只算当前空间的力学，
   * 主线程开销从 O(全图) 降到 O(当前空间)。
   */
  onEnterSpace?: (spaceId: string) => void;
}

let cyRef: cytoscape.Core | null = null;
let spaces: readonly SpaceInfo[] = [];
let onSpaceChange: ((spaceId: string | null) => void) | null = null;
let onShowDetail: (() => void) | null = null;
let onEnterSpace: ((spaceId: string) => void) | null = null;
let menuEl: HTMLElement | null = null;
let listEl: HTMLElement | null = null;
let detailBtn: HTMLButtonElement | null = null;
let dismissInstalled = false;
/**
 * 布局坐标缓存：spaceId → (nodeId → {x, y})。
 *
 * 第一次跑完 euler 后把当前活跃空间的节点坐标存进来；下次切回这个空间时
 * add 节点直接带 position，跳过 halo + euler，瞬间到位。省掉每次切宇宙都
 * 要再看一遍大爆炸的等待（药学宇宙 2556 节点的 euler 要跑几秒）。
 *
 * 坐标是"布局收敛 + 分岛之后"的最终位置，切回时直接复用，不需要再分岛。
 */
const layoutCache = new Map<string, Map<string, { x: number; y: number }>>();
/**
 * 菜单打开的时刻。打开菜单的那一次 click 此刻还在往 document 冒泡——必须
 * 放过它，否则菜单会在同一个事件里被自己关掉。
 */
let openedAt = Number.NEGATIVE_INFINITY;

function now(): number {
  return typeof performance === 'object' ? performance.now() : Date.now();
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** 图上真实的节点（排除虚拟层父节点——它们是容器，不参与空间划分）。 */
function nodesOf(cy: cytoscape.Core): { id: string; label?: string }[] {
  return cy
    .nodes()
    .not(`.${CLASSES.LAYER_PARENT}`)
    .map((n) => ({ id: n.id(), label: n.data('label') as string | undefined }));
}

function edgesOf(cy: cytoscape.Core): { source: string; target: string }[] {
  return cy.edges().map((e) => ({ source: e.source().id(), target: e.target().id() }));
}

/**
 * 装配空间控制器。
 *
 * `cy` 必须在图数据加载完成后传进来——除非调用方**显式**提供 `inSpaces`：
 * 「只渲染当前空间」之后 cy 里只有当前空间的内容节点，再从 cy 算 spaces
 * 永远只能看到一个空间（用户实测反馈：菜单只显示两项）。调用方应从**全图**
 * 算一次 spaces 并传进来。
 *
 * 不传 `inSpaces` 时（兼容测试夹具——那里 cy 装的是全图）：从 cy 现场算。
 */
export function installSpaceController(
  cy: cytoscape.Core,
  options: SpaceControllerOptions = {},
  inSpaces?: readonly SpaceInfo[],
): void {
  cyRef = cy;
  onSpaceChange = options.onSpaceChange ?? null;
  onShowDetail = options.onShowPortalDetail ?? null;
  onEnterSpace = options.onEnterSpace ?? null;
  // 注意：参数名是 inSpaces，模块级变量是 spaces——必须显式赋值给模块级变量，
  // 否则 buildMenu / applyVisibility 等内部函数读的还是旧的 spaces。
  spaces = inSpaces ?? computeSpaces(nodesOf(cy), edgesOf(cy), UNIVERSE_ROOTS);
  buildMenu();
  installDismissHandlers();
  registerEnsureVisible(ensureVisible);
}

export function getSpaces(): readonly SpaceInfo[] {
  return spaces;
}

/** 节点属于哪个空间（不在任何空间里 = 虚拟节点，返回 null）。 */
export function spaceOfNode(nodeId: string): SpaceInfo | null {
  return spaces.find((s) => s.nodeIds.has(nodeId)) ?? null;
}

export function isPortalNode(nodeId: string): boolean {
  return nodeId === PORTAL_ID;
}

// ── 菜单 DOM ───────────────────────────────────────────────────────────────

function buildMenu(): void {
  menuEl = document.getElementById(MENU_ID);
  if (menuEl) {
    listEl = document.getElementById(LIST_ID);
    detailBtn = document.getElementById(DETAIL_BTN_ID) as HTMLButtonElement | null;
    return;
  }

  const el = document.createElement('div');
  el.id = MENU_ID;
  el.className = 'space-menu';
  el.hidden = true;
  el.innerHTML = `
    <div class="space-menu__panel" role="dialog" aria-modal="true" aria-label="空间传送">
      <div class="space-menu__head">
        <div class="space-menu__head-text">
          <span class="space-menu__title">卡冈图雅</span>
          <span class="space-menu__hint">选择目的地</span>
        </div>
        <button type="button" class="space-menu__close" id="${CLOSE_BTN_ID}" aria-label="关闭" title="关闭">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <ul class="space-menu__list" id="${LIST_ID}"></ul>
      <div class="space-menu__foot">
        <button type="button" class="space-menu__link" id="${DETAIL_BTN_ID}">卡冈图雅详情</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  menuEl = el;
  listEl = document.getElementById(LIST_ID);
  detailBtn = document.getElementById(DETAIL_BTN_ID) as HTMLButtonElement | null;

  // 关闭手势与节点详情面板一致：右上角 ×。原先这里是页脚的一行「Esc 关闭」
  // 文字提示——它不是控件，点不了，占地方又容易让人以为能按。Esc 仍然有效，
  // 但那是键盘快捷键该在的地方（keyboard-shortcuts），不必在面板上写一行字。
  document.getElementById(CLOSE_BTN_ID)?.addEventListener('click', () => {
    closeSpaceMenu();
  });

  detailBtn?.addEventListener('click', () => {
    closeSpaceMenu();
    onShowDetail?.();
  });
}

/** 每次打开都重绘：活动项会变，按钮的可用态也会变。 */
function renderList(): void {
  if (!listEl) return;
  const active = getActiveSpaceId();
  listEl.textContent = '';

  for (const space of spaces) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'space-menu__item';
    btn.dataset.spaceId = space.id;
    if (space.id === active) {
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'true');
    }

    const dot = document.createElement('span');
    dot.className = 'space-menu__dot';
    const name = document.createElement('span');
    name.className = 'space-menu__name';
    // 用 textContent 而不是拼 HTML：label 来自 Markdown，作者手滑写个 <b>
    // 不该变成真的标签。
    name.textContent = space.label;
    const count = document.createElement('span');
    count.className = 'space-menu__count';
    count.textContent = `${space.nodeIds.size}`;

    btn.append(dot, name, count);
    btn.addEventListener('click', () => {
      // 点当前空间 = 只是收起菜单；否则传送。
      if (space.id === getActiveSpaceId()) closeSpaceMenu();
      else enterSpace(space.id);
    });
    li.appendChild(btn);
    listEl.appendChild(li);
  }

  if (detailBtn) detailBtn.hidden = onShowDetail === null;
}

export function isSpaceMenuOpen(): boolean {
  return Boolean(menuEl && !menuEl.hidden);
}

export function openSpaceMenu(): void {
  if (!menuEl) return;
  renderList();
  menuEl.hidden = false;
  // 用 hidden 之外的 class 驱动进场动画：hidden 只管"在不在文档流里"，
  // 动画交给 CSS，避免 display:none 下的 transition 直接失效。
  requestAnimationFrame(() => menuEl?.classList.add('visible'));
  openedAt = now();
}

export function closeSpaceMenu(): void {
  if (!menuEl || menuEl.hidden) return;
  menuEl.classList.remove('visible');
  menuEl.hidden = true;
}

function installDismissHandlers(): void {
  if (dismissInstalled) return;
  dismissInstalled = true;
  // 点菜单外面（含画布）就收起。不拦 Esc——Esc 的语义链由
  // keyboard-shortcuts 统一掌管，避免两个监听器抢同一次按键。
  document.addEventListener('click', (e) => {
    if (!isSpaceMenuOpen()) return;
    // 打开菜单的那一次 click 此刻还在往 document 冒泡——必须放过它，
    // 否则菜单会在同一个事件里被自己关掉。用"打开后一小段窗口内的 click
    // 一律忽略"而不是布尔开关：布尔只能挡住第一个读它的监听器，而时间戳
    // 对所有监听器一致（顺序无关的幂等判定）。
    if (now() - openedAt <= OPEN_CLICK_GRACE_MS) return;
    const target = e.target as Node | null;
    if (target && menuEl?.contains(target)) return;
    closeSpaceMenu();
  });
}

// ── 空间切换 ───────────────────────────────────────────────────────────────

/**
 * 只留当前空间的节点与边。
 *
 * 唯一跨宇宙节点是传送门：它背在所有空间上，否则进了空间就出不来了。
 * 按 id 判定，不按 class——它是内容树里的正式节点（有自己的 md），不挂
 * layer-parent（挂了就会被排除出搜索，而"搜传送门跳过去"恰恰是个有用的入口）。
 *
 * 装饰奇观（太极八卦 / 四维空间 / 生命之树 / E8 根系）**不跨宇宙**——它们
 * 只属于散点空间。曾经这里把它们强制 show，结果药学宇宙首屏里也飘着四个
 * 奇观（用户实测反馈）。现在按 `space.nodeIds` 归属显示：在散点空间里可见，
 * 别的空间里 hide。
 *
 * 只动节点，不动边：边是否可见是 cytoscape 的派生状态（两端都可见才可见），
 * 跟着端点自动成立。显式给每条边各写一份 display bypass 是纯浪费。
 *
 * 签名收紧为 `space: SpaceInfo`——没有"全图态"了，调用方一定是代表某个空间。
 */
function applyVisibility(space: SpaceInfo): void {
  const cy = cyRef;
  if (!cy) return;
  cy.batch(() => {
    cy.nodes().forEach((n) => {
      if (n.id() === PORTAL_ID) {
        n.show();
        return;
      }
      if (space.nodeIds.has(n.id())) n.show();
      else n.hide();
    });
  });
}

/**
 * 把各个空间摆成互不重叠的「岛」。
 *
 * 为什么必须做：euler 是全图力导，它不知道空间这回事，只会把所有连通分量
 * 互相排斥着塞进同一团。实测 2736 节点时，四个奇观的坐标整个落在药学宇宙的
 * 包围盒**内部**——于是「全图」在屏幕上和「药学宇宙」几乎一模一样，用户点
 * 返回全图会以为没生效（真实反馈）。
 *
 * 只做平移，不改内部结构：空间就是连通分量，分量之间没有边，平移不可能
 * 拉断关系。传送门不参与——它跨多宇宙，留在 euler 给的原地坐标。
 *
 * **当前所在的空间是锚点，一个像素都不动**，其它岛排到它右边。这样整张图
 * 不会整体平移，镜头也就没必要跟着动（真实反馈：初始化完成后被强制缩放/
 * 平移了一下，"没有必要"）。
 */
export function separateSpaces(): void {
  const cy = cyRef;
  if (!cy || spaces.length === 0) return;

  const geometry = spaces.map((space) => {
    const points: { id: string; x: number; y: number }[] = [];
    for (const id of space.nodeIds) {
      // 传送门是跨越多宇宙的特殊节点：它不属于任何一个空间，也不跟着
      // 任何岛平移——euler 给它什么坐标就是什么坐标，在所有宇宙里都看
      // 同一个坐标。一旦把它算进散点岛一起平移（曾经的做法），它会被
      // 推到几千单位以外，而当前视口停在药考宇宙——传送门就消失了。
      if (id === PORTAL_ID) continue;
      const node = cy.getElementById(id);
      if (node.empty()) continue;
      const p = node.position();
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      points.push({ id, x: p.x, y: p.y });
    }
    return { id: space.id, points };
  });

  const plan = planSeparation(geometry, {
    // 锚定当前所在空间——它一个像素都不动，其它岛排到它右边。
    anchorId: getActiveSpaceId()!,
  });
  if (plan.size === 0) return;

  cy.batch(() => {
    for (const [id, p] of plan) {
      const node = cy.getElementById(id);
      if (!node.empty()) node.position(p);
    }
  });
}

/**
 * 布局收敛后调用：只分岛。**不动镜头，也不动任何单个节点的坐标。**
 *
 * 曾经这里做两件多余的事，都被否掉了：
 *   1. `flyToCurrentSpace(false)` 重新取景——那时分岛把整张图搬了一次，镜头
 *      不跟就只能看到空地。现在分岛锚定当前空间（`anchorId`），被看的东西
 *      原地不动，取景就没有理由了（真实反馈：落定后又缩一下，"没有必要"）。
 *   2. 把传送门钉到视口右下角——它本来就是内容树里的节点，跟着力导走即可，
 *      没必要为了"好点"而给它一个假坐标。
 *
 * 分岛本身保留：三个空间在力导里会互相排斥着挤进同一团，"全图"和"药学宇宙"
 * 在屏幕上就没区别了。分岛只做整岛平移，不改任何岛的内部结构。
 */
export function settleAfterLayout(): void {
  if (!cyRef) return;
  separateSpaces();
}

/**
 * `layoutstop` 的统一入口：**只分岛，永不取景。**
 *
 * 用户明确要求：任何布局结束后都不要强制移动/缩放画面——无论是首屏入场、
 * 重置按钮、换布局、还是虫洞切换宇宙触发的 euler，落定后镜头停在哪就停在哪。
 * 分岛（`separateSpaces`）只做整岛平移且锚定当前空间，被看的内容原地不动，
 * 不会带镜头走。要看全就按 F（适应视图）。
 *
 * 曾经这里分"首屏不取景 / 非首屏取景 / 用户动过则不取景"三支（ADR-0011），
 * 用户在虫洞切宇宙场景下反馈"任何地方都不想要"，于是全部砍掉，统一不取景。
 */
export function onLayoutStopped(): void {
  if (!cyRef) return;
  separateSpaces();
  // 存当前活跃空间坐标——覆盖重置按钮、换布局等不传 onLayoutStop 回调的路径。
  // 守卫在 cacheActiveSpacePositions 内部：切宇宙执行期间触发的 layoutstop
  // （activeSpaceId 还是旧的、旧节点已 remove）会被挡住，不错误存坐标。
  cacheActiveSpacePositions();
}

// ── 布局坐标缓存 ─────────────────────────────────────────────────────────────

/**
 * 把当前活跃空间里所有节点的坐标存进缓存。
 *
 * 在 euler 收敛后调用——存的是最终位置，下次切回这个空间直接复用，
 * 不需要再摆 halo + 跑 euler。
 *
 * **守卫**：活跃空间的节点必须确实在 cy 里才存。切宇宙执行期间
 * （`onEnterSpace` 在 `setActiveSpace` 之前跑），如果上一个 euler 被 stop
 * 触发全局 `layoutstop`，此刻 `getActiveSpaceId()` 还是旧空间，但旧空间
 * 节点已被 remove——守卫挡住这种情况，不把新空间的坐标错误地存到旧空间名下。
 *
 * 传送门与虚拟层父节点不缓存：传送门跨宇宙、位置每次切都要重置到视口中心；
 * 虚拟层父节点是 overlay 管的容器，坐标有自己的来源。
 */
export function cacheActiveSpacePositions(): void {
  if (!cyRef) return;
  const active = getActiveSpaceId();
  if (!active) return;
  // 守卫：活跃空间的代表节点必须在 cy 里。否则跳过——防止切宇宙执行
  // 期间（setActiveSpace 还没调）错误地把当前 cy 里的节点坐标存到旧空间名下。
  const space = spaces.find((s) => s.id === active);
  if (!space || space.nodeIds.size === 0) return;
  const sampleId = space.nodeIds.values().next().value;
  if (!sampleId || cyRef.getElementById(sampleId).empty()) return;

  const positions = new Map<string, { x: number; y: number }>();
  cyRef
    .nodes()
    .not(`#${PORTAL_ID}`)
    .not(`.${CLASSES.LAYER_PARENT}`)
    .forEach((n) => {
      const p = n.position();
      positions.set(n.id(), { x: p.x, y: p.y });
    });
  layoutCache.set(active, positions);
}

/**
 * 取某空间的缓存坐标。
 *
 * 有 → 返回只读 Map（nodeId → {x,y}），调用方 add 节点时注入 position，
 * 跳过 halo + euler。
 * 无 → 返回 null，调用方走完整布局路径。
 */
export function getCachedPositions(
  spaceId: string,
): ReadonlyMap<string, { x: number; y: number }> | null {
  return layoutCache.get(spaceId) ?? null;
}

/**
 * 传送后的相机目标：把当前可见内容整体取景。
 * 缩到 MIN/MAX 之间——超大的宇宙不会变灰雾，单节点的空间也不会糊成一片。
 */
function currentFitTarget(): FitTarget | null {
  const cy = cyRef;
  if (!cy) return null;
  // 取景不算上传送门：它跟着视口中心跑，落点可能离当前空间很远，
  // 算进去会让镜头为了迁就一个门而拉远。
  //
  // 判据用 isElementShown（display + 尺寸）而非 ':visible'：后者排除
  // opacity: 0 的元素，而奇观空间里全是透明命中盒——用它取景会让
  // 「奇观与散点」永远得到 0 个可见节点，镜头一动不动。
  const visible = cy
    .nodes()
    .not(`.${CLASSES.LAYER_PARENT}`)
    .not(`#${PORTAL_ID}`)
    .filter(isElementShown);
  if (visible.length === 0) return null;
  let bb: cytoscape.BoundingBox12 & cytoscape.BoundingBoxWH;
  try {
    bb = visible.boundingBox();
  } catch {
    return null;
  }
  if (!Number.isFinite(bb.x1) || !Number.isFinite(bb.y1) || bb.w <= 0 || bb.h <= 0) return null;

  const target = computeFitTarget({
    bb: { x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 },
    width: cy.width(),
    height: cy.height(),
    insets: { top: topInset(), right: FIT_INSET, bottom: FIT_INSET, left: FIT_INSET },
  });
  return { zoom: clamp(target.zoom, MIN_TRAVEL_ZOOM, MAX_TRAVEL_ZOOM), pan: target.pan };
}

function flyToCurrentSpace(animate: boolean): void {
  const cy = cyRef;
  const target = currentFitTarget();
  if (!cy || !target) return;
  cy.stop();
  if (animate) {
    cy.animate({
      zoom: target.zoom,
      pan: target.pan,
      duration: TRAVEL_DURATION,
      easing: 'ease-in-out-cubic',
    });
  } else {
    cy.zoom(target.zoom);
    cy.pan(target.pan);
  }
}

/** 传送带来的状态清理：旧的选中/高亮可能落在刚被藏起来的节点上。 */
function clearSelectionArtifacts(): void {
  const cy = cyRef;
  if (!cy) return;
  cy.elements().removeClass(
    [CLASSES.SELECTED_NODE, CLASSES.DIMMED, CLASSES.HIGHLIGHTED, CLASSES.HIGHLIGHTED_EDGE].join(
      ' ',
    ),
  );
  cy.elements().unselect();
}

export interface EnterSpaceOptions {
  animate?: boolean;
  /** 不弹 toast。启动时自动落位用——加载画面上不需要一条"已进入…"。 */
  silent?: boolean;
  /**
   * 不做取景（不动 zoom/pan，也不停靠传送门）。
   *
   * 启动落位必须关掉：那一刻节点还全在 halo 预铺位置上——半径 50–330 的
   * 一小团。按这团算出来的取景是 ~1.1–1.2 倍，等于把镜头怼在这个小点上，
   * 而 euler 一开跑就把节点甩到几千单位外，整个「大爆炸」全程都在画面之外
   * （真实反馈：最开始大爆炸时候的缩放不对）。0.08 的宏观视野才是这段动画
   * 要的镜头，取景留给布局收敛后的 reframeAfterLayout。
   */
  frame?: boolean;
  /**
   * 跳过 `onEnterSpace`：调用方自己已经把节点 add 进 cy 了，不需要 SpaceController
   * 触发"换内容"路径。仅启动落位用——首次进入主空间时，main.ts 在构造 Renderer
   * 时就把主空间数据塞进去了，再走一遍 onEnterSpace 等于 remove + add + 跑 euler 一次，
   * 是浪费。
   */
  skipLoad?: boolean;
}

export function enterSpace(spaceId: string, options: EnterSpaceOptions = {}): void {
  if (!cyRef) return;
  const space = spaces.find((s) => s.id === spaceId);
  if (!space) return;
  const changed = getActiveSpaceId() !== spaceId;

  // 切空间时先换内容：remove 旧空间节点 + add 新空间节点 + 跑 euler。
  // 这一步在 applyVisibility 之前——先有节点再切可见性，否则空 cytoscape
  // 上一通 hide/show 没意义。但 frame:false（启动落位那次）不动相机：
  // 镜头留在 main.ts 设的 0.08 宏观视野，euler 炸开时才看得见全貌。
  //
  // skipLoad: 启动落位时调用方已经把主空间数据塞进 cy 了——这次 enterSpace
  // 只切可见性 + 标记，不重复跑换内容路径。
  if (changed && onEnterSpace && !options.skipLoad) {
    onEnterSpace(spaceId);
  }

  applyVisibility(space);
  clearSelectionArtifacts();
  setActiveSpace(spaceId);
  // 不取景：切宇宙会触发 onEnterSpace → 跑 euler，节点会从 halo 散开。
  // 此刻取景是基于 halo 起始位置算的（半径 50-330 的一小团），目标是错的，
  // euler 把节点炸开后视觉上就是"强制移动+缩放"。用户明确要求任何地方都
  // 不要强制动镜头——切完宇宙自己按 F（适应视图）即可。
  // `frame` option 保留在接口里以兼容现有调用方，但当前不再驱动取景。
  void options.frame;
  void options.animate;
  closeSpaceMenu();
  onSpaceChange?.(spaceId);
  if (changed && !options.silent) {
    showToast(`已进入「${space.label}」 · ${space.nodeIds.size} 个节点`, 'info');
  }
}

/**
 * 启动落位：默认直接进入主空间（面积最大的宇宙，也就是主题体系），而不是
 * 停在「全图」。
 *
 * 为什么：空间隔离若只在主动传送后才生效，首屏就是三个空间的**并集**——
 * 四个奇观会和药学节点一起铺在画面上，与「除传送门外交互隔离」的规则矛盾。
 * 落在主空间后，奇观只存在于「奇观与散点」里，要靠传送门过去。
 *
 * 只返回落位成功与否，不做任何提示——加载画面上不需要多一条 toast。
 */
export function enterInitialSpace(): string | null {
  const primary = spaces[0];
  if (!primary || primary.id === MISC_SPACE_ID) return null;
  // frame: false —— 此刻节点还在 halo 预铺位置，取景毫无意义（见 EnterSpaceOptions.frame）。
  // 镜头停在 main.ts 设的 0.08 宏观视野，让 euler 把节点炸开时才看得见全貌。
  // skipLoad: true —— main.ts 构造 Renderer 时已经把主空间数据塞进 cy 了，
  // 这里不重复走"换内容"路径（remove + add + 跑 euler）。euler 由 finishStreamingLayout
  // 那条路径统一触发。
  enterSpace(primary.id, { animate: false, silent: true, frame: false, skipLoad: true });
  return primary.id;
}

export function exitToFullGraph(options: { animate?: boolean } = {}): void {
  // 全图态已删——没有"退回全图"这回事。用户要换空间就走传送门菜单。
  // 这个函数保留只是为了避免外部 import 报错——既然它没语义就只做收菜单。
  void options;
  closeSpaceMenu();
}

/**
 * 供 space-state 注册的守卫：让焦点跳转（搜索、详情面板邻居、漫游）先把目标
 * 节点所在的空间切过去，否则飞过去看到的是一片空白。
 *
 * 不动画——调用方紧接着就要自己 animate 相机，两趟动画会打架。
 * 返回是否真的切了空间，调用方据此决定要不要跳过自己的动画。
 */
function ensureVisible(nodeId: string): boolean {
  if (!cyRef) return false;
  const active = getActiveSpaceId();
  // 全图态已删——active 一定有值。这里 return false 是防御性兜底。
  if (active === null) return false;
  if (isPortalNode(nodeId)) return false;
  const space = spaceOfNode(nodeId);
  if (!space || space.id === active) return false;

  applyVisibility(space);
  clearSelectionArtifacts();
  setActiveSpace(space.id);
  flyToCurrentSpace(false);
  onSpaceChange?.(space.id);
  return true;
}

/** 测试专用：清空模块级状态。 */
export function _resetSpaceControllerForTests(): void {
  cyRef = null;
  spaces = [];
  onSpaceChange = null;
  onShowDetail = null;
  onEnterSpace = null;
  menuEl = null;
  listEl = null;
  detailBtn = null;
  dismissInstalled = false;
  openedAt = Number.NEGATIVE_INFINITY;
  layoutCache.clear();
  registerEnsureVisible(null);
  setActiveSpace(null);
}
