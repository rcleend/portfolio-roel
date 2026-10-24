import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DISC_RADIUS, discSlots } from '../discLayout';
import { RADIO_FIXTURE } from '../radioFixtures';
import { radioViewpoint, slotOrientation } from '../radioFraming';
import { DECK } from './deckLayout';
import {
  across,
  anticipate,
  apexPose,
  approachPoint,
  attentionPose,
  backOut,
  backToExit,
  DISC_MOTION,
  type DiscPose,
  drop,
  exitPlane,
  frontPoint,
  hiddenPose,
  homeInFront,
  hoverPose,
  idleCharacter,
  idleOffset,
  insertFlight,
  into,
  leaveLane,
  lowestY,
  outOf,
  type PoseSegment,
  rise,
  riseLane,
  riseOrder,
  riseStagger,
  SLIT_X,
  seatPose,
  settle,
  sink,
  slide,
  slotPose,
  standUp,
  underShelf,
} from './discMotion';

const VIEWPORT = { width: 1440, height: 900 };
const SLOTS = discSlots(5, 1.6);
const EYE = radioViewpoint(RADIO_FIXTURE, SLOTS, VIEWPORT, { top: 0, right: 0, bottom: 0, left: 0 }).position;
const normalOf = (pose: DiscPose) => new Vector3(0, 0, 1).applyQuaternion(pose.orientation);

function samples(segment: PoseSegment, steps = 100): DiscPose[] {
  return Array.from({ length: steps + 1 }, (_, i) =>
    segment.at(segment.start + ((segment.end - segment.start) * i) / steps),
  );
}

function sound(pose: DiscPose): void {
  expect([...pose.position.toArray(), ...pose.orientation.toArray(), pose.scale].every(Number.isFinite)).toBe(true);
  expect(pose.orientation.length()).toBeCloseTo(1, 9);
}

describe('the rise', () => {
  it('waits fully hidden below the well floor, then comes up through the slot', () => {
    const hidden = hiddenPose();
    expect(hidden.position.y + DISC_RADIUS).toBeLessThan(DECK.slot.floorY);
    expect(hidden.position.z).toBe(DECK.slot.z);
    const up = rise(hidden, apexPose(SLOTS[0] as never, riseLane(0, 5)), 0, DISC_MOTION.rise.ms);
    expect(up.at(0).position.distanceTo(hidden.position)).toBeLessThan(1e-12);
    for (const pose of samples(up)) {
      sound(pose);
      // In the slot's own plane until its lower edge is clear of the lips and of a disc lying in the player.
      if (lowestY(pose) < DISC_MOTION.rise.clearY) {
        expect(pose.position.z).toBeCloseTo(DECK.slot.z, 9);
        expect(Math.abs(pose.position.x - SLIT_X) + DISC_RADIUS * pose.scale).toBeLessThanOrEqual(
          (DECK.slot.maxX - DECK.slot.minX) / 2 + 1e-9,
        );
      }
    }
  });

  it('is in its lane a fifth of a rise after it is clear, the first one up furthest forward', () => {
    const up = rise(hiddenPose(), apexPose(SLOTS[0] as never, riseLane(0, 5)), 0, DISC_MOTION.rise.ms);
    expect(up.at(up.end).position.z - DECK.slot.z).toBeCloseTo(riseLane(0, 5), 9);
    const lanes = [0, 1, 2, 3, 4].map((k) => riseLane(k, 5));
    for (let k = 1; k < lanes.length; k++) {
      // Parallel discs in lanes this far apart cannot touch.
      expect((lanes[k - 1] ?? 0) - (lanes[k] ?? 0)).toBeGreaterThan(0.004);
    }
    expect(lanes.at(-1)).toBeCloseTo(DISC_MOTION.rise.lane, 9);
  });

  it('rises behind a disc already in the player, clear of its back edge', () => {
    const seat = seatPose();
    const back = new Vector3(0, -DISC_RADIUS, 0).applyQuaternion(seat.orientation).add(seat.position);
    // The rising disc is in the slot's plane, 1.2 mm thick, until it is above the seated disc.
    expect(back.z - (DECK.slot.z + 0.0006)).toBeGreaterThanOrEqual(0.012);
    expect(DISC_MOTION.rise.clearY).toBeGreaterThan(DECK.seat.y + 0.002);
  });

  it('goes across within its lane, upright, data side out, and turns over going into its slot', () => {
    for (const [index, slot] of SLOTS.entries()) {
      const apex = apexPose(slot, riseLane(index, 5));
      const side = across(apex, slot.position, 0, DISC_MOTION.across.ms);
      for (const pose of samples(side)) {
        sound(pose);
        expect(pose.position.z).toBeCloseTo(apex.position.z, 12);
        expect(normalOf(pose).z).toBeCloseTo(-1, 9);
      }
      const behind = side.at(side.end);
      expect(behind.position.x).toBeCloseTo(slot.position.x, 9);
      expect(behind.position.y).toBeCloseTo(slot.position.y, 9);
      const enter = into(behind, slot, side.end, DISC_MOTION.into.ms);
      for (const pose of samples(enter)) {
        sound(pose);
        // Only ever in its own slot's column.
        expect(Math.hypot(pose.position.x - slot.position.x, pose.position.y - slot.position.y)).toBeLessThan(1e-9);
      }
      const end = enter.at(enter.end);
      expect(end.orientation.angleTo(slotOrientation(slot))).toBeLessThan(1e-6);
      expect(end.position.distanceTo(slot.position)).toBeCloseTo(DISC_MOTION.settle.overshoot, 9);
      const back = settle(end, slot, enter.end);
      expect(back.at(back.end).position.distanceTo(slot.position)).toBeLessThan(0.0002);
    }
  });

  it('rises the furthest slot first, one side then the other', () => {
    expect(riseOrder(SLOTS)).toEqual([4, 0, 3, 1, 2]);
    expect(riseOrder(discSlots(1, 1.6))).toEqual([0]);
    // On a phone the top of the stack first.
    const stack = discSlots(5, 0.46);
    const order = riseOrder(stack);
    const heights = order.map((index) => stack[index]?.position.y ?? 0);
    expect(heights).toEqual([...heights].sort((a, b) => b - a));
  });

  it('staggers 55–60 ms: a disc must be in its lane before the next one reaches it', () => {
    expect(riseStagger(5, false)).toBe(60);
    expect(riseStagger(4, false)).toBe(60);
    expect(riseStagger(7, false)).toBe(55);
    expect(riseStagger(12, false)).toBe(55);
    expect(riseStagger(1, false)).toBe(0);
    expect(riseStagger(5, true)).toBe(55);
  });
});

