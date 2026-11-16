import { describe, expect, it } from 'vitest';
import { POSTERS_2K_MIN_FOCAL_PX, posterTier, roomFocalPx } from './posterTier';

const desktop = { width: 1440, height: 900, pixelRatio: 1, deviceMemory: 8, softwareGpu: false };

describe('posterTier', () => {
  it('measures the room view focal length in drawing-buffer pixels', () => {
    // 16:10 keeps the 64° base field: 900 / (2 · tan 32°).
    expect(roomFocalPx(1440, 900, 1)).toBeCloseTo(900 / (2 * Math.tan((32 * Math.PI) / 180)), 6);
    expect(roomFocalPx(1440, 900, 2)).toBeCloseTo(2 * roomFocalPx(1440, 900, 1), 6);
  });

  it('gives the 2K from the 505 px focal length up', () => {
    // At 16:10 the focal length is 0.8002 × the buffer height: find the heights either side of the boundary.
    const at = (height: number) => ({ ...desktop, width: height * 1.6, height });
    let height = 900;
    while (roomFocalPx(height * 1.6, height, 1) >= POSTERS_2K_MIN_FOCAL_PX) height--;
    expect(posterTier(at(height))).toBe('1k');
    expect(posterTier(at(height + 1))).toBe('2k');
    expect(posterTier(desktop)).toBe('2k');
  });

  it('gives a phone the 2K at its pixel ratio and the 1K at 1×', () => {
    const phone = { ...desktop, width: 375, height: 667, pixelRatio: 2 };
    expect(posterTier(phone)).toBe('2k');
    expect(posterTier({ ...phone, pixelRatio: 1 })).toBe('1k');
  });

  it('keeps the 1K for small memory and a software GPU', () => {
    expect(posterTier({ ...desktop, deviceMemory: 2 })).toBe('1k');
    expect(posterTier({ ...desktop, deviceMemory: 4 })).toBe('2k');
    expect(posterTier({ ...desktop, deviceMemory: undefined })).toBe('2k');
    expect(posterTier({ ...desktop, softwareGpu: true })).toBe('1k');
  });
});
