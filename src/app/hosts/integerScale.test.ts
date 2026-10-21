import { describe, expect, it } from 'vitest';
import { integerScale, toNativePixels } from './integerScale';

describe('integerScale', () => {
  it('picks the largest whole zoom that fits with the bezel', () => {
    expect(integerScale(1920, 1080, 320, 240)).toBe(3);
    expect(integerScale(2560, 1440, 320, 240)).toBe(5);
    expect(integerScale(1280, 800, 320, 240)).toBe(2);
  });

  it('never goes below 1', () => {
    expect(integerScale(200, 200, 320, 240)).toBe(1);
  });
});

describe('toNativePixels', () => {
  it('maps client coordinates through the displayed size', () => {
    expect(toNativePixels(160, 100, { left: 10, top: 40, width: 960, height: 720 }, 320, 240)).toEqual({
      x: 50,
      y: 20,
    });
  });
});