describe('the pick', () => {
  it('flies out in front of the shelf, upright at first and flat by the time it is down in front of the radio', () => {
    for (const slot of SLOTS) {
      const start = attentionPose(slot, EYE);
      const antic = anticipate(start, EYE, 0);
      const fly = insertFlight(antic.at(antic.end), EYE, antic.end, DISC_MOTION.pick.flightMs);
      const poses = samples(fly, 200);
      for (const pose of poses) sound(pose);
      const end = fly.at(fly.end);
      expect(end.position.distanceTo(frontPoint())).toBeLessThan(1e-9);
      expect(end.orientation.angleTo(seatPose().orientation)).toBeLessThan(1e-6);
      // Out of the shelf before it moves across: sideways only once a disc's width in front of where it was.
      for (const pose of poses) {
        if (Math.abs(pose.position.x - start.position.x) > 0.005) {
          expect(pose.position.z - start.position.z).toBeGreaterThan(0.06);
        }
      }
    }
  });

  it('slides back flat over the seat, drops onto the spindle and bounces 1.5 mm', () => {
    const over = slide(0, 0);
    expect(over.at(0).position.distanceTo(frontPoint())).toBeLessThan(1e-9);
    expect(over.at(over.end).position.distanceTo(approachPoint())).toBeLessThan(1e-9);
    // Under the discs hanging above the seat: their lower edges are 40 mm above it.
    for (const pose of samples(over)) expect(pose.position.y).toBeCloseTo(approachPoint().y, 9);
    expect(approachPoint().distanceTo(DECK.seat)).toBeCloseTo(0.093, 6);
    const fall = drop(approachPoint(), 0);
    expect(fall.at(DISC_MOTION.pick.dropMs).position.distanceTo(DECK.seat)).toBeLessThan(1e-9);
    const bounce = fall.at(DISC_MOTION.pick.dropMs + DISC_MOTION.pick.bounceMs / 2);
    expect(bounce.position.distanceTo(DECK.seat)).toBeCloseTo(0.0015, 6);
    expect(fall.at(fall.end).position.distanceTo(DECK.seat)).toBeLessThan(1e-9);
  });

  it('called back from the slide, backs out from under the shelf first, then goes home in front', () => {
    const under = slide(0, 0).at(DISC_MOTION.pick.slideMs * 0.7);
    expect(underShelf(under)).toBe(true);
    const out = backOut(under, 0);
    expect(out.at(out.end).position.distanceTo(frontPoint())).toBeLessThan(1e-9);
    for (const pose of samples(out)) expect(pose.position.y).toBeCloseTo(approachPoint().y, 9);
    const slot = SLOTS[0] as never;
    const home = homeInFront(out.at(out.end), slot, EYE, out.end);
    for (const pose of samples(home)) sound(pose);
    expect(home.at(home.end).position.distanceTo(slotPose(slot).position)).toBeCloseTo(DISC_MOTION.settle.overshoot, 6);
    expect(underShelf(attentionPose(slot, EYE))).toBe(false);
  });
});

