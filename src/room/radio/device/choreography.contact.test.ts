import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DISC_RADIUS, discSlots } from '../discLayout';
import { RADIO_FIXTURE } from '../radioFixtures';
import { radioViewpoint } from '../radioFraming';
import { Choreography, type DiscSample } from './choreography';
import { DECK } from './deckLayout';
import { discsTouch } from './discContact';
import { DISC_MOTION } from './discMotion';

/**
 * The storyboard sweep: no disc ever passes through another, nor through the radio (its body outside the well, the
 * well floor anywhere but the slot, the lid at its angle), and none jumps (moves further than JUMP_M between two
 * samples). Every scenario on four framed viewports for 1–12 discs, sampled every 8 ms with the device's own order of
 * events, discs held to 0.5 mm apart.
 */

const LAYOUTS = [
  { width: 1440, height: 900, bottom: 0, right: 0 },
  { width: 3440, height: 1440, bottom: 0, right: 0 },
  { width: 844, height: 390, bottom: 0, right: 64 },
  { width: 390, height: 844, bottom: 64, right: 0 },
] as const;
const COUNTS = [1, 2, 4, 5, 7, 12];
const STEP_MS = 8;
const MARGIN = 0.0005;
/** Faster than any drawn path goes (7.5 m/s): a disc that covers this in one sample has jumped. */
const JUMP_M = 0.06;
/** The camera is back at the room this long after the leave (the flight is 1100 ms): the radio is packed up by then. */
const LANDING_MS = 1150;
/**
 * Up to this many discs the lid is shut by then too. Past it the slot sets the pace (one disc down it per
 * DISC_MOTION.leave.sinkGap, closer and they touch in its plane): each further disc, and a disc leaving the player,
 * shuts the lid a gap later, while the camera is already back at the room.
 */
const SHUT_BY_LANDING = 7;

/** When the lid is shut at the latest after a leave with `count` discs. */
function shutBy(count: number): number {
  return LANDING_MS + Math.max(0, count - SHUT_BY_LANDING + 1) * DISC_MOTION.leave.sinkGap;
}

type Event = readonly [number, (choreography: Choreography, ids: readonly string[]) => void];

const arrive: readonly Event[] = [
  [0, (c) => c.approach(0, 0)],
  [1100, (c) => c.reveal(1100)],
];
const pick = (at: number, which: (count: number) => number): Event => [
  at,
  (c, ids) => {
    c.setTransport('playing', at);
    c.setLoaded(ids[which(ids.length)] ?? null, at, true);
  },
];
const conceal = (at: number): Event => [at, (c) => c.conceal(at)];

/** A first insert or a swap, and the leave a moment into it. */
function leavesMidPick(count: number): { name: string; events: Event[]; from: number; leave: number }[] {
  const list: { name: string; events: Event[]; from: number; leave: number }[] = [];
  for (const after of [0, 150, 300, 600, 900]) {
    const leave = 4500 + after;
    list.push({
      name: `the leave ${after} ms into an insert`,
      events: [pick(4500, (n) => n - 1), conceal(leave)],
      from: 4500,
      leave,
    });
    if (count > 1) {
      const swap = 7000 + after;
      list.push({
        name: `the leave ${after} ms into a swap`,
        events: [pick(4500, () => 0), pick(7000, (n) => n - 1), conceal(swap)],
        from: 7000,
        leave: swap,
      });
    }
  }
  return list;
}

