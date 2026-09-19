/**
 * OptimizedContentLoader — High-performance content loading with:
 * - In-memory cache (prevents re-fetching on same session)
 * - localStorage persistence (survives page refresh)
 * - Batched loading (limits concurrent requests)
 * - **Streaming callback** — fires as each batch arrives so callers can
 *   render nodes progressively ("生长" effect preserved)
 * - Progress callbacks (for status indicator)
 * - Pre-built graph data fallback (skip markdown parsing entirely)
 */

const MANIFEST_URL = '/content-manifest.json';
const CONTENT_ROOT = '../../content';
// v3: 临时禁用 cache 时 bump key，让旧的 v2 cache 自动失效（一次性清理）
const CACHE_KEY = 'pg_content_v3';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface LoadedContent {
  files: Record<string, string>;
  count: number;
}

export interface LoadProgress {
  phase: 'manifest' | 'content' | 'graph' | 'render' | 'done';
  loaded: number;
  total: number;
  message: string;
}

export type ProgressCallback = (progress: LoadProgress) => void;

/**
 * Streaming batch callback — fires each time a batch finishes fetching.
 * `batchFiles` is a Map<key, rawMarkdown> of the newly-arrived files.
 * Callers can render this batch immediately to give the user a
 * progressive "节点一颗颗长出来" experience instead of a blank
 * screen for the entire fetch duration.
 */
export type BatchCallback = (batchFiles: Record<string, string>, batchLoaded: number, batchTotal: number) => void;

/**
 * Concurrency-limited parallel fetch with progress + streaming batches.
 *
 * Concurrency limits how many in-flight requests exist at once. We
 * process them serially-in-promise form: an array of "pending slots"
 * keeps track of which index ranges have been started; a worker
 * walks those slots, picking the next index whenever one finishes.
 *
 * The streaming callback fires once per N-completed items so the
 * UI can render progressive batches without being flooded.
 */
async function fetchWithStreaming(
  urls: string[],
  rels: string[],
  onBatch: BatchCallback,
  onProgress: ProgressCallback,
  concurrency: number,
  batchSize: number,
): Promise<void> {
  let completed = 0;
  const total = urls.length;
  let pendingBatch: Record<string, string> = {};
  let pendingBatchLoaded = 0;

  const flushBatch = () => {
    if (Object.keys(pendingBatch).length === 0) return;
    onBatch(pendingBatch, pendingBatchLoaded, total);
    pendingBatch = {};
  };

  const work = async (index: number): Promise<void> => {
    if (index >= total) return;
    const url = urls[index];
    const rel = rels[index];
    const key = `${CONTENT_ROOT}/${rel}`;

    try {
      const response = await fetch(url);
      if (response.ok) {
        const ct = response.headers.get('content-type') ?? '';
        if (!ct.includes('text/html')) {
          const text = await response.text();
          if (!text.startsWith('<!DOCTYPE') && !text.startsWith('<html')) {
            pendingBatch[key] = text;
          }
        }
      } else {
        // log non-OK so the user can see which file failed (silent failure otherwise)
        console.warn(`[loader] fetch ${response.status} ${url}`);
      }
    } catch (err) {
      // ignore failed request — caller can still load the rest
      console.warn(`[loader] fetch failed ${url}:`, err);
    }

    completed++;
    pendingBatchLoaded = completed;
    onProgress({
      phase: 'content',
      loaded: completed,
      total,
      message: '加载知识节点',
    });

    if (completed % batchSize === 0 || completed === total) {
      flushBatch();
    }

    // Pick up the next task
    await work(index + concurrency);
  };

  // Start the initial batch of workers (one per concurrency slot)
  const workers: Array<Promise<void>> = [];
  for (let i = 0; i < Math.min(concurrency, total); i++) {
    workers.push(work(i));
  }
  await Promise.all(workers);
  flushBatch();
}

/**
 * Check if localStorage is available and working.
 */
function canUseLocalStorage(): boolean {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to load from localStorage cache.
 */
function loadFromCache(): { files: Record<string, string>; timestamp: number } | null {
  if (!canUseLocalStorage()) return null;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const parsed = JSON.parse(cached) as {
      data?: Record<string, string>;
      timestamp?: number;
    };
    const data = parsed.data;
    const timestamp = parsed.timestamp;
    if (!data || !timestamp) return null;

    const now = Date.now();

    if (now - timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return { files: data, timestamp };
  } catch {
    return null;
  }
}

/**
 * Save content to localStorage cache.
 */
function saveToCache(files: Record<string, string>): void {
  if (!canUseLocalStorage()) return;

  try {
    const size = JSON.stringify(files).length;
    if (size > 5 * 1024 * 1024) {
      console.warn('[loader] Cache too large, skipping localStorage');
      return;
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data: files,
      timestamp: Date.now(),
    }));
  } catch (err) {
    console.warn('[loader] Failed to cache:', err);
  }
}

/**
 * Detect device performance profile (for adaptive concurrency / batch size).
 */
