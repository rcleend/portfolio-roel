import { describe, expect, it } from 'vitest';
import { fitContentRect, type UvRect, uvToNativePixel } from './screenMapping';

const FULL: UvRect = { minU: 0, minV: 0, maxU: 1, maxV: 1 };
const SIZE = { width: 320, height: 240 };

describe('fitContentRect', () => {
  it('returns the aperture when aspects already match and there is no inset', () => {
    expect(fitContentRect(FULL, 4 / 3, 4 / 3, 0)).toEqual(FULL);
  });

  it('pillarboxes content inside a wider aperture', () => {
    const rect = fitContentRect(FULL, 2, 4 / 3, 0);
    expect(rect.minV).toBe(0);
    expect(rect.maxV).toBe(1);
    expect(rect.maxU - rect.minU).toBeCloseTo(2 / 3);
    expect((rect.minU + rect.maxU) / 2).toBeCloseTo(0.5);
  });

  it('letterboxes content inside a taller aperture and applies the inset', () => {
    const rect = fitContentRect(FULL, 1, 4 / 3, 0.1);
    expect(rect.minU).toBeCloseTo(0.1);
    expect(rect.maxU).toBeCloseTo(0.9);
    // Physical height = 0.8 / (4/3) = 0.6, centred.
    expect(rect.maxV - rect.minV).toBeCloseTo(0.6);
    expect((rect.minV + rect.maxV) / 2).toBeCloseTo(0.5);
  });
});

describe('uvToNativePixel', () => {
  const content: UvRect = { minU: 0.125, minV: 0.25, maxU: 0.875, maxV: 0.75 };

  it('maps the content corners to the first and last pixels without flipping', () => {
    expect(uvToNativePixel(0.125, 0.25, content, SIZE)).toEqual({ x: 0, y: 0 });
    expect(uvToNativePixel(0.8749, 0.7499, content, SIZE)).toEqual({ x: 319, y: 239 });
  });

  it('maps v downwards, because glTF screen UVs put v = 0 at the top edge', () => {
    expect(uvToNativePixel(0.5, 0.26, content, SIZE)?.y).toBeLessThan(10);
    expect(uvToNativePixel(0.5, 0.74, content, SIZE)?.y).toBeGreaterThan(230);
  });

  it('maps the centre to the centre pixel', () => {
    expect(uvToNativePixel(0.5, 0.5, content, SIZE)).toEqual({ x: 160, y: 120 });
  });

  it('returns null on the tube border outside the picture', () => {
    expect(uvToNativePixel(0.05, 0.5, content, SIZE)).toBeNull();
    expect(uvToNativePixel(0.5, 0.75, content, SIZE)).toBeNull();
  });

  it('clamps to the nearest edge pixel when asked', () => {
    expect(uvToNativePixel(0.0, 0.95, content, SIZE, true)).toEqual({ x: 0, y: 239 });
  });
});
