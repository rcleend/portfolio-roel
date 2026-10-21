/**
 * Easing curves for camera and CRT motion. The room keeps its own copy instead of importing
 * engine/motion because the room may depend on engine *types* only.
 */
export type Easing = (t: number) => number;

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export const linear: Easing = (t) => t;
export const easeInCubic: Easing = (t) => t * t * t;
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutExpo: Easing = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** Quint in-out with a long, soft landing: reads as a deliberate dolly rather than a snap. */
export const easeInOutQuint: Easing = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);

/** Overshoots past 1 and settles; `overshoot` ~1.7 matches the classic back-ease. */
export const easeOutBack =
  (overshoot = 1.70158): Easing =>
  (t) => {
    const c3 = overshoot + 1;
    return 1 + c3 * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
  };

/** Progress 0 → 1 of `time` across [start, end], shaped by `ease`. */
export function segment(time: number, start: number, end: number, ease: Easing = linear): number {
  if (end <= start) return time >= end ? 1 : 0;
  return ease(clamp01((time - start) / (end - start)));
}
