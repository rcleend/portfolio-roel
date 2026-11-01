import type { Gfx } from '@/engine/gfx/Gfx';
import { lazy } from '../../art/logos/lazy';
import { bitmapToCanvas } from '../../art/logos/raster/toCanvas';
import { printOnPaper } from '../title/backdrops/blueprint/sheet';

/** The survey grid's pitch, and how far its first lines sit in from the top-left corner. */
export const SURVEY = { cell: 16, offset: 8 } as const;

const backdrop = lazy(() =>
  bitmapToCanvas(() => printOnPaper((x, y) => x % SURVEY.cell === SURVEY.offset || y % SURVEY.cell === SURVEY.offset)),
);

/**
 * The screen behind the mission select: a tactical map, the title's
 * blueprint paper with a faint survey grid, so the select screens and the
 * title read as one sheet. Static, so it is painted once.
 */
export function drawBackdrop(gfx: Gfx): void {
  gfx.image(backdrop(), 0, 0);
}
