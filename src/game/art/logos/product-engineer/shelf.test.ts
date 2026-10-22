import { describe, expect, it } from 'vitest';
import type { Bitmap } from '../raster/Bitmap';
import { setLettering } from './lettering';
import { buildRaisedTopLine, buildTitleLogo } from './logo';
import { paintLettering } from './paint';

const RAISED = { x: 1.5, y: 1.5 } as const;

/** The first and last column `image` paints in row `y`, or `null` when the row is empty. */
function paintedSpan(image: Bitmap, y: number): [number, number] | null {
  let span: [number, number] | null = null;
  for (let x = 0; x < image.width; x++) {
    if (image.isOpaque(x, y)) span = [span ? span[0] : x, x];
  }
  return span;
}

describe('raised initial', () => {
  const plain = setLettering('PRO', { height: 44, seed: 7 });
  const raised = setLettering('PRO', { height: 44, seed: 7, initial: RAISED });

  it('stands on the baseline and rises above the cap line by its extra height', () => {
    expect(plain.initial).toBeNull();
    expect(raised.initial?.height).toBe(66);
    expect(raised.origin.y - plain.origin.y).toBe(66 - 44);
    const ink = raised.face.bounds();
    const initialInk = raised.initial?.face.bounds();
    expect(ink?.y).toBe(initialInk?.y);
    expect(raised.origin.y - (initialInk?.y ?? 0)).toBeGreaterThanOrEqual(66 - 44 - 2);
    // Above the rest of the line, every pixel is the initial's.
    for (let y = 0; y < raised.origin.y - 2; y++) {
      for (let x = 0; x < raised.face.width; x++) {
        if (raised.face.has(x, y)) expect(raised.initial?.face.has(x, y)).toBe(true);
      }
    }
  });

  it('widens the letter and moves the rest of the word along, without changing its letters', () => {
    const [plainP, plainR] = plain.letters;
    const [raisedP, raisedR] = raised.letters;
    expect(raisedP?.w).toBe(Math.round((plainP?.w ?? 0) * RAISED.x));
    expect((raisedR?.x ?? 0) - (plainR?.x ?? 0)).toBe((raisedP?.w ?? 0) - (plainP?.w ?? 0));
    expect(raisedR?.w).toBe(plainR?.w);
  });

  it('bands its paint over its own height, so it is as bright as its neighbours at the top and darker beside their tops', () => {
    const bitmap = paintLettering(raised, 7);
    const { initial, origin, letters } = raised;
    const second = letters[1];
    if (!initial || !second) throw new Error('expected a raised initial and a second letter');
    const greenness = (rows: readonly number[], inside: (x: number, y: number) => boolean): number => {
      let sum = 0;
      let count = 0;
      for (const y of rows) {
        for (let x = 0; x < bitmap.width; x++) {
          if (!inside(x, y)) continue;
          sum += bitmap.get(x, y)?.g ?? 0;
          count++;
        }
      }
      return sum / count;
    };
    const isInitial = (x: number, y: number): boolean => initial.face.has(x, y);
    const isRest = (x: number, y: number): boolean => raised.face.has(x, y) && !initial.face.has(x, y);
    const initialTop = (initial.face.bounds()?.y ?? 0) + 3;
    const capRows = [origin.y + 3, origin.y + 4, origin.y + 5, origin.y + 6];
    const topRows = capRows.map((y) => y - origin.y + initialTop);
    expect(Math.abs(greenness(topRows, isInitial) - greenness(capRows, isRest))).toBeLessThan(30);
    expect(greenness(capRows, isInitial)).toBeLessThan(greenness(capRows, isRest) - 15);
  });
});

describe('shelf', () => {
  const line = buildRaisedTopLine('Product Engineer', RAISED);
  const shelf = line.shelf;
  if (!shelf) throw new Error('a raised top line has a shelf');

  it('exists only beside a raised initial', () => {
    const { top, bottom } = buildTitleLogo('Product Engineer');
    expect(top.shelf).toBeNull();
    expect(bottom.shelf).toBeNull();
  });

  it("ends at the last letter's top-right corner on the cap line", () => {
    let corner = -1;
    for (let y = line.origin.y - 2; y <= line.origin.y + 2; y++) {
      for (let x = 0; x < line.shine.width; x++) if (line.shine.isOpaque(x, y)) corner = Math.max(corner, x);
    }
    expect(shelf.end).toBe(corner);
  });

  it('measures how far right the initial and its outline reach, and how high the rest of the line does', () => {
    const top = line.origin.y - 18;
    const bottom = line.origin.y - 4;
    // Only the initial is painted this high; its outline is the last column it paints.
    const reach = Math.max(
      ...Array.from({ length: bottom - top + 1 }, (_, i) => paintedSpan(line.image, top + i)?.[1] ?? -1),
    );
    expect(shelf.clearOf(top, bottom)).toBe(reach + 1);
    const clear = shelf.clearOf(top, bottom);
    let highest = line.image.height;
    for (let x = clear; x <= shelf.end; x++) {
      for (let y = 0; y < line.image.height; y++) {
        if (line.image.isOpaque(x, y)) {
          highest = Math.min(highest, y);
          break;
        }
      }
    }
    expect(shelf.floor(clear, shelf.end)).toBe(highest);
  });
});
