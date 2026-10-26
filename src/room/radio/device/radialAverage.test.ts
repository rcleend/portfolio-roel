import { describe, expect, it } from 'vitest';
import { radialAverage } from './radialAverage';

/** A label of concentric rings: opaque red inside half the radius, nothing (bare foil) outside. */
function ringImage(size: number) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const i = (y * size + x) * 4;
      if (r < 0.5) data.set([255, 0, 0, 255], i);
      else if (r < 0.75) data.set([255, 255, 255, 128], i);
    }
  }
  return { width: size, height: size, data };
}

describe('radialAverage', () => {
  it('averages each ring of a label: ink premultiplied by its coverage, and the coverage', () => {
    const row = radialAverage(ringImage(128), 64);
    expect(row).toHaveLength(64 * 4);
    // Inside: opaque red.
    expect([...row.slice(10 * 4, 10 * 4 + 4)]).toEqual([255, 0, 0, 255]);
    // Half-covered white: premultiplied in linear light, half coverage.
    const half = [...row.slice(40 * 4, 40 * 4 + 4)];
    expect(half[3]).toBeGreaterThanOrEqual(127);
    expect(half[3]).toBeLessThanOrEqual(129);
    expect(half[0]).toBeGreaterThan(180);
    expect(half[0]).toBeLessThan(190);
    // Bare foil beyond.
    expect([...row.slice(60 * 4, 60 * 4 + 4)]).toEqual([0, 0, 0, 0]);
  });

  it('is the same whichever way the label is turned', () => {
    const image = ringImage(64);
    const turned = { ...image, data: new Uint8ClampedArray(image.data.length) };
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++)
        turned.data.set(image.data.slice((x * 64 + y) * 4, (x * 64 + y) * 4 + 4), (y * 64 + x) * 4);
    expect([...radialAverage(turned, 32)]).toEqual([...radialAverage(image, 32)]);
  });
});
