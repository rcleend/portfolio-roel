import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { discsTouch } from './discContact';

const facing = new Quaternion();
const turned = (axis: Vector3, degrees: number) => new Quaternion().setFromAxisAngle(axis, (degrees * Math.PI) / 180);
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const disc = (x: number, y: number, z: number, orientation = facing, scale = 1) => ({
  position: new Vector3(x, y, z),
  orientation,
  scale,
});

describe('discsTouch', () => {
  it('parallel discs touch only within a thickness of each other, overlapping', () => {
    expect(discsTouch(disc(0, 0, 0), disc(0.05, 0, 0.0005))).toBe(true);
    expect(discsTouch(disc(0, 0, 0), disc(0.05, 0, 0.002))).toBe(false);
    expect(discsTouch(disc(0, 0, 0), disc(0.05, 0, 0.002), 0.002)).toBe(true);
    // Side by side in one plane: 121 mm apart do not touch, 119 mm do.
    expect(discsTouch(disc(0, 0, 0), disc(0.121, 0, 0))).toBe(false);
    expect(discsTouch(disc(0, 0, 0), disc(0.119, 0, 0))).toBe(true);
  });

  it('a disc standing through another touches it; one standing beside it does not', () => {
    const upright = turned(X, 90);
    expect(discsTouch(disc(0, 0, 0), disc(0, 0, 0.03, upright))).toBe(true);
    // Its plane crosses the other's, but 70 mm out it misses the 60 mm disc.
    expect(discsTouch(disc(0, 0, 0), disc(0, 0.07, 0.03, upright))).toBe(false);
    // Crossing planes whose chords miss each other: a disc beyond the other's rim.
    expect(discsTouch(disc(0, 0, 0), disc(0.13, 0, 0, turned(Y, 90)))).toBe(false);
  });

  it('a disc mid-flip sweeps through a neighbour 40 mm behind it, but not one 65 mm behind', () => {
    const edgeOn = turned(Y, 90);
    expect(discsTouch(disc(0, 0, 0, edgeOn), disc(0.02, 0, -0.04))).toBe(true);
    expect(discsTouch(disc(0, 0, 0, edgeOn), disc(0.02, 0, -0.065))).toBe(false);
  });

  it('scales with the disc: a bigger disc reaches further', () => {
    expect(discsTouch(disc(0, 0, 0), disc(0.1225, 0, 0, facing, 1.06))).toBe(true);
    expect(discsTouch(disc(0, 0, 0), disc(0.1225, 0, 0))).toBe(false);
  });

  it('agrees with a dense sampling of both surfaces on random pairs', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647) * 2 - 1;
    };
    let agreed = 0;
    for (let i = 0; i < 400; i++) {
      const a = disc(0, 0, 0, new Quaternion(random(), random(), random(), random()).normalize());
      const b = disc(
        random() * 0.08,
        random() * 0.08,
        random() * 0.08,
        new Quaternion(random(), random(), random(), random()).normalize(),
      );
      if (discsTouch(a, b) === sampledCrossing(a, b)) agreed++;
    }
    // Sampling misses slivers the exact test sees: near-total agreement.
    expect(agreed).toBeGreaterThanOrEqual(392);
  });
});

/** The review's sampled test: does A's surface cross B's plane inside B's rim? */
function sampledCrossing(a: ReturnType<typeof disc>, b: ReturnType<typeof disc>): boolean {
  const normal = new Vector3(0, 0, 1).applyQuaternion(b.orientation);
  let above = false;
  let below = false;
  for (let ring = 0; ring <= 12; ring++) {
    const r = (0.06 * ring) / 12;
    for (let k = 0; k < 48; k++) {
      const angle = (2 * Math.PI * k) / 48;
      const p = new Vector3(r * Math.cos(angle), r * Math.sin(angle), 0).applyQuaternion(a.orientation).add(a.position);
      const relative = p.sub(b.position);
      const d = relative.dot(normal);
      const radial = relative.addScaledVector(normal, -d).length();
      if (radial > 0.06) continue;
      if (d > 0.0006) above = true;
      else if (d < -0.0006) below = true;
      else return true;
    }
  }
  return above && below;
}
