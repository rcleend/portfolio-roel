import { describe, expect, it } from 'vitest';
import { BitmapFont, BitmapFontError, type GlyphFontData, parseGlyphSheet } from './BitmapFont';

const data: GlyphFontData = {
  name: 'tiny',
  cellHeight: 3,
  ascent: 3,
  lineHeight: 4,
  letterSpacing: 1,
  spaceWidth: 2,
  glyphs: parseGlyphSheet(`
    = A
    .#.
    ###
    #.#

    = I
    #
    #
    #

    = ?
    ##
    .#
    #.
  `),
};

describe('parseGlyphSheet', () => {
  it('parses headers and rows, trimming indentation', () => {
    expect(data.glyphs.A).toEqual(['.#.', '###', '#.#']);
    expect(Object.keys(data.glyphs)).toEqual(['A', 'I', '?']);
  });

  it('rejects rows before a header and duplicate glyphs', () => {
    expect(() => parseGlyphSheet('##')).toThrow(BitmapFontError);
    expect(() => parseGlyphSheet('= A\n#\n\n= A\n#')).toThrow(/twice/);
  });
});

describe('BitmapFont.fromGlyphData', () => {
  const font = BitmapFont.fromGlyphData(data);

  it('measures with letter spacing between glyphs but not after the last', () => {
    expect(font.measure('A')).toBe(3);
    expect(font.measure('AI')).toBe(3 + 1 + 1);
    expect(font.measure('A I')).toBe(3 + 1 + 3 + 1);
    expect(font.measure('')).toBe(0);
  });

  it('falls back to "?" for missing glyphs', () => {
    expect(font.has('Z')).toBe(false);
    expect(font.glyph('Z')).toBe(font.glyph('?'));
  });

  it('stores 1-bit glyph bitmaps row-major', () => {
    expect([...font.glyph('A').bits]).toEqual([0, 1, 0, 1, 1, 1, 1, 0, 1]);
  });

  it('validates glyph shapes with helpful errors', () => {
    expect(() => BitmapFont.fromGlyphData({ ...data, glyphs: { ...data.glyphs, B: ['##', '#'] } })).toThrow(
      'Font "tiny": glyph "B" row 1 is 1 wide, expected 2',
    );
    expect(() => BitmapFont.fromGlyphData({ ...data, glyphs: { ...data.glyphs, B: ['#x'] } })).toThrow(
      /use "#" for ink/,
    );
    expect(() => BitmapFont.fromGlyphData({ ...data, glyphs: { ...data.glyphs, B: ['#', '#', '#', '#'] } })).toThrow(
      /4 rows, expected 1..3/,
    );
    const { '?': _missing, ...withoutFallback } = data.glyphs;
    expect(() => BitmapFont.fromGlyphData({ ...data, glyphs: withoutFallback })).toThrow(/fallback glyph "\?"/);
  });
});
