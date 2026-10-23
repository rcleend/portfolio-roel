import { describe, expect, it } from 'vitest';
import { draftingType, glyphPixels, LETTER_HEIGHT, letteredWidth } from './lettering';

/** Everything the blueprint letters: the dimensions, the drawings' labels and the zone margin. */
const LETTERED = 'IDEA ? SHIP NO 375 Ø31 0123456789 ABCDEF';

describe('drafting lettering', () => {
  it('has a glyph for every character the blueprint letters', () => {
    const font = draftingType();
    for (const char of LETTERED) expect(font.has(char), char).toBe(true);
  });

  it('stands 5 px tall, so it fits the 8 px margin', () => {
    expect(LETTER_HEIGHT).toBe(5);
    for (const [, y] of glyphPixels(LETTERED, 0, 0)) expect(y >= 0 && y < LETTER_HEIGHT).toBe(true);
  });

  it('writes column by column from the left, the way a plotter letters', () => {
    const columns = glyphPixels('IDEA', 3, 9).map(([x]) => x);
    expect(columns).toEqual([...columns].sort((a, b) => a - b));
    expect(Math.min(...columns)).toBe(3);
    expect(Math.max(...columns)).toBe(3 + letteredWidth('IDEA') - 1);
  });

  it('keeps 0 square and O round, so dimensions never read as letters', () => {
    expect(glyphPixels('0', 0, 0)).not.toEqual(glyphPixels('O', 0, 0));
  });
});
