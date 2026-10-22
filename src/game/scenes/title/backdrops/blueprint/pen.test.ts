import { describe, expect, it } from 'vitest';
import { glyphPixels } from './lettering';
import { box, circle, line, type PenCanvas, PenPath, type Point, polyline } from './pen';

/** A canvas that remembers which pixels each rectangle covered, and in what colour. */
function pixelCanvas(): PenCanvas & { readonly pixels: Map<string, string> } {
  const pixels = new Map<string, string>();
  const canvas = {
    pixels,
    fillStyle: '' as PenCanvas['fillStyle'],
    fillRect(x: number, y: number, w: number, h: number): void {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) pixels.set(`${i},${j}`, String(canvas.fillStyle));
    },
  };
  return canvas;
}

const key = ([x, y]: Point): string => `${x},${y}`;
const neighbours = (a: Point, b: Point): boolean => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1;
const connected = (points: readonly Point[]): boolean =>
  points.every((point, i) => i === 0 || neighbours(points[i - 1] as Point, point));

describe('pen strokes', () => {
  it('draw lines end to end as 8-connected pixels', () => {
    const points = line([0, 0], [7, -3]);
    expect(points[0]).toEqual([0, 0]);
    expect(points.at(-1)).toEqual([7, -3]);
    expect(points).toHaveLength(8);
    expect(connected(points)).toBe(true);
  });

  it('turn polyline corners without inking them twice', () => {
    const points = polyline([0, 0], [4, 0], [4, 3], [0, 3]);
    expect(points).toHaveLength(5 + 3 + 4);
    expect(new Set(points.map(key)).size).toBe(points.length);
    expect(connected(points)).toBe(true);
  });

  it('close a box one pixel short of where it began', () => {
    const points = box(2, 3, 6, 4);
    expect(points).toHaveLength(2 * (6 + 4) - 4);
    expect(new Set(points.map(key)).size).toBe(points.length);
    expect(neighbours(points.at(-1) as Point, points[0] as Point)).toBe(true);
  });

  it('draw circles like a compass: from the top, clockwise, gap-free and on the radius', () => {
    const points = circle(10, 10, 6);
    expect(points[0]).toEqual([10, 4]);
    expect((points[1] as Point)[0]).toBeGreaterThan(10);
    expect(new Set(points.map(key)).size).toBe(points.length);
    expect(connected(points)).toBe(true);
    for (const [x, y] of points) expect(Math.abs(Math.hypot(x - 10, y - 10) - 6)).toBeLessThan(0.75);
  });
});

describe('PenPath', () => {
  const strokes = [box(0, 0, 9, 6), line([2, 2], [6, 4]), circle(20, 5, 4), glyphPixels('SHIP', 30, 0)];
  const path = new PenPath(strokes);
  const order = strokes.flat();

  it('inks exactly the first pixels in pen order, however far it has got', () => {
    for (let count = 0; count <= path.length; count++) {
      const canvas = pixelCanvas();
      path.ink(canvas, count, '#7fb2e8');
      expect(new Set(canvas.pixels.keys())).toEqual(new Set(order.slice(0, count).map(key)));
    }
  });

  it('merges straight runs, so a whole drawing costs far fewer rectangles than pixels', () => {
    expect(path.length).toBe(order.length);
    expect(path.runCount).toBeLessThan(path.length / 2);
    expect(new PenPath([box(0, 0, 20, 10)]).runCount).toBe(4);
  });

  it('inks in the colour it is given and reads back its pixels in pen order', () => {
    const canvas = pixelCanvas();
    path.ink(canvas, path.length, '#d8eeff');
    expect(new Set(canvas.pixels.values())).toEqual(new Set(['#d8eeff']));
    order.forEach(([x, y], i) => {
      expect([path.x(i), path.y(i)]).toEqual([x, y]);
    });
  });
});
