import { describe, expect, it } from 'vitest';
import { baselineInLineBox, wrapLabel } from './text';

describe('baselineInLineBox', () => {
  it('centres the font box in the line box like CSS half-leading', () => {
    // Tahoma 11 px: ascent 11.06, descent 2.30 → the box is 13.36 tall in a 13 px line.
    expect(baselineInLineBox(13, 11.06, 2.3)).toBeCloseTo(10.88, 5);
    expect(baselineInLineBox(30, 11, 3)).toBe(19);
  });

  it('puts the baseline at the ascent when the line is exactly the font box', () => {
    expect(baselineInLineBox(14, 11, 3)).toBe(11);
  });
});

/** Every character is 6 px wide, so widths are easy to reason about. */
const measure = (text: string): number => text.length * 6;

describe('wrapLabel', () => {
  it('keeps a short label on one line', () => {
    expect(wrapLabel('Projects', 70, 2, measure)).toEqual(['Projects']);
  });

  it('breaks at spaces', () => {
    // 11 characters fit in 70 px, 15 in 90 px.
    expect(wrapLabel('My CV file', 70, 2, measure)).toEqual(['My CV file']);
    expect(wrapLabel('Leenders CV.pdf', 90, 2, measure)).toEqual(['Leenders CV.pdf']);
    expect(wrapLabel('Roel Leenders CV.pdf', 90, 2, measure)).toEqual(['Roel Leenders', 'CV.pdf']);
  });

  it('ends the last line with an ellipsis when the text does not fit', () => {
    expect(wrapLabel('Roel Leenders CV.pdf', 70, 2, measure)).toEqual(['Roel', 'Leenders C…']);
    const lines = wrapLabel('A very long label indeed', 70, 2, measure);
    expect(lines).toEqual(['A very long', 'label inde…']);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(70);
  });

  it('cuts a word wider than the line with an ellipsis', () => {
    expect(wrapLabel('Wastebasketeers', 60, 2, measure)).toEqual(['Wastebask…']);
    expect(wrapLabel('Wastebasketeers too', 60, 2, measure)).toEqual(['Wastebask…', 'too']);
  });

  it('returns nothing for an empty label', () => {
    expect(wrapLabel('  ', 70, 2, measure)).toEqual([]);
  });
});
