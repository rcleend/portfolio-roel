import { describe, expect, it } from 'vitest';
import { meanLight } from './tubeLight';

const pixels = (...colours: readonly (readonly [number, number, number])[]): number[] =>
  colours.flatMap(([r, g, b]) => [r, g, b, 255]);

/** A display value (0–255) as the still's drawing wants it: `--tube` to the power of its response. */
const bent = (value: number): number => Math.round(255 * (value / 255) ** 1.45);

describe('meanLight', () => {
  it('keeps black black and white white, and bends a flat picture to the still’s response', () => {
    expect(meanLight(pixels([0, 0, 0], [0, 0, 0]))).toBe('rgb(0 0 0)');
    expect(meanLight(pixels([255, 255, 255]))).toBe('rgb(255 255 255)');
    // The still's build measured a mid grey picture as about rgb(89 88 107) on the lip, blue lifted by the lip's paint.
    expect(meanLight(pixels([128, 128, 128]))).toBe(`rgb(${bent(128)} ${bent(128)} ${bent(128)})`);
    expect(bent(128)).toBeGreaterThan(88);
    expect(bent(128)).toBeLessThan(96);
    expect(meanLight(pixels([42, 80, 180], [42, 80, 180]))).toBe(`rgb(${bent(42)} ${bent(80)} ${bent(180)})`);
  });

  it('averages light, not sRGB values: half white on black is far brighter than mid grey', () => {
    // The linear mean 0.5 is sRGB 188 (163 once bent); the mean of the bytes would be 128 (94).
    expect(meanLight(pixels([255, 255, 255], [0, 0, 0]))).toBe('rgb(163 163 163)');
    const [red, green, blue] = (
      meanLight(pixels([255, 0, 0], [0, 0, 255], [0, 0, 0], [0, 0, 0])).match(/\d+/g) ?? []
    ).map(Number);
    // A quarter of full red is sRGB 137, bent to 104.
    expect([red, green, blue]).toEqual([104, 0, 104]);
  });
});
