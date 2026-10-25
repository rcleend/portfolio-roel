import { describe, expect, it } from 'vitest';
import { Bitmap } from './Bitmap';
import { Mask } from './Mask';

describe('Bitmap', () => {
  it('starts transparent and stores RGBA per pixel', () => {
    const bitmap = new Bitmap(2, 1);
    expect(bitmap.isOpaque(0, 0)).toBe(false);
    bitmap.set(1, 0, { r: 1, g: 2, b: 3, a: 255 });
    expect(bitmap.get(1, 0)).toEqual({ r: 1, g: 2, b: 3, a: 255 });
    expect(bitmap.data.slice(4, 8)).toEqual(new Uint8ClampedArray([1, 2, 3, 255]));
  });

  it('ignores writes outside and reads null there', () => {
    const bitmap = new Bitmap(1, 1);
    bitmap.set(5, 5, { r: 9, g: 9, b: 9, a: 255 });
    expect(bitmap.get(5, 5)).toBeNull();
    expect(() => new Bitmap(0, 4)).toThrow(RangeError);
  });

  it('bounds what it paints, transparent margins left out', () => {
    const bitmap = new Bitmap(5, 4);
    expect(bitmap.bounds()).toBeNull();
    bitmap.set(1, 2, { r: 0, g: 0, b: 0, a: 255 });
    bitmap.set(3, 1, { r: 0, g: 0, b: 0, a: 255 });
    expect(bitmap.bounds()).toEqual({ x: 1, y: 1, w: 3, h: 2 });
  });

  it('fills a mask with a colour or a per-pixel paint, at an offset', () => {
    const bitmap = new Bitmap(3, 1);
    const mask = Mask.fromRows(['#.#']);
    bitmap.fill(mask, '#ff0000');
    expect(bitmap.get(0, 0)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(bitmap.isOpaque(1, 0)).toBe(false);

    bitmap.fill(Mask.fromRows(['#']), (x) => (x === 1 ? { r: 0, g: 0, b: 255, a: 255 } : null), 1, 0);
    expect(bitmap.get(1, 0)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
  });
});
