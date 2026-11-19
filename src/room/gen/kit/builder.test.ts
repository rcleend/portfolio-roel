import { describe, expect, it } from 'vitest';
import { MeshBuilder, type Ring, spline, type Vec3 } from './builder';

/** The signed volume a closed, outward-facing triangle soup encloses. */
function volume(positions: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.subarray(i, i + 9) as unknown as number[];
    sum +=
      ((ax as number) * ((by as number) * (cz as number) - (bz as number) * (cy as number)) +
        (ay as number) * ((bz as number) * (cx as number) - (bx as number) * (cz as number)) +
        (az as number) * ((bx as number) * (cy as number) - (by as number) * (cx as number))) /
      6;
  }
  return sum;
}

describe('spline', () => {
  it('passes through its points, with the asked pieces between each two', () => {
    const points: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [2, 1, 3],
    ];
    const path = spline(points, 4);
    expect(path).toHaveLength(3 * 4 + 1);
    points.forEach((point, i) => {
      for (let k = 0; k < 3; k++) expect((path[i * 4] as Vec3)[k]).toBeCloseTo(point[k] as number, 9);
    });
  });
});

describe('tube', () => {
  it('sweeps a closed, outward-facing tube of the asked radius along a bent path', () => {
    const builder = new MeshBuilder();
    const path = spline(
      [
        [0, 0, 0],
        [0.1, 0, 0],
        [0.2, 0.05, 0],
        [0.2, 0.05, 0.1],
      ],
      6,
    );
    const radius = 0.004;
    builder.tube(path, radius, 8, [1, 1, 1]);
    // Two triangles a side a piece, and a fan at each end.
    expect(builder.triangles).toBe((path.length - 1) * 8 * 2 + 2 * 8);
    const { positions, normals } = builder.finish();
    // Every vertex but the caps' middles is one radius from the path.
    for (let i = 0; i < positions.length; i += 3) {
      const p: Vec3 = [positions[i] as number, positions[i + 1] as number, positions[i + 2] as number];
      const nearest = Math.min(...path.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])));
      expect(nearest).toBeLessThanOrEqual(radius + 1e-6);
      expect(Number.isFinite(normals[i] as number)).toBe(true);
    }
    let run = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const [p, q] = [path[i] as Vec3, path[i + 1] as Vec3];
      run += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    }
    // An octagon's area against the circle's, bends aside: positive means it faces outwards.
    const full = Math.PI * radius * radius * run;
    expect(volume(positions)).toBeGreaterThan(full * 0.8);
    expect(volume(positions)).toBeLessThan(full);
  });

  it('takes a radius that changes along the path', () => {
    const builder = new MeshBuilder();
    builder.tube(
      [
        [0, 0, 0],
        [0, 0, 1],
      ],
      (along) => 0.1 + along * 0.1,
      12,
      [1, 1, 1],
      1,
      false,
    );
    const { positions } = builder.finish();
    for (let i = 0; i < positions.length; i += 3) {
      const z = positions[i + 2] as number;
      expect(Math.hypot(positions[i] as number, positions[i + 1] as number)).toBeCloseTo(0.1 + z * 0.1, 5);
    }
  });
});

describe('skin', () => {
  it('closes a run of rings into one outward-facing body', () => {
    const builder = new MeshBuilder();
    const square = (z: number, half: number): Ring => [
      [-half, -half, z],
      [half, -half, z],
      [half, half, z],
      [-half, half, z],
    ];
    builder.skin([square(0, 1), square(1, 1), square(3, 1)], [1, 1, 1]);
    expect(builder.triangles).toBe(2 * 4 * 2 + 2 * 4);
    expect(volume(builder.finish().positions)).toBeCloseTo(12, 5);
  });

  it('leaves its ends open when asked', () => {
    const builder = new MeshBuilder();
    const ring = (z: number): Ring => [
      [0, 0, z],
      [1, 0, z],
      [0, 1, z],
    ];
    builder.skin([ring(0), ring(1)], [1, 1, 1], 1, false);
    expect(builder.triangles).toBe(6);
  });
});

