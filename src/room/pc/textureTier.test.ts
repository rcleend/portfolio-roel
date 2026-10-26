import { describe, expect, it } from 'vitest';
import { textureTier } from './textureTier';

/** pc-base.glb's glass, 0.356 × 0.284 m. */
const ASPECT = 1.2535;

describe('textureTier', () => {
  it.each([
    [300, 512],
    [600, 512],
    [601, 768],
    [900, 768],
    [901, 1024],
    [4000, 1024],
  ])('gives a glass %s render pixels wide a %s-pixel texture', (glass, width) => {
    expect(textureTier(glass, ASPECT).width).toBe(width);
  });

  it('matches the glass in aspect, at most 1024 × 817', () => {
    expect(textureTier(1408, ASPECT)).toEqual({ width: 1024, height: 817 });
    expect(textureTier(680, ASPECT)).toEqual({ width: 768, height: 613 });
    expect(textureTier(400, ASPECT)).toEqual({ width: 512, height: 408 });
  });

  it('caps the texture on devices reporting 2 GB of memory or less', () => {
    expect(textureTier(1408, ASPECT, 2).width).toBe(768);
    expect(textureTier(1408, ASPECT, 0.5).width).toBe(768);
    expect(textureTier(400, ASPECT, 1).width).toBe(512);
    expect(textureTier(1408, ASPECT, 4).width).toBe(1024);
    expect(textureTier(1408, ASPECT, undefined).width).toBe(1024);
  });
});
