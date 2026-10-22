import { describe, expect, it } from 'vitest';
import { CAP_HEIGHT } from './glyphs';
import { buildWordmark, LETTER_SPACING, WORDMARK_TEXT } from './wordmark';

describe('boot wordmark', () => {
  const mask = buildWordmark();

  it('spells ROEL about 145 px wide, with room for round-letter overshoot', () => {
    expect(WORDMARK_TEXT).toBe('ROEL');
    expect(mask.width).toBeGreaterThanOrEqual(140);
    expect(mask.width).toBeLessThanOrEqual(150);
    expect(mask.height).toBe(CAP_HEIGHT + 2);
    expect(mask.bounds()).toEqual({ x: 0, y: 0, w: mask.width, h: mask.height });
  });

  it('is high-contrast: stems are several times thicker than hairlines', () => {
    const rows = buildWordmark('L').toRows();
    // The L's stem stands alone in the middle row; its top serif is read down a column clear of the stem.
    const stem = [...(rows[Math.floor(rows.length / 2)] ?? '')].filter((pixel) => pixel === '#').length;
    const serif = rows.slice(0, CAP_HEIGHT / 2).filter((row) => row[13] === '#').length;
    expect(stem).toBe(7);
    expect(serif).toBeLessThanOrEqual(3);
  });

  it('sets every letter exactly as it is drawn alone, so none blurs or shifts in the word', () => {
    const rows = mask.toRows();
    let pen = 0;
    for (const letter of WORDMARK_TEXT) {
      const alone = buildWordmark(letter).toRows();
      const width = alone[0]?.length ?? 0;
      expect(rows.map((row) => row.slice(pen, pen + width))).toEqual(alone);
      pen += width + LETTER_SPACING;
    }
  });

  it('refuses characters it has no glyph for', () => {
    expect(() => buildWordmark('NEO·GEO')).toThrow(/no glyph for "N"/);
  });
});
