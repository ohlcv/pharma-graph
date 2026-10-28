/**
 * @vitest-environment jsdom
 *
 * 空间传送的端到端行为：空间划分（连通分量）→ 隐藏其它空间 → 取景 → 菜单。
 *
 * 用真实的 headless cytoscape 而不是 mock：这里要验的恰恰是 cytoscape 的
 * 语义——ele.hide() 是不是真的把它移出了 :visible、边是不是跟着端点走、
 * `#portal-gate` 这种 id 里带连字符的选择器能不能命中。mock 掉这些等于
 * 什么都没验。
 *
 * 图刻意做成真实图的形状：两个体系 + 一个孤立装饰 + 一个孤立传送门。
 */

// jsdom 不保证有 rAF——缺了就补一个：菜单进场 class 与"放过打开那一次
// click"的复位都挂在 rAF 上。
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import cytoscape from 'cytoscape';
import {
  installSpaceController,
  getSpaces,
  enterSpace,
  openSpaceMenu,
  closeSpaceMenu,
  isSpaceMenuOpen,
  spaceOfNode,
  isPortalNode,
  separateSpaces,
  settleAfterLayout,
  beginBootLayout,
  onLayoutStopped,
  markLayoutStart,
  _resetSpaceControllerForTests,
} from '@/ui/space-controller';
import { getActiveSpaceId, ensureNodeVisible } from '@/ui/space-state';

/** 与 config.ts 的 UNIVERSE_ROOTS 一致——刻意不另造一套假 id。 */
const EXAM = 'concept-exam-system';
const NEURO = 'sum-neurodiversity-p1';
const PORTAL = 'portal-gate';

function makeGraph(): cytoscape.Core {
  // 必须开 style：ele.hide() 是 `this.css('display','none')`，而
  // visible() 读的是派生出来的 pstyle —— styleEnabled:false 时 display
  // 根本不入样式表，hide 会变成哑操作。别的 UI 测试关掉 style 是为了快，
  // 这里要验的偏偏就是这个状态，不能关。
  const cy = cytoscape({ headless: true, styleEnabled: true });
  cy.add([
    // 体系一：根 + 两层
    { group: 'nodes', data: { id: EXAM, label: '执业药师考试体系' } },
    { group: 'nodes', data: { id: 'e1', label: '药一' } },
    { group: 'nodes', data: { id: 'e2', label: '药二' } },
    // 体系二
    { group: 'nodes', data: { id: NEURO, label: '神经多样性生存策略集合' } },
    { group: 'nodes', data: { id: 'n1', label: '八字命理' } },
    // 孤立装饰 + 传送门（都无连边）
    { group: 'nodes', data: { id: 'e8-root-system', label: 'E8 根系' } },
    { group: 'nodes', data: { id: PORTAL, label: '传送门' } },
    { group: 'edges', data: { id: 'ee1', source: 'e1', target: EXAM } },
    { group: 'edges', data: { id: 'ee2', source: 'e2', target: EXAM } },
    { group: 'edges', data: { id: 'en1', source: 'n1', target: NEURO } },
  ]);
  return cy;
}

let cy: cytoscape.Core;

function menuItems(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.space-menu__item')];
}

