import { describe, expect, it } from 'vitest';
import { type GlassPixel, glassLayerPixel, paintGlassLayer } from './glassLayer';

/** Luminance of a mid-grey picture with the glass finish composited over it ("source-over"). */
function over(pixel: GlassPixel, under = 0.5): number {
  const [r, g, b, a] = pixel;
  const colour = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return under * (1 - a) + colour * a;
}

const grid = (steps: number): number[] => Array.from({ length: steps + 1 }, (_, i) => i / steps);

describe('glassLayerPixel', () => {
  it('stays a faint finish everywhere: an 18 % shadow under a 5 % sheen at most', () => {
    for (const u of grid(40)) {
      for (const v of grid(40)) {
        for (const channel of glassLayerPixel(u, v)) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
        expect(glassLayerPixel(u, v)[3]).toBeLessThanOrEqual(1 - (1 - 0.234) * (1 - 0.065) + 1e-9);
      }
    }
  });

  it('is a pure function of the texture coordinate', () => {
    expect(glassLayerPixel(0.31, 0.77)).toEqual(glassLayerPixel(0.31, 0.77));
  });

  it('darkens the corners more than the middles of the edges, and those more than the centre', () => {
    const centre = over(glassLayerPixel(0.5, 0.5));
    const edges = [
      [0.5, 0],
      [1, 0.5],
      [0.5, 1],
      [0, 0.5],
    ].map(([u, v]) => over(glassLayerPixel(u as number, v as number)));
    const corners = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ].map(([u, v]) => over(glassLayerPixel(u as number, v as number)));
    for (const edge of edges) expect(edge).toBeLessThan(centre);
    for (const corner of corners) expect(corner).toBeLessThan(Math.min(...edges));
  });

  it('leaves the central 70 % to the lamp sheen alone: warm, never above 5 %', () => {
    for (const u of grid(20).map((t) => 0.15 + 0.7 * t)) {
      for (const v of grid(20).map((t) => 0.15 + 0.7 * t)) {
        const [r, g, b, a] = glassLayerPixel(u, v);
        expect(a).toBeGreaterThan(0);
        expect(a).toBeLessThanOrEqual(0.065);
        expect([r, g, b].map((c) => Number(c.toFixed(9)))).toEqual([1, 0.96, 0.9]);
      }
    }
  });

  it('puts the sheen towards the top left, where the desk lamp is', () => {
    expect(glassLayerPixel(0.22, 0.16)[3]).toBeCloseTo(0.065, 9);
    expect(glassLayerPixel(0.22, 0.16)[3]).toBeGreaterThan(glassLayerPixel(0.78, 0.16)[3]);
  });
});

describe('paintGlassLayer', () => {
  it('fills every pixel from the pixel function at its centre', () => {
    const image = { width: 8, height: 6, data: new Uint8ClampedArray(8 * 6 * 4) };
    paintGlassLayer(image);
    const [r, g, b, a] = glassLayerPixel(0.5 / 8, 0.5 / 6);
    expect(Array.from(image.data.slice(0, 4))).toEqual([r, g, b, a].map((c) => Math.round(c * 255)));
    const last = (8 * 6 - 1) * 4;
    expect(image.data[last + 3]).toBe(Math.round((glassLayerPixel(7.5 / 8, 5.5 / 6)[3] as number) * 255));
  });

  it('paints the same pixels band by band as all at once', () => {
    const whole = { width: 8, height: 6, data: new Uint8ClampedArray(8 * 6 * 4) };
    paintGlassLayer(whole);
    const banded = { width: 8, height: 6, data: new Uint8ClampedArray(8 * 6 * 4) };
    paintGlassLayer(banded, 0, 4);
    expect(banded.data.slice(4 * 8 * 4).every((byte) => byte === 0)).toBe(true);
    paintGlassLayer(banded, 4, 10);
    expect(banded.data).toEqual(whole.data);
  });
});
