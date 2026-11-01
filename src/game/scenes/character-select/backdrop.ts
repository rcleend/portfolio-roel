import type { Gfx } from '@/engine/gfx/Gfx';
import { lazy } from '../../art/logos/lazy';
import { bitmapToCanvas } from '../../art/logos/raster/toCanvas';
import { printOnPaper } from '../title/backdrops/blueprint/sheet';

const STRIPE_SPACING = 6;

/** The paper with its pinstripes: a pixel every `STRIPE_SPACING` along each row, on diagonals rising to the right. */
const backdrop = lazy(() => bitmapToCanvas(() => printOnPaper((x, y) => (x + y) % STRIPE_SPACING === 0)));

/**
 * The screen behind everything: the title's blueprint paper with faint
 * diagonal pinstripes, like the printed backing of an arcade instruction
 * card, so the select screen and the title read as one sheet. Static, so it
 * is painted once.
 */
export function drawBackdrop(gfx: Gfx): void {
  gfx.image(backdrop(), 0, 0);
}
