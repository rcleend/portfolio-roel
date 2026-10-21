import { Mask } from '../raster/Mask';
import { type Shape, translate, union } from '../raster/shape';
import { CAP_HEIGHT, wordmarkGlyphs } from './glyphs';

export const WORDMARK_TEXT = 'REO·LEO';

/** Space between letters, and a little more either side of the interpunct so it floats. */
const LETTER_SPACING = 3;
const DOT_SPACING = 4;
/** Rows above the cap line (and below the baseline) for the overshoot of round letters. */
const OVERSHOOT = 1;

/**
 * The boot logo as a 1-bit mask, about 230 × 32 px. It stays a mask because
 * the boot scene recolours it every frame and resamples it per column and
 * row to fake the spin and the flip.
 */
export function buildWordmark(text: string = WORDMARK_TEXT): Mask {
  const placed: Shape[] = [];
  let pen = 0;
  [...text].forEach((char, index) => {
    const glyph = wordmarkGlyphs[char];
    if (!glyph) throw new Error(`Wordmark: no glyph for "${char}"`);
    if (index > 0) pen += char === '·' || text[index - 1] === '·' ? DOT_SPACING : LETTER_SPACING;
    placed.push(translate(glyph.shape, pen, OVERSHOOT));
    pen += glyph.width;
  });
  return Mask.fromShape(pen, CAP_HEIGHT + OVERSHOOT * 2, union(...placed));
}
