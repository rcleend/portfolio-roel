import type { Gfx } from '@/engine/gfx/Gfx';
import { palette } from '../../palette';

/** A two-band pool of light for a sprite to stand on, centred on `x` with its top at `floor`. */
export function drawSpotlight(gfx: Gfx, x: number, floor: number): void {
  gfx.fillRect(x - 15, floor, 30, 2, palette.violet);
  gfx.fillRect(x - 10, floor + 1, 20, 1, palette.lavender);
}
