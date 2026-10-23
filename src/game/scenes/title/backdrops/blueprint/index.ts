import type { Gfx } from '@/engine/gfx/Gfx';
import { lazy } from '../../../../art/logos/lazy';
import type { BackdropArt, TitleBackdrop, TitleFrame } from '../TitleBackdrop';
import { DRAWINGS } from './drawings';
import { drawRipple } from './gridWave';
import { LightTable } from './lightTable';
import { drawMeasure, measureArt } from './measure';
import { PenPath } from './pen';
import { drawPlotter } from './plotter';
import { drawStrike, strikeRings } from './strike';
import { BOOT_FRAMES, framesSince, plotterAt, STRIKE_FRAMES } from './timeline';

export const blueprintBackdrop: TitleBackdrop<'blueprint'> = {
  id: 'blueprint',
  name: 'Blueprint',
  description:
    "The product, drafted on the menus' navy: a pen strike boots a sheet that measures where the words will land.",
  prepare: lazy(paintBlueprintBackdrop),
};

/**
 * "Blueprint" (docs/ART-DIRECTION.md › Title › Blueprint): the title card is
 * the engineering drawing of the product being built, printed in the menus'
 * navies and lavenders so it flows into the select screens. A plotter-pen
 * strike boots the sheet from the impact point, the engineer measures the
 * spot where the words will land, the lock sends a ripple through the grid,
 * and the idle plotter drafts product wireframes in the free corners.
 * About 20 ms to paint.
 */
function paintBlueprintBackdrop(): BackdropArt {
  const table = new LightTable();
  const rings = strikeRings();
  const measure = measureArt();
  const plots = DRAWINGS.map((drawing) => new PenPath(drawing.strokes));

  return {
    drawBehind(gfx: Gfx, frame: TitleFrame): void {
      const at = framesSince(frame.time);
      table.draw(gfx, frame, at);
      if (at < STRIKE_FRAMES) drawStrike(gfx, frame, at, rings);
      drawMeasure(gfx, frame, at, measure);
      drawRipple(gfx.ctx, frame, at);
      if (at < BOOT_FRAMES) return;

      const settled = framesSince(frame.time, frame.beats.settled);
      const plotter = settled >= 0 ? plotterAt(settled) : null;
      const path = plotter && plots[plotter.drawing];
      if (plotter && path) drawPlotter(gfx, path, plotter, frame.reducedMotion);
    },
  };
}
