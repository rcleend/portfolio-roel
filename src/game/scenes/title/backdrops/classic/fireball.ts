import type { Gfx } from '@/engine/gfx/Gfx';

/**
 * The white-core fireball that opens the title: concentric flat rings from
 * a thin red rim through orange and yellow to a blinding white core, as in
 * the reference. Fractions are of the current radius, outermost first.
 */
const RINGS: readonly (readonly [fraction: number, color: string])[] = [
  [1, '#d0300c'],
  [0.97, '#ff7a16'],
  [0.94, '#ffbc2c'],
  [0.91, '#ffea78'],
  [0.87, '#fffbe0'],
  [0.82, '#ffffff'],
];

export function drawFireball(gfx: Gfx, cx: number, cy: number, radius: number): void {
  if (radius <= 0) return;
  for (const [fraction, color] of RINGS) {
    const ring = Math.round(radius * fraction);
    if (ring > 0) gfx.circle(cx, cy, ring, color);
  }
}
