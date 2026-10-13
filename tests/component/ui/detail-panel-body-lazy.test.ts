/**
 * DetailPanel 正文懒加载策略：
 * 打开详情面板默认停在“概”页签，此时不应发起正文 fetch；
 * 只有切到“文”页签才拉取正文（带“加载中”过渡），
 * 且同一节点二次进入零请求（内存缓存）。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DetailPanel } from '@/ui/detail-panel';

// ── DOM fixture ──────────────────────────────────────────────────────────────
function mountPanel(): void {
  document.body.innerHTML = `
    <div id="node-panel" class="node-panel">
      <div class="node-panel__header">
        <div class="node-panel__tabs">
          <button id="lp-tab-overview" class="active">概</button>
          <button id="lp-tab-body" class="">文</button>
        </div>
        <button id="lp-btn-pin">固定</button>
      </div>
      <div id="lp-overview-page" class="np-page"></div>
      <div id="lp-body-page" class="np-page u-hidden"></div>
    </div>`;
}

/** 一个轻量 cytoscape 桩，仅支撑 DetailPanel 用到的节点 API。 */
function makeCy() {
  const nodes = new Map<string, Partial<Record<string, unknown>>>();
  return {
    getElementById: (id: string) => ({
      empty: () => !nodes.has(id),
      id: () => id,
      connectedEdges: () => [],
      data: (key?: string, val?: unknown) => {
        const rec = nodes.get(id) ?? {};
        if (typeof key === 'string') {
          if (val !== undefined) rec[key] = val;
          return rec[key];
        }
        return rec;
      },
    }),
    // 供 DetailPanel 内部写回节点数据
    __setNodeData: (id: string, data: Record<string, unknown>) => nodes.set(id, data),
  };
}

function stripPanelClass(panel: HTMLElement): void {
  panel.classList.remove('visible');
}

describe('DetailPanel 正文懒加载（切到文页签才 fetch）', () => {
  let cy: ReturnType<typeof makeCy>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mountPanel();
    cy = makeCy();
    cy.__setNodeData('n1', {
      id: 'n1',
      label: '节点一',
      sourcePath: '章节/节点一.md',
    });
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/markdown' },
      text: () =>
        Promise.resolve(
          ['---', 'id: n1', 'label: 节点一', '---', '', '## 问题一', '答案A。'].join('\n'),
        ),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    // DetailPanel 构造会读少量 CSS 变量；jsdom 里 getComputedStyle 返回空，
    // readVar 会走 fallback（NaN → fallback），不抛错。
    // drag-manager 的 restorePanelBounds 在窗口 ≤768 时清空样式，jsdom 默认 1024×768，
    // 且 hasSavedBounds 无 localStorage 数据时为 false → 不触发注入。
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('打开面板默认停在“概”页签：不发 fetch', async () => {
    const detail = new DetailPanel(cy as unknown as cytoscape.Core, { reset: vi.fn() } as never);
    detail.show('n1');
    // 让微任务有机会跑（若错误地发起了 fetch，会在此浮现）
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();

    // 面板可见、正文页签还是隐藏
    const panel = document.getElementById('node-panel')!;
    expect(panel.classList.contains('visible')).toBe(true);
    expect(document.getElementById('lp-body-page')!.classList.contains('u-hidden')).toBe(true);
  });

  it('切到“文”页签：先显示加载占位，fetch 完成后替换为正文', async () => {
    const detail = new DetailPanel(cy as unknown as cytoscape.Core, { reset: vi.fn() } as never);
    detail.show('n1');

    document.getElementById('lp-tab-body')!.click();

    // 点击后立即渲染 loading 占位
    expect(document.getElementById('lp-body-page')!.innerHTML).toContain('正在加载正文');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 等待 fetch + markdown 解析完成
    await vi.waitFor(() => {
      expect(document.getElementById('lp-body-page')!.innerHTML).toContain('问题一');
    });
    // 加载占位已被替换
    expect(document.getElementById('lp-body-page')!.innerHTML).not.toContain('正在加载正文');

    // 正文写回节点数据（缓存）
    expect(cy.getElementById('n1').data('body')).toContain('答案A');
  });

  it('同节点二次进入：命中缓存，零请求', async () => {
    const detail = new DetailPanel(cy as unknown as cytoscape.Core, { reset: vi.fn() } as never);
    detail.show('n1');
    document.getElementById('lp-tab-body')!.click();
    await vi.waitFor(() => {
      expect(document.getElementById('lp-body-page')!.innerHTML).toContain('问题一');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 关闭面板回到概页签，再切文页签——不重新 fetch
    stripPanelClass(document.getElementById('node-panel')!);
    detail.show('n1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('md 兜底模式：节点数据已自带 body → 切文页签零请求，直接渲染', async () => {
    // 模拟"开局逐个下载全部 md"的兜底路径：buildGraph 把 content.trim()
    // 写进节点数据，正文开局就在内存里。
    cy.__setNodeData('n1', {
      id: 'n1',
      label: '节点一',
      sourcePath: '章节/节点一.md',
      body: ['## 问题一', '答案A。'].join('\n'),
    });

    const detail = new DetailPanel(cy as unknown as cytoscape.Core, { reset: vi.fn() } as never);
    detail.show('n1');
    document.getElementById('lp-tab-body')!.click();

    // 正文立即渲染（已有数据，不用 loading 占位）
    expect(document.getElementById('lp-body-page')!.innerHTML).toContain('问题一');
    expect(document.getElementById('lp-body-page')!.innerHTML).not.toContain('正在加载正文');
    // 零网络请求
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('md 兜底模式：节点自带空 body（无正文）→ 也不请求', async () => {
    cy.__setNodeData('n1', {
      id: 'n1',
      label: '节点一',
      sourcePath: '章节/节点一.md',
      body: '',
    });

    const detail = new DetailPanel(cy as unknown as cytoscape.Core, { reset: vi.fn() } as never);
    detail.show('n1');
    document.getElementById('lp-tab-body')!.click();

    // 空正文：页签里什么都不渲染，但也不发起 fetch
    expect(document.getElementById('lp-body-page')!.innerHTML).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