describe('space-controller', () => {
  beforeEach(() => {
    _resetSpaceControllerForTests();
    document.body.innerHTML = '';
    cy = makeGraph();
    installSpaceController(cy);
  });

  afterEach(() => {
    _resetSpaceControllerForTests();
    vi.restoreAllMocks();
  });

  describe('空间划分', () => {
    it('每个体系根一个空间，孤立节点收进散点空间', () => {
      const spaces = getSpaces();
      expect(spaces.map((s) => s.id)).toEqual([EXAM, NEURO, 'misc']);
      expect(spaces[0].label).toBe('执业药师考试体系');
      expect([...spaces[0].nodeIds].sort()).toEqual([EXAM, 'e1', 'e2']);
      // 装饰与传送门都无连边，落在同一个散点空间里。
      expect([...spaces[2].nodeIds].sort()).toEqual(['e8-root-system', PORTAL]);
    });

    it('一个节点都不漏', () => {
      const total = getSpaces().reduce((sum, s) => sum + s.nodeIds.size, 0);
      expect(total).toBe(cy.nodes().length);
    });

    it('能反查节点属于哪个空间', () => {
      expect(spaceOfNode('e2')?.id).toBe(EXAM);
      expect(spaceOfNode(PORTAL)?.id).toBe('misc');
      expect(isPortalNode(PORTAL)).toBe(true);
      expect(isPortalNode('e1')).toBe(false);
    });
  });

  describe('真隔离', () => {
    it('进入体系一后，体系二的节点与边都不在 :visible 里', () => {
      enterSpace(EXAM, { animate: false });

      expect(cy.getElementById('e1').visible()).toBe(true);
      expect(cy.getElementById('n1').visible()).toBe(false);
      expect(cy.getElementById(NEURO).visible()).toBe(false);
      // 端点被藏起来的边也要跟着藏，否则 :visible 里会混进幽灵边。
      expect(cy.getElementById('en1').visible()).toBe(false);
      expect(cy.getElementById('ee1').visible()).toBe(true);
      expect(getActiveSpaceId()).toBe(EXAM);
    });

    it('传送门永远可见——它是唯一能出去的路', () => {
      enterSpace(EXAM, { animate: false });
      expect(cy.getElementById(PORTAL).visible()).toBe(true);
      enterSpace('misc', { animate: false });
      expect(cy.getElementById(PORTAL).visible()).toBe(true);
    });

    it('没有"全图态"——退空间这回事不存在了', () => {
      // 旧测试调过 exitToFullGraph → getActiveSpaceId() === null.
      // 产品决策已删全图: 没有导出 exitToFullGraph, 也没有"null 空间"运行态.
      // Esc 现在只收菜单 / 清选中 / 关面板 / 停漫游.
      enterSpace(EXAM, { animate: false });
      expect(getActiveSpaceId()).toBe(EXAM);
    });

    it('进入会飞一次相机；animate:false 时不飞', () => {
      const animateSpy = vi.spyOn(cy, 'animate').mockImplementation(() => undefined as never);
      enterSpace(EXAM);
      expect(animateSpy).toHaveBeenCalledTimes(1);
      const opts = animateSpy.mock.calls[0][0] as {
        zoom: number;
        pan: { x: number; y: number };
      };
      expect(opts.zoom).toBeGreaterThan(0);
      expect(Number.isFinite(opts.pan.x)).toBe(true);

      animateSpy.mockClear();
      enterSpace(NEURO, { animate: false });
      expect(animateSpy).not.toHaveBeenCalled();
    });
  });

  describe('空间菜单', () => {
    it('打开时列出所有空间，并标出当前所在', () => {
      enterSpace(EXAM, { animate: false });
      openSpaceMenu();

      expect(isSpaceMenuOpen()).toBe(true);
      expect(menuItems()).toHaveLength(3);
      expect(menuItems()[0].classList.contains('active')).toBe(true);
      expect(menuItems()[0].textContent).toContain('执业药师考试体系');
      // 计数是空间规模，不是全图规模。
      expect(menuItems()[0].textContent).toContain('3');
    });

    it('点一个目的地就传送过去，并自动收起菜单', () => {
      openSpaceMenu();
      // 列表是每次打开时重绘的，所以必须先打开再取元素。
      menuItems()[1].click();

      expect(getActiveSpaceId()).toBe(NEURO);
      expect(isSpaceMenuOpen()).toBe(false);
    });

    it('点当前所在的空间只收起菜单，不重新传送', () => {
      enterSpace(EXAM, { animate: false });
      openSpaceMenu();
      menuItems()[0].click();
      expect(isSpaceMenuOpen()).toBe(false);
      expect(getActiveSpaceId()).toBe(EXAM);
    });

    it('菜单里不再有「返回全图」——退空间归 Esc', () => {
      expect(document.getElementById('space-menu-exit')).toBeNull();
      expect(document.querySelector('.space-menu__exit')).toBeNull();
    });

    it('点菜单外面会收起菜单', async () => {
      openSpaceMenu();
      // 越过"打开那一刻的 click"豁免窗口——真实的二次点击不可能在 40ms 内。
      await new Promise((r) => setTimeout(r, 60));
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(isSpaceMenuOpen()).toBe(false);
    });

    it('打开菜单的那一次 click 不会把自己关掉', () => {
      openSpaceMenu();
      // 这就是"点传送门"的那一次 click，它还在往 document 冒泡。
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(isSpaceMenuOpen()).toBe(true);
      closeSpaceMenu();
      expect(isSpaceMenuOpen()).toBe(false);
    });
  });

  describe('落定之后不动镜头', () => {
    it('settleAfterLayout 只分岛，不改 zoom/pan，也不改单个节点坐标', () => {
      enterSpace(EXAM, { animate: false });
      cy.zoom(0.08);
      cy.pan({ x: 800, y: 449 });
      const portalBefore = cy.getElementById(PORTAL).position();

      settleAfterLayout();

      // 这就是用户看到的那一下"多余的缩放"：这里必须为 0。
      expect(cy.zoom()).toBeCloseTo(0.08, 9);
      expect(cy.pan()).toEqual({ x: 800, y: 449 });
      // 传送门不参与分岛，也不被钉到任何"好点的位置"——它在哪就是力导给的哪。
      expect(cy.getElementById(PORTAL).position()).toEqual(portalBefore);
    });

    it('首屏那次 layoutstop 不取景，之后的才取景', () => {
      cy.zoom(0.08);
      cy.pan({ x: 800, y: 449 });

      beginBootLayout();
      onLayoutStopped();
      expect(cy.zoom()).toBeCloseTo(0.08, 9);

      // 用户主动重排布局：节点被甩到新位置，取景是对这次操作的收尾。
      onLayoutStopped();
      expect(cy.zoom()).not.toBeCloseTo(0.08, 9);
    });

    it('布局期间用户动过镜头时，layoutstop 不再强制取景', () => {
      // 模拟生产路径：layoutstart 记下快照，用户在布局跑的过程中缩放/
      // 平移了，layoutstop 看到 zoom/pan 与快照不一致 → 跳过取景。
      // 真实反馈：重置后布局还在跑，期间缩放/移动屏幕，布局完成却给强制
      // 挪一下、缩一下，不想要。
      enterSpace(EXAM, { animate: false });
      cy.zoom(0.08);
      cy.pan({ x: 800, y: 449 });

      markLayoutStart(cy.zoom(), cy.pan());
      // 用户在布局期间手动改了视角。
      cy.zoom(0.2);
      cy.pan({ x: 100, y: 200 });

      onLayoutStopped();

      // 用户动过的视角被尊重，没被取景覆盖。
      expect(cy.zoom()).toBeCloseTo(0.2, 9);
      expect(cy.pan()).toEqual({ x: 100, y: 200 });
    });

    it('布局期间用户没动镜头时，layoutstop 照常取景', () => {
      // 与上一条对照：markLayoutStart 之后用户没动 → 取景照旧发生。
      enterSpace(EXAM, { animate: false });
      cy.zoom(0.08);
      cy.pan({ x: 800, y: 449 });

      markLayoutStart(cy.zoom(), cy.pan());

      onLayoutStopped();

      // 没动过 → 取景发生，视角变了。
      expect(cy.zoom()).not.toBeCloseTo(0.08, 9);
    });
  });

  describe('空间分岛', () => {
    it('把叠在一起的空间摊成互不重叠的岛', () => {
      // 真实图里 euler 把所有分量排斥进同一团——这里刻意复现那个状态。
      cy.nodes().positions((n: cytoscape.NodeSingular, i: number) => ({
        x: (i % 3) * 40 - 40,
        y: Math.floor(i / 3) * 40 - 40,
      }));

      separateSpaces();

      const boxOf = (...ids: string[]) =>
        ids.map((id) => cy.getElementById(id)).reduce((acc, n) => acc.union(n));
      const left = boxOf(EXAM, 'e1', 'e2').boundingBox();
      const mid = boxOf(NEURO, 'n1').boundingBox();
      const right = boxOf('e8-root-system').boundingBox();
      expect(mid.x1).toBeGreaterThan(left.x2);
      expect(right.x1).toBeGreaterThan(mid.x2);
    });

    it('传送门不参与分岛——它是跨越多宇宙的特殊节点，留在 euler 给的原地', () => {
      const deco = cy.getElementById('e8-root-system');
      const portal = cy.getElementById(PORTAL);
      // 把传送门刻意放到散点岛附近——它必须留在原地，不被吹到散点岛一侧
      // 去之后又被空间隔离掉。曾经真的发生：被推到模型 x=37775，rendered
      // x=3822 远超视口 1600——传送门就消失了。
      deco.position({ x: 100, y: 100 });
      portal.position({ x: 400, y: 100 });

      separateSpaces();

      // 散点奇观会被分岛平移；传送门一个像素都不动。
      expect(deco.position()).not.toEqual({ x: 100, y: 100 });
      expect(portal.position()).toEqual({ x: 400, y: 100 });
    });
  });

  describe('面板关闭按钮（右上角 ×）', () => {
    const closeBtn = () => document.getElementById('space-menu-close') as HTMLButtonElement;

    it('不再有常驻的空间徽章——右上角只留画布', () => {
      expect(document.getElementById('space-badge')).toBeNull();
      expect(document.querySelector('.space-badge')).toBeNull();
    });

    it('面板页脚不再写「Esc 关闭」——那不是控件', () => {
      openSpaceMenu();
      expect(document.querySelector('.space-menu__esc')).toBeNull();
      expect(document.querySelector('.space-menu__foot')!.textContent).not.toContain('Esc');
      closeSpaceMenu();
    });

    it('点右上角 × 收起菜单，且不动当前空间', () => {
      enterSpace(EXAM, { animate: false });
      openSpaceMenu();
      closeBtn().click();
      expect(isSpaceMenuOpen()).toBe(false);
      // × 的语义是「关面板」，不是「退空间」——退空间归 Esc。
      expect(getActiveSpaceId()).toBe(EXAM);
    });

    it('× 与「传送门详情」都只收面板，不吞掉更外层的关闭语义', () => {
      openSpaceMenu();
      closeBtn().click();
      expect(isSpaceMenuOpen()).toBe(false);
      openSpaceMenu();
      closeBtn().click();
      expect(isSpaceMenuOpen()).toBe(false);
    });
  });

  describe('跨空间焦点跳转（space-state 守卫）', () => {
    it('目标在别的空间里时先切空间，且不做动画', () => {
      const animateSpy = vi.spyOn(cy, 'animate').mockImplementation(() => undefined as never);
      enterSpace(EXAM, { animate: false });

      expect(ensureNodeVisible('n1')).toBe(true);
      expect(getActiveSpaceId()).toBe(NEURO);
      expect(cy.getElementById('n1').visible()).toBe(true);
      expect(animateSpy).not.toHaveBeenCalled();
    });

    it('目标就在当前空间时不切，返回 false', () => {
      enterSpace(EXAM, { animate: false });
      expect(ensureNodeVisible('e1')).toBe(false);
      expect(ensureNodeVisible(PORTAL)).toBe(false);
    });
  });
});
