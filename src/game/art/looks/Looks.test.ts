import { describe, expect, it } from 'vitest';
import type { PixelImage } from '@/engine/gfx/canvas';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import { figureHeight } from './Looks';

/** A 64 × 64 frame with the feet on its bottom edge, the Terraria looks' layout. */
const sheet = SpriteSheet.fromImage(
  { width: 256, height: 128 } as PixelImage,
  parseSpriteSheetSpec(
    {
      frame: { w: 64, h: 64 },
      origin: { x: 32, y: 64 },
      animations: [
        { name: 'idle', fps: 8, loop: true, frames: 2 },
        {
          name: 'victory',
          fps: 10,
          loop: true,
          frames: 4,
          anchors: {
            head: [
              [33, 34],
              [33, 32],
              [33, 29],
              [33, 32],
            ],
          },
        },
      ],
    },
    'hero.json',
  ),
  'hero',
);

describe('figureHeight', () => {
  it('measures up to the highest head the animation reaches, so a hop counts at its top', () => {
    expect(figureHeight(sheet, 'victory')).toBe(35);
  });

  it('takes the whole frame where the animation marks no head', () => {
    expect(figureHeight(sheet, 'idle')).toBe(64);
  });
});
