import { describe, expect, it } from 'vitest';
import { POINTER_ARROW, POINTER_ARROW_TIP } from './cursor';

describe('POINTER_ARROW', () => {
  it('is square and exactly mirror-symmetric about its 45° pointing axis, so it leans neither way', () => {
    const rows = POINTER_ARROW.map((row) => [...row]);
    for (const row of rows) expect(row).toHaveLength(rows.length);
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows.length; x++) expect(rows[y]?.[x], `(${x}, ${y})`).toBe(rows[x]?.[y]);
    }
  });

  it('points at its tip: the hotspot is the corner of its first pixel, an outline pixel', () => {
    expect(POINTER_ARROW_TIP).toEqual({ x: 0, y: 0 });
    expect(POINTER_ARROW[0]?.[0]).not.toBe('.');
  });
});
