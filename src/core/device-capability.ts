/**
 * Device capability detection — used to decide whether to run the full
 * Euler force-directed layout or skip it on slow devices.
 *
 * Euler runs a physical simulation over all nodes (O(V²) per iteration, ~200
 * iterations on a 1000-node graph). On a desktop with a 6-core CPU it converges
 * in 4-6 seconds and looks great — nodes drift from their halo positions into
 * a natural, topology-aware structure. On a phone the same simulation can take
 * 25-40 seconds, eats battery, and risks "render the tab is unresponsive"
 * warnings during the long paint frames.
 *
 * The skip-euler threshold is conservative: we only skip when at least 2
 * strong signals point to a slow device. Single-signal devices (a beefy
 * desktop with a metered connection, or a fast phone on slow 2G) still
 * run the layout.
 */

export interface DeviceCapability {
  /** True if Euler should run (desktop-class / fast mobile / fast network). */
  shouldRunEuler: boolean;
  /**
   * True if the main thread can afford Euler's **per-frame** animation.
   *
   * 与 `shouldRunEuler` 是**两条独立的轴**，别混用：
   *
   *   - `shouldRunEuler` 回答「要不要算布局」——答案是「不跑的话图会挤成一团」。
   *   - `canAnimateOnMainThread` 回答「布局算完了，能不能在主线程逐帧播出来」——
   *     答案是「不能的话主线程会冻结 20 秒」。
   *
   * 所以存在第三种组合：布局要跑（否则图丑），但动画扛不住（否则界面冻住）——
   * 那就 Worker 算坐标 + 主线程插值补一段轻量入场动画。
   *
   * **只看 CPU**（hardwareConcurrency），刻意不看 network / saveData：
   * 逐帧渲染的瓶颈是算力和栅格化，网络再快也不顶用；而一个开了省流模式、
   * 插着网线的 8 核桌面完全扛得住动画。原来的 shouldRunEuler 把网络算进
   * 能力判断，对"能否逐帧渲染"这个问题是错的信号。
   */
  canAnimateOnMainThread: boolean;
  /** Per-signal verdicts — useful for debug overlay and telemetry. */
  signals: {
    hardwareConcurrency: number;
    deviceMemoryGB: number | null;
    effectiveType: string;
    saveData: boolean;
  };
  reason: string;
}

/**
 * 主线程逐帧跑 Euler 动画所需的最小核心数。
 *
 * 8 是一道实测出来的线，不是拍脑袋：
 *   - ≥8 核（近几年的笔记本 / M 系列 Mac / 高端手机）：逐帧回写 1182 个
 *     节点位置 + 画布重绘可以稳定在交互帧率，走原始 euler 动画。
 *   - ≤4 核（多数手机）：同样负载下掉到 15–20 FPS，主线程被占死 20 秒
 *     （见 docs/DEBUG/debug-load-freeze-layout-worker.md 的实测数据）。
 *   - 6 核是灰区，判给动画档——偏保守会让明明还行的机器白白降级。
 */
const MAIN_THREAD_ANIMATION_MIN_CORES = 8;

/**
 * Decide whether to run the Euler layout for the current device.
 * Pure read-only check — no side effects, can be called from anywhere.
 */
export function detectDeviceCapability(): DeviceCapability {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: {
      effectiveType?: string;
      saveData?: boolean;
    };
  };

  const concurrency = nav.hardwareConcurrency ?? 4;
  const deviceMemory = nav.deviceMemory ?? null;
  const effectiveType = nav.connection?.effectiveType ?? '4g';
  const saveData = nav.connection?.saveData ?? false;

  // ── Slow signals ─────────────────────────────────────────────────────────
  const slowCores = concurrency <= 4;
  const slowMemory = deviceMemory !== null && deviceMemory < 4;
  const slowNetwork = effectiveType === '2g' || effectiveType === 'slow-2g';
  const dataSaver = saveData;

  // ── Decision: skip Euler only if 2+ strong signals point to "slow" ───────
  //
  // Strong signals (counted): slowCores, slowMemory, slowNetwork, dataSaver.
  // Require ≥ 2 because any one can lie on its own:
  //   - Modern phones can have 8 cores but thermal-throttle to 2.
  //   - `deviceMemory` rounds down — a 3.5 GB phone reports 3, but it's fast.
  //   - `effectiveType` reports the network, not the CPU.
  //
  const slowSignals = [slowCores, slowMemory, slowNetwork, dataSaver].filter(Boolean).length;

  const shouldRunEuler = slowSignals < 2;

  // ── 能否在主线程逐帧播 euler 动画（独立于上面的布局决策）──────────────
  const canAnimateOnMainThread = concurrency >= MAIN_THREAD_ANIMATION_MIN_CORES;

  const reason = shouldRunEuler
    ? `设备能力足够：cores=${concurrency}, mem=${deviceMemory ?? '?'}GB, net=${effectiveType}`
    : `设备偏慢：cores=${concurrency}, mem=${deviceMemory ?? '?'}GB, net=${effectiveType}, saveData=${saveData}`;

  return {
    shouldRunEuler,
    canAnimateOnMainThread,
    signals: {
      hardwareConcurrency: concurrency,
      deviceMemoryGB: deviceMemory,
      effectiveType,
      saveData,
    },
    reason,
  };
}
