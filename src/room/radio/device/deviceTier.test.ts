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
    // Which renderers are software is the stage's to know (softwareGpu.test.ts).
    expect(isSlow(true, null)).toBe(true);
    expect(isSlow(false, null)).toBe(false);
    const slowFlight = Array.from({ length: 30 }, (_, i) => i * 40);
    expect(isSlow(false, slowFlight)).toBe(true);
    expect(
      isSlow(
        false,
        Array.from({ length: 30 }, (_, i) => i * 20),
      ),
    ).toBe(false);
  });
});
