import { describe, expect, it } from 'vitest';
import { DISC_FRAGMENT, DISC_VERTEX, grating, spectral } from './discShader';

const unit = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

describe('the disc shader', () => {
  it('maps the visible spectrum into 0–1 and nothing outside 400–700 nm', () => {
    for (let nm = 300; nm <= 800; nm += 1) {
      const colour = spectral(nm);
      for (const channel of colour) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
      if (nm < 400 || nm > 700) expect(colour).toEqual([0, 0, 0]);
    }
    // Blue at the short end, red at the long end.
    expect(spectral(450)[2]).toBeGreaterThan(spectral(450)[0]);
    expect(spectral(650)[0]).toBeGreaterThan(spectral(650)[2]);
  });

  it('diffracts only inside the lobe where the half vector lies in the plane of the normal and the tracks', () => {
    const n: [number, number, number] = [0, 0, 1];
    const r: [number, number, number] = [1, 0, 0];
    // View and light in the x–z plane: in the lobe, coloured for first order around λ = 1600 |r·(v+l)|.
    const v = unit([0.15, 0, 1]);
    const l = unit([0.15, 0, 1]);
    const inLobe = grating(n, r, v, l);
    expect(Math.max(...inLobe)).toBeGreaterThan(0.1);
    // Tilted out of that plane: no colour.
    const out = grating(n, r, unit([0, 0.6, 1]), unit([0, 0.6, 1]));
    expect(Math.max(...out)).toBeLessThan(1e-6);
  });

  it('colours a grazing lamp on the label side only in the third order', () => {
    const n: [number, number, number] = [0, 0, 1];
    const r: [number, number, number] = [-1, 0, 0];
    // The lamp low to the left, the eye in front: |r·(v+l)| ≈ 0.98, beyond the first two orders.
    const v = unit([0, 0, 1]);
    const l = unit([-0.98, 0, 0.2]);
    expect(Math.max(...grating(n, r, v, l))).toBeLessThan(1e-6);
    expect(Math.max(...grating(n, r, v, l, 3))).toBeGreaterThan(0.1);
  });

  it('is one program: plain GLSL with no per-disc defines', () => {
    expect(DISC_FRAGMENT).not.toMatch(/#ifdef|#if defined/);
    expect(DISC_VERTEX).toContain('attribute float face');
    expect(DISC_FRAGMENT).toContain('#include <colorspace_fragment>');
  });
});
