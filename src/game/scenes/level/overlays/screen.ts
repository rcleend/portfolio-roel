import { context2d, createCanvas } from '@/engine/gfx/canvas';
import { ditherOn } from '@/engine/gfx/dither';
import type { Gfx } from '@/engine/gfx/Gfx';

/** Bayer 4 × 4 tiles are periodic, so one tile per (coverage, colour) covers the whole screen. */
const TILE = 4;
const LEVELS = 16;
const tiles = new Map<string, HTMLCanvasElement>();

function ditherTile(level: number, color: string): HTMLCanvasElement {
  const key = `${level}|${color}`;
  let tile = tiles.get(key);
  if (!tile) {
    tile = createCanvas(TILE, TILE);
    const ctx = context2d(tile);
    ctx.fillStyle = color;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) if (ditherOn('bayer4', x, y, level / LEVELS)) ctx.fillRect(x, y, 1, 1);
    }
    tiles.set(key, tile);
  }
  return tile;
}

/**
 * Darkens the whole screen with an ordered dither instead of alpha, the way
 * 16-bit hardware dimmed a scene behind a menu. Coverage is quantised to the
 * sixteen Bayer levels and drawn as one pattern fill.
 */
export function dimScreen(gfx: Gfx, coverage: number, color = '#0b0a1f'): void {
  const level = Math.round(Math.min(1, Math.max(0, coverage)) * LEVELS);
  if (level <= 0) return;
  if (level >= LEVELS) {
    gfx.fillRect(0, 0, gfx.width, gfx.height, color);
    return;
  }
  const pattern = gfx.ctx.createPattern(ditherTile(level, color), 'repeat');
  if (!pattern) return;
  gfx.ctx.fillStyle = pattern;
  gfx.ctx.fillRect(0, 0, gfx.width, gfx.height);
}

/** Quantised fade to a solid colour: flat steps, never a smooth ramp. */
export function fadeScreen(gfx: Gfx, coverage: number, color = '#000000', levels = 5): void {
  const stepped = Math.round(Math.min(1, Math.max(0, coverage)) * levels) / levels;
  if (stepped > 0) gfx.withAlpha(stepped, () => gfx.fillRect(0, 0, gfx.width, gfx.height, color));
}
