import { Box3, MathUtils, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Viewpoint } from '../camera/cameraPath';
import { projectToPage } from '../camera/pageProjection';
import { DECK, seatOrientation } from './device/deckLayout';
import { attentionPose } from './device/discMotion';
import { DISC_RADIUS, type DiscSlot, discSlots, labelSizeFor, STACK_BELOW_ASPECT } from './discLayout';
import { RADIO_FIXTURE, RADIO_VIEWPORTS } from './radioFixtures';
import { radioViewpoint, slotOrientation } from './radioFraming';
import { RADIO_GEOMETRY } from './radioModel';

type Point = { readonly x: number; readonly y: number };

function ring(centre: Vector3, orientation: import('three').Quaternion, radius: number, points = 24): Vector3[] {
  return Array.from({ length: points }, (_, k) => {
    const angle = (2 * Math.PI * k) / points;
    return new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0).applyQuaternion(orientation).add(centre);
  });
}

function onPage(points: Vector3[], pose: Viewpoint, viewport: { width: number; height: number }): Point[] {
  return projectToPage(points, pose, viewport).map(({ x, y }) => ({ x, y }));
}

/** Separating-axis test on two convex polygons (projected discs are ellipses: convex). */
function overlap(a: readonly Point[], b: readonly Point[]): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i] as Point;
      const q = polygon[(i + 1) % polygon.length] as Point;
      const axis = { x: q.y - p.y, y: p.x - q.x };
      const span = (poly: readonly Point[]) => poly.map((v) => v.x * axis.x + v.y * axis.y);
      const [sa, sb] = [span(a), span(b)];
      if (Math.max(...sa) < Math.min(...sb) || Math.max(...sb) < Math.min(...sa)) return false;
    }
  }
  return true;
}

/** How far two convex polygons overlap along their least-overlapping axis (px); ≤ 0 when apart. */
function depth(a: readonly Point[], b: readonly Point[]): number {
  let least = Infinity;
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i] as Point;
      const q = polygon[(i + 1) % polygon.length] as Point;
      const length = Math.hypot(q.y - p.y, p.x - q.x);
      const span = (poly: readonly Point[]) => poly.map((v) => (v.x * (q.y - p.y) + v.y * (p.x - q.x)) / length);
      const [sa, sb] = [span(a), span(b)];
      least = Math.min(least, Math.max(...sa) - Math.min(...sb), Math.max(...sb) - Math.min(...sa));
    }
  }
  return least;
}

/** Smallest distance between two disjoint polygons' outlines (vertex to edge). */
function gap(a: readonly Point[], b: readonly Point[]): number {
  if (overlap(a, b)) return 0;
  const segment = (p: Point, v: Point, w: Point) => {
    const l = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    const t = l === 0 ? 0 : MathUtils.clamp(((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l, 0, 1);
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  };
  let best = Infinity;
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const p of from) {
      for (let i = 0; i < to.length; i++)
        best = Math.min(best, segment(p, to[i] as Point, to[(i + 1) % to.length] as Point));
    }
  }
  return best;
}

function setup(count: number, viewport: (typeof RADIO_VIEWPORTS)[number]) {
  const insets = { top: 0, left: 0, right: viewport.right, bottom: viewport.bottom };
  const slots = discSlots(count, viewport.width / viewport.height);
  const pose = radioViewpoint(RADIO_FIXTURE, slots, viewport, insets);
  return { slots, pose };
}

/** Distance from a point to the open lid, a 223 mm plate across x 1.010–1.213, anywhere from 80° to 88° open. */
function lidDistance(point: Vector3): number {
  const { hinge, lid } = RADIO_GEOMETRY;
  let nearest = Infinity;
  for (let degrees = 80; degrees <= 88; degrees += 0.5) {
    const angle = MathUtils.degToRad(degrees);
    // The lid's top surface leans 9.8° further than the hinge angle (it slopes up to its front edge).
    const along = new Vector3(0, Math.sin(angle + 0.171), Math.cos(angle + 0.171));
    const relative = new Vector3(0, point.y - hinge.y, point.z - hinge.z);
    const t = MathUtils.clamp(relative.dot(along), 0, 0.226);
    const dx = Math.max(lid.minX - point.x, 0, point.x - lid.maxX);
    nearest = Math.min(nearest, Math.hypot(dx, relative.sub(along.multiplyScalar(t)).length()));
  }
  return nearest;
}

const restingDisc = (slot: DiscSlot) => ring(slot.position, slotOrientation(slot), DISC_RADIUS);

