import { describe, expect, it } from 'vitest';
import { wantsSkin } from './deviceTier';

const capable = { bodyWidthCss: 600, pixelRatio: 2, deviceMemory: 8, saveData: false, slow: false };

describe('device tiers', () => {
  it('uses the 2K skin only where the radio is seen sharper than the 1K atlas resolves, and it fits', () => {
    expect(wantsSkin(capable)).toBe(true);
    expect(wantsSkin({ ...capable, deviceMemory: undefined })).toBe(true);
    // An old 1366 × 768 laptop at DPR 1 sees the body about 600 px wide: the 1K panel smears there.
    expect(wantsSkin({ ...capable, pixelRatio: 1 })).toBe(true);
    // Only a radio drawn hardly larger than the 1K panel's own texels keeps the 1K atlas.
    expect(wantsSkin({ ...capable, bodyWidthCss: 150, pixelRatio: 2 })).toBe(false);
    expect(wantsSkin({ ...capable, bodyWidthCss: 320, pixelRatio: 1 })).toBe(true);
    expect(wantsSkin({ ...capable, deviceMemory: 2 })).toBe(false);
    expect(wantsSkin({ ...capable, saveData: true })).toBe(false);
    expect(wantsSkin({ ...capable, slow: true })).toBe(false);
  });
});
