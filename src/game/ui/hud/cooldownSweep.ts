import { ditherOn } from '@/engine/gfx/dither';
import type { Gfx } from '@/engine/gfx/Gfx';

/**
 * Clock-wipe over a `size × size` icon: pixels whose angle (clockwise from
 * twelve o'clock) is past `charge` are shaded with a dense ordered dither,
 * so the icon stays recognisable while it refills. No alpha blending.
 */
export function drawCooldownSweep(gfx: Gfx, x: number, y: number, size: number, charge: number, color: string): void {
  if (charge >= 1) return;
  const center = (size - 1) / 2;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const angle = Math.atan2(px - center, center - py);
      const turn = (angle < 0 ? angle + Math.PI * 2 : angle) / (Math.PI * 2);
      if (turn >= charge && ditherOn('bayer2', px, py, 0.75)) gfx.pixel(x + px, y + py, color);
    }
  }
}
