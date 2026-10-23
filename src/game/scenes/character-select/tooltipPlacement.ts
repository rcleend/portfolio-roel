import type { Rect } from '@/engine/math/Rect';
import { clamp } from '@/engine/math/scalar';

export interface Size {
  readonly w: number;
  readonly h: number;
}

/**
 * Top-left corner for a tooltip of `size` next to `anchor`: above it,
 * left-aligned with it, or below it when there is no room above. The result
 * always lies fully inside `bounds` (when the tooltip fits at all), so a
 * hover near any edge never pushes the window off the screen.
 */
export function placeTooltip(anchor: Rect, size: Size, bounds: Rect, gap = 3): { x: number; y: number } {
  const above = anchor.y - gap - size.h;
  const below = anchor.y + anchor.h + gap;
  const fitsAbove = above >= bounds.y;
  const fitsBelow = below + size.h <= bounds.y + bounds.h;
  const y = fitsAbove || !fitsBelow ? above : below;
  return {
    x: clamp(anchor.x, bounds.x, bounds.x + bounds.w - size.w),
    y: clamp(y, bounds.y, bounds.y + bounds.h - size.h),
  };
}
