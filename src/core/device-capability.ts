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

  const reason = shouldRunEuler
    ? `设备能力足够：cores=${concurrency}, mem=${deviceMemory ?? '?'}GB, net=${effectiveType}`
    : `设备偏慢：cores=${concurrency}, mem=${deviceMemory ?? '?'}GB, net=${effectiveType}, saveData=${saveData}`;

  return {
    shouldRunEuler,
    signals: {
      hardwareConcurrency: concurrency,
      deviceMemoryGB: deviceMemory,
      effectiveType,
      saveData,
    },
    reason,
  };
}
