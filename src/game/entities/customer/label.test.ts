import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { parseHex } from '@/engine/gfx/color';
import { RasterCanvas } from '@/engine/gfx/testing';
import { smallFont } from '../../art/fonts/small';
import { customerLabelArt } from '../../art/fx/customerLabel';
import { palette } from '../../palette';
import { Customer, type CustomerMood } from './Customer';
import {
  FEET_GAP,
  LABEL_GAP,
  type LabelFocus,
  LabelLayout,
  labelFrame,
  labelKind,
  labelLeft,
  labelled,
  labelTop,
  type PlacedLabel,
  SETTLE,
} from './label';
import { ESCALATED_CUSTOMER, REGULAR_CUSTOMER } from './tuning';

beforeAll(() => vi.stubGlobal('document', { createElement: () => new RasterCanvas() }));
afterAll(() => vi.unstubAllGlobals());

const FRAME = 1 / 60;
/** The screen, in world pixels, down to where the HUD along its bottom begins. */
const VIEW = { x: 0, w: 320, bottom: 240 };
const ART = customerLabelArt(BitmapFont.fromGlyphData(smallFont));
const SIZES = ART.sizes;
const { width: WIDTH, height: HEIGHT } = SIZES.unhappy;

/** The player standing with their middle at `centerX`, on a hitbox like the hero's. */
function at(centerX: number, feet = 200): LabelFocus {
  return { centerX, feet, body: { x: centerX - 7, y: feet - 30, w: 14, h: 30 } };
}

const PLAYER = at(0);

/** Every mood, so a new one has to say which label it wears. */
const MOODS: Readonly<Record<CustomerMood['kind'], CustomerMood>> = {
  entering: { kind: 'entering' },
  patrol: { kind: 'patrol' },
  approach: { kind: 'approach' },
  windup: { kind: 'windup', until: 1 },
  recover: { kind: 'recover', until: 1 },
  hurt: { kind: 'hurt', until: 1 },
  stunned: { kind: 'stunned', until: 1 },
  chargeWindup: { kind: 'chargeWindup', until: 1 },
  charge: { kind: 'charge', until: 1, direction: 1 },
  won: { kind: 'won', since: 0 },
};

const WON = MOODS.won;

function customer(x: number, feet = 200): Customer {
  return new Customer(REGULAR_CUSTOMER, x, feet);
}

function wonOver(won: Customer, time = 0): Customer {
  won.hit({ damage: 99, direction: 1 }, time);
  return won;
}

function moveTo(moved: Customer, x: number): void {
  moved.body.x = x - moved.body.w / 2;
}

/** One frame of `layout`: which customers wear a label, on which row, the neediest first. */
function frame(layout: LabelLayout, customers: readonly Customer[], player = PLAYER, time = 10, bottom = VIEW.bottom) {
  const count = layout.update(customers, SIZES, player, VIEW.x, VIEW.w, bottom, time, false);
  return Array.from({ length: count }, (_, index) => layout.label(index));
}

/** A first frame, on a layout that has seen no customer yet. */
function layOut(customers: readonly Customer[], player = PLAYER, time = 10) {
  return frame(new LabelLayout(), customers, player, time);
}

/** Who wears a label on which row, by index into the customers laid out. */
function rows(customers: readonly Customer[], layout = new LabelLayout(), player = PLAYER): (number | null)[] {
  const shown = frame(layout, customers, player);
  return customers.map((_, index) => shown.find((label) => label.index === index)?.row ?? null);
}

