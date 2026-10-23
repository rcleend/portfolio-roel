import { TRANSPARENT_KEY } from '@/engine/gfx/PixelArt';
import type { Rows } from '../compose';

/**
 * Pads `rows` by one pixel and paints every transparent pixel that touches
 * art (8-connected) with `outlineKey` — the 1 px dark rim that keeps small
 * projectiles readable against any background.
 */
export function outlined(rows: Rows, outlineKey: string): string[] {
  const width = [...(rows[0] ?? '')].length + 2;
  const height = rows.length + 2;
  const at = (x: number, y: number): string => [...(rows[y - 1] ?? '')][x - 1] ?? TRANSPARENT_KEY;
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const own = at(x, y);
      if (own !== TRANSPARENT_KEY) return own;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) !== TRANSPARENT_KEY) return outlineKey;
      }
      return TRANSPARENT_KEY;
    }).join(''),
  );
}
