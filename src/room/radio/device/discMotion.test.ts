import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { projectToPage } from '../../camera/pageProjection';
import { DISC_RADIUS, discSlots } from '../discLayout';
import { RADIO_FIXTURE } from '../radioFixtures';
import { radioViewpoint, slotOrientation } from '../radioFraming';
import { DECK } from './deckLayout';
import {
  anticipate,
  apexPose,
  approachPoint,
  attentionPose,
  centreOutOrder,
  DISC_MOTION,
  type DiscPose,
  drop,
  flight,
  glide,
  hiddenPose,
  idleCharacter,
  idleOffset,
  lowestY,
  type PoseSegment,
  returnHome,
  rise,
  riseStagger,
  seatPose,
  settle,
  slotPose,
  unseat,
} from './discMotion';

const VIEWPORT = { width: 1440, height: 900 };
const SLOTS = discSlots(5, 1.6);
const EYE = radioViewpoint(RADIO_FIXTURE, SLOTS, VIEWPORT, { top: 0, right: 0, bottom: 0, left: 0 }).position;

function samples(segment: PoseSegment, steps = 100): DiscPose[] {
  return Array.from({ length: steps + 1 }, (_, i) =>
    segment.at(segment.start + ((segment.end - segment.start) * i) / steps),
  );
}

function sound(pose: DiscPose): void {
  expect([...pose.position.toArray(), ...pose.orientation.toArray(), pose.scale].every(Number.isFinite)).toBe(true);
  expect(pose.orientation.length()).toBeCloseTo(1, 9);
}

describe('the rise and the glide', () => {
  it('waits fully hidden below the well floor, then comes up through the slot', () => {
    const hidden = hiddenPose();
    expect(hidden.position.y + DISC_RADIUS).toBeLessThan(DECK.slot.floorY);
    expect(hidden.position.z).toBe(DECK.slot.z);
    const up = rise(hidden, apexPose(SLOTS[0] as never, 0), 0, DISC_MOTION.rise.ms);
    expect(up.at(0).position.distanceTo(hidden.position)).toBeLessThan(1e-12);
    // It stays in the slot's plane and only drifts towards its slot once clear of the floor.
    for (const pose of samples(up)) {
      sound(pose);
      expect(pose.position.z).toBeCloseTo(DECK.slot.z, 9);
      if (pose.position.y - DISC_RADIUS < DECK.slot.floorY) {
        expect(Math.abs(pose.position.x - hidden.position.x) + DISC_RADIUS).toBeLessThanOrEqual(
          (DECK.slot.maxX - DECK.slot.minX) / 2 + 1e-9,
        );
      }
    }
  });

  it.each(SLOTS.map((slot, i) => [i, slot] as const))(
    'glides disc %i to its slot, label out by 75 %',
    (index, slot) => {
      const apex = apexPose(slot, index);
      const across = glide(apex, slot, 0, DISC_MOTION.glide.ms);
      const start = across.at(0);
      expect(start.position.distanceTo(apex.position)).toBeLessThan(1e-12);
      expect(start.orientation.angleTo(apex.orientation)).toBeLessThan(1e-6);
      for (const pose of samples(across)) sound(pose);
      // The half turn is done by 75 % of the glide: the label faces the slot's way from there.
      const late = across.at(across.start + 0.75 * DISC_MOTION.glide.ms);
      const goal = slotOrientation(slot);
      const lateFacing = new Vector3(0, 0, 1).applyQuaternion(late.orientation);
      expect(lateFacing.dot(new Vector3(0, 0, 1).applyQuaternion(goal))).toBeGreaterThan(0.9);
      // It ends 6 mm past the slot; the settle springs it back into place.
      const end = across.at(across.end);
      expect(end.position.distanceTo(slot.position)).toBeCloseTo(DISC_MOTION.settle.overshoot, 6);
      const back = settle(end, slot, across.end);
      expect(back.at(back.end).position.distanceTo(slot.position)).toBeLessThan(0.0002);
    },
  );

  it('staggers centre-out on the way up, clamped to 30–60 ms', () => {
    expect(centreOutOrder(5)).toEqual([2, 1, 3, 0, 4]);
    expect(centreOutOrder(1)).toEqual([0]);
    expect(riseStagger(5, false)).toBe(60);
    expect(riseStagger(4, false)).toBe(60);
    expect(riseStagger(7, false)).toBe(40);
    expect(riseStagger(12, false)).toBe(30);
    expect(riseStagger(1, false)).toBe(0);
    expect(riseStagger(5, true)).toBe(40);
  });

  it('rises behind a disc already in the player, clear of its back edge', () => {
    const seat = seatPose();
    const back = new Vector3(0, -DISC_RADIUS, 0).applyQuaternion(seat.orientation).add(seat.position);
    // The rising disc is in the slot's plane, 1.2 mm thick.
    expect(back.z - (DECK.slot.z + 0.0006)).toBeGreaterThanOrEqual(0.012);
  });
});

