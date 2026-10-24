import { describe, expect, it } from 'vitest';
import type { PixelImage } from '@/engine/gfx/canvas';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import terrariaJson from '../../art/looks/terraria/customer/sheet.json';
import type { RenderKit } from '../RenderKit';
import type { Customer, CustomerMood } from './Customer';
import { customerPose, overheadLift } from './renderCustomer';

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

/** A customer in `mood`, moving at `vx` with `walked` art pixels behind it; customerPose reads nothing else. */
const moving = (mood: CustomerMood, vx: number, walked: number) =>
  ({ mood, moodAge: () => 0, body: { vx }, walked }) as unknown as Customer;

describe('customerPose', () => {
  it("plays the walk by distance, in real time at a regular customer's pace", () => {
    expect(customerPose(moving({ kind: 'approach' }, 30, 45), 100)).toEqual({ animation: 'walk', time: 1.5 });
    // Half as far in its art for the escalated customer at 2×, so his legs plant at his size.
    expect(customerPose(moving({ kind: 'approach' }, 34, 17), 100)).toEqual({ animation: 'walk', time: 17 / 30 });
    expect(customerPose(moving({ kind: 'charge', until: 9, direction: 1 }, 165, 82.5), 100).time).toBe(2.75);
  });

  it('stands a still customer in the walk frame with both feet down', () => {
    const still = customerPose(moving({ kind: 'approach' }, 0, 45), 100);
    expect(still.animation).toBe('walk');
    expect(Math.floor(still.time * 6)).toBe(1);
  });
});
