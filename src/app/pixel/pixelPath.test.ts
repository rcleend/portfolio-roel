import { describe, expect, it } from 'vitest';
import { discRows, pixelPath } from './pixelPath';

describe('pixelPath', () => {
  it('merges horizontal runs into rectangles', () => {
    expect(pixelPath(['##.#', '....', '.##.'])).toBe('M0 0h2v1h-2zM3 0h1v1h-1zM1 2h2v1h-2z');
  });

  it('draws nothing for an empty sprite', () => {
    expect(pixelPath(['...', ''])).toBe('');
  });
});

describe('discRows', () => {
  it('is symmetric and square', () => {
    const rows = discRows(4);
    expect(rows).toHaveLength(9);
    expect(rows.every((row) => row.length === 9)).toBe(true);
    expect(rows).toEqual([...rows].reverse());
    expect(rows[4]).toBe('#########');
    expect(rows[0]).toBe('  #####  ');
  });
});
