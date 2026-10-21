import type { Rect } from '@/engine/math/Rect';

export function rectCenter(rect: Rect): { readonly x: number; readonly y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/** True when the circle and the rectangle overlap (closest-point test). */
export function circleIntersectsRect(cx: number, cy: number, radius: number, rect: Rect): boolean {
  const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return (cx - nearestX) ** 2 + (cy - nearestY) ** 2 < radius * radius;
}

/** The bounding box of a circle. */
export function circleBounds(cx: number, cy: number, radius: number): Rect {
  return { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
}
