import { describe, expect, it } from 'vitest';
import { coverCrop, needsRepaint, paintPlaceholder, WALLPAPER_PLACEHOLDER, wallpaperSize } from './wallpaper';

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

describe('coverCrop', () => {
  it('crops a taller photograph top and bottom, centred, to fill a wider screen', () => {
    expect(coverCrop({ width: 1280, height: 1029 }, { width: 874, height: 687 })).toEqual({
      x: 0,
      y: expect.closeTo((1029 - 1280 / (874 / 687)) / 2, 6),
      w: 1280,
      h: expect.closeTo(1280 / (874 / 687), 6),
    });
  });

  it('crops the sides for a screen narrower than the photograph', () => {
    const crop = coverCrop({ width: 1280, height: 1029 }, { width: 400, height: 400 });
    expect(crop.h).toBe(1029);
    expect(crop.w).toBeCloseTo(1029, 6);
    expect(crop.x).toBeCloseTo((1280 - 1029) / 2, 6);
    expect(crop.y).toBe(0);
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
