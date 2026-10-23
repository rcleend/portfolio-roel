/** Restricts `value` to the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Linear interpolation; `t` is not clamped so callers can overshoot deliberately. */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Inverse of {@link lerp}: where `value` sits between `from` and `to`, unclamped. */
export function inverseLerp(from: number, to: number, value: number): number {
  return from === to ? 0 : (value - from) / (to - from);
}

/** Moves `value` towards `target` by at most `maxDelta`, never past it. */
export function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
}

/** Euclidean modulo: always returns a value in [0, modulus), also for negative input. */
export function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
