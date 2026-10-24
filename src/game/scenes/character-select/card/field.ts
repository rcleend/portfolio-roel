import type { Gfx } from '@/engine/gfx/Gfx';
import { lerp } from '@/engine/math/scalar';
import { lazy } from '../../../art/logos/lazy';
import { Bitmap } from '../../../art/logos/raster/Bitmap';
import { rampAt } from '../../../art/logos/raster/ramp';
import { bitmapToCanvas } from '../../../art/logos/raster/toCanvas';
import { RAMP_RGBA } from '../../title/backdrops/blueprint/inks';
import { bandedStep } from '../../title/backdrops/blueprint/sheet';
import { CARD_INNER } from '../layout';

/** The field's shade in blueprint ramp steps, at the top of the card and at its foot. */
const SHADE = { top: 0, bottom: 2.6 } as const;

/** The field, banded the way the paper is, on its own screen pixels so the dither lines up with the paper's. */
const field = lazy(() => {
  const { x, y, w, h } = CARD_INNER;
  const bitmap = new Bitmap(w, h);
  for (let row = 0; row < h; row++) {
    const shade = lerp(SHADE.top, SHADE.bottom, row / (h - 1));
    for (let column = 0; column < w; column++) {
      bitmap.set(column, row, rampAt(RAMP_RGBA, bandedStep(shade, x + column, y + row)));
    }
  }
  return bitmapToCanvas(bitmap);
});

/**
 * The deep field inside the card: the blueprint ramp's three deepest steps,
 * unexposed navy at the top down to Prussian at the foot, so the card reads
 * as a window of unlit cyanotype set into the paper. Static, so it is
 * painted once.
 */
export function drawField(gfx: Gfx): void {
  gfx.image(field(), CARD_INNER.x, CARD_INNER.y);
}
