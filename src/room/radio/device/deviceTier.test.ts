import { describe, expect, it } from 'vitest';
import { flightMedian, isSlow, wantsSkin } from './deviceTier';

const capable = { bodyWidthCss: 800, pixelRatio: 2, deviceMemory: 8, saveData: false, slow: false };

describe('device tiers', () => {
  it('uses the 2K skin only where the radio is seen sharper than the 1K atlas resolves, and it fits', () => {
    expect(wantsSkin(capable)).toBe(true);
    expect(wantsSkin({ ...capable, deviceMemory: undefined })).toBe(true);
    expect(wantsSkin({ ...capable, pixelRatio: 1 })).toBe(false);
    expect(wantsSkin({ ...capable, deviceMemory: 2 })).toBe(false);
    expect(wantsSkin({ ...capable, saveData: true })).toBe(false);
    expect(wantsSkin({ ...capable, slow: true })).toBe(false);
  });

  it('takes the median frame of the first flight, from its second frame, with at least ten', () => {
    const steady = Array.from({ length: 20 }, (_, i) => i * 16);
    expect(flightMedian(steady)).toBe(16);
    expect(flightMedian(steady.slice(0, 11))).toBeNull();
    // A slow first frame (shader warm-up) is ignored.
    expect(flightMedian([0, 200, ...Array.from({ length: 12 }, (_, i) => 216 + i * 16)])).toBe(16);
  });

  it('is slow on software renderers or when the first flight could not keep up', () => {
    expect(isSlow('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))', null)).toBe(true);
    expect(isSlow('llvmpipe (LLVM 15.0.7, 256 bits)', null)).toBe(true);
    expect(isSlow('Microsoft Basic Render Driver', null)).toBe(true);
    expect(isSlow('ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro)', null)).toBe(false);
    expect(isSlow(null, null)).toBe(false);
    const slowFlight = Array.from({ length: 30 }, (_, i) => i * 40);
    expect(isSlow(null, slowFlight)).toBe(true);
    expect(
      isSlow(
        null,
        Array.from({ length: 30 }, (_, i) => i * 20),
      ),
    ).toBe(false);
  });
});
