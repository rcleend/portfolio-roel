import { describe, expect, it } from 'vitest';
import { containsPoint, intersection, intersects, rect } from './Rect';

describe('Rect', () => {
  it('treats touching edges as not intersecting', () => {
    expect(intersects(rect(0, 0, 10, 10), rect(10, 0, 5, 5))).toBe(false);
    expect(intersects(rect(0, 0, 10, 10), rect(9, 9, 5, 5))).toBe(true);
  });

  it('uses half-open containment', () => {
    const r = rect(0, 0, 4, 4);
    expect(containsPoint(r, 0, 0)).toBe(true);
    expect(containsPoint(r, 4, 0)).toBe(false);
  });

  it('computes the overlap', () => {
    expect(intersection(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toEqual(rect(5, 5, 5, 5));
    expect(intersection(rect(0, 0, 1, 1), rect(2, 2, 1, 1))).toBeNull();
  });
});
