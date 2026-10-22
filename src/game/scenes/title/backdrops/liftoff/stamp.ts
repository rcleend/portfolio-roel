import type { Rgba } from '@/engine/gfx/color';
import { TRANSPARENT_KEY } from '@/engine/gfx/PixelArt';
import type { Bitmap } from '../../../../art/logos/raster/Bitmap';

/** One colour per palette key of a hand-drawn sprite. */
export type Keys = Readonly<Record<string, Rgba>>;

/**
 * Paints hand-drawn rows (one palette key per pixel, `.` for clear, as in
 * `pixels`) into `bitmap` with their top-left at (x, y). An unknown key
 * throws, so a typo in the art fails the first paint instead of leaving a
 * hole in the skyline.
 */
export function stampRows(bitmap: Bitmap, rows: readonly string[], keys: Keys, x: number, y: number): void {
  rows.forEach((row, dy) => {
    [...row].forEach((key, dx) => {
      if (key === TRANSPARENT_KEY) return;
      const color = keys[key];
      if (!color) throw new Error(`stampRows: no colour for key "${key}" in row ${dy}: "${row}"`);
      bitmap.set(x + dx, y + dy, color);
    });
  });
}