/** Scenarios: events after the arrival, and the window to watch. */
function scenarios(count: number): { name: string; events: Event[]; from: number; to: number }[] {
  const list: { name: string; events: Event[]; from: number; to: number }[] = [
    { name: 'the arrival', events: [], from: 1100, to: 3600 },
    { name: 'the leave', events: [conceal(4500)], from: 4500, to: 6400 },
    { name: 'the leave during the rise', events: [conceal(1500)], from: 1500, to: 4200 },
    { name: 'the leave during an insert', events: [pick(4500, (n) => n - 1), conceal(4800)], from: 4800, to: 7400 },
    {
      name: 'turning back mid-leave',
      events: [conceal(4500), [4800, (c) => c.approach(4800, 4800)], [5900, (c) => c.reveal(5900)]],
      from: 4800,
      to: 7800,
    },
    {
      name: 'a warm arrival',
      events: [conceal(4500), [6000, (c) => c.approach(6000, 6000)], [7100, (c) => c.reveal(7100)]],
      from: 7100,
      to: 9400,
    },
  ];
  // A keyboard can choose a disc the moment the camera lands, before it (or any) is out of the radio.
  for (const at of [1100, 1250, 1450, 1700, 2000]) {
    for (const which of new Set([0, Math.floor(count / 2), count - 1])) {
      list.push({
        name: `a pick of disc ${which} during the rise (+${at - 1100} ms)`,
        events: [pick(at, () => which)],
        from: 1100,
        to: 4600,
      });
    }
  }
  // …and change their mind while it is still on its way: the first goes on into its slot from where it is.
  for (const at of [1100, 1350, 1700]) {
    for (const gap of [0, 100, 350, 700, 1000]) {
      const pairs: readonly (readonly [number, number])[] = [
        [0, count - 1],
        [Math.floor(count / 2), 0],
      ];
      for (const [first, second] of pairs) {
        if (first === second) continue;
        list.push({
          name: `a pick of disc ${first} during the rise (+${at - 1100} ms), then disc ${second} ${gap} ms later`,
          events: [pick(at, () => first), pick(at + gap, () => second)],
          from: 1100,
          to: 5200,
        });
      }
    }
  }
  // Turning back while the discs are still rising: those that had not set off arrive as they were.
  for (const at of [1300, 1500, 1800]) {
    list.push({
      name: `turning back mid-leave during the rise (+${at - 1100} ms)`,
      events: [conceal(at), [at + 20, (c) => c.approach(at + 20, at + 20)], [at + 1120, (c) => c.reveal(at + 1120)]],
      from: at,
      to: at + 3600,
    });
  }
  // Turning back once the room view has landed (a mouse can click the radio again), with the last discs still
  // going down the slit and the lid closing over them: the lid turns and swings open before any disc comes back up.
  for (const leave of [1100, 1300, 1600, 2400, 4500]) {
    for (const back of [1150, 1400, 1650, 2000]) {
      const at = leave + back;
      list.push({
        name: `turning back ${back} ms after a leave at +${leave - 1100} ms`,
        events: [conceal(leave), [at, (c) => c.approach(at, at)], [at + 1100, (c) => c.reveal(at + 1100)]],
        from: at,
        to: at + 3400,
      });
    }
  }
  // Leaving while a disc goes in: it commits, and the radio packs up while it is still on screen.
  for (const scenario of leavesMidPick(count)) list.push({ ...scenario, to: scenario.leave + 2000 });
  for (let i = 0; i < count; i++) {
    list.push({ name: `an insert of disc ${i}`, events: [pick(4500, () => i)], from: 4500, to: 6200 });
    if (count > 1) {
      const next = (i + 1) % count;
      const far = (i + Math.ceil(count / 2)) % count;
      for (const j of new Set([next, far])) {
        list.push({
          name: `a swap ${i} → ${j}`,
          events: [pick(4500, () => i), pick(7000, () => j)],
          from: 7000,
          to: 9600,
        });
      }
    }
  }
  if (count > 2) {
    for (const gap of [150, 550, 700]) {
      list.push({
        name: `three picks ${gap} ms apart`,
        events: [pick(4500, () => 0), pick(4500 + gap, (n) => n - 1), pick(4700 + gap, () => 1)],
        from: 4500,
        to: 8200,
      });
      list.push({
        name: `a pick, another, the first again (${gap} ms)`,
        events: [pick(4500, () => 1), pick(4500 + gap, () => 0), pick(4600 + gap, () => 1)],
        from: 4500,
        to: 8200,
      });
    }
  }
  return list;
}

