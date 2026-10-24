import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BitmapFont } from '@/engine/gfx/BitmapFont';
import type { PixelImage } from '@/engine/gfx/canvas';
import { Gfx } from '@/engine/gfx/Gfx';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import { RasterCanvas, rasterContext } from '@/engine/gfx/testing';
import { smallFont } from '../../art/fonts/small';
import { customerLabelArt } from '../../art/fx/customerLabel';
import terrariaJson from '../../art/looks/terraria/customer/sheet.json';
import type { RenderKit } from '../RenderKit';
import { Customer, type CustomerMood } from './Customer';
import { FEET_GAP, LabelLayout } from './label';
import { customerPose, drawCustomerLabels, layOutCustomerLabels, overheadLift } from './renderCustomer';
import { REGULAR_CUSTOMER } from './tuning';

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

beforeAll(() => vi.stubGlobal('document', { createElement: () => new RasterCanvas() }));
afterAll(() => vi.unstubAllGlobals());

const PLAYER = { centerX: 20, feet: 200, body: { x: 13, y: 170, w: 14, h: 30 } };
const SCREEN = { width: 320, restLeft: 0, restBottom: 240, left: 0, bottom: 240 };
const FONTS = { small: BitmapFont.fromGlyphData(smallFont) };
const { sizes } = customerLabelArt(FONTS.small);

function paint(customers: readonly Customer[], time: number, reducedMotion = false) {
  const ctx = rasterContext(320, 240);
  const gfx = new Gfx(ctx as unknown as CanvasRenderingContext2D);
  const kit = { time, reducedMotion, fonts: FONTS };
  const labels = new LabelLayout();
  layOutCustomerLabels(kit, labels, customers, PLAYER, SCREEN);
  drawCustomerLabels(gfx, kit, labels, 'behind');
  drawCustomerLabels(gfx, kit, labels, 'front');
  return ctx.paintedBounds();
}

describe('drawCustomerLabels', () => {
  it('paints the label just under the feet, centred on the customer', () => {
    const { width, height } = sizes.unhappy;
    expect(paint([new Customer(REGULAR_CUSTOMER, 160, 200)], 0)).toEqual({
      x: 160 - Math.floor(width / 2),
      y: 200 + FEET_GAP,
      w: width,
      h: height,
    });
  });

  it('paints the label of a customer close by a row lower', () => {
    const { width, height } = sizes.unhappy;
    const customers = [new Customer(REGULAR_CUSTOMER, 120, 200), new Customer(REGULAR_CUSTOMER, 190, 200)];
    expect(paint(customers, 0)).toEqual({
      x: 120 - Math.floor(width / 2),
      y: 200 + FEET_GAP,
      w: 190 - 120 + width,
      h: height * 2,
    });
  });

  it('pops the happy label in two pixels up and settles it back on its row', () => {
    const customer = new Customer(REGULAR_CUSTOMER, 160, 200);
    customer.hit({ damage: 99, direction: 1 }, 5);
    expect(paint([customer], 5)?.y).toBe(200 + FEET_GAP - 2);
    expect(paint([customer], 6)?.y).toBe(200 + FEET_GAP);
    expect(paint([customer], 5, true)?.y).toBe(200 + FEET_GAP);
  });

  it('paints nothing for nobody', () => {
    expect(paint([], 0)).toBeNull();
  });
});
