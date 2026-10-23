import { describe, expect, it } from 'vitest';
import type { Bitmap } from '../../../../art/logos/raster/Bitmap';
import { TITLE_LAYOUT } from '../../layout';
import { BARS, CHART } from './layout';
import { glassLevels, hazeLevel, paintFrame, paintGlass } from './tube';

const { width, height } = TITLE_LAYOUT.screen;

function brightness(bitmap: Bitmap, x: number, y: number): number {
  const pixel = bitmap.get(x, y);
  return pixel ? pixel.r + pixel.g + pixel.b : 0;
}

describe('the glass', () => {
  const levels = glassLevels(width, height);

  it('glows brightest behind the logo and darkens towards the corners and the ticker', () => {
    const logo = hazeLevel(158, 82);
    for (const [x, y] of [
      [0, 0],
      [319, 0],
      [0, 239],
      [319, 239],
      [160, 230],
    ] as const) {
      expect(hazeLevel(x, y)).toBeLessThan(logo - 3);
    }
    // Nearly as bright at the logo's ends as at its middle, so every letter sits on the haze.
    expect(hazeLevel(10, 82)).toBeGreaterThan(logo - 3);
    expect(hazeLevel(305, 82)).toBeGreaterThan(logo - 3);
  });

  it('is cut into flat bands, every other row a level lower', () => {
    expect(new Set(levels).size).toBeLessThanOrEqual(12);
    expect(levels[121 * width + 158]).toBe((levels[120 * width + 158] ?? 0) - 1);
  });

  it('paints the same pixels every time, brighter when overdriven', () => {
    const rest = paintGlass(levels, width, height);
    expect(paintGlass(glassLevels(width, height), width, height).data).toEqual(rest.data);
    const hot = paintGlass(levels, width, height, 3);
    expect(brightness(hot, 158, 82)).toBeGreaterThan(brightness(rest, 158, 82));
    expect(rest.isOpaque(0, 0) && rest.isOpaque(width - 1, height - 1)).toBe(true);
  });
});

describe('the chart frame', () => {
  const frame = paintFrame(width, height);

  it('keeps its grid inside the chart, clear of the rows the prompt and the copyright print on', () => {
    for (let y = CHART.bottom + 1; y < BARS.floor + 1; y++) {
      for (let x = 0; x < width; x++) expect(frame.isOpaque(x, y), `${x}, ${y}`).toBe(false);
    }
    for (let y = BARS.floor + 2; y < 228; y++) {
      for (let x = 0; x < width; x++) expect(frame.isOpaque(x, y), `${x}, ${y}`).toBe(false);
    }
  });

  it('draws its y axis and floor, but not its ceiling, which the backdrop draws live so it can break', () => {
    expect(frame.isOpaque(CHART.left, 100)).toBe(true);
    expect(frame.isOpaque(200, CHART.bottom)).toBe(true);
    expect(frame.isOpaque(200, CHART.top)).toBe(false);
  });

  it('paints the same pixels every time', () => {
    expect(paintFrame(width, height).data).toEqual(frame.data);
  });
});
