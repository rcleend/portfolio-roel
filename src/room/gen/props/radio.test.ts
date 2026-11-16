import { describe, expect, it } from 'vitest';
import { DECK } from '../../radio/device/deckLayout';
import { RADIO_FIXTURE } from '../../radio/radioFixtures';
import { LID_FRAMING } from '../../radio/radioFraming';
import { RADIO_ANCHOR } from '../../radio/radioModel';
import type { MeshData } from '../kit/builder';
import { buildScene } from '../scene';
import { RADIO_MESHES, RADIO_SPEC } from './radioSpec';

const scene = buildScene({ densityScale: 1, maxPageSize: 2048 }, () => 0);
/** What the mechanism may differ by (m). */
const HALF_MM = 0.0005;

function bounds(mesh: MeshData): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i++) {
    const value = mesh.positions[i] as number;
    min[i % 3] = Math.min(min[i % 3] as number, value);
    max[i % 3] = Math.max(max[i % 3] as number, value);
  }
  return { min, max };
}

const near = (actual: number, expected: number, tolerance = HALF_MM): void =>
  expect(Math.abs(actual - expected), `${actual} against ${expected}`).toBeLessThanOrEqual(tolerance);

describe('the generated CD player', () => {
  it('is the machine the cameras, the choreography and the overlays were made for', () => {
    const { hinge, lid, keys, turntable, slot, bodyBounds, anchor } = RADIO_SPEC;
    near(hinge.point[1], LID_FRAMING.hinge.y);
    near(hinge.point[2], LID_FRAMING.hinge.z);
    expect(hinge.openDegrees).toBe(LID_FRAMING.openDegrees);
    for (const key of ['minX', 'maxX', 'frontY', 'frontZ'] as const) near(lid[key], LID_FRAMING.lid[key], 0.0006);
    DECK.seat.toArray().forEach((value, i) => {
      near(turntable.centre[i] as number, value);
    });
    DECK.seatNormal.toArray().forEach((value, i) => {
      near(turntable.normal[i] as number, value, 1e-3);
    });
    for (const key of ['z', 'minX', 'maxX', 'floorY'] as const) near(slot[key], DECK.slot[key]);
    for (const part of ['rocker', 'previous', 'next'] as const)
      for (const key of ['minX', 'maxX', 'minY', 'maxY'] as const) near(keys[part][key], DECK.keys[part][key]);
    near(keys.pivotY, DECK.keys.pivotY);
    near(keys.frontZ, DECK.keys.frontZ);
    RADIO_FIXTURE.bodyBounds.min.toArray().forEach((value, i) => {
      near(bodyBounds.min[i] as number, value);
    });
    RADIO_FIXTURE.bodyBounds.max.toArray().forEach((value, i) => {
      near(bodyBounds.max[i] as number, value);
    });
    RADIO_ANCHOR.toArray().forEach((value, i) => {
      near(anchor[i] as number, value);
    });
  });

  it('fills the shipped radio’s outline and never leaves it', () => {
    const body = bounds(scene.meshes.radio);
    const { min, max } = RADIO_SPEC.bodyBounds;
    for (let i = 0; i < 3; i++) {
      expect(body.min[i]).toBeGreaterThanOrEqual((min[i] as number) - HALF_MM);
      expect(body.max[i]).toBeLessThanOrEqual((max[i] as number) + HALF_MM);
    }
    // Its width, its height and its front to within a millimetre; the back is the aerial's.
    near(body.min[0] as number, min[0], 0.001);
    near(body.max[0] as number, max[0], 0.001);
    near(body.min[1] as number, min[1], 0.001);
    near(body.max[1] as number, max[1], 0.001);
    near(body.max[2] as number, max[2], 0.001);
    expect(body.min[2]).toBeLessThan(min[2] + 0.006);
  });

  it('builds the parts where the spec says they are', () => {
    const lid = bounds(scene.meshes.radioLid);
    near(lid.min[0] as number, RADIO_SPEC.lid.minX);
    near(lid.max[0] as number, RADIO_SPEC.lid.maxX);
    near(lid.max[2] as number, RADIO_SPEC.lid.frontZ);
    near(lid.max[1] as number, RADIO_SPEC.lid.frontY);
    near(lid.min[2] as number, RADIO_SPEC.hinge.point[2], 0.001);
    // The keys' faces: nothing of a key stands proud of its face plane, and each fills its box.
    const face = (y: number): number => RADIO_SPEC.keys.frontZ - 0.0002 - RADIO_SPEC.keys.slope * (y - 1.035);
    const boxes = {
      radioRockerTop: { ...RADIO_SPEC.keys.rocker, minY: RADIO_SPEC.keys.pivotY },
      radioRockerBottom: { ...RADIO_SPEC.keys.rocker, maxY: RADIO_SPEC.keys.pivotY },
      radioPrevious: RADIO_SPEC.keys.previous,
      radioNext: RADIO_SPEC.keys.next,
    } as const;
    for (const [name, box] of Object.entries(boxes) as [keyof typeof boxes, (typeof boxes)[keyof typeof boxes]][]) {
      const mesh = scene.meshes[name];
      const key = bounds(mesh);
      near(key.min[0] as number, box.minX);
      near(key.max[0] as number, box.maxX);
      for (let i = 0; i < mesh.positions.length; i += 3)
        expect(mesh.positions[i + 2] as number).toBeLessThanOrEqual(face(mesh.positions[i + 1] as number) + 0.0002);
      // Deep enough to stay in its seat pressed (2.5 mm) or tipped out (6°).
      expect((key.max[2] as number) - (key.min[2] as number)).toBeGreaterThan(0.004);
    }
    const well = bounds(scene.meshes.radioWell);
    expect(well.min[0]).toBeLessThanOrEqual(RADIO_SPEC.well.minX);
    expect(well.max[0]).toBeGreaterThanOrEqual(RADIO_SPEC.well.maxX);
    // The turntable holds a disc at the seat: its platter under the disc's lower face, its spindle through the hole.
    const { centre, normal } = RADIO_SPEC.turntable;
    let [platter, spindle] = [-Infinity, -Infinity];
    const p = scene.meshes.radioWell.positions;
    for (let i = 0; i < p.length; i += 3) {
      const d = [(p[i] as number) - centre[0], (p[i + 1] as number) - centre[1], (p[i + 2] as number) - centre[2]];
      const height = (d[0] as number) * normal[0] + (d[1] as number) * normal[1] + (d[2] as number) * normal[2];
      const radius = Math.hypot(...d.map((value, k) => value - height * (normal[k] as number)));
      if (radius > 0.0076 && radius < 0.06) platter = Math.max(platter, height);
      if (radius <= 0.0074) spindle = Math.max(spindle, height);
      // Nothing of the well reaches into a seated disc but the spindle through its hole.
      if (radius > 0.0076 && radius < 0.06) expect(height).toBeLessThan(-0.0006);
    }
    expect(platter).toBeGreaterThan(-0.0012);
    expect(spindle).toBeGreaterThan(0.002);
    // The lid's underside is generated open: above the hinge, where the bake lights it.
    const inner = bounds(scene.meshes.radioLidInner);
    expect(inner.max[1]).toBeGreaterThan(RADIO_SPEC.hinge.point[1] + 0.2);
  });

  it('keeps the body and the close-up’s parts within their triangles', () => {
    const triangles = Object.fromEntries(
      RADIO_MESHES.map((name) => [name, scene.meshes[name].positions.length / 9]),
    ) as Record<(typeof RADIO_MESHES)[number], number>;
    expect(triangles.radio).toBeLessThanOrEqual(11000);
    const parts = Object.values(triangles).reduce((sum, count) => sum + count, 0) - triangles.radio;
    expect(parts).toBeLessThanOrEqual(4000);
  });
});
