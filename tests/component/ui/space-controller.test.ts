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
  onLayoutStopped,
  cacheActiveSpacePositions,
  getCachedPositions,
  _resetSpaceControllerForTests,
} from '@/ui/space-controller';
import { getActiveSpaceId, ensureNodeVisible } from '@/ui/space-state';

/** 与 config.ts 的 UNIVERSE_ROOTS 一致——刻意不另造一套假 id。 */
const EXAM = 'concept-exam-system';
const NEURO = 'sum-personal-growth-p1';
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
    { group: 'nodes', data: { id: NEURO, label: '个人成长与生存策略' } },
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

    it('切宇宙不动相机——任何地方都不要强制取景', () => {
      // 用户明确要求：切宇宙（虫洞传送）时不要强制移动/缩放画面。
      // 曾经 enterSpace 会调 flyToCurrentSpace(animate) 让相机飞到目标空间，
      // 但切宇宙会触发 euler（节点从 halo 散开），此刻取景基于 halo 起始
      // 位置算的目标是错的，视觉上就是"强制移动+缩放"。
      enterSpace(EXAM, { animate: false });
      cy.zoom(0.08);
      cy.pan({ x: 800, y: 449 });

      // 再切一次空间（EXAM → NEURO），镜头应原封不动。
      enterSpace(NEURO);

      expect(cy.zoom()).toBeCloseTo(0.08, 9);
      expect(cy.pan()).toEqual({ x: 800, y: 449 });
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

    it('任何 layoutstop 都不取景——只分岛，不动镜头', () => {
      // 用户明确要求：任何布局结束后都不要强制移动/缩放画面。
      // 曾经 onLayoutStopped 区分首屏/非首屏/用户是否动过三支（ADR-0011），
      // 虫洞切宇宙场景反馈"任何地方都不想要"，于是统一为：只分岛，永不取景。
      enterSpace(EXAM, { animate: false });
      cy.zoom(0.08);
      cy.pan({ x: 800, y: 449 });

      // 多次 layoutstop（模拟首屏、重置、换布局、切宇宙触发的各种布局）
      // 都不该改 zoom/pan。
      onLayoutStopped();
      expect(cy.zoom()).toBeCloseTo(0.08, 9);
      expect(cy.pan()).toEqual({ x: 800, y: 449 });

      onLayoutStopped();
      expect(cy.zoom()).toBeCloseTo(0.08, 9);
      expect(cy.pan()).toEqual({ x: 800, y: 449 });

      onLayoutStopped();
      expect(cy.zoom()).toBeCloseTo(0.08, 9);
      expect(cy.pan()).toEqual({ x: 800, y: 449 });
    });
  });

  describe('布局坐标缓存', () => {
    it('cacheActiveSpacePositions 把当前活跃空间的节点坐标存进缓存', () => {
      enterSpace(EXAM, { animate: false });
      // 给节点一些确定坐标
      cy.getElementById('e1').position({ x: 100, y: 200 });
      cy.getElementById('e2').position({ x: 300, y: 400 });
      cy.getElementById(EXAM).position({ x: 0, y: 0 });

      cacheActiveSpacePositions();

      const cached = getCachedPositions(EXAM);
      expect(cached).not.toBeNull();
      expect(cached!.get('e1')).toEqual({ x: 100, y: 200 });
      expect(cached!.get('e2')).toEqual({ x: 300, y: 400 });
      expect(cached!.get(EXAM)).toEqual({ x: 0, y: 0 });
    });

    it('传送门不被缓存——它跨宇宙，位置每次切都要重置', () => {
      enterSpace(EXAM, { animate: false });
      cy.getElementById(PORTAL).position({ x: 999, y: 999 });

      cacheActiveSpacePositions();

      const cached = getCachedPositions(EXAM);
      expect(cached).not.toBeNull();
      expect(cached!.has(PORTAL)).toBe(false);
    });

    it('没访问过的空间返回 null', () => {
      enterSpace(EXAM, { animate: false });
      cacheActiveSpacePositions();
      expect(getCachedPositions(NEURO)).toBeNull();
    });

    it('切换空间后各自有独立缓存', () => {
      // 进 EXAM，存坐标
      enterSpace(EXAM, { animate: false });
      cy.getElementById('e1').position({ x: 100, y: 200 });
      cacheActiveSpacePositions();

      // 进 NEURO，存坐标
      enterSpace(NEURO, { animate: false });
      cy.getElementById('n1').position({ x: 500, y: 600 });
      cacheActiveSpacePositions();

      // 两份缓存都在，互不干扰
      expect(getCachedPositions(EXAM)?.get('e1')).toEqual({ x: 100, y: 200 });
      expect(getCachedPositions(NEURO)?.get('n1')).toEqual({ x: 500, y: 600 });
    });

    it('活跃空间的节点不在 cy 里时不存坐标（守卫）', () => {
      // 切宇宙执行期间（onEnterSpace 在 setActiveSpace 之前跑），如果上一个
      // euler 被 stop 触发全局 layoutstop，此刻 activeSpaceId 还是旧空间，
      // 但旧空间节点已被 remove。守卫挡住这种情况，不把当前 cy 里的节点
      // 坐标错误地存到旧空间名下。
      enterSpace(EXAM, { animate: false });
      // 手动 remove EXAM 的所有节点（模拟切宇宙 remove 旧空间）
      cy.getElementById('e1').remove();
      cy.getElementById('e2').remove();
      cy.getElementById(EXAM).remove();

      cacheActiveSpacePositions();

      // 守卫挡住，没存
      expect(getCachedPositions(EXAM)).toBeNull();
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
