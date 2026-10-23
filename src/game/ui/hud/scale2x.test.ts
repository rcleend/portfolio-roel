import { describe, expect, it } from 'vitest';
import { scale2x } from './scale2x';

describe('scale2x', () => {
  it('doubles a block, rounding its outer corners', () => {
    expect(scale2x(['##', '##'])).toEqual(['.##.', '####', '####', '.##.']);
  });

  it('joins a diagonal into a smooth stroke instead of 2 × 2 stair steps', () => {
    expect(scale2x(['#.', '.#'])).toEqual(['##..', '###.', '.###', '..##']);
  });

  it('keeps straight strokes straight and empty glyphs empty', () => {
    expect(scale2x(['###'])).toEqual(['######', '######']);
    expect(scale2x(['..'])).toEqual(['....', '....']);
  });
});
