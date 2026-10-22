import type { Gfx } from '@/engine/gfx/Gfx';

/** A shine image (letter faces in a pale colour) and where its top-left sits on screen. */
export interface GlintTarget {
  readonly shine: HTMLCanvasElement;
  readonly left: number;
  readonly top: number;
}

/** A wide and a thin stripe, `offset` pixels apart, like light catching a polished edge twice. */
const STRIPES: readonly (readonly [offset: number, width: number])[] = [
  [0, 4],
  [7, 2],
];
/** Horizontal shift per row, so the band leans the same way as the italic letters. */
const LEAN = 0.6;
/** How far beyond the screen edges a sweep starts and ends, so the band enters and leaves fully. */
const OVERSCAN = 40;

/**
 * Sweeps a leaning band of shine across the targets, `progress` 0 → 1 from
 * left to right. It is copied row by row from the shine images, so it only
 * ever lights letter pixels and stays as crisp as the art.
 */
export function drawGlint(gfx: Gfx, targets: readonly GlintTarget[], progress: number, pivotY: number): void {
  const sweep = -OVERSCAN + progress * (gfx.width + OVERSCAN * 2);
  for (const { shine, left, top } of targets) {
    for (let row = 0; row < shine.height; row++) {
      const y = top + row;
      const lean = Math.round((pivotY - y) * LEAN);
      for (const [offset, width] of STRIPES) {
        const from = Math.max(0, Math.round(sweep + lean - offset) - left);
        const to = Math.min(shine.width, Math.round(sweep + lean - offset) - left + width);
        if (to <= from) continue;
        gfx.image(shine, left + from, y, { source: { x: from, y: row, w: to - from, h: 1 } });
      }
    }
  }
}