describe('extrude', () => {
  // An L: a shape that turns inwards, 3 m² of it.
  const L: [number, number][] = [
    [0, 0],
    [2, 0],
    [2, 1],
    [1, 1],
    [1, 2],
    [0, 2],
  ];

  it('pulls an outline that turns inwards into a closed, outward-facing body', () => {
    const builder = new MeshBuilder();
    builder.extrude(L, 0, 0.5, [1, 1, 1]);
    expect(volume(builder.finish().positions)).toBeCloseTo(1.5, 9);
    // The same body whichever way round the outline was given.
    const reversed = new MeshBuilder();
    reversed.extrude([...L].reverse(), 0, 0.5, [1, 1, 1]);
    expect(volume(reversed.finish().positions)).toBeCloseTo(1.5, 9);
  });

  it('cuts the front face at the grid, so no triangle of it is longer than a cell', () => {
    const builder = new MeshBuilder();
    builder.extrude(L, 0, 0.5, [1, 1, 1], { grid: 0.25, back: false });
    const { positions } = builder.finish();
    let front = 0;
    for (let i = 0; i < positions.length; i += 9) {
      const zs = [positions[i + 2], positions[i + 5], positions[i + 8]] as number[];
      if (zs.some((z) => z !== 0.5)) continue;
      front++;
      const xs = [positions[i], positions[i + 3], positions[i + 6]] as number[];
      const ys = [positions[i + 1], positions[i + 4], positions[i + 7]] as number[];
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(0.25 + 1e-6);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(0.25 + 1e-6);
    }
    // 48 cells of two triangles.
    expect(front).toBe(96);
  });

  it('rounds its rims and carries a relief on the front face', () => {
    const plain = new MeshBuilder();
    plain.extrude(L, 0, 0.5, [1, 1, 1], { bevel: 0.05, steps: 3 });
    const rounded = volume(plain.finish().positions);
    expect(rounded).toBeLessThan(1.5);
    expect(rounded).toBeGreaterThan(1.4);
    const dished = new MeshBuilder();
    dished.extrude(L, 0, 0.5, [1, 1, 1], { grid: 0.25, relief: (x) => -0.1 * x });
    const { positions } = dished.finish();
    // Every point is on the back face or the side's foot (z 0), or on the tilted front.
    for (let i = 0; i < positions.length; i += 3) {
      const [x, z] = [positions[i] as number, positions[i + 2] as number];
      if (z !== 0) expect(z).toBeCloseTo(0.5 - 0.1 * x, 5);
    }
    // The L under a front that falls 0.1 m a metre: 1.5 less the wedge it loses.
    expect(volume(positions)).toBeCloseTo(1.5 - 0.1 * (2 * 1 * 1 + 1 * 1 * 0.5), 6);
  });
});

describe('shaded', () => {
  it('multiplies the shade of what is built inside it, vertex by vertex, and nothing after', () => {
    const builder = new MeshBuilder();
    builder.shaded(
      ([, y]) => (y > 0.5 ? 1 : 0.5),
      () => builder.tri([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 1], 0.8),
    );
    builder.tri([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 1], 0.8);
    const shade = [...builder.finish().shade].map((value) => Math.round(value * 100) / 100);
    expect(shade).toEqual([0.4, 0.4, 0.8, 0.8, 0.8, 0.8]);
  });
});

describe('toned', () => {
  it('multiplies the albedo of what is built inside it, vertex by vertex, and nothing after', () => {
    const builder = new MeshBuilder();
    builder.toned(
      ([x]) => (x > 0.5 ? 0.5 : 1),
      () => builder.tri([0, 0, 0], [1, 0, 0], [0, 1, 0], [0.8, 0.4, 0.2]),
    );
    builder.tri([0, 0, 0], [1, 0, 0], [0, 1, 0], [0.8, 0.4, 0.2]);
    const albedo = [...builder.finish().albedo].map((value) => Math.round(value * 100) / 100);
    expect(albedo.slice(0, 9)).toEqual([0.8, 0.4, 0.2, 0.4, 0.2, 0.1, 0.8, 0.4, 0.2]);
    expect(albedo.slice(9)).toEqual([0.8, 0.4, 0.2, 0.8, 0.4, 0.2, 0.8, 0.4, 0.2]);
  });
});

describe('plate', () => {
  const square: [number, number][] = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
  ];
  // Wound the other way, as a hole may be given.
  const hole: [number, number][] = [
    [0.5, 0.5],
    [0.5, 1.5],
    [1.5, 1.5],
    [1.5, 0.5],
  ];
  const area = (positions: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < positions.length; i += 9) {
      const [ax, ay, bx, by, cx, cy] = [0, 1, 3, 4, 6, 7].map((k) => positions[i + k] as number) as number[];
      const twice =
        ((bx as number) - (ax as number)) * ((cy as number) - (ay as number)) -
        ((cx as number) - (ax as number)) * ((by as number) - (ay as number));
      // Every triangle faces +z.
      expect(twice).toBeGreaterThan(0);
      sum += twice / 2;
    }
    return sum;
  };

  it('fills a face around its holes, with every corner of every loop a vertex', () => {
    const builder = new MeshBuilder();
    builder.plate([square, hole], 0.25, [1, 1, 1], { grid: 0.4 });
    const { positions } = builder.finish();
    expect(area(positions)).toBeCloseTo(3, 6);
    const corners = new Set<string>();
    for (let i = 0; i < positions.length; i += 3) {
      expect(positions[i + 2]).toBeCloseTo(0.25, 6);
      corners.add(`${(positions[i] as number).toFixed(3)},${(positions[i + 1] as number).toFixed(3)}`);
    }
    for (const [x, y] of [...square, ...hole]) expect(corners.has(`${x.toFixed(3)},${y.toFixed(3)}`)).toBe(true);
    // Nothing of it inside the hole.
    for (let i = 0; i < positions.length; i += 9) {
      const x = ((positions[i] as number) + (positions[i + 3] as number) + (positions[i + 6] as number)) / 3;
      const y = ((positions[i + 1] as number) + (positions[i + 4] as number) + (positions[i + 7] as number)) / 3;
      expect(x > 0.5 && x < 1.5 && y > 0.5 && y < 1.5).toBe(false);
    }
  });

  it('carries a relief', () => {
    const builder = new MeshBuilder();
    builder.plate([square, hole], 0, [1, 1, 1], { relief: (x, y) => 0.1 * x - 0.2 * y });
    const { positions } = builder.finish();
    for (let i = 0; i < positions.length; i += 3)
      expect(positions[i + 2]).toBeCloseTo(0.1 * (positions[i] as number) - 0.2 * (positions[i + 1] as number), 6);
  });
});