/** The storyboard for `count` discs framed for `layout`. */
function stage(layout: (typeof LAYOUTS)[number], count: number) {
  const slots = discSlots(count, layout.width / layout.height);
  const eye = radioViewpoint(RADIO_FIXTURE, slots, layout, {
    top: 0,
    right: layout.right,
    bottom: layout.bottom,
    left: 0,
  }).position;
  const ids = Array.from({ length: count }, (_, i) => `disc ${i}`);
  const choreography = new Choreography({
    reducedFadeMs: 140,
    eye: () => eye,
    reducedMotion: () => false,
    slow: () => false,
  });
  choreography.setDiscs(ids, slots, 0);
  return { choreography, ids };
}

/** What touched what, and when, in a scenario. */
function sweep(layout: (typeof LAYOUTS)[number], count: number, events: readonly Event[], from: number, to: number) {
  const { choreography, ids } = stage(layout, count);
  const queue = [...arrive, ...events].sort((a, b) => a[0] - b[0]);
  const contacts: string[] = [];
  const last = new Map<string, Vector3>();
  for (let t = 0; t <= to; t += t < from ? 16 : STEP_MS) {
    while (queue.length > 0 && (queue[0]?.[0] ?? Number.POSITIVE_INFINITY) <= t) {
      const [at, act] = queue.shift() as Event;
      choreography.advance(at);
      act(choreography, ids);
    }
    choreography.advance(t);
    if (t < from) continue;
    const sample = choreography.sample(t);
    const discs = sample.discs.filter((disc) => disc.visible);
    for (const disc of sample.discs) {
      const before = last.get(disc.id);
      const moved = before ? before.distanceTo(disc.position) : 0;
      if (disc.visible && before && moved > JUMP_M) {
        contacts.push(`${disc.id} (${disc.phase}) jumps ${Math.round(moved * 1000)} mm at +${t - from} ms`);
      }
      if (disc.visible) last.set(disc.id, disc.position.clone());
      else last.delete(disc.id);
    }
    for (let i = 0; i < discs.length; i++) {
      const a = discs[i] as DiscSample;
      const radio = radioContact(a, sample.lid);
      if (radio) contacts.push(`${a.id} (${a.phase}) × the radio's ${radio} at +${t - from} ms`);
      for (let j = i + 1; j < discs.length; j++) {
        const b = discs[j] as DiscSample;
        if (discsTouch(a, b, MARGIN)) contacts.push(`${a.id} (${a.phase}) × ${b.id} (${b.phase}) at +${t - from} ms`);
      }
    }
  }
  return contacts;
}

/** The radio as a solid: its body around the open well, the well's floor (but the slot), and the lid at its angle. */
const BODY = { minX: 0.735, maxX: 1.295, minZ: -2.205, maxZ: -1.865, top: 1.087 };
const WELL = { minX: 1.01, maxX: 1.213, minZ: -2.161, maxZ: -1.939 };
const LID = { hingeY: 1.044, hingeZ: -2.161, dy: 0.0382, dz: 0.2224, minX: 1.01, maxX: 1.213, half: 0.004 };

function radioContact(disc: DiscSample, lidDegrees: number): string | null {
  const radius = DISC_RADIUS * disc.scale;
  const angle = (lidDegrees * Math.PI) / 180;
  const ly = LID.dy * Math.cos(angle) + LID.dz * Math.sin(angle);
  const lz = -LID.dy * Math.sin(angle) + LID.dz * Math.cos(angle);
  const length = Math.hypot(ly, lz);
  const point = new Vector3();
  for (let ring = 1; ring <= 4; ring++) {
    for (let k = 0; k < 24; k++) {
      const a = (2 * Math.PI * k) / 24;
      point
        .set((Math.cos(a) * radius * ring) / 4, (Math.sin(a) * radius * ring) / 4, 0)
        .applyQuaternion(disc.orientation)
        .add(disc.position);
      const inWell = point.x > WELL.minX && point.x < WELL.maxX && point.z > WELL.minZ && point.z < WELL.maxZ;
      const inBody =
        point.x > BODY.minX && point.x < BODY.maxX && point.z > BODY.minZ && point.z < BODY.maxZ && point.y < BODY.top;
      if (inBody && !inWell) return 'body';
      if (inWell && point.y < DECK.slot.floorY - 0.0005) {
        const inSlot = Math.abs(point.z - DECK.slot.z) < 0.0025 && point.x > DECK.slot.minX && point.x < DECK.slot.maxX;
        if (!inSlot) return 'well floor';
      }
      if (point.x > LID.minX && point.x < LID.maxX) {
        const ry = point.y - LID.hingeY;
        const rz = point.z - LID.hingeZ;
        const along = (ry * ly + rz * lz) / length;
        const off = (-ry * lz + rz * ly) / length;
        if (along > 0 && along < length && Math.abs(off) < LID.half) return 'lid';
      }
    }
  }
  return null;
}