describe('customer label state', () => {
  it('calls every frustrated customer unhappy and a won-over one happy', () => {
    for (const [kind, mood] of Object.entries(MOODS)) {
      const expected = kind === 'won' ? 'happy' : kind === 'entering' ? null : 'unhappy';
      expect(labelKind(mood), kind).toBe(expected);
    }
  });

  it('keeps a hurt or stunned customer unhappy until the hit that wins them over', () => {
    const hit = customer(100);
    hit.hit({ damage: 1, direction: 1 }, 0);
    expect([hit.mood.kind, labelKind(hit.mood)]).toEqual(['hurt', 'unhappy']);
    hit.stun(2, 0.5);
    expect([hit.mood.kind, labelKind(hit.mood)]).toEqual(['stunned', 'unhappy']);
    wonOver(hit, 1);
    expect([hit.mood.kind, labelKind(hit.mood)]).toEqual(['won', 'happy']);
  });

  it('names the escalated customer once it has dropped in, not while it falls past the HUD', () => {
    expect(labelKind(new Customer(ESCALATED_CUSTOMER, 100, -40, { kind: 'entering' }).mood)).toBeNull();
    expect(labelKind(new Customer(ESCALATED_CUSTOMER, 100, 200, { kind: 'approach' }).mood)).toBe('unhappy');
  });
});

describe('customer label switch', () => {
  const frames = (reducedMotion: boolean) =>
    Array.from({ length: 8 }, (_, index) => labelFrame(WON, index * FRAME, reducedMotion));

  it('pops the happy label in with a white flash that hops two pixels, then lands', () => {
    expect(frames(false).map((popped) => [popped?.picture, popped?.rise])).toEqual([
      ['flash', 2],
      ['flash', 2],
      ['flash', 2],
      ['happy', 1],
      ['happy', 1],
      ['happy', 1],
      ['happy', 0],
      ['happy', 0],
    ]);
  });

  it('moves only by whole pixels', () => {
    for (let index = 0; index < 30; index++) {
      expect(Number.isInteger(labelFrame(WON, index * FRAME + 0.004, false)?.rise)).toBe(true);
    }
  });

  it('swaps without the pop under reduced motion', () => {
    for (const swapped of frames(true)) expect(swapped).toEqual({ picture: 'happy', rise: 0 });
  });

  it('holds the unhappy label still whatever the mood is doing', () => {
    for (const mood of Object.values(MOODS)) {
      if (mood.kind === 'won' || mood.kind === 'entering') continue;
      expect(labelFrame(mood, 0, false)).toEqual({ picture: 'unhappy', rise: 0 });
    }
  });
});

