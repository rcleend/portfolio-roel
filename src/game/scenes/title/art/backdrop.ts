import { bandColors, parseHex } from '@/engine/gfx/color';
import { Bitmap } from '../../../art/logos/raster/Bitmap';
import { hash2, valueNoise } from '../../../art/logos/raster/noise';
import { rampAt } from '../../../art/logos/raster/ramp';
import { palette } from '../../../palette';

/** Shades from dark umber at the top to pale khaki at the bottom. */
const SHADES = bandColors([palette.khakiDark, '#6a5d43', '#958a6e', palette.khakiLight], 12).map(parseHex);
/** How many shades a streak may push a row segment up or down. */
const STREAK_STRENGTH = 2;
const SEED = 0x7172;

/**
 * The title's backdrop: a warm khaki-olive vertical gradient overlaid with
 * horizontal streak noise — rows broken into long dashes a shade or two
 * lighter or darker, like an old printed card (docs/ART-DIRECTION.md › Title).
 */
export function paintBackdrop(width: number, height: number): Bitmap {
  const bitmap = new Bitmap(width, height);
  for (let y = 0; y < height; y++) {
    const base = (y / (height - 1)) * (SHADES.length - 1);
    for (let x = 0; x < width; x++) {
      // Cells 16 px wide and one row tall: each row gets its own short dashes.
      const streak = (valueNoise(x, y, 16, 1, SEED) - 0.5) * STREAK_STRENGTH;
      const grain = (hash2(x, y, SEED + 1) - 0.5) * 0.8;
      bitmap.set(x, y, rampAt(SHADES, base + streak + grain));
    }
  }
  return bitmap;
}
