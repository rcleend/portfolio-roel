import type { Gfx } from '@/engine/gfx/Gfx';
import { lazy } from '../../../../art/logos/lazy';
import type { BackdropArt, TitleBackdrop, TitleFrame } from '../TitleBackdrop';
import { DRAWINGS } from './drawings';
import { drawRipple } from './gridWave';
import { INK } from './inks';
import { LetteringAtlas } from './lettering';
import { LightTable } from './lightTable';
import { drawMeasure, measureArt } from './measure';
import { PenPath } from './pen';
import { drawPlotter } from './plotter';
import { TITLE_BLOCK } from './sheet';
import { drawStrike, strikeRings } from './strike';
import { BOOT_FRAMES, framesSince, plotterAt, revisionAt, STRIKE_FRAMES } from './timeline';

export const blueprintBackdrop: TitleBackdrop<'blueprint'> = {
  id: 'blueprint',
  name: 'Blueprint',
  description: 'The product, drafted: a pen strike boots a cyanotype sheet that measures where the words will land.',
  prepare: lazy(paintBlueprintBackdrop),
};

/** Revision letters: A for the fresh sheet and one more per finished drawing. */
const REVISIONS = 'ABCDE';
/** Frames a fresh revision letter stays white-hot before it settles. */
const REVISION_STAMP_FRAMES = 12;

/**
 * "Blueprint" (docs/ART-DIRECTION.md › Title › Blueprint): the title card is
 * the engineering drawing of the product being built. A plotter-pen strike
 * boots a cyanotype sheet from the impact point, the engineer measures the
 * spot where the words will land, the lock sends a ripple through the grid,
 * and the idle plotter drafts product wireframes in the free corners,
 * bumping the title block's revision with each one. About 20 ms to paint.
 */
function paintBlueprintBackdrop(): BackdropArt {
  const table = new LightTable();
  const rings = strikeRings();
  const measure = measureArt();
  const plots = DRAWINGS.map((drawing) => new PenPath(drawing.strokes));
  const revisions = new LetteringAtlas(REVISIONS, [INK.white, INK.hot]);

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
      drawRevision(gfx.ctx, revisions, settled, frame.reducedMotion);
    },
  };
}

/** The title block's revision letter, stamped white-hot for a moment whenever it climbs. */
function drawRevision(ctx: CanvasRenderingContext2D, atlas: LetteringAtlas, settled: number, reducedMotion: boolean) {
  const { count, since } = settled >= 0 ? revisionAt(settled) : { count: 0, since: null };
  const fresh = !reducedMotion && since !== null && since < REVISION_STAMP_FRAMES;
  const { x, y } = TITLE_BLOCK.revision;
  atlas.draw(ctx, REVISIONS.charAt(count), x, y, fresh ? INK.hot : INK.white);
}
