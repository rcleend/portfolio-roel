import type { BitmapFont } from '@/engine/gfx/BitmapFont';
import type { Gfx } from '@/engine/gfx/Gfx';
import { INK } from './palette';

const TEXT = '▲ NEW HIGH';
/** The box hugs the lettering with this much room on each side. */
const PAD = 3;
/** The lettering is the darkest glass, cut out of the lit box like inverse video. */
const CUT_OUT = '#03111a';
/** The badge's top row: on the readout line, above the ceiling. */
const TOP = 1;

/**
 * Draws the "▲ NEW HIGH" badge with its right edge at `right`, `open` of
 * the way open (0 to 1, up to 1.25 while it overshoots): the lit box grows
 * from its middle row and the lettering appears once the box is whole.
 */
export function drawBadge(gfx: Gfx, font: BitmapFont, right: number, open: number): void {
  if (open <= 0) return;
  const width = font.measure(TEXT) + PAD * 2;
  const fullHeight = font.ascent + PAD + 1;
  const height = Math.max(1, Math.round(fullHeight * open));
  const middle = TOP + fullHeight / 2;
  gfx.fillRect(right - width, Math.round(middle - height / 2), width, height, INK[3]);
  if (open >= 1) gfx.text(TEXT, right - width + PAD, TOP + 2, { font, fill: CUT_OUT });
}
