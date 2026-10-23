import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bandColors, parseHex } from './color';
import { type BandedGradient, bandAt, Gfx } from './Gfx';
import { RasterCanvas, rasterContext } from './testing';

beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => new RasterCanvas() });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('bandAt', () => {
  it.each<[string, BandedGradient, number, number]>([
    ['five dithered bands down a screen', { stops: ['#110e36', '#07061a'], bands: 5, dither: 'bayer2' }, 320, 240],
    [
      'bands across, with a wide dither ramp',
      { stops: ['#ff0000', '#0000ff'], bands: 4, dither: 'bayer4', direction: 'horizontal' },
      37,
      9,
    ],
    ['flat bands', { stops: ['#ffffff', '#000000', '#00ff00'], bands: 6 }, 5, 41],
    ['bands too thin for their dither ramp', { stops: ['#ffffff', '#000000'], bands: 5, dither: 'bayer4' }, 3, 11],
  ])('names the band fillRect paints at every pixel: %s', (_, gradient, w, h) => {
    const ctx = rasterContext(w, h);
    new Gfx(ctx as unknown as CanvasRenderingContext2D, w, h).fillRect(0, 0, w, h, gradient);
    const colors = bandColors(gradient.stops, gradient.bands).map(parseHex);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const { r, g, b } = colors[bandAt(gradient, w, h, x, y)] ?? { r: -1, g: -1, b: -1 };
        const i = (y * w + x) * 4;
        expect([...ctx.data.slice(i, i + 3)], `${x},${y}`).toEqual([r, g, b]);
      }
    }
  });
});
