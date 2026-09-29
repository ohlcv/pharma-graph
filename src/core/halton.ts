/**
 * Halton sequence —— 低差异准随机数，取值 [0, 1)。
 *
 * 比纯随机好在**点不会聚簇**：纯随机抽 1182 个角度会自然地聚成几团，
 * Halton 的分布均匀得多。这是入场动画的预铺位置需要的性质——那一圈
 * 「等待中的星尘」要均匀铺满，视觉上才像一片星场而不是几个斑点。
 *
 * 放在 core 而不是 ui：入场预动画（layout-worker-client）和 halo burst
 * （ui/main）两处都要用，而 core 不能反向依赖 ui。纯函数，无依赖。
 *
 * @param index 序列下标（0 起）
 * @param base 进制的质数（2 / 3 / 5 …）。不同 base 展开出不同维度的序列，
 *             组合使用得到低相关的二维分布。
 */
export function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  let i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}
