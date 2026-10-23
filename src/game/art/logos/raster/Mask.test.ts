import { describe, expect, it } from 'vitest';
import { Mask } from './Mask';
import { rect } from './shape';

describe('Mask', () => {
  it('rasterises shapes at pixel centres', () => {
    const mask = Mask.fromShape(4, 3, rect(1, 0, 3, 2));
    expect(mask.toRows()).toEqual(['.##.', '.##.', '....']);
    expect(mask.count()).toBe(4);
  });

  it('round-trips rows and pads ragged input', () => {
    const mask = Mask.fromRows(['#.', '.##']);
    expect(mask.toRows()).toEqual(['#..', '.##']);
    expect(mask.has(-1, 0)).toBe(false);
    expect(mask.has(3, 0)).toBe(false);
  });

  it('rejects invalid sizes', () => {
    expect(() => new Mask(0, 1)).toThrow(RangeError);
    expect(() => new Mask(2, 2, new Uint8Array(3))).toThrow(RangeError);
  });

  it('unions, subtracts and intersects with an offset', () => {
    const a = Mask.fromRows(['##..', '##..']);
    const b = Mask.fromRows(['##', '##']);
    expect(a.union(b, 2, 0).toRows()).toEqual(['####', '####']);
    expect(a.subtract(b, 1, 0).toRows()).toEqual(['#...', '#...']);
    expect(a.intersect(b, 1, 1).toRows()).toEqual(['....', '.#..']);
  });

  it('dilates into all eight neighbours and derives a 1 px outline', () => {
    const dot = Mask.fromRows(['...', '.#.', '...']);
    expect(dot.dilate().toRows()).toEqual(['###', '###', '###']);
    expect(dot.outline().toRows()).toEqual(['###', '#.#', '###']);
  });

  it('measures how deep each pixel lies inside the shape, capped', () => {
    const block = Mask.fromRows(['#####', '#####', '#####', '#####', '#####']);
    expect(Array.from(block.depths(9).slice(10, 15))).toEqual([1, 2, 3, 2, 1]);
    expect(Array.from(block.depths(2).slice(10, 15))).toEqual([1, 2, 2, 2, 1]);
    expect(Mask.fromRows(['#.']).depths(3)[1]).toBe(0);
  });

  it('finds bounds and crops to them', () => {
    const mask = Mask.fromRows(['....', '..#.', '.##.', '....']);
    const box = mask.bounds();
    expect(box).toEqual({ x: 1, y: 1, w: 2, h: 2 });
    expect(box && mask.crop(box).toRows()).toEqual(['.#', '##']);
    expect(new Mask(2, 2).bounds()).toBeNull();
  });
});
