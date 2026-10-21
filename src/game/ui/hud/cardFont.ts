import { BitmapFont, parseGlyphSheet } from '@/engine/gfx/BitmapFont';
import { smallFont } from '../../art/fonts/small';

/**
 * The shared body face plus the few characters the portfolio copy uses that
 * it lacks (a tilde for "~35%"), for highlight cards and speech bubbles.
 * Kept local so the shared face stays untouched.
 */
export const cardFont: BitmapFont = BitmapFont.fromGlyphData({
  ...smallFont,
  name: 'card',
  glyphs: {
    ...smallFont.glyphs,
    ...parseGlyphSheet(`
= ~
.....
.....
.....
.#..#
#.##.
`),
  },
});