describe('the storyboard sweep', () => {
  it('sees a jump when there is one', () => {
    const contacts = sweep(LAYOUTS[0], 1, [[2000, (c) => c.relayout(discSlots(1, 0.5), 2000)]], 1100, 2100);
    expect(contacts.some((contact) => contact.includes('jumps'))).toBe(false);
    // A disc moved by hand between samples is caught: the sweep reads the poses, not the plan.
    const jumped = Choreography.prototype.sample;
    let shift = 0;
    Choreography.prototype.sample = function (this: Choreography, t: number) {
      const sample = jumped.call(this, t);
      if (t >= 2000) shift = 0.1;
      for (const disc of sample.discs) disc.position.x += shift;
      return sample;
    };
    try {
      expect(sweep(LAYOUTS[0], 1, [], 1900, 2100).some((contact) => contact.includes('jumps 100 mm'))).toBe(true);
    } finally {
      Choreography.prototype.sample = jumped;
    }
  });

  it('sees a contact when there is one: discs side by side in one plane, and a disc through the radio', () => {
    const facing = new Quaternion();
    const at = (x: number, y: number, z: number) =>
      ({
        id: '',
        phase: 'floating',
        position: new Vector3(x, y, z),
        orientation: facing,
        scale: 1,
        omega: 0,
        visible: true,
      }) as DiscSample;
    expect(discsTouch(at(1, 1.25, -2), at(1.1, 1.25, -2), MARGIN)).toBe(true);
    expect(radioContact(at(0.9, 1.1, -2), 0)).toBe('body');
    expect(radioContact(at(1.11, 1.2, -2.17), 84)).toBe('lid');
    expect(radioContact(at(1.11, 1.25, -1.98), 84)).toBeNull();
  });

  for (const layout of LAYOUTS) {
    it(`packs up by the camera's landing (the lid by its bound) when the visitor leaves mid-pick at ${layout.width} × ${layout.height}`, () => {
      const late: string[] = [];
      for (const count of COUNTS) {
        for (const { name, events, leave } of leavesMidPick(count)) {
          const { choreography, ids } = stage(layout, count);
          const queue = [...arrive, ...events].sort((a, b) => a[0] - b[0]);
          const landed = leave + LANDING_MS;
          const shut = leave + shutBy(count);
          for (let t = 0; t <= shut; t += 16) {
            while (queue.length > 0 && (queue[0]?.[0] ?? Number.POSITIVE_INFINITY) <= t) {
              const [at, act] = queue.shift() as Event;
              choreography.advance(at);
              act(choreography, ids);
            }
            choreography.advance(t);
          }
          const out = choreography.sample(landed).discs.filter((disc) => disc.visible && disc.phase !== 'seated');
          const lid = choreography.sample(shut).lid;
          if (lid > 0 || choreography.lidDegrees(shut + 100) > 0 || out.length > 0) {
            late.push(
              `${count} discs, ${name}: lid ${lid.toFixed(1)}° at +${shut - leave} ms, ${out.length} disc(s) out`,
            );
          }
        }
      }
      expect(late).toEqual([]);
    });

    describe(`${layout.width} × ${layout.height}`, () => {
      it.each(COUNTS)('keeps %i discs apart and clear of the radio in every scenario', (count) => {
        const contacts = scenarios(count).flatMap(({ name, events, from, to }) =>
          sweep(layout, count, events, from, to).map((contact) => `${name}: ${contact}`),
        );
        expect(contacts.slice(0, 8)).toEqual([]);
      });
    });
  }
});
