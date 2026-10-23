import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BitmapFont, parseGlyphSheet } from './BitmapFont';
import { drawText, type TextStyle, textBounds, textInk } from './TextStyle';
import { RasterCanvas, rasterContext } from './testing';

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

describe('textInk', () => {
  const plain = { font, fill: '#ffffff' };
  const decorated: TextStyle = { font, fill: '#ffffff', outline: '#000000', shadow: { color: '#000000', x: 1, y: 2 } };

  it('hugs the inked columns, leaving out empty ones that textBounds counts', () => {
    expect(textInk(plain, 'AA', 10, 20)).toEqual({ x: 10, y: 20, w: 7, h: 3 });
    // A space, then a "?" whose cell is two columns wide: the ink starts where the "?" does.
    expect(textInk(plain, ' ?', 10, 20)).toEqual({ x: 13, y: 20, w: 2, h: 3 });
    expect(textBounds(plain, ' ?', 10, 20).x).toBe(10);
    expect(textInk(plain, '  ', 0, 0)).toBeNull();
  });

  it('grows by the outline all round and by the shadow only on the side it falls', () => {
    expect(textInk(decorated, 'A', 0, 0)).toEqual({ x: -1, y: -1, w: 6, h: 7 });
    expect(textInk(decorated, 'AA', 10, 0, { align: 'right' })?.x).toBe(10 - 7 - 1);
  });

  describe('against what drawText paints', () => {
    beforeAll(() => vi.stubGlobal('document', { createElement: () => new RasterCanvas() }));
    afterAll(() => vi.unstubAllGlobals());

    it.each([
      ['plain', plain],
      ['decorated', decorated],
    ])('covers exactly the pixels a %s style paints', (_, style) => {
      for (const [text, align] of [
        ['A?', 'left'],
        [' ?A\nA', 'center'],
        ['?', 'right'],
      ] as const) {
        const ctx = rasterContext(40, 20);
        drawText(ctx as unknown as CanvasRenderingContext2D, style, text, 20, 6, { align });
        expect(textInk(style, text, 20, 6, { align }), JSON.stringify(text)).toEqual(ctx.paintedBounds());
      }
    });
  });
});
