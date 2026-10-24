import { Vector3 } from 'three';
import { DISC_RADIUS, discSlots } from '../discLayout';
import { RADIO_FIXTURE } from '../radioFixtures';
import { radioViewpoint } from '../radioFraming';
import { Choreography, type DiscSample } from './choreography';
import { DECK } from './deckLayout';
import { discsTouch } from './discContact';

/**
 * The storyboard sweep's harness, for the choreography's contact tests: a choreography framed for a viewport, played
 * through a list of events in the device's own order and sampled every 8 ms, and what touched what (disc against
 * disc, disc against the radio) or jumped (moved further than JUMP_M between two samples) on the way.
 */

export const LAYOUTS = [
  { width: 1440, height: 900, bottom: 0, right: 0 },
  { width: 3440, height: 1440, bottom: 0, right: 0 },
  { width: 844, height: 390, bottom: 0, right: 64 },
  { width: 390, height: 844, bottom: 64, right: 0 },
] as const;
const STEP_MS = 8;
export const MARGIN = 0.0005;
/** Faster than any drawn path goes (7.5 m/s): a disc that covers this in one sample has jumped. */
const JUMP_M = 0.06;

export type Event = readonly [number, (choreography: Choreography, ids: readonly string[]) => void];

export const arrive: readonly Event[] = [
  [0, (c) => c.approach(0, 0)],
  [1100, (c) => c.reveal(1100)],
];
export const pick = (at: number, which: (count: number) => number): Event => [
  at,
  (c, ids) => {
    c.setTransport('playing', at);
    c.setLoaded(ids[which(ids.length)] ?? null, at, true);
  },
];
export const conceal = (at: number): Event => [at, (c) => c.conceal(at)];

/** The storyboard for `count` discs framed for `layout`. */
export function stage(layout: (typeof LAYOUTS)[number], count: number) {
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
export function sweep(
  layout: (typeof LAYOUTS)[number],
  count: number,
  events: readonly Event[],
  from: number,
  to: number,
) {
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

export function radioContact(disc: DiscSample, lidDegrees: number): string | null {
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
