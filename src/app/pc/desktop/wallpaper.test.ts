import { describe, expect, it } from 'vitest';
import { needsRepaint, paintWallpaper, wallpaperSize } from './wallpaper';

/** A 2D context that records every call and property write, gradients included. */
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

describe('paintWallpaper', () => {
  it('draws the same calls every time: the seed fixes the clouds and the grass', () => {
    const first = recordingContext();
    const second = recordingContext();
    paintWallpaper(first.context, 874, 687);
    paintWallpaper(second.context, 874, 687);
    expect(second.calls).toEqual(first.calls);
    expect(first.calls.length).toBeGreaterThan(400);
  });

  it('paints the same composition at any size', () => {
    const small = recordingContext();
    const large = recordingContext();
    paintWallpaper(small.context, 437, 343.5);
    paintWallpaper(large.context, 874, 687);
    const shape = (calls: readonly string[]) => calls.map((call) => call.replace(/\(.*\)| = .*/, ''));
    expect(shape(large.calls)).toEqual(shape(small.calls));
  });

  it('starts with the sky gradient from deep blue to the pale horizon', () => {
    const { context, calls } = recordingContext();
    paintWallpaper(context, 874, 687);
    expect(calls.slice(0, 5)).toEqual([
      'context.createLinearGradient(0.000000, 0.000000, 0.000000, 687.000000)',
      'gradient1.addColorStop(0.000000, #1b4fc4)',
      'gradient1.addColorStop(0.450000, #3a7fe0)',
      'gradient1.addColorStop(0.750000, #b9d8f4)',
      'context.fillStyle = gradient',
    ]);
  });

  it('puts every cloud puff inside the sky', () => {
    const { context, calls } = recordingContext();
    paintWallpaper(context, 1000, 800);
    const puffs = calls
      .filter((call) => call.startsWith('context.translate('))
      .map((call) => call.slice('context.translate('.length, -1).split(', ').map(Number));
    expect(puffs).toHaveLength(4 * 26 * 3);
    for (const [x, y] of puffs) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1000);
      expect(y).toBeLessThan(0.5 * 800);
    }
  });
});
