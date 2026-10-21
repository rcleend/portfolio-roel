/** An immutable 2D vector. Functions return new vectors so values can be shared freely. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export const ZERO: Vec2 = vec2(0, 0);

export function add(a: Vec2, b: Vec2): Vec2 {
  return vec2(a.x + b.x, a.y + b.y);
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return vec2(a.x - b.x, a.y - b.y);
}

export function scale(v: Vec2, factor: number): Vec2 {
  return vec2(v.x * factor, v.y * factor);
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Unit vector in the direction of `v`; the zero vector stays zero instead of becoming NaN. */
export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  return len === 0 ? ZERO : vec2(v.x / len, v.y / len);
}