describe('the pick', () => {
  it('passes in front of the discs it crosses on its way to the player', () => {
    const pose = radioViewpoint(RADIO_FIXTURE, SLOTS, VIEWPORT, { top: 0, right: 0, bottom: 0, left: 0 });
    type Point = { x: number; y: number };
    const outline = (centre: Vector3, orientation: Quaternion): Point[] =>
      projectToPage(
        Array.from({ length: 32 }, (_, k) =>
          new Vector3(Math.cos((k * Math.PI) / 16) * DISC_RADIUS, Math.sin((k * Math.PI) / 16) * DISC_RADIUS, 0)
            .applyQuaternion(orientation)
            .add(centre),
        ),
        pose,
        VIEWPORT,
      );
    const overlap = (a: Point[], b: Point[]) =>
      [a, b].every((polygon) =>
        polygon.every((p, i) => {
          const q = polygon[(i + 1) % polygon.length] as Point;
          const span = (poly: Point[]) => poly.map((v) => v.x * (q.y - p.y) + v.y * (p.x - q.x));
          const [sa, sb] = [span(a), span(b)];
          return !(Math.max(...sa) < Math.min(...sb) || Math.max(...sb) < Math.min(...sa));
        }),
      );
    for (const [index, slot] of SLOTS.entries()) {
      const start = attentionPose(slot, EYE);
      const antic = anticipate(start, EYE, 0);
      const fly = flight(antic.at(antic.end), approachPoint(), EYE, antic.end, DISC_MOTION.pick.flightMs);
      for (const [other, neighbour] of SLOTS.entries()) {
        // The disc hanging right above the seat lifts while this one drops beneath it into the well.
        if (other === index || Math.abs(neighbour.position.x - DECK.seat.x) < 0.07) continue;
        // Wherever the flying disc covers another on screen it is nearer the camera (the other leans 30 mm back from
        // the pick on, in by the flight's first 30 ms); the tightest is the tail of the overlap, 18 mm.
        const away = neighbour.position.clone().sub(EYE).setY(0).normalize().multiplyScalar(0.03);
        const resting = neighbour.position.clone().add(away);
        const restingOutline = outline(resting, slotOrientation(neighbour));
        for (const flying of samples(fly, 200).slice(6)) {
          sound(flying);
          if (!overlap(outline(flying.position, flying.orientation), restingOutline)) continue;
          expect(resting.distanceTo(EYE) - flying.position.distanceTo(EYE)).toBeGreaterThanOrEqual(0.015);
        }
      }
    }
  });

  it('flies flat onto the approach point, drops onto the spindle and bounces 1.5 mm', () => {
    const start = attentionPose(SLOTS[0] as never, EYE);
    const fly = flight(start, approachPoint(), EYE, 0, 560);
    const above = fly.at(fly.end);
    expect(above.position.distanceTo(approachPoint())).toBeLessThan(1e-9);
    expect(above.orientation.angleTo(seatPose().orientation)).toBeLessThan(1e-6);
    expect(above.position.distanceTo(DECK.seat)).toBeCloseTo(0.093, 6);
    const fall = drop(above.position, 560);
    expect(fall.at(560 + DISC_MOTION.pick.dropMs).position.distanceTo(DECK.seat)).toBeLessThan(1e-9);
    const bounce = fall.at(560 + DISC_MOTION.pick.dropMs + DISC_MOTION.pick.bounceMs / 2);
    expect(bounce.position.distanceTo(DECK.seat)).toBeCloseTo(0.0015, 6);
    expect(fall.at(fall.end).position.distanceTo(DECK.seat)).toBeLessThan(1e-9);
  });

  it('pops a disc 25 mm off the spindle when it makes way, overshooting a little', () => {
    const pop = unseat(seatPose(), 0);
    expect(pop.at(0).position.distanceTo(DECK.seat)).toBeLessThan(1e-12);
    expect(pop.at(pop.end).position.distanceTo(DECK.seat)).toBeCloseTo(0.025, 6);
    expect(Math.max(...samples(pop).map((pose) => pose.position.distanceTo(DECK.seat)))).toBeGreaterThan(0.025);
  });
});

describe('the return', () => {
  it('flips back to the data side over the slit and sinks out of sight', () => {
    const slot = SLOTS[1] as never;
    const home = returnHome(slotPose(slot), apexPose(slot, 0), 0);
    for (const pose of samples(home)) sound(pose);
    const end = home.at(home.end);
    expect(end.position.distanceTo(hiddenPose().position)).toBeLessThan(1e-9);
    expect(lowestY(end) + 2 * DISC_RADIUS).toBeLessThan(DECK.slot.floorY + DISC_RADIUS);
    expect(home.end).toBe(DISC_MOTION.leave.glideMs + DISC_MOTION.leave.sinkMs);
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
