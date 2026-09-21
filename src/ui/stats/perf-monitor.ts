// src/ui/stats/perf-monitor.ts
// Lightweight performance monitoring for the "图谱状态" sidebar panel.
// Tracks FPS and JS heap memory in real time.
//
// FPS: rolling 60-frame average, sampled every animation frame. The displayed
// value reflects actual rendering throughput on 60/120/144 Hz monitors alike
// (a per-frame `1 / delta` would only show the monitor's refresh rate when
// the page is idle and falsely drop to 1 when the tab is backgrounded and
// resumed).
//
// Memory: tries `performance.memory.usedJSHeapSize` (Chrome's precise heap).
// That API is unavailable on Firefox/Safari and gated behind
// `--enable-precise-memory-info` on Chrome since version 96. When absent we
// fall back to `navigator.deviceMemory` (device RAM, in GB, rounded) so the
// card never shows "—" on platforms that just lack heap introspection.
//
// On tab hide: stop sampling and display "—" until the tab is visible again,
// so the user doesn't see a phantom frame-1 right after resuming.

const WINDOW_SIZE = 60;

let _rafId = 0;
let _updateTimer: ReturnType<typeof setInterval> | null = null;
let _memoryTimer: ReturnType<typeof setInterval> | null = null;
let _memoryMb = -1; // -1 = unknown
let _fps = 0;

// Rolling frame timestamps (most-recent first). Using a circular buffer keeps
// memory bounded and lookups O(1).
const _frameTimes = new Float64Array(WINDOW_SIZE);
let _frameHead = 0; // index of newest entry
let _frameCount = 0;

function resetFpsWindow(): void {
  _frameHead = 0;
  _frameCount = 0;
  _fps = 0;
}

function pushFrame(now: number): void {
  _frameHead = (_frameHead + 1) % WINDOW_SIZE;
  _frameTimes[_frameHead] = now;
  if (_frameCount < WINDOW_SIZE) _frameCount++;
}

/** FPS over the last `min(WINDOW_SIZE, sampled)` frames. */
function computeFps(now: number): number {
  if (_frameCount < 2) return 0;
  const oldestIdx = (_frameHead - _frameCount + 1 + WINDOW_SIZE) % WINDOW_SIZE;
  const span = now - _frameTimes[oldestIdx];
  if (span <= 0) return 0;
  // The window has N-1 intervals between N frames.
  return Math.round(((_frameCount - 1) * 1000) / span);
}

function tick(now: number): void {
  pushFrame(now);
  _fps = computeFps(now);
  _rafId = requestAnimationFrame(tick);
}

/** 桌面侧栏 #stat-fps 和手机抽屉 #bs-stat-fps 显示同一个读数。 */
function setFpsText(text: string): void {
  const desktop = document.getElementById('stat-fps');
  const mobile = document.getElementById('bs-stat-fps');
  if (desktop) desktop.textContent = text;
  if (mobile) mobile.textContent = text;
}

function updateFpsDom(): void {
  setFpsText(_fps > 0 ? String(_fps) : '—');
}

function readMemoryMb(): number {
  const perf = performance as unknown as { memory?: { usedJSHeapSize: number } };
  if (perf.memory) {
    return Math.round(perf.memory.usedJSHeapSize / (1024 * 1024));
  }
  // Fallback: device RAM in GB. We multiply by 1024 to express it in MB so
  // the unit stays consistent. Not a heap measurement but better than "—".
  const nav = navigator as unknown as { deviceMemory?: number };
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0) {
    return Math.round(nav.deviceMemory * 1024);
  }
  return -1;
}

function pollMemory(): void {
  _memoryMb = readMemoryMb();
}

function updateMemoryDom(): void {
  const desktop = document.getElementById('stat-memory');
  let text: string;
  if (_memoryMb < 0) {
    text = '—';
  } else if (_memoryMb > 1024) {
    text = `${(_memoryMb / 1024).toFixed(1)} GB`;
  } else {
    text = `${_memoryMb} MB`;
  }
  if (desktop) desktop.textContent = text;
}

function startSampling(): void {
  if (_rafId !== 0) return;
  resetFpsWindow();
  _rafId = requestAnimationFrame(tick);
}

function stopSampling(): void {
  if (_rafId !== 0) {
    cancelAnimationFrame(_rafId);
    _rafId = 0;
  }
  _fps = 0;
}

/** Initialise monitoring. Called once at boot. Idempotent. */
export function init(): void {
  if (_updateTimer !== null) return;
  startSampling();
  _updateTimer = setInterval(() => {
    updateFpsDom();
    updateMemoryDom();
  }, 500);
  _memoryTimer = setInterval(pollMemory, 1000);
  pollMemory();
  // Pause on tab hide so resume doesn't show a phantom 1 FPS from the
  // multi-second RAF gap.
  document.addEventListener('visibilitychange', onVisibilityChange);
}

/** Stop monitoring. Clears all timers (FPS + memory). */
export function stop(): void {
  stopSampling();
  if (_updateTimer !== null) {
    clearInterval(_updateTimer);
    _updateTimer = null;
  }
  if (_memoryTimer !== null) {
    clearInterval(_memoryTimer);
    _memoryTimer = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
}

function onVisibilityChange(): void {
  if (document.hidden) {
    stopSampling();
    // Show "—" while hidden so the user doesn't read a stale value.
    setFpsText('—');
  } else {
    startSampling();
  }
}

/** Test-only: current FPS. */
export function _getFpsForTest(): number {
  return _fps;
}

/** Test-only: current memory in MB, -1 if unknown. */
export function _getMemoryForTest(): number {
  return _memoryMb;
}
