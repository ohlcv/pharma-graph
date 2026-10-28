// The four "spectacle" decoration nodes (太极八卦 / 四维空间 / 生命之树 /
// E8 根系) used to carry their own copy of the markdown path and URL encoder.
// This test pins the replacement: the path comes from the node's own data, so
// moving a decoration md file in the content tree can never desync the code.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { contentUrlForRel, loadDecorContent } from '@/core/spectacle/decor-content';

type FakeData = Record<string, unknown>;

/** Minimal stand-in for cytoscape's NodeSingular: data() get/set only. */
function fakeNode(data: FakeData = {}): {
  data: (key?: string, value?: unknown) => unknown;
  snapshot: () => FakeData;
} {
  const store: FakeData = { ...data };
  const api = {
    data(key?: string, value?: unknown): unknown {
      if (key === undefined) return store;
      if (value !== undefined) store[key] = value;
      return store[key];
    },
    snapshot(): FakeData {
      return store;
    },
  };
  return api;
}

const MD = '---\nid: sample\nlabel: 样例\n---\n\n## 正文\n\nbody line\n';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('contentUrlForRel', () => {
  it('percent-encodes spaces and #/?, leaving ( ) , literal', () => {
    expect(contentUrlForRel('装饰奇观/太极 八卦.md')).toBe(
      '/content/%E8%A3%85%E9%A5%B0%E5%A5%87%E8%A7%82/%E5%A4%AA%E6%9E%81%20%E5%85%AB%E5%8D%A6.md',
    );
    expect(contentUrlForRel('a/b#c?d.md')).toBe('/content/a/b%23c%3Fd.md');
    // ( ) , stay literal on purpose: Vite cannot resolve their encoded forms.
    expect(contentUrlForRel('dir/(x),y.md')).toBe('/content/dir/(x),y.md');
  });
});

describe('loadDecorContent', () => {
  it('resolves the path from node.data and writes the parsed fields', async () => {
    const res = { ok: true, text: async () => MD } as Response;
    const fetchMock = vi.fn(async () => res);
    vi.stubGlobal('fetch', fetchMock);

    const node = fakeNode({ sourcePath: '装饰奇观/太极八卦.md' });
    await loadDecorContent(node as any);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/content/%E8%A3%85%E9%A5%B0%E5%A5%87%E8%A7%82/%E5%A4%AA%E6%9E%81%E5%85%AB%E5%8D%A6.md',
    );
    const out = node.snapshot();
    expect(out.sourcePath).toBe('装饰奇观/太极八卦.md');
    expect(out.body).toContain('body line');
  });

  it('prefers rel over sourcePath', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => MD }) as Response),
    );
    const node = fakeNode({ rel: '装饰奇观/E8根系.md', sourcePath: '旧/路径.md' });
    await loadDecorContent(node as any);
    expect(node.snapshot().sourcePath).toBe('装饰奇观/E8根系.md');
  });

  it('fetches nothing when the node has no path (no md in the content tree)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const node = fakeNode();
    await loadDecorContent(node as any);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('degrades silently on a 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false }) as Response),
    );
    const node = fakeNode({ sourcePath: '装饰奇观/太极八卦.md' });
    await expect(loadDecorContent(node as any)).resolves.toBeUndefined();
    expect(node.snapshot().body).toBeUndefined();
  });

  it('degrades silently when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const node = fakeNode({ sourcePath: '装饰奇观/太极八卦.md' });
    await expect(loadDecorContent(node as any)).resolves.toBeUndefined();
  });
});
