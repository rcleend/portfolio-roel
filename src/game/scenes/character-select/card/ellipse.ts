import type { Gfx } from '@/engine/gfx/Gfx';

/**
 * Half-width of an axis-aligned ellipse on the row `dy` pixels from its
 * centre. Sampling against `ry + 0.5` gives the top and bottom rows a short
 * flat run instead of a lone pixel, the way pixel artists draw ovals.
 * Drawing ellipses as whole-pixel row spans keeps every edge crisp.
 */
export function ellipseSpan(rx: number, ry: number, dy: number): number {
  if (Math.abs(dy) > ry) return 0;
  const t = dy / (ry + 0.5);
  return Math.round(rx * Math.sqrt(1 - t * t));
}

export function fillEllipse(gfx: Gfx, cx: number, cy: number, rx: number, ry: number, color: string): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const span = ellipseSpan(rx, ry, dy);
    if (span > 0) gfx.fillRect(cx - span, cy + dy, span * 2, 1, color);
  }
}

/** A 1 px ring. Each row's run reaches out to the next row's edge, so steep parts never break into dots. */
export function strokeEllipse(gfx: Gfx, cx: number, cy: number, rx: number, ry: number, color: string): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const span = ellipseSpan(rx, ry, dy);
    if (Math.abs(dy) === ry) {
      gfx.fillRect(cx - span, cy + dy, span * 2, 1, color);
      continue;
    }
    const outerRow = ellipseSpan(rx, ry, Math.abs(dy) + 1);
    const run = Math.max(1, span - outerRow);
    gfx.fillRect(cx - span, cy + dy, run, 1, color);
    gfx.fillRect(cx + span - run, cy + dy, run, 1, color);
  }
}
