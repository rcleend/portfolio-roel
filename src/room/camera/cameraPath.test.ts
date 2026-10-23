import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { pcViewpoint } from '../pc/pcFraming';
import {
  craneControl,
  fovForAspect,
  interpolateViewpoint,
  pcLegProgress,
  uniformProgress,
  type Viewpoint,
} from './cameraPath';
import { roomViewpoint } from './roomFraming';

const from: Viewpoint = { position: new Vector3(0, 1, 0), target: new Vector3(1, 1, 0), fov: 30 };
const to: Viewpoint = { position: new Vector3(4, 1, 0), target: new Vector3(4, 0, -4), fov: 60 };

/** The TV ↔ room interpolation before the computer existed: one eased value, an arc lifted at its middle. */
function arcReference(a: Viewpoint, b: Viewpoint, t: number, lift: number): Viewpoint {
  const control = a.position.clone().lerp(b.position, 0.5);
  control.y += lift * 2;
  const p = a.position.clone().lerp(control, t);
  const q = control.clone().lerp(b.position, t);
  return { position: p.lerp(q, t), target: a.target.clone().lerp(b.target, t), fov: a.fov + (b.fov - a.fov) * t };
}

describe('interpolateViewpoint', () => {
  it('starts and ends exactly on the viewpoints', () => {
    const start = interpolateViewpoint(from, to, uniformProgress(0), { lift: 0.3 });
    const end = interpolateViewpoint(from, to, uniformProgress(1), { lift: 0.3 });
    expect(start.position.toArray()).toEqual(from.position.toArray());
    expect(end.position.distanceTo(to.position)).toBeLessThan(1e-9);
    expect(end.target.distanceTo(to.target)).toBeLessThan(1e-9);
    expect(end.fov).toBe(60);
  });

  it('arcs upwards by the lift at the midpoint', () => {
    const mid = interpolateViewpoint(from, to, uniformProgress(0.5), { lift: 0.3 });
    expect(mid.position.x).toBeCloseTo(2);
    expect(mid.position.y).toBeCloseTo(1.3);
    expect(mid.fov).toBe(45);
  });

  it.each([0, 0.13, 0.5, 0.77, 1])('reproduces the TV ↔ room motion with equal progress at %s', (t) => {
    const pose = interpolateViewpoint(from, to, uniformProgress(t), { lift: 0.16 });
    const reference = arcReference(from, to, t, 0.16);
    expect(pose.position.distanceTo(reference.position)).toBeLessThan(1e-12);
    expect(pose.target.distanceTo(reference.target)).toBeLessThan(1e-12);
    expect(pose.fov).toBeCloseTo(reference.fov, 12);
  });

  it('moves the look-at and the lens independently of the position', () => {
    const pose = interpolateViewpoint(from, to, { position: 0, target: 1, fov: 0.5 }, { lift: 0.3 });
    expect(pose.position.toArray()).toEqual(from.position.toArray());
    expect(pose.target.distanceTo(to.target)).toBeLessThan(1e-12);
    expect(pose.fov).toBe(45);
  });

  it('follows an explicit control point through both ends', () => {
    const control = new Vector3(2, 3, -1);
    const start = interpolateViewpoint(from, to, uniformProgress(0), { control });
    const mid = interpolateViewpoint(from, to, uniformProgress(0.5), { control });
    const end = interpolateViewpoint(from, to, uniformProgress(1), { control });
    expect(start.position.distanceTo(from.position)).toBeLessThan(1e-12);
    expect(end.position.distanceTo(to.position)).toBeLessThan(1e-12);
    // A quadratic Bézier's midpoint is a quarter of each end plus half the control.
    expect(mid.position.distanceTo(new Vector3(2, 2, -0.5))).toBeLessThan(1e-12);
    expect(control.toArray()).toEqual([2, 3, -1]);
  });

  it('does not mutate its inputs', () => {
    interpolateViewpoint(from, to, uniformProgress(0.5), { lift: 0.3 });
    expect(from.position.toArray()).toEqual([0, 1, 0]);
  });
});

