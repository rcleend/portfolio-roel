import { context2d, createCanvas } from '@/engine/gfx/canvas';
import { ditherOn } from '@/engine/gfx/dither';
import type { Gfx } from '@/engine/gfx/Gfx';
import { lerp } from '@/engine/math/scalar';
import { shadeOf } from '../../title/backdrops/blueprint/inks';

/**
 * A stage spotlight falling from the top of the card onto the pedestal:
 * flat bands widening downwards, joined to the dark backdrop by a dithered
 * edge. Each band is a blueprint ramp step above the one around it, the
 * outermost on the step the card's field ends on, so the beam's rim fades
 * into the field's foot where the light pools. Static, so it is rasterised
 * once and blitted.
 */
const BANDS = [
  { color: shadeOf(2), scale: 1 },
  { color: shadeOf(3), scale: 0.66 },
  { color: shadeOf(4), scale: 0.36 },
] as const;
const TOP_HALF_WIDTH = 9;
const BOTTOM_HALF_WIDTH = 36;
/** Width of the dithered fringe on each side of a band. */
const FRINGE = 3;

let cached: { readonly canvas: HTMLCanvasElement; readonly height: number } | null = null;

function render(height: number): HTMLCanvasElement {
  const width = BOTTOM_HALF_WIDTH * 2 + FRINGE * 2;
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  const centre = width / 2;
  for (const band of BANDS) {
    ctx.fillStyle = band.color;
    for (let y = 0; y < height; y++) {
      const half = Math.round(lerp(TOP_HALF_WIDTH, BOTTOM_HALF_WIDTH, y / (height - 1)) * band.scale);
      ctx.fillRect(centre - half, y, half * 2, 1);
      // The fringe thins out away from the band: 3/4, 1/2, 1/4 coverage.
      for (let f = 1; f <= FRINGE; f++) {
        const coverage = 1 - f / (FRINGE + 1);
        for (const x of [centre - half - f, centre + half + f - 1]) {
          if (ditherOn('bayer4', x, y, coverage)) ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }
  return canvas;
}

/** Draws the spotlight with its axis at `cx`, from `top` down to `bottom`. */
export function drawSpotlight(gfx: Gfx, cx: number, top: number, bottom: number): void {
  const height = Math.max(2, bottom - top);
  if (!cached || cached.height !== height) cached = { canvas: render(height), height };
  gfx.image(cached.canvas, cx - Math.floor(cached.canvas.width / 2), top);
}
