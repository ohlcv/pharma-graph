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
}

let cyRef: cytoscape.Core | null = null;
let spaces: SpaceInfo[] = [];
let onSpaceChange: ((spaceId: string | null) => void) | null = null;
let onShowDetail: (() => void) | null = null;
let menuEl: HTMLElement | null = null;
let listEl: HTMLElement | null = null;
let detailBtn: HTMLButtonElement | null = null;
let dismissInstalled = false;
/**
 * 接下来这次 layoutstop 是不是首屏那次。
 *
 * 光靠"落定过了没有"判断不出来：main 的 layout 选项回调（completeLoading →
 * settleAfterLayout）比 cy 的 'layoutstop' 事件**先**跑，等事件到的时候首屏
 * 已经被标成"落定过"了，于是又走一遍取景——用户看到的正是那一下多余的缩放。
 * 所以由启动流程显式打标（beginBootLayout），事件端只消费。
 */
let bootLayoutPending = false;
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
 * 装配空间控制器。cy 必须在图数据加载完成后传进来（节点/边都在位），
 * 否则算出来的空间会缺节点。
 */
export function installSpaceController(
  cy: cytoscape.Core,
  options: SpaceControllerOptions = {},
): void {
  cyRef = cy;
  onSpaceChange = options.onSpaceChange ?? null;
  onShowDetail = options.onShowPortalDetail ?? null;
  spaces = computeSpaces(nodesOf(cy), edgesOf(cy), UNIVERSE_ROOTS);
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
          <span class="space-menu__title">传送门</span>
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
        <button type="button" class="space-menu__link" id="${DETAIL_BTN_ID}">传送门详情</button>
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
 * 两个特例永远可见：
 *   - 传送门本身：它背在所有空间上，否则进了空间就出不来了。按 id 判定，
 *     不按 class——它是内容树里的正式节点（有自己的 md），不挂 layer-parent
 *     （挂了就会被排除出搜索，而"搜传送门跳过去"恰恰是个有用的入口）。
 *   - 虚拟层父节点：容器，不是内容。
 *
 * 只动节点，不动边：边是否可见是 cytoscape 的派生状态（两端都可见才可见），
 * 跟着端点自动成立，`ele.visible()` / `:visible` / boundingBox 全部一致。
 * 显式给 3184 条边各写一份 display bypass 是纯浪费——派生函数已经算过一遍了。
 */
function applyVisibility(space: SpaceInfo | null): void {
  const cy = cyRef;
  if (!cy) return;
  cy.batch(() => {
    cy.nodes().forEach((n) => {
      if (n.id() === PORTAL_ID || n.hasClass(CLASSES.LAYER_PARENT)) {
        n.show();
        return;
      }
      if (!space || space.nodeIds.has(n.id())) n.show();
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
 * 拉断关系。传送门不参与——它跟着视口停靠，坐标没有空间含义。
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
      // 传送门也是普通内容节点：它属于散点空间，就跟着那个岛一起平移。
      // 曾经这里把它单独摘出来、再钉到视口角落——那是给它一个假坐标。
      const node = cy.getElementById(id);
      if (node.empty()) continue;
      const p = node.position();
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      points.push({ id, x: p.x, y: p.y });
    }
    return { id: space.id, points };
  });

  const plan = planSeparation(geometry, {
    // 全图态没有"所在空间"，就把最大（第一个）当锚点——它就是主宇宙。
    anchorId: getActiveSpaceId() ?? spaces[0]?.id,
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
 * `layoutstop` 的统一入口：分岛是每次都要的，取景只有**非首屏**才做。
 *
 * 为什么要分：首屏那次 euler 是入场动画本身，落定就该停在原地（用户明确
 * 说过"初始化完成之后再强制缩放/平移一下，没有必要"）；而用户主动换布局 /
 * 重跑 euler 时，节点是被甩到全新区位的，镜头守着旧位置多半只剩空地，
 * 重新取景是这次操作的收尾。
 */
export function onLayoutStopped(): void {
  if (!cyRef) return;
  if (bootLayoutPending) {
    bootLayoutPending = false;
    settleAfterLayout();
    return;
  }
  separateSpaces();
  flyToCurrentSpace(false);
}

/** 启动流程在跑首屏 euler 之前调用一次：这次落定不取景。 */
export function beginBootLayout(): void {
  bootLayoutPending = true;
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
}

export function enterSpace(spaceId: string, options: EnterSpaceOptions = {}): void {
  if (!cyRef) return;
  const space = spaces.find((s) => s.id === spaceId);
  if (!space) return;
  const changed = getActiveSpaceId() !== spaceId;

  applyVisibility(space);
  clearSelectionArtifacts();
  setActiveSpace(spaceId);
  // frame: false → 镜头留在原处（启动落位时是 0.08 的宏观视野），
  // 传送门也就先跟着 halo 位置走，等 reframeAfterLayout 再停靠。
  if (options.frame !== false) flyToCurrentSpace(options.animate ?? true);
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
 * 落在主空间后，奇观只存在于「奇观与散点」里，要靠传送门过去（或按 Esc 回全图）。
 *
 * 只返回落位成功与否，不做任何提示——加载画面上不需要多一条 toast。
 */
export function enterInitialSpace(): string | null {
  const primary = spaces[0];
  if (!primary || primary.id === MISC_SPACE_ID) return null;
  // frame: false —— 此刻节点还在 halo 预铺位置，取景毫无意义（见 EnterSpaceOptions.frame）。
  // 镜头停在 main.ts 设的 0.08 宏观视野，让 euler 把节点炸开时才看得见全貌。
  enterSpace(primary.id, { animate: false, silent: true, frame: false });
  return primary.id;
}

export function exitToFullGraph(options: { animate?: boolean } = {}): void {
  if (!cyRef) return;
  if (getActiveSpaceId() === null) {
    closeSpaceMenu();
    return;
  }
  applyVisibility(null);
  clearSelectionArtifacts();
  setActiveSpace(null);
  flyToCurrentSpace(options.animate ?? true);
  closeSpaceMenu();
  onSpaceChange?.(null);
  showToast('已返回全图', 'info');
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
  menuEl = null;
  listEl = null;
  detailBtn = null;
  dismissInstalled = false;
  bootLayoutPending = false;
  openedAt = Number.NEGATIVE_INFINITY;
  registerEnsureVisible(null);
  setActiveSpace(null);
}
