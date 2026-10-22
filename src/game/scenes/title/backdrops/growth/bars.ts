import { context2d, createCanvas } from '@/engine/gfx/canvas';
import { ditherOn } from '@/engine/gfx/dither';
import type { Gfx } from '@/engine/gfx/Gfx';
import { BARS } from './layout';
import { CYAN } from './palette';

/**
 * A bar's body, painted once as tall as any bar gets and anchored to the
 * floor: a 50 % checker of two dark cyans, the printed-chart look of the
 * period, with a lit left edge.
 */
export function paintBarBody(tallest: number): HTMLCanvasElement {
  const canvas = createCanvas(BARS.width, tallest);
  const ctx = context2d(canvas);
  for (let y = 0; y < tallest; y++) {
    for (let x = 0; x < BARS.width; x++) {
      ctx.fillStyle = x === 0 ? CYAN[2] : ditherOn('bayer2', x, y, 0.5) ? CYAN[1] : CYAN[0];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

/** Draws a bar `height` pixels tall standing on the floor at `x`: the body's bottom rows under a lit two-row cap. */
export function drawBar(gfx: Gfx, body: HTMLCanvasElement, x: number, height: number): void {
  if (height <= 0) return;
  const top = BARS.floor - height + 1;
  // Straight to the context: Gfx.image would allocate a source rectangle per bar, every frame.
  gfx.ctx.drawImage(body, 0, body.height - height, BARS.width, height, x, top, BARS.width, height);
  gfx.fillRect(x, top, BARS.width, 1, CYAN[3]);
  if (height > 1) gfx.fillRect(x, top + 1, BARS.width, 1, CYAN[2]);
}
