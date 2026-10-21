import { describe, expect, it } from 'vitest';
import {
  circle,
  displace,
  ellipse,
  empty,
  intersect,
  polygon,
  rect,
  rotate,
  roundedRect,
  scale,
  shear,
  stroke,
  subtract,
  translate,
  union,
} from './shape';

describe('primitive shapes', () => {
  it('treats rect as half-open, so adjacent boxes never overlap', () => {
    const box = rect(0, 0, 2, 2);
    expect(box(0, 0)).toBe(true);
    expect(box(1.9, 1.9)).toBe(true);
    expect(box(2, 1)).toBe(false);
    expect(box(1, 2)).toBe(false);
  });

  it('includes the boundary of ellipses and circles', () => {
    expect(ellipse(0, 0, 4, 2)(4, 0)).toBe(true);
    expect(ellipse(0, 0, 4, 2)(0, 2.1)).toBe(false);
    expect(circle(5, 5, 1)(5, 6)).toBe(true);
  });

  it('fills polygons with the even-odd rule', () => {
    const triangle = polygon([
      [0, 0],
      [10, 0],
      [0, 10],
    ]);
    expect(triangle(2, 2)).toBe(true);
    expect(triangle(8, 8)).toBe(false);
    expect(() => polygon([[0, 0]])).toThrow(RangeError);
  });

  it('rounds only the requested corners', () => {
    const tab = roundedRect(0, 0, 10, 10, [4, 0, 0, 0]);
    expect(tab(0.2, 0.2)).toBe(false);
    expect(tab(9.8, 0.2)).toBe(true);
    expect(tab(5, 5)).toBe(true);
  });

  it('strokes a segment with the given width', () => {
    const bar = stroke([0, 5], [10, 5], 2);
    expect(bar(5, 5.9)).toBe(true);
    expect(bar(5, 6.1)).toBe(false);
    expect(stroke([1, 1], [1, 1], 3)).toBe(empty);
  });
});

describe('combinators', () => {
  const a = rect(0, 0, 4, 4);
  const b = rect(2, 0, 6, 4);

  it('combines with union, intersect and subtract', () => {
    expect(union(a, b)(5, 1)).toBe(true);
    expect(intersect(a, b)(1, 1)).toBe(false);
    expect(intersect(a, b)(3, 1)).toBe(true);
    expect(subtract(a, b)(3, 1)).toBe(false);
    expect(subtract(a, b)(1, 1)).toBe(true);
  });

  it('moves and scales shapes', () => {
    expect(translate(a, 10, 0)(11, 1)).toBe(true);
    expect(scale(a, 2, 1)(7, 1)).toBe(true);
    expect(scale(a, 2, 1, [4, 0])(-3, 1)).toBe(true);
  });

  it('rotates clockwise about an origin', () => {
    const bar = rotate(rect(0, -1, 10, 1), Math.PI / 2, [0, 0]);
    expect(bar(0, 5)).toBe(true);
    expect(bar(5, 0)).toBe(false);
  });

  it('leans shapes right above the baseline and keeps the baseline in place', () => {
    const italic = shear(rect(0, 0, 2, 10), 0.5, 10);
    expect(italic(1, 9.9)).toBe(true);
    expect(italic(5.5, 0.1)).toBe(true);
    expect(italic(1, 0.1)).toBe(false);
  });

  it('samples through a displacement field', () => {
    const shifted = displace(a, () => [-10, 0]);
    expect(shifted(12, 1)).toBe(true);
    expect(shifted(1, 1)).toBe(false);
  });
});