describe('the way out of the player', () => {
  it('lifts off the spindle and stands up, label to the camera, its front edge clear of the well floor', () => {
    const stand = standUp(0);
    for (const pose of samples(stand)) {
      sound(pose);
      expect(lowestY(pose)).toBeGreaterThan(DECK.slot.floorY);
    }
    expect(normalOf(stand.at(stand.end)).z).toBeGreaterThan(0.99);
  });

  it('goes home behind every disc on the shelf, never deeper than clear of the open lid', () => {
    for (const [count, aspect] of [
      [5, 1.6],
      [12, 1.6],
      [5, 0.46],
      [12, 0.46],
    ] as const) {
      const slots = discSlots(count, aspect);
      const plane = exitPlane(slots);
      expect(plane).toBeGreaterThanOrEqual(DISC_MOTION.swap.deepestExitZ);
      for (const slot of slots)
        expect(slot.position.z - DISC_RADIUS * Math.sin(slot.tilt)).toBeGreaterThan(plane + 0.01);
    }
    const stood = standUp(0);
    const back = backToExit(stood.at(stood.end), exitPlane(SLOTS), stood.end);
    expect(back.at(back.end).position.z).toBeCloseTo(exitPlane(SLOTS), 9);
  });
});

describe('the leave', () => {
  it('goes out of its slot into its lane, upright and data side out again, in its own column', () => {
    const slot = SLOTS[1] as never;
    const out = outOf(slotPose(slot), slot, leaveLane(0), 0, DISC_MOTION.leave.outMs);
    for (const pose of samples(out)) {
      sound(pose);
      expect(
        Math.hypot(pose.position.x - slotPose(slot).position.x, pose.position.y - slotPose(slot).position.y),
      ).toBeLessThan(1e-9);
    }
    const end = out.at(out.end);
    expect(normalOf(end).z).toBeCloseTo(-1, 9);
    expect(end.position.z - DECK.slot.z).toBeCloseTo(leaveLane(0), 9);
  });

  it('takes the lane nearest the slot first, and sinks back into its plane before its lower edge reaches the floor', () => {
    expect(leaveLane(1) - leaveLane(0)).toBeGreaterThan(0.004);
    const hover = hoverPose(SLOTS[3] as never, leaveLane(4));
    const down = sink(hover, 0);
    for (const pose of samples(down, 400)) {
      sound(pose);
      if (lowestY(pose) < DISC_MOTION.rise.clearY) {
        expect(pose.position.z).toBeCloseTo(DECK.slot.z, 9);
        expect(pose.position.x).toBeCloseTo(SLIT_X, 9);
      }
    }
    expect(down.at(down.end).position.distanceTo(hiddenPose().position)).toBeLessThan(1e-9);
  });
});

describe('the float', () => {
  it('bobs ±3.5 mm and wobbles ±1.5° at its own pace, and rests still at zero amplitude', () => {
    const characters = [0, 1, 2, 3, 4].map(idleCharacter);
    expect(new Set(characters.map((c) => c.bobPeriod)).size).toBe(5);
    for (const character of characters) {
      expect(character.bobPeriod).toBeGreaterThanOrEqual(2800);
      expect(character.bobPeriod).toBeLessThanOrEqual(3600);
      expect(Math.abs(character.spin) / (2 * Math.PI)).toBeGreaterThanOrEqual(0.12);
      expect(Math.abs(character.spin) / (2 * Math.PI)).toBeLessThanOrEqual(0.18);
      let highest = 0;
      for (let t = 0; t < 4000; t += 10) highest = Math.max(highest, Math.abs(idleOffset(character, t, 1).y));
      expect(highest).toBeLessThanOrEqual(0.0035 + 1e-12);
      expect(idleOffset(character, 1234, 0).y).toBeCloseTo(0, 12);
      expect(idleOffset(character, 1234, 0).wobble.angleTo(new Quaternion())).toBe(0);
    }
    // Neighbours spin opposite ways.
    expect(Math.sign(characters[0]?.spin ?? 0)).toBe(-Math.sign(characters[1]?.spin ?? 0));
  });
});
