import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { arcadeFont } from '../../art/fonts/arcade';
import { scale2x } from './scale2x';

/**
 * The big announcer face ("MISSION 1", "START!", "CUSTOMER RETAINED!"):
 * the arcade face run through Scale2x, so it is twice the size but still
 * one-pixel art with rounded joins rather than chunky doubled pixels.
 */
export const bannerFont: BitmapFont = BitmapFont.fromGlyphData({
  name: 'banner',
  cellHeight: arcadeFont.cellHeight * 2,
  ascent: arcadeFont.ascent * 2,
  lineHeight: arcadeFont.lineHeight * 2,
  letterSpacing: arcadeFont.letterSpacing * 2,
  spaceWidth: arcadeFont.spaceWidth * 2,
  glyphs: Object.fromEntries(Object.entries(arcadeFont.glyphs).map(([char, rows]) => [char, scale2x(rows)])),
});
