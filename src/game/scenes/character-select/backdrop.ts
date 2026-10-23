import { context2d, createCanvas } from '@/engine/gfx/canvas';
import type { BandedGradient, Gfx } from '@/engine/gfx/Gfx';

/** The menus' navy field; the title's blueprint sheet is printed on it too, so the screens flow into each other. */
export const MENU_FIELD: BandedGradient = { stops: ['#110e36', '#07061a'], bands: 5, dither: 'bayer2' };
/** The faint diagonal pinstripes over the field. */
export const MENU_PINSTRIPE = '#151243';
const STRIPE_SPACING = 6;

let stripes: HTMLCanvasElement | null = null;

/**
 * The screen behind everything: a banded navy gradient with faint diagonal
 * pinstripes, like the printed backing of an arcade instruction card. Static,
 * so the stripes are rasterised once.
 */
export function drawBackdrop(gfx: Gfx): void {
  gfx.fillRect(0, 0, gfx.width, gfx.height, MENU_FIELD);
  stripes ??= renderStripes(gfx.width, gfx.height);
  gfx.image(stripes, 0, 0);
}

function renderStripes(width: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  ctx.fillStyle = MENU_PINSTRIPE;
  for (let y = 0; y < height; y++) {
    for (let x = (STRIPE_SPACING - (y % STRIPE_SPACING)) % STRIPE_SPACING; x < width; x += STRIPE_SPACING) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}