describe('pcLegProgress', () => {
  it('turns the look-at onto the glass by 82 % of an arrival, then only settles', () => {
    expect(pcLegProgress(0, 'arriving')).toEqual({ position: 0, target: 0, fov: 0 });
    expect(pcLegProgress(0.82, 'arriving').target).toBe(1);
    expect(pcLegProgress(0.81, 'arriving').target).toBeLessThan(1);
    expect(pcLegProgress(0.9, 'arriving').target).toBe(1);
    expect(pcLegProgress(0.9, 'arriving').position).toBeLessThan(1);
    expect(pcLegProgress(1, 'arriving')).toEqual({ position: 1, target: 1, fov: 1 });
  });

  it('stands up first when departing, then looks round', () => {
    expect(pcLegProgress(0.18, 'departing').target).toBe(0);
    expect(pcLegProgress(0.18, 'departing').position).toBeGreaterThan(0);
    expect(pcLegProgress(0.19, 'departing').target).toBeGreaterThan(0);
    expect(pcLegProgress(1, 'departing')).toEqual({ position: 1, target: 1, fov: 1 });
  });

  it.each(['arriving', 'departing'] as const)('never overshoots while %s', (leg) => {
    let previous = pcLegProgress(0, leg);
    for (let i = 1; i <= 100; i++) {
      const progress = pcLegProgress(i / 100, leg);
      for (const part of ['position', 'target', 'fov'] as const) {
        expect(progress[part]).toBeGreaterThanOrEqual(previous[part]);
        expect(progress[part]).toBeLessThanOrEqual(1);
      }
      previous = progress;
    }
  });
});

describe('the crane onto the desk', () => {
  /** The chair in front of the desk (room.glb, measured by ray casting): its back's footprint and top. */
  const CHAIR_BACK = { minX: -1.9, maxX: -0.8, minZ: -0.8, maxZ: -0.5, topY: 1.075 };
  const RIM = { minX: -1.518, maxX: -1.162, minY: 0.929, maxY: 1.213, z: -1.679 };
  /** pc-base.glb's CRT shell, around the glass. */
  const SHELL = new Box3(new Vector3(-1.57, 0.785, -2.086), new Vector3(-1.11, 1.268, -1.654));
  const PC = { facing: new Vector3(0, 0, 1), rim: RIM, shellBounds: SHELL };

  function clearanceOverChair(start: Viewpoint, end: Viewpoint, leg: 'arriving' | 'departing'): number {
    const pc = leg === 'arriving' ? end : start;
    const other = leg === 'arriving' ? start : end;
    const control = craneControl(pc.position, other.position);
    let clearance = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 1000; i++) {
      const { position } = interpolateViewpoint(start, end, pcLegProgress(i / 1000, leg), { control });
      const overChair =
        position.x > CHAIR_BACK.minX &&
        position.x < CHAIR_BACK.maxX &&
        position.z > CHAIR_BACK.minZ &&
        position.z < CHAIR_BACK.maxZ;
      if (overChair) clearance = Math.min(clearance, position.y - CHAIR_BACK.topY);
    }
    return clearance;
  }

  it('places the control halfway across, above the higher eye, at the desk', () => {
    const control = craneControl(new Vector3(-1.34, 1.06, -1.03), new Vector3(-0.55, 1.62, 2.1));
    expect(control.x).toBeCloseTo(-0.945, 12);
    expect(control.y).toBeCloseTo(1.67, 12);
    expect(control.z).toBe(-1.03);
  });

  it.each([
    ['tall', 390 / 844],
    ['mid', 0.9],
    ['wide', 1440 / 900],
  ])('stays at least 15 cm above the chair back from the %s room view', (_name, aspect) => {
    const room = roomViewpoint(aspect);
    const pc = pcViewpoint(PC, aspect);
    expect(clearanceOverChair(room, pc, 'arriving')).toBeGreaterThanOrEqual(0.15);
    expect(clearanceOverChair(pc, room, 'departing')).toBeGreaterThanOrEqual(0.15);
  });
});

describe('fovForAspect', () => {
  it('keeps the base FOV on wide screens', () => {
    expect(fovForAspect(60, 80, 16 / 9, 90)).toBe(60);
  });

  it('widens on portrait screens to keep enough of the room in view, up to a cap', () => {
    const portrait = fovForAspect(60, 60, 0.5, 100);
    expect(portrait).toBeGreaterThan(60);
    const horizontal = 2 * Math.atan(Math.tan((portrait * Math.PI) / 360) * 0.5);
    expect((horizontal * 180) / Math.PI).toBeCloseTo(60);
    expect(fovForAspect(60, 80, 0.3, 85)).toBe(85);
  });
});
