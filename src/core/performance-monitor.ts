/**
 * Performance Monitor - Detects device capabilities and applies appropriate optimizations.
 * Helps low-end devices avoid frame drops and long loading times.
 */

export interface DeviceProfile {
  isLowEnd: boolean;
  isMidRange: boolean;
  isHighEnd: boolean;
  recommendedConcurrency: number;
  shouldReduceAnimations: boolean;
  shouldUseSimplifiedLayout: boolean;
  maxNodesPerBatch: number;
}

interface NavigatorExtended extends Navigator {
  deviceMemory?: number;
  connection?: {
    effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
    saveData?: boolean;
  };
}

/**
 * Detect device performance profile.
 * Uses multiple signals to estimate device capability.
 */
export function detectDeviceProfile(): DeviceProfile {
  const nav = navigator as NavigatorExtended;

  // Hardware signals
  const cores = navigator.hardwareConcurrency || 4;
  const memory = nav.deviceMemory || 4; // GB, defaults to 4 if not available

  // Screen pixel density (high DPI = more rendering work)
  const pixelRatio = window.devicePixelRatio || 1;

  // Network conditions
  const connection = nav.connection;
  const isSlowNetwork = connection?.effectiveType === 'slow-2g' ||
                        connection?.effectiveType === '2g' ||
                        connection?.effectiveType === '3g';
  const isSaveData = connection?.saveData === true;

  // User agent hints
  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /android|iphone|ipad|ipod/i.test(ua);
  const isOldIOS = /os [0-9]_/i.test(ua) && isMobile;

  // Battery status (if available, low battery = reduce animations)
  let isLowBattery = false;
  if ('getBattery' in navigator) {
    (navigator as Navigator & { getBattery: () => Promise<{ level: number; charging: boolean }> })
      .getBattery?.().then((battery) => {
        isLowBattery = !battery.charging && battery.level < 0.2;
      }).catch(() => {});
  }

  // Scoring system (higher = more capable)
  let score = 100;

  // Deduct for low cores
  if (cores <= 2) score -= 40;
  else if (cores <= 4) score -= 20;

  // Deduct for low memory
  if (memory <= 2) score -= 30;
  else if (memory <= 4) score -= 15;

  // Deduct for slow network
  if (isSlowNetwork) score -= 30;
  else if (connection?.effectiveType === '4g') score -= 5;

  // Deduct for save data mode
  if (isSaveData) score -= 20;

  // Deduct for mobile
  if (isMobile) score -= 15;

  // Deduct for old iOS
  if (isOldIOS) score -= 20;

  // Deduct for high DPI
  if (pixelRatio > 2) score -= 10;
  else if (pixelRatio > 1.5) score -= 5;

  // Deduct for low battery
  if (isLowBattery) score -= 15;

  // Determine profile
  const isLowEnd = score < 40;
  const isMidRange = score >= 40 && score < 70;
  const isHighEnd = score >= 70;

  // Recommendations based on profile
  let recommendedConcurrency = 6;
  let shouldReduceAnimations = false;
  let shouldUseSimplifiedLayout = false;
  let maxNodesPerBatch = 50;

  if (isLowEnd) {
    recommendedConcurrency = 3;
    shouldReduceAnimations = true;
    shouldUseSimplifiedLayout = true;
    maxNodesPerBatch = 20;
  } else if (isMidRange) {
    recommendedConcurrency = 4;
    shouldReduceAnimations = true;
    shouldUseSimplifiedLayout = false;
    maxNodesPerBatch = 35;
  }

  // Log for debugging
  if (import.meta.env.DEV) {
    console.info('[perf] Device profile:', {
      cores,
      memory,
      pixelRatio,
      isSlowNetwork,
      isSaveData,
      isMobile,
      score,
      profile: isLowEnd ? 'low-end' : isMidRange ? 'mid-range' : 'high-end',
    });
  }

  return {
    isLowEnd,
    isMidRange,
    isHighEnd,
    recommendedConcurrency,
    shouldReduceAnimations,
    shouldUseSimplifiedLayout,
    maxNodesPerBatch,
  };
}

/**
 * Performance Monitor class for runtime tracking.
 */
export class PerformanceMonitor {
  private marks: Map<string, number> = new Map();
  private measures: Map<string, number[]> = new Map();
  private frameRates: number[] = [];
  private lastFrameTime = 0;
  private rafId: number | null = null;
  private profile: DeviceProfile;

  constructor() {
    this.profile = detectDeviceProfile();
  }

  getProfile(): DeviceProfile {
    return this.profile;
  }

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark: string, endMark?: string): number {
    const start = this.marks.get(startMark);
    const end = endMark ? this.marks.get(endMark) : performance.now();

    if (start === undefined) {
      console.warn(`[perf] Mark "${startMark}" not found`);
      return 0;
    }

    const duration = (end ?? performance.now()) - start;
    const existing = this.measures.get(name) || [];
    existing.push(duration);
    this.measures.set(name, existing);

    return duration;
  }

  getAverage(name: string): number {
    const measures = this.measures.get(name);
    if (!measures || measures.length === 0) return 0;
    return measures.reduce((a, b) => a + b, 0) / measures.length;
  }

  startFrameTracking(): void {
    if (this.rafId !== null) return;

    const trackFrame = (timestamp: number) => {
      if (this.lastFrameTime > 0) {
        const delta = timestamp - this.lastFrameTime;
        const fps = 1000 / delta;
        this.frameRates.push(fps);

        // Keep last 60 samples
        if (this.frameRates.length > 60) {
          this.frameRates.shift();
        }
      }
      this.lastFrameTime = timestamp;
      this.rafId = requestAnimationFrame(trackFrame);
    };

    this.rafId = requestAnimationFrame(trackFrame);
  }

  stopFrameTracking(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  getAverageFPS(): number {
    if (this.frameRates.length === 0) return 0;
    return this.frameRates.reduce((a, b) => a + b, 0) / this.frameRates.length;
  }

  isExperiencingJank(): boolean {
    const avgFPS = this.getAverageFPS();
    return avgFPS < 30;
  }

  getSummary(): Record<string, unknown> {
    return {
      profile: this.profile,
      averageFPS: Math.round(this.getAverageFPS()),
      frameSamples: this.frameRates.length,
      measures: Object.fromEntries(
        Array.from(this.measures.entries()).map(([k, v]) => [k, {
          count: v.length,
          avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length),
          min: Math.round(Math.min(...v)),
          max: Math.round(Math.max(...v)),
        }]),
      ),
    };
  }
}

// Singleton instance
let monitorInstance: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!monitorInstance) {
    monitorInstance = new PerformanceMonitor();
  }
  return monitorInstance;
}