describe('customer label placement', () => {
  it('sits just under the feet, centred on the pixel the sprite is drawn at', () => {
    for (const centerX of [100, 100.3, 100.5, 100.7, 101.2]) {
      const sprite = Math.round(centerX);
      expect(labelLeft(centerX, WIDTH, VIEW.x, VIEW.w)).toBe(sprite - Math.floor(WIDTH / 2));
    }
    expect(labelTop(200, 0, HEIGHT)).toBe(200 + FEET_GAP);
    expect(labelTop(199.6, 0, HEIGHT)).toBe(200 + FEET_GAP);
    expect(labelTop(200, 1, HEIGHT)).toBe(200 + FEET_GAP + HEIGHT);
  });

  it('slides inward at an edge of the screen so the edge never cuts it', () => {
    const right = VIEW.x + VIEW.w;
    expect(labelLeft(right - 10, WIDTH, VIEW.x, VIEW.w)).toBe(right - WIDTH);
    expect(labelLeft(VIEW.x + 10, WIDTH, VIEW.x, VIEW.w)).toBe(VIEW.x);
    // The camera's view is in world pixels.
    expect(labelLeft(2000 + 10, WIDTH, 2000, VIEW.w)).toBe(2000);
  });

  it('labels a customer whose middle is on screen, and nobody further out', () => {
    const edges = [-1, 0, VIEW.w - 1, VIEW.w].map((x) => customer(x));
    expect(edges.map((edge) => labelled(edge.centerX, VIEW.x, VIEW.w))).toEqual([false, true, true, false]);
    expect(layOut([customer(VIEW.w + 4)])).toEqual([]);
  });

  it('keeps the escalated customer’s label whole against the arena wall', () => {
    const boss = new Customer(ESCALATED_CUSTOMER, VIEW.w - ESCALATED_CUSTOMER.hitbox.w / 2, 200);
    const [label] = layOut([boss]);
    expect((label?.left ?? 0) + (label?.width ?? 0)).toBe(VIEW.w);
  });

  it('stays under the escalated customer’s feet at its double size', () => {
    const [label] = layOut([new Customer(ESCALATED_CUSTOMER, 160, 200)]);
    expect(label?.top).toBe(200 + FEET_GAP);
    expect(label?.left).toBe(160 - Math.floor(WIDTH / 2));
  });

  it('puts labels that keep clear of each other side by side under the feet', () => {
    expect(rows([customer(60), customer(200)])).toEqual([0, 0]);
  });

  it('steps a label down a row where two would meet, each still centred under its own customer', () => {
    // 70 px apart: the customers are well clear of each other, their labels are not.
    const customers = [customer(150), customer(220)];
    const labels = layOut(customers, at(60));
    expect(labels.map(({ index, row, left, top }) => ({ index, row, left, top }))).toEqual([
      { index: 0, row: 0, left: 150 - Math.floor(WIDTH / 2), top: 200 + FEET_GAP },
      { index: 1, row: 1, left: 220 - Math.floor(WIDTH / 2), top: 200 + FEET_GAP + HEIGHT },
    ]);
  });

  it('labels two customers standing on top of each other, one row each', () => {
    expect(rows([customer(150), customer(152)])).toEqual([0, 1]);
  });

  it('gives the row under the feet to the customer nearest the player', () => {
    const customers = [customer(150), customer(190)];
    expect(rows(customers, new LabelLayout(), at(60))).toEqual([0, 1]);
    expect(rows(customers, new LabelLayout(), at(260))).toEqual([1, 0]);
  });

  it('keeps labels further apart than their words, so two side by side never read as one line', () => {
    const apart = (gap: number) => rows([customer(100), customer(100 + WIDTH + gap)]);
    expect(apart(LABEL_GAP - 1)).toEqual([0, 1]);
    expect(apart(LABEL_GAP)).toEqual([0, 0]);
    // The outlines either side add to the gap between two labels' letters.
    expect(LABEL_GAP + 2).toBeGreaterThan(wordGap());
  });

  it('lets only a third label in the same stretch wait for room, the one furthest from the player', () => {
    expect(rows([customer(150), customer(170), customer(190)], new LabelLayout(), at(60))).toEqual([0, 1, null]);
  });

  it('gives the room to unhappy customers before happy ones', () => {
    const happy = [wonOver(customer(150)), wonOver(customer(160))];
    const unhappy = customer(190);
    // The unhappy one is furthest from the player, yet a happy one waits.
    expect(rows([...happy, unhappy], new LabelLayout(), at(60))).toEqual([1, null, 0]);
  });

  it('labels customers on different floors apart', () => {
    expect(rows([customer(100), customer(110, 160)])).toEqual([0, 0]);
  });

  it('switches a won-over customer to the happy label, sized to its own words', () => {
    const won = wonOver(customer(100), 10);
    const [popping] = layOut([won], PLAYER, 10);
    expect(popping?.frame).toEqual({ picture: 'flash', rise: 2 });
    expect(popping?.width).toBe(SIZES.happy.width);
    const [settled] = layOut([won], PLAYER, 11);
    expect(settled?.frame).toEqual({ picture: 'happy', rise: 0 });
  });

  it('hops a popping label only as far as the label above it leaves room', () => {
    const [near, far] = [customer(150), wonOver(customer(190), 10)];
    const [above, below] = layOut([near, far], at(60), 10);
    expect([above?.row, above?.lift, below?.row, below?.frame]).toEqual([0, 0, 1, { picture: 'flash', rise: 2 }]);
    // Right under the other label: popping in place keeps both whole.
    expect(below?.lift).toBe(0);
    // Under the feet, with nothing above, it hops the whole way.
    const [alone] = layOut([wonOver(customer(100), 10)], PLAYER, 10);
    expect(alone?.lift).toBe(2);
  });

  it('never draws a label over another, popping or not', () => {
    const customers = [customer(150), customer(165), customer(180), customer(195)];
    for (const won of customers.slice(1)) wonOver(won, 10);
    for (const time of [10, 10 + 3 * FRAME, 11]) {
      const drawn = layOut(customers, at(60), time);
      for (const a of drawn) {
        for (const b of drawn) {
          if (a === b) continue;
          const side = a.left < b.left + b.width && b.left < a.left + a.width;
          const level = a.top - a.lift < b.top - b.lift + b.height && b.top - b.lift < a.top - a.lift + a.height;
          expect(side && level, `${a.index} over ${b.index} at ${time}`).toBe(false);
        }
      }
    }
  });

  it('leaves out a customer still dropping in', () => {
    expect(layOut([new Customer(ESCALATED_CUSTOMER, 100, -40, { kind: 'entering' })])).toEqual([]);
  });

  it('keeps labels out of the HUD along the bottom, so a second row it would hide waits', () => {
    // As under the boss bar: its strip begins two rows below the first row's bottom.
    const bottom = 200 + FEET_GAP + HEIGHT + 2;
    const shown = frame(new LabelLayout(), [customer(150), customer(200)], at(60), 10, bottom);
    expect(shown.map(({ index, row }) => ({ index, row }))).toEqual([{ index: 0, row: 0 }]);
  });

  it('leaves out a customer whose label the HUD along the bottom would hide', () => {
    expect(frame(new LabelLayout(), [customer(150)], PLAYER, 10, 200 + FEET_GAP + HEIGHT - 1)).toEqual([]);
  });

  it('takes a second row again once the HUD along the bottom leaves it', () => {
    const layout = new LabelLayout();
    const customers = [customer(150), customer(200)];
    frame(layout, customers, at(60), 10, 200 + FEET_GAP + HEIGHT + 2);
    expect(rows(customers, layout, at(60))).toEqual([0, 1]);
  });
});