function deviceProfile(): { concurrency: number; batchSize: number } {
  const cores = navigator.hardwareConcurrency || 4;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  const memory = nav.deviceMemory || 4;
  const isSlowNet = nav.connection?.effectiveType === 'slow-2g' ||
                    nav.connection?.effectiveType === '2g' ||
                    nav.connection?.effectiveType === '3g';
  const isSaveData = nav.connection?.saveData === true;
  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);

  let score = 100;
  if (cores <= 2) score -= 40;
  else if (cores <= 4) score -= 20;
  if (memory <= 2) score -= 30;
  else if (memory <= 4) score -= 15;
  if (isSlowNet) score -= 30;
  if (isSaveData) score -= 20;
  if (isMobile) score -= 15;

  if (score < 40) return { concurrency: 3, batchSize: 12 };
  if (score < 70) return { concurrency: 4, batchSize: 20 };
  return { concurrency: 6, batchSize: 30 };
}

/**
 * Streaming content loader — fires batches as they arrive.
 *
 * The callback receives a `Record<key, rawMarkdown>` of newly arrived
 * files. Callers can render them progressively. Final `done` phase
 * fires once the entire manifest is exhausted.
 */
export async function loadContentStreaming(
  onProgress?: ProgressCallback,
  onBatch?: BatchCallback,
): Promise<LoadedContent> {
  const report = onProgress ?? (() => {});
  const stream = onBatch ?? (() => {});

  // Phase 1: manifest
  report({ phase: 'manifest', loaded: 0, total: 1, message: '获取内容索引…' });
  const manifestRes = await fetch(MANIFEST_URL);
  if (!manifestRes.ok) {
    throw new Error(`Manifest fetch failed: ${manifestRes.status}`);
  }
  const manifest = await manifestRes.json() as { files: string[] };

  // Cache disabled — 临时禁用，跳过 localStorage 缓存命中。
  // 调试后端改动时每次刷新都重新拉取，避免看到陈旧的 streaming 行为。
  // 恢复时把下一行 `return null;` 去掉即可。
  const cached = null; // loadFromCache();
  if (cached) {
    report({
      phase: 'content',
      loaded: Object.keys(cached.files).length,
      total: manifest.files.length,
      message: '从缓存恢复',
    });

    // Synthetic single batch (so caller still gets a render kick)
    stream(cached.files, Object.keys(cached.files).length, manifest.files.length);

    requestAnimationFrame(() => {
      report({ phase: 'done', loaded: manifest.files.length, total: manifest.files.length, message: '准备就绪' });
    });

    return { files: cached.files, count: Object.keys(cached.files).length };
  }

  // Build URLs (parallel to manifest)
  const urls = manifest.files.map((rel) =>
    '/content/' + rel.split('/').map(
      (s) => encodeURI(s).replace(/#/g, '%23').replace(/\?/g, '%3F'),
    ).join('/')
  );

  // Adaptive concurrency / batch size from device profile
  const { concurrency, batchSize } = deviceProfile();

  report({ phase: 'content', loaded: 0, total: urls.length, message: '加载知识节点…' });

  const collected: Record<string, string> = {};

  await fetchWithStreaming(
    urls,
    manifest.files,
    (batchFiles, loaded, total) => {
      Object.assign(collected, batchFiles);
      stream(batchFiles, loaded, total);
    },
    report,
    concurrency,
    batchSize,
  );

  // Cache disabled — 跳过保存，避免下一次刷新立刻命中陈旧 cache。
  // saveToCache(collected);

  report({ phase: 'done', loaded: urls.length, total: urls.length, message: '准备就绪' });
  return { files: collected, count: Object.keys(collected).length };
}

/**
 * Synchronous one-shot loader (keeps the old signature working for callers
 * that don't need streaming render).
 */
export async function loadContent(onProgress?: ProgressCallback): Promise<LoadedContent> {
  let allFiles: Record<string, string> = {};
  let finalCount = 0;

  await loadContentStreaming(
    onProgress,
    (batchFiles, _loaded, _total) => {
      // Accumulate all batches without rendering progressively
      Object.assign(allFiles, batchFiles);
      finalCount = Object.keys(allFiles).length;
    },
  );

  // Final pass — call once with everything collected
  void finalCount;
  return { files: allFiles, count: Object.keys(allFiles).length };
}

/**
 * Clear the content cache.
 */
export function clearContentCache(): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Get cache status.
 */
export function getCacheStatus(): { cached: boolean; count: number; age: number | null } {
  if (!canUseLocalStorage()) return { cached: false, count: 0, age: null };

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return { cached: false, count: 0, age: null };

    const parsed = JSON.parse(cached) as {
      data?: Record<string, string>;
      timestamp?: number;
    };
    const data = parsed.data;
    const timestamp = parsed.timestamp;
    if (!data || !timestamp) return { cached: false, count: 0, age: null };
    const count = Object.keys(data).length;
    const age = Date.now() - timestamp;

    return { cached: true, count, age };
  } catch {
    return { cached: false, count: 0, age: null };
  }
}
