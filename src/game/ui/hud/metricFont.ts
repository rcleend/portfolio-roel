import { BitmapFont, parseGlyphSheet } from '@/engine/gfx/BitmapFont';
import { scale2x } from './scale2x';
import { scoreFontData } from './scoreFont';

/**
 * Glyphs Scale2x gets wrong: it fills the inside corners of a plus, turning
 * it into a diamond, so the doubled plus is drawn by hand.
 */
const HAND_DRAWN = parseGlyphSheet(`
= +
............
............
....####....
....####....
....####....
....####....
############
############
############
############
....####....
....####....
....####....
....####....
............
............
`);

/** The HUD numerals at twice the size via Scale2x, for the headline metric on a highlight card ("20%→35%"). */
export const metricFont: BitmapFont = BitmapFont.fromGlyphData({
  ...scoreFontData,
  name: 'metric',
  cellHeight: scoreFontData.cellHeight * 2,
  ascent: scoreFontData.ascent * 2,
  lineHeight: scoreFontData.lineHeight * 2,
  letterSpacing: scoreFontData.letterSpacing * 2,
  spaceWidth: scoreFontData.spaceWidth * 2,
  glyphs: {
    ...Object.fromEntries(Object.entries(scoreFontData.glyphs).map(([char, rows]) => [char, scale2x(rows)])),
    ...HAND_DRAWN,
  },
});