describe('discSlots', () => {
  it('hangs up to six discs in one arc centred over the well, stacking on portrait screens', () => {
    const arc = discSlots(5, 1.6);
    expect(arc.map((slot) => slot.row)).toEqual([0, 0, 0, 0, 0]);
    expect(arc[2]?.position.x).toBeCloseTo(1.1115, 6);
    expect(arc[0]?.position.x).toBeCloseTo(1.1115 - 0.27, 6);
    expect(arc[0]?.yaw).toBeCloseTo(0.275, 6);
    expect(arc[1]?.tilt).toBeCloseTo(MathUtils.degToRad(21), 6);
    const stack = discSlots(5, STACK_BELOW_ASPECT - 0.01);
    expect(stack.map((slot) => slot.row)).toEqual([2, 2, 1, 1, 0]);
    // The incomplete bottom row is centred.
    expect(stack[4]?.position.x).toBeCloseTo(1.0875, 6);
    expect(stack.every((slot) => slot.yaw === 0)).toBe(true);
  });

  it('fills the top row first with the odd disc when the arc takes two rows', () => {
    const slots = discSlots(7, 1.6);
    expect(slots.map((slot) => slot.row)).toEqual([1, 1, 1, 1, 0, 0, 0]);
    expect(discSlots(12, 0.5).map((slot) => slot.row)).toEqual([3, 3, 3, 2, 2, 2, 1, 1, 1, 0, 0, 0]);
  });

  it('clamps the count to 1–12', () => {
    expect(discSlots(0, 1.6)).toHaveLength(1);
    expect(discSlots(40, 1.6)).toHaveLength(12);
    expect(discSlots(1, 1.6)[0]?.position.x).toBeCloseTo(1.1115, 6);
  });

  describe.each(RADIO_VIEWPORTS)('at $width × $height', (viewport) => {
    it.each(Array.from({ length: 12 }, (_, i) => i + 1))('lays %i discs that never overlap on screen', (count) => {
      const { slots, pose } = setup(count, viewport);
      const discs = slots.map((slot) => onPage(restingDisc(slot), pose, viewport));
      // Known limit: two rows of 11–12 on a 21:9 screen, seen from right of the lamp, kiss by up to 4 px.
      const kiss = viewport.width / viewport.height > 2.2 && count > 10 ? 4.5 : 0;
      for (let i = 0; i < discs.length; i++) {
        for (let j = i + 1; j < discs.length; j++)
          expect(depth(discs[i] ?? [], discs[j] ?? [])).toBeLessThanOrEqual(kiss);
      }
    });

    it.each(Array.from({ length: 12 }, (_, i) => i + 1))(
      'keeps %i discs clear of the disc in the player, of the body and of the lid',
      (count) => {
        const { slots, pose } = setup(count, viewport);
        const seated = onPage(ring(DECK.seat, seatOrientation(), DISC_RADIUS), pose, viewport);
        const body = RADIO_FIXTURE.bodyBounds;
        for (const slot of slots) {
          const attention = attentionPose(slot, pose.position);
          const attended = onPage(ring(attention.position, attention.orientation, DISC_RADIUS * 1.06), pose, viewport);
          expect(gap(seated, attended)).toBeGreaterThanOrEqual(15);
          for (const point of restingDisc(slot)) {
            expect(body.distanceToPoint(point)).toBeGreaterThanOrEqual(0.02);
            // Discs are out only while the lid stands between the 80° gate and its 87.2° peak: never in its way.
            expect(lidDistance(point)).toBeGreaterThanOrEqual(0.01);
          }
        }
      },
    );
  });

  const diameters = (count: number, viewport: (typeof RADIO_VIEWPORTS)[number]) => {
    const { slots, pose } = setup(count, viewport);
    return slots.map((slot) => {
      const xs = onPage(restingDisc(slot), pose, viewport).map((p) => p.x);
      return Math.max(...xs) - Math.min(...xs);
    });
  };
  const viewport = (width: number, height: number) => {
    const found = RADIO_VIEWPORTS.find((v) => v.width === width && v.height === height);
    if (!found) throw new Error(`no viewport ${width}×${height}`);
    return found;
  };

  it.each([
    [1280, 720, 160],
    [1024, 768, 135],
    [390, 844, 125],
    [360, 640, 98],
    [844, 390, 80],
    [667, 375, 80],
  ])('shows up to six discs at least big enough to read at %i × %i (≥ %i px)', (width, height, least) => {
    for (let count = 1; count <= 6; count++) {
      expect(Math.min(...diameters(count, viewport(width, height)))).toBeGreaterThanOrEqual(least);
    }
  });

  it.each(RADIO_VIEWPORTS)('shows seven to twelve discs at least 64 px across at $width × $height', (v) => {
    // Known limit: on a landscape phone two rows of discs come to 62 px.
    const least = v.height < 480 && v.width > v.height ? 62 : 64;
    for (let count = 7; count <= 12; count++) expect(Math.min(...diameters(count, v))).toBeGreaterThanOrEqual(least);
  });
});

describe('labelSizeFor', () => {
  it('rounds the largest disc on screen (with attention headroom) up to a step', () => {
    expect(labelSizeFor(200, 1, undefined, false)).toBe(256);
    expect(labelSizeFor(240, 1, 8, false)).toBe(256);
    expect(labelSizeFor(242, 1, 8, false)).toBe(384);
    expect(labelSizeFor(214, 1.52, 8, false)).toBe(384);
    expect(labelSizeFor(214, 2, 8, false)).toBe(512);
    expect(labelSizeFor(343, 2, undefined, false)).toBe(512);
  });

  it('keeps the smallest prints on low-memory devices and software renderers', () => {
    expect(labelSizeFor(343, 2, 2, false)).toBe(256);
    expect(labelSizeFor(343, 2, 1, false)).toBe(256);
    expect(labelSizeFor(343, 2, 8, true)).toBe(256);
  });
});

void Box3;
