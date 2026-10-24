import { describe, expect, it } from 'vitest';
import type { PixelImage } from '@/engine/gfx/canvas';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import terrariaJson from '../../art/looks/terraria/customer/sheet.json';
import type { RenderKit } from '../RenderKit';
import { overheadLift } from './renderCustomer';

/** Only the size of the image matters until something is drawn. */
const image = (width: number, height: number) => ({ width, height }) as PixelImage;

/** A kit whose customer look is drawn with `json`'s sheet; overheadLift reads nothing else. */
function kitFor(json: unknown, name: string): RenderKit {
  const spec = parseSpriteSheetSpec(json, name);
  const columns = Math.max(...spec.animations.map((animation) => animation.frames));
  const atlas = image(columns * spec.frame.w, spec.animations.length * spec.frame.h);
  return { looks: { customer: { sheet: SpriteSheet.fromImage(atlas, spec, name) } } } as unknown as RenderKit;
}

/** A customer sheet with no anchors, its frames `h` tall. */
const unmarked = (h: number) => ({
  frame: { w: h, h },
  origin: { x: h / 2, y: h },
  animations: ['walk', 'shout', 'hurt', 'stunned', 'happy'].map((name) => ({ name, fps: 6, loop: true, frames: 4 })),
});

describe('overheadLift', () => {
  it('leaves everything above a customer where classic placed it for a look of its 40 px frame', () => {
    expect(overheadLift(kitFor(unmarked(40), 'classic-sized'), 1)).toBe(0);
  });

  it('raises it with the frame for a look that fills a taller one, by the scale it is drawn at', () => {
    expect(overheadLift(kitFor(unmarked(64), 'tall'), 1)).toBe(24);
    expect(overheadLift(kitFor(unmarked(64), 'tall'), 2)).toBe(48);
  });

  it('measures a look drawn smaller than its frame from the standing head it marks', () => {
    // The Terraria customer's phone antenna tops out 32 px over his feet, two above classic's head.
    const kit = kitFor(terrariaJson, 'terraria/customer/sheet.json');
    expect(overheadLift(kit, 1)).toBe(2);
    expect(overheadLift(kit, 2)).toBe(4);
  });
});
