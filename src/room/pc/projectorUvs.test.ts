import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type GlassPlane, planeCentre, planeCorners } from './glassPlane';
import { pcViewpoint } from './pcFraming';
import { projectorUvs } from './projectorUvs';

/** pc-base.glb's glass: the rim plane and the curved glass's bulge towards the viewer. */
const RIM: GlassPlane = { minX: -1.518, maxX: -1.162, minY: 0.929, maxY: 1.213, z: -1.679 };
const SAG = 0.011;
const EYE = pcViewpoint({ facing: new Vector3(0, 0, 1), rim: RIM }, 1440 / 900).position;

/** A point of a glass that bulges `SAG` in its middle, like the monitor's. */
function onCurvedGlass(u: number, v: number): Vector3 {
  const x = RIM.minX + u * (RIM.maxX - RIM.minX);
  const y = RIM.maxY - v * (RIM.maxY - RIM.minY);
  return new Vector3(x, y, RIM.z + SAG * (1 - (2 * u - 1) ** 2) * (1 - (2 * v - 1) ** 2));
}

/** Where the eye's ray through `point` (on the rim plane) meets the curved glass. */
function seenThrough(point: Vector3): Vector3 {
  const direction = point.clone().sub(EYE);
  // Bisect along the ray for the depth at which it pierces the glass.
  let near = 0;
  let far = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (near + far) / 2;
    const p = EYE.clone().addScaledVector(direction, mid);
    const u = (p.x - RIM.minX) / (RIM.maxX - RIM.minX);
    const v = (RIM.maxY - p.y) / (RIM.maxY - RIM.minY);
    if (p.z > onCurvedGlass(u, v).z) near = mid;
    else far = mid;
  }
  return EYE.clone().addScaledVector(direction, far);
}

const pack = (points: readonly Vector3[]): Float32Array => new Float32Array(points.flatMap((p) => p.toArray()));

describe('projectorUvs', () => {
  it('maps the rim corners to the corners of the texture', () => {
    const uvs = projectorUvs(pack(planeCorners(RIM)), EYE, RIM);
    const expected = [0, 0, 1, 0, 0, 1, 1, 1];
    for (const [i, value] of expected.entries()) expect(Math.abs((uvs[i] as number) - value)).toBeLessThan(1e-6);
  });

  it('gives the glass under the middle of the page rectangle the middle of the texture', () => {
    const [u, v] = projectorUvs(pack([seenThrough(planeCentre(RIM))]), EYE, RIM);
    expect(Math.abs((u as number) - 0.5)).toBeLessThan(1e-4);
    expect(Math.abs((v as number) - 0.5)).toBeLessThan(1e-4);
  });

  it.each([
    [0.1, 0.1],
    [0.9, 0.2],
    [0.3, 0.75],
    [0.98, 0.98],
  ])('registers the bulging glass with the flat rectangle at (%s, %s)', (u, v) => {
    const flat = new Vector3(RIM.minX + u * (RIM.maxX - RIM.minX), RIM.maxY - v * (RIM.maxY - RIM.minY), RIM.z);
    const [pu, pv] = projectorUvs(pack([seenThrough(flat)]), EYE, RIM);
    expect(Math.abs((pu as number) - u)).toBeLessThan(1e-6);
    expect(Math.abs((pv as number) - v)).toBeLessThan(1e-6);
  });

  it('differs from the planar UVs where the glass bulges, which is why it exists', () => {
    const bulge = onCurvedGlass(0.05, 0.5);
    const [u] = projectorUvs(pack([bulge]), EYE, RIM);
    // Planar UVs would say 0.05; seen from the eye, that glass shows the texture further out.
    expect(Math.abs((u as number) - 0.05)).toBeGreaterThan(1e-3);
  });
});
