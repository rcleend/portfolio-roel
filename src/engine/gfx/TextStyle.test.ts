import { describe, expect, it } from 'vitest';
import { BitmapFont, parseGlyphSheet } from './BitmapFont';
import { textBounds } from './TextStyle';

const font = BitmapFont.fromGlyphData({
  name: 'blocks',
  cellHeight: 3,
  ascent: 3,
  lineHeight: 4,
  letterSpacing: 1,
  spaceWidth: 2,
  glyphs: parseGlyphSheet(`
    = A
    ###
    ###
    ###

    = ?
    ##
    .#
    #.
  `),
});

describe('textBounds', () => {
  it('covers the glyph cells, anchored on x the way drawText aligns them', () => {
    const plain = { font, fill: '#ffffff' };
    expect(textBounds(plain, 'AA', 10, 20)).toEqual({ x: 10, y: 20, w: 7, h: 3 });
    expect(textBounds(plain, 'AA', 10, 20, { align: 'right' })).toEqual({ x: 3, y: 20, w: 7, h: 3 });
    expect(textBounds(plain, 'A\nAA', 0, 0).h).toBe(4 + 3);
  });

  it("grows on every side by how far the outline and the shadow's offset reach", () => {
    const decorated = { font, fill: '#ffffff', outline: '#000000', shadow: { color: '#000000', x: 1, y: 2 } };
    expect(textBounds(decorated, 'A', 0, 0)).toEqual({ x: -3, y: -3, w: 9, h: 9 });
  });
});
