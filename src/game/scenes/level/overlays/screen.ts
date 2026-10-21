import { ditherOn } from '@/engine/gfx/dither';
import type { Gfx } from '@/engine/gfx/Gfx';

/**
 * Darkens the whole screen with an ordered dither instead of alpha, the way
 * 16-bit hardware dimmed a scene behind a menu. Rows are drawn as runs to
 * keep it cheap.
 */
export function dimScreen(gfx: Gfx, coverage: number, color = '#0b0a1f'): void {
  if (coverage <= 0) return;
  if (coverage >= 1) {
    gfx.fillRect(0, 0, gfx.width, gfx.height, color);
    return;
  }
  gfx.ctx.fillStyle = color;
  for (let y = 0; y < gfx.height; y++) {
    for (let x = 0; x < gfx.width; x++) if (ditherOn('bayer4', x, y, coverage)) gfx.ctx.fillRect(x, y, 1, 1);
  }
}

/** Quantised fade to a solid colour: flat steps, never a smooth ramp. */
export function fadeScreen(gfx: Gfx, coverage: number, color = '#000000', levels = 5): void {
  const stepped = Math.round(Math.min(1, Math.max(0, coverage)) * levels) / levels;
  if (stepped > 0) gfx.withAlpha(stepped, () => gfx.fillRect(0, 0, gfx.width, gfx.height, color));
}
