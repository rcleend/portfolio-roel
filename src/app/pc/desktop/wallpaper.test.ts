import { describe, expect, it } from 'vitest';
import { needsRepaint, paintPlaceholder, WALLPAPER_PLACEHOLDER, wallpaperSize } from './wallpaper';
import { paintWallpaperRows } from './wallpaperPicture';

/** A 2D context that records every call and property write. */
function recordingContext(): { readonly context: CanvasRenderingContext2D; readonly calls: string[] } {
  const calls: string[] = [];
  const recorder = (name: string): object =>
    new Proxy(
      {},
      {
        get: (_target, property) => {
          const method = `${name}.${String(property)}`;
          return (...args: unknown[]) => {
            calls.push(`${method}(${args.map(format).join(', ')})`);
            return method.endsWith('Gradient') ? recorder(`gradient${calls.length}`) : undefined;
          };
        },
        set: (_target, property, value: unknown) => {
          calls.push(`${name}.${String(property)} = ${format(value)}`);
          return true;
        },
      },
    );
  return { context: recorder('context') as CanvasRenderingContext2D, calls };
}

function format(value: unknown): string {
  return typeof value === 'number' ? value.toFixed(6) : typeof value === 'object' ? 'gradient' : String(value);
}

describe('wallpaperSize', () => {
  it('takes the requested width at the picture aspect', () => {
    expect(wallpaperSize(874, 874 / 687, 8)).toEqual({ width: 874, height: 687 });
  });

  it('caps the bitmap at one megapixel', () => {
    const size = wallpaperSize(1748, 1.272, 8);
    expect(size.width * size.height).toBeLessThanOrEqual(1_000_000 + size.width);
    expect(size.width / size.height).toBeCloseTo(1.272, 2);
    expect(wallpaperSize(1748, 1.272, undefined)).toEqual(size);
  });

  it('caps it at 0.6 megapixels on devices with 2 GB of memory or less', () => {
    const size = wallpaperSize(1748, 1.272, 2);
    expect(size.width * size.height).toBeLessThanOrEqual(600_000 + size.width);
    expect(size.width * size.height).toBeGreaterThan(590_000);
  });

  it('never shrinks to nothing', () => {
    expect(wallpaperSize(0, 1.25, 8)).toEqual({ width: 1, height: 1 });
  });
});

describe('needsRepaint', () => {
  it('repaints only for a request more than 1.3 × wider than the current bitmap', () => {
    expect(needsRepaint(800, { width: 1040, height: 818 })).toBe(false);
    expect(needsRepaint(800, { width: 1041, height: 819 })).toBe(true);
    expect(needsRepaint(800, { width: 400, height: 315 })).toBe(false);
  });
});

describe('paintPlaceholder', () => {
  it('fills the sky over the hill, edge to edge', () => {
    const { context, calls } = recordingContext();
    paintPlaceholder(context, 874, 687);
    const horizon = Math.round(WALLPAPER_PLACEHOLDER.horizon * 687);
    expect(calls).toEqual([
      `context.fillStyle = ${WALLPAPER_PLACEHOLDER.sky}`,
      `context.fillRect(0.000000, 0.000000, 874.000000, ${horizon.toFixed(6)})`,
      `context.fillStyle = ${WALLPAPER_PLACEHOLDER.grass}`,
      `context.fillRect(0.000000, ${horizon.toFixed(6)}, 874.000000, ${(687 - horizon).toFixed(6)})`,
    ]);
  });
});

describe('paintWallpaperRows', () => {
  const width = 160;
  const height = 128;
  const whole = new Uint8ClampedArray(width * height * 4);
  paintWallpaperRows(whole, width, height, 0, height);
  const at = (x: number, y: number): [number, number, number] => {
    const o = (y * width + x) * 4;
    return [whole[o] ?? 0, whole[o + 1] ?? 0, whole[o + 2] ?? 0];
  };
  /** The mean colour of a block of pixels. */
  const mean = (x0: number, y0: number, x1: number, y1: number): [number, number, number] => {
    let [r, g, b] = [0, 0, 0];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const colour = at(x, y);
        r += colour[0];
        g += colour[1];
        b += colour[2];
      }
    }
    const count = (x1 - x0) * (y1 - y0);
    return [r / count, g / count, b / count];
  };

  it('draws the same picture whatever bands its rows are drawn in, and in whatever order', () => {
    const banded = new Uint8ClampedArray(whole.length);
    for (const from of [77, 0, 30, 31, 100]) {
      const to = { 77: 100, 0: 30, 30: 31, 31: 77, 100: height + 5 }[from] ?? height;
      paintWallpaperRows(banded, width, height, from, to);
    }
    expect(Buffer.compare(Buffer.from(banded.buffer), Buffer.from(whole.buffer))).toBe(0);
  });

  it('fills every pixel, opaque', () => {
    for (let o = 3; o < whole.length; o += 4) if (whole[o] !== 255) throw new Error(`alpha ${whole[o]} at ${o}`);
  });

  it('is a blue sky, deeper overhead, over a green hill that is lit on the left and darker in front', () => {
    const [topR, topG, topB] = mean(0, 0, width, 6);
    expect(topB).toBeGreaterThan(topG);
    expect(topG).toBeGreaterThan(topR);
    const low = mean(0, 60, 16, 66);
    expect(low[0]).toBeGreaterThan(topR + 40);
    const lit = mean(20, 84, 50, 96);
    const shaded = mean(120, 110, 150, 122);
    for (const [r, g, b] of [lit, shaded]) {
      expect(g).toBeGreaterThan(r + 20);
      expect(g).toBeGreaterThan(b + 40);
    }
    expect(lit[1]).toBeGreaterThan(shaded[1] + 15);
  });

  it('dithers: a clear stretch of sky never holds a flat run of one value', () => {
    const top = Array.from({ length: width }, (_, x) => at(x, 0)[0]);
    let run = 1;
    let longest = 1;
    for (let x = 1; x < width; x++) {
      run = top[x] === top[x - 1] ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThan(8);
  });
});
