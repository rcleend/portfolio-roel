// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onWallpaperRestored, wallpaperCanvas } from './wallpaper';

describe('the wallpaper after a lost context', () => {
  afterEach(() => vi.restoreAllMocks());

  // A GPU process reset (a laptop's sleep, a display change) gives the shared canvas back blank: the live desktop shows
  // it, and the glass is composed from it.
  it('is painted again in place, and says so, when its canvas comes back from a lost context', () => {
    const fills: unknown[] = [];
    const context = {
      fillStyle: '',
      fillRect: () => fills.push(context.fillStyle),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const canvas = wallpaperCanvas(400, 4 / 3);
    expect(fills).toHaveLength(2);
    const restored = vi.fn(() => expect(fills).toHaveLength(4));
    const stop = onWallpaperRestored(restored);
    canvas.dispatchEvent(new Event('contextrestored'));
    expect(restored).toHaveBeenCalledOnce();
    expect(wallpaperCanvas(400, 4 / 3)).toBe(canvas);
    stop();
    canvas.dispatchEvent(new Event('contextrestored'));
    expect(restored).toHaveBeenCalledOnce();
  });
});
