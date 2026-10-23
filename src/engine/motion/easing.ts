/**
 * Easing curves map linear progress t ∈ [0, 1] to eased progress.
 *
 * Every curve returns exactly 0 at t = 0 and 1 at t = 1, so a segment always
 * starts and ends on its keyframes. Curves with overshoot (back, elastic) may
 * leave [0, 1] in between — that is the point of them.
 */
export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;

export const easeInQuad: Easing = (t) => t * t;
export const easeOutQuad: Easing = (t) => 1 - (1 - t) * (1 - t);
export const easeInOutQuad: Easing = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export const easeInCubic: Easing = (t) => t * t * t;
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export const easeInExpo: Easing = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (10 * t - 10));
export const easeOutExpo: Easing = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** Factory for "back" curves; `overshoot` 1.70158 is the classic ~10 % overshoot. */
export function easeOutBackWith(overshoot: number): Easing {
  const c3 = overshoot + 1;
  return (t) => 1 + c3 * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

export const easeOutBack: Easing = easeOutBackWith(1.70158);

export const easeInBack: Easing = (t) => 2.70158 * t * t * t - 1.70158 * t * t;

export const easeOutElastic: Easing = (t) =>
  t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;

/**
 * Quantises progress into `count` equal jumps, emulating hand-drawn sprite
 * frames. `steps(4)` yields 0, .25, .5, .75 and only reaches 1 at t = 1.
 */
export function steps(count: number): Easing {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`steps(): count must be a positive integer`);
  return (t) => (t >= 1 ? 1 : Math.floor(Math.max(0, t) * count) / count);
}
