/** Axis-aligned rectangle; `x`/`y` is the top-left corner. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

/** True when the rectangles overlap by a positive area; touching edges do not count. */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Half-open containment, so adjacent rectangles never both contain a shared edge pixel. */
export function containsPoint(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** The overlapping area of two rectangles, or `null` when they do not intersect. */
export function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return right > x && bottom > y ? rect(x, y, right - x, bottom - y) : null;
}

export function inflate(r: Rect, by: number): Rect {
  return rect(r.x - by, r.y - by, r.w + by * 2, r.h + by * 2);
}
