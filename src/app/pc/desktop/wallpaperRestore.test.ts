// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onWallpaperPainted, paintWallpaperUnit, wallpaperCanvas } from './wallpaper';

describe('the wallpaper', () => {
  afterEach(() => vi.restoreAllMocks());

  // The picture is worked out a few rows at a time; until then the canvas holds the placeholder. A GPU process reset
  // (a laptop's sleep, a display change) gives the shared canvas back blank: the live desktop shows it, and the glass
  // is composed from it.
  it('shows its placeholder, then its picture, and paints either again in place when its canvas comes back', () => {
    const fills: unknown[] = [];
    const puts: ImageData[] = [];
    const context = {
      fillStyle: '',
      fillRect: () => fills.push(context.fillStyle),
      createImageData: (width: number, height: number) =>
        ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData,
      putImageData: (image: ImageData) => puts.push(image),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const painted = vi.fn();
    const stop = onWallpaperPainted(painted);
    const canvas = wallpaperCanvas(400, 4 / 3);
    expect(fills).toHaveLength(2);

    // Lost before the picture is done: the placeholder again.
    canvas.dispatchEvent(new Event('contextrestored'));
    expect(fills).toHaveLength(4);
    expect(painted).toHaveBeenCalledTimes(1);

    // 400 × 300 at 16 000 pixels a unit: eight units of rows, then the one that puts the picture on the canvas.
    let units = 1;
    while (paintWallpaperUnit()) units++;
    expect(units).toBe(9);
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({ width: 400, height: 300 });
    expect(puts[0]?.data.at(-1)).toBe(255);
    expect(painted).toHaveBeenCalledTimes(2);
    expect(paintWallpaperUnit()).toBe(false);

    // Lost after: the same picture, not worked out again.
    painted.mockImplementationOnce(() => expect(puts).toHaveLength(2));
    canvas.dispatchEvent(new Event('contextrestored'));
    expect(puts[1]).toBe(puts[0]);
    expect(fills).toHaveLength(4);
    expect(painted).toHaveBeenCalledTimes(3);
    expect(wallpaperCanvas(400, 4 / 3)).toBe(canvas);

    // A much wider request works a larger picture out behind the one shown, and swaps it in when it is done.
    expect(wallpaperCanvas(800, 4 / 3)).toBe(canvas);
    expect(canvas.width).toBe(400);
    while (paintWallpaperUnit());
    expect(canvas.width).toBe(800);
    expect(puts[2]).toMatchObject({ width: 800, height: 600 });
    expect(painted).toHaveBeenCalledTimes(4);

    stop();
    canvas.dispatchEvent(new Event('contextrestored'));
    expect(painted).toHaveBeenCalledTimes(4);
  });
});