describe('customer label layers', () => {
  const layers = (labels: readonly PlacedLabel[]) => labels.map(({ index, front }) => ({ index, front }));

  it('draws a label in front of the foreground while it meets no character', () => {
    expect(layers(layOut([customer(160)]))).toEqual([{ index: 0, front: true }]);
  });

  it('drops a label behind the characters where it meets the player, as under a customer on a raised floor', () => {
    // The player stands on the street right under a customer on a floor 20 px up.
    expect(layers(layOut([customer(160, 180)], at(165)))).toEqual([{ index: 0, front: false }]);
  });

  it('drops a label behind a customer lower down that it meets, and only that label', () => {
    expect(layers(layOut([customer(160, 180), customer(170)]))).toEqual([
      { index: 0, front: false },
      { index: 1, front: true },
    ]);
  });

  it('drops a popping label behind its own customer while it hops up past their feet', () => {
    const won = wonOver(customer(160), 10);
    expect(layOut([won], PLAYER, 10).map(({ lift, front }) => ({ lift, front }))).toEqual([{ lift: 2, front: false }]);
    expect(layOut([won], PLAYER, 11).map(({ lift, front }) => ({ lift, front }))).toEqual([{ lift: 0, front: true }]);
  });
});

describe('customer labels over time', () => {
  const NEAR_LEFT = at(60);
  const NEAR_RIGHT = at(260);

  it('keep their rows while the player walks past, rather than swapping them', () => {
    const layout = new LabelLayout();
    const customers = [customer(150), customer(190)];
    expect(rows(customers, layout, NEAR_LEFT)).toEqual([0, 1]);
    expect(rows(customers, layout, NEAR_RIGHT)).toEqual([0, 1]);
  });

  it('keep their rows the moment a customer is won over', () => {
    const layout = new LabelLayout();
    const customers = [customer(150), customer(190)];
    expect(rows(customers, layout, NEAR_LEFT)).toEqual([0, 1]);
    wonOver(customers[0] as Customer, 10);
    expect(rows(customers, layout, NEAR_LEFT)).toEqual([0, 1]);
  });

  it('never let a newcomer bump a label that is showing', () => {
    const layout = new LabelLayout();
    const customers = [customer(150), customer(190)];
    rows(customers, layout, NEAR_LEFT);
    const newcomer = customer(160);
    expect(rows([...customers, newcomer], layout, at(140))).toEqual([0, 1, null]);
  });

  it('count a customer who walked off screen as a newcomer when they walk back on', () => {
    const layout = new LabelLayout();
    const [away, stays] = [customer(150), customer(190)];
    expect(rows([away, stays], layout, NEAR_LEFT)).toEqual([0, 1]);
    moveTo(away, -40);
    expect(rows([away, stays], layout, NEAR_LEFT)).toEqual([null, 0]);
    // Back nearer the player, yet the label that is showing keeps its row.
    moveTo(away, 150);
    expect(rows([away, stays], layout, NEAR_LEFT)).toEqual([1, 0]);
  });

  it('let a happy label give way to a newly arrived unhappy one', () => {
    const layout = new LabelLayout();
    const customers = [wonOver(customer(150)), wonOver(customer(190))];
    expect(rows(customers, layout, NEAR_LEFT)).toEqual([0, 1]);
    // The unhappy one takes the row under its feet; of the happy ones, the further waits.
    expect(rows([...customers, customer(170)], layout, NEAR_LEFT)).toEqual([1, null, 0]);
  });

  it('move a stepped-down label back up only once its row has room to spare', () => {
    const layout = new LabelLayout();
    const [near, far] = [customer(150), customer(190)];
    expect(rows([near, far], layout, NEAR_LEFT)).toEqual([0, 1]);
    const clear = 150 + WIDTH + LABEL_GAP;
    moveTo(far, clear);
    expect(rows([near, far], layout, NEAR_LEFT)).toEqual([0, 1]);
    moveTo(far, clear + SETTLE - 1);
    expect(rows([near, far], layout, NEAR_LEFT)).toEqual([0, 1]);
    moveTo(far, clear + SETTLE);
    expect(rows([near, far], layout, NEAR_LEFT)).toEqual([0, 0]);
    // And stays up as they close in again, until the labels would meet.
    moveTo(far, clear);
    expect(rows([near, far], layout, NEAR_LEFT)).toEqual([0, 0]);
  });

  it('give a label to a customer who waited, once the crowd parts', () => {
    const layout = new LabelLayout();
    const customers = [customer(150), customer(170), customer(190)];
    expect(rows(customers, layout, NEAR_LEFT)).toEqual([0, 1, null]);
    moveTo(customers[0] as Customer, 20);
    expect(rows(customers, layout, NEAR_LEFT)).toEqual([0, 1, 0]);
  });

  it('reuse their slots from frame to frame and hold on to no customer', () => {
    const layout = new LabelLayout();
    const customers = [customer(60), customer(200)];
    frame(layout, customers);
    const first = [layout.label(0), layout.label(1)];
    expect(frame(layout, customers.slice(1))).toHaveLength(1);
    expect(first).toContain(layout.label(0));
    expect(() => layout.label(1)).toThrow(RangeError);
    for (const label of first) expect(Object.values(label).some((value) => value instanceof Customer)).toBe(false);
  });
});

/** The widest run of columns without a letter pixel inside one label: the space between its words. */
function wordGap(): number {
  const { image, width, height } = ART.bitmaps().unhappy;
  const { data } = (image as unknown as RasterCanvas).getContext();
  const { r, g, b } = parseHex(palette.scarlet);
  const lettered = Array.from({ length: width }, (_, x) =>
    Array.from({ length: height }, (_, y) => (y * width + x) * 4).some(
      (i) => data[i] === r && data[i + 1] === g && data[i + 2] === b,
    ),
  );
  let widest = 0;
  let run = 0;
  for (const column of lettered.slice(lettered.indexOf(true), lettered.lastIndexOf(true))) {
    run = column ? 0 : run + 1;
    widest = Math.max(widest, run);
  }
  return widest;
}
