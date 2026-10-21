import { describe, expect, it } from 'vitest';
import { CAP_HEIGHT } from './glyphs';
import { buildWordmark, WORDMARK_TEXT } from './wordmark';

describe('REO·LEO wordmark', () => {
  const mask = buildWordmark();

  it('is about 230 px wide with room for round-letter overshoot', () => {
    expect(WORDMARK_TEXT).toBe('REO·LEO');
    expect(mask.width).toBeGreaterThanOrEqual(220);
    expect(mask.width).toBeLessThanOrEqual(240);
    expect(mask.height).toBe(CAP_HEIGHT + 2);
    expect(mask.bounds()).toEqual({ x: 0, y: 0, w: mask.width, h: mask.height });
  });

  it('is high-contrast: stems are several times thicker than hairlines', () => {
    const rows = mask.toRows();
    const middle = rows[Math.floor(mask.height / 2)] ?? '';
    const topArm = rows[2] ?? '';
    // The R's stem through the middle row versus the E's top arm read down its stem column.
    expect(middle.slice(0, 12)).toContain('#######');
    const eStemColumn = topArm.indexOf('#', 40);
    const armThickness = rows.slice(1, 8).filter((row) => row[eStemColumn + 12] === '#').length;
    expect(armThickness).toBeLessThanOrEqual(3);
  });

  it('draws both Os identically', () => {
    const rows = mask.toRows();
    const lastO = rows.map((row) => row.slice(-39));
    const firstOStart = rows[0]?.indexOf('#') ?? -1;
    const firstO = rows.map((row) => row.slice(firstOStart - 15, firstOStart + 24));
    expect(firstO).toEqual(lastO);
  });

  it('refuses characters it has no glyph for', () => {
    expect(() => buildWordmark('NEO·GEO')).toThrow(/no glyph for "N"/);
  });
});
