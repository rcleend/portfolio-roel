import type { Gfx } from '@/engine/gfx/Gfx';

/**
 * The white-core fireball that opens the title: concentric flat rings from
 * a thin red rim through orange and yellow to a blinding white core, as in
 * the reference. Fractions are of the current radius, outermost first.
 */
const RINGS: readonly (readonly [fraction: number, color: string])[] = [
  [1, '#c8280a'],
  [0.96, '#ff6c14'],
  [0.91, '#ffae24'],
  [0.85, '#ffe36a'],
  [0.77, '#fff8d8'],
  [0.66, '#ffffff'],
];

export function drawFireball(gfx: Gfx, cx: number, cy: number, radius: number): void {
  if (radius <= 0) return;
  for (const [fraction, color] of RINGS) {
    const ring = Math.round(radius * fraction);
    if (ring > 0) gfx.circle(cx, cy, ring, color);
  }
}
