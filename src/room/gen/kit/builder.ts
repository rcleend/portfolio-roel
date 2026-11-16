/**
 * The builder kit: props are functions that add placed primitives to a MeshBuilder, which hands back flat typed arrays
 * (position, normal, albedo, shade). No three.js here: the generators run in a worker and their output is transferred.
 */
export type Vec3 = readonly [number, number, number];
/** Linear RGB albedo. */
export type Rgb = readonly [number, number, number];

export interface MeshData {
  /** Three floats a vertex, three vertices a triangle (not indexed). */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** Linear albedo a vertex. */
  readonly albedo: Float32Array;
  /** Occlusion the part knows about itself (a recess, a slot), 0–1, multiplied into the ambient light. */
  readonly shade: Float32Array;
}

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** A rigid placement: rotation (row-major 3 × 3) then translation. */
export interface Placement {
  readonly rotation: readonly number[];
  readonly offset: Vec3;
}
export const IDENTITY: Placement = { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [0, 0, 0] };

/** A turn of `yaw` about +y, `pitch` about +x and `roll` about +z (applied roll, pitch, yaw), then a move to `offset`. */
export function place(offset: Vec3, yaw = 0, pitch = 0, roll = 0): Placement {
  const [cy, sy, cp, sp, cr, sr] = [
    Math.cos(yaw),
    Math.sin(yaw),
    Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(roll),
    Math.sin(roll),
  ];
  // R = Ry · Rx · Rz
  return {
    rotation: [
      cy * cr + sy * sp * sr,
      -cy * sr + sy * sp * cr,
      sy * cp,
      cp * sr,
      cp * cr,
      -sp,
      -sy * cr + cy * sp * sr,
      sy * sr + cy * sp * cr,
      cy * cp,
    ],
    offset,
  };
}

function apply(p: Placement, v: Vec3): Vec3 {
  const r = p.rotation as number[];
  return [
    (r[0] as number) * v[0] + (r[1] as number) * v[1] + (r[2] as number) * v[2] + p.offset[0],
    (r[3] as number) * v[0] + (r[4] as number) * v[1] + (r[5] as number) * v[2] + p.offset[1],
    (r[6] as number) * v[0] + (r[7] as number) * v[1] + (r[8] as number) * v[2] + p.offset[2],
  ];
}

/** `outer` after `inner`. */
export function compose(outer: Placement, inner: Placement): Placement {
  const a = outer.rotation as number[];
  const b = inner.rotation as number[];
  const rotation: number[] = [];
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < 3; column++)
      rotation.push(
        (a[row * 3] as number) * (b[column] as number) +
          (a[row * 3 + 1] as number) * (b[3 + column] as number) +
          (a[row * 3 + 2] as number) * (b[6 + column] as number),
      );
  return { rotation, offset: apply(outer, inner.offset) };
}

/** Which way a lofted or capped surface faces: away from a point, towards it, or along a direction. */
export type Facing = { readonly from: Vec3 } | { readonly towards: Vec3 } | { readonly along: Vec3 };

export type Ring = readonly Vec3[];

export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly albedo: number[] = [];
  private readonly shade: number[] = [];
  private placement: Placement = IDENTITY;

  get triangles(): number {
    return this.positions.length / 9;
  }

  /** Runs `build` with everything it adds placed by `placement` (nested placements compose). */
  placed(placement: Placement, build: () => void): void {
    const previous = this.placement;
    this.placement = compose(previous, placement);
    build();
    this.placement = previous;
  }

  tri(a: Vec3, b: Vec3, c: Vec3, color: Rgb, shade = 1): void {
    // A triangle without area (a lathe's pole, a ring that closes on its axis) has no normal and draws nothing.
    if (length(cross(sub(b, a), sub(c, a))) < 1e-12) return;
    for (const point of [a, b, c]) {
      const p = apply(this.placement, point);
      this.positions.push(p[0], p[1], p[2]);
      this.albedo.push(color[0], color[1], color[2]);
      this.shade.push(shade);
    }
  }

  /** a, b, c, d counter-clockwise seen from the side the quad faces. */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Rgb, shade = 1): void {
    this.tri(a, b, c, color, shade);
    this.tri(a, c, d, color, shade);
  }

  /** Joins two rings of the same length with quads, wound to face `facing`. */
  loft(a: Ring, b: Ring, facing: Facing, color: Rgb, shade = 1): void {
    const n = a.length;
    const triangles: [Vec3, Vec3, Vec3][] = [];
    let agreement = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const [a0, a1, b0, b1] = [a[i] as Vec3, a[j] as Vec3, b[i] as Vec3, b[j] as Vec3];
      for (const t of [
        [a0, a1, b1],
        [a0, b1, b0],
      ] as [Vec3, Vec3, Vec3][]) {
        const normal = cross(sub(t[1], t[0]), sub(t[2], t[0]));
        const centre = scale(add(add(t[0], t[1]), t[2]), 1 / 3);
        agreement += dot(normal, wanted(facing, centre));
        triangles.push(t);
      }
    }
    for (const [p, q, r] of triangles)
      agreement >= 0 ? this.tri(p, q, r, color, shade) : this.tri(p, r, q, color, shade);
  }

  /** Closes a ring with a fan about its centre, facing `direction`. */
  cap(ring: Ring, direction: Vec3, color: Rgb, shade = 1): void {
    const centre = scale(
      ring.reduce<Vec3>((sum, p) => add(sum, p), [0, 0, 0]),
      1 / ring.length,
    );
    const probe = cross(sub(ring[0] as Vec3, centre), sub(ring[1] as Vec3, centre));
    const flip = dot(probe, direction) < 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i] as Vec3;
      const q = ring[(i + 1) % ring.length] as Vec3;
      flip ? this.tri(centre, q, p, color, shade) : this.tri(centre, p, q, color, shade);
    }
  }

  /** An axis-aligned box; `faces` leaves sides out (`-x`, `+y`, ...). */
  box(min: Vec3, max: Vec3, color: Rgb, shade = 1, skip: readonly string[] = []): void {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const side = (name: string, a: Vec3, b: Vec3, c: Vec3, d: Vec3) => {
      if (!skip.includes(name)) this.quad(a, b, c, d, color, shade);
    };
    side('-x', [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    side('+x', [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    side('-y', [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    side('+y', [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    side('-z', [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    side('+z', [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  }

  /**
   * A long box cut into lengths of about `segment` metres along its longest side, so light baked at its vertices can
   * change along it (a window bar crossed by a blind's shadow, a table leg in a lamp's pool).
   */
  beam(min: Vec3, max: Vec3, color: Rgb, shade = 1, segment = 0.1): void {
    const size = sub(max, min);
    const axis = size[0] >= size[1] && size[0] >= size[2] ? 0 : size[1] >= size[2] ? 1 : 2;
    const pieces = Math.max(1, Math.round(size[axis] / segment));
    const name = ['x', 'y', 'z'][axis];
    for (let i = 0; i < pieces; i++) {
      const low = [min[0], min[1], min[2]] as [number, number, number];
      const high = [max[0], max[1], max[2]] as [number, number, number];
      low[axis] = min[axis] + (size[axis] * i) / pieces;
      high[axis] = min[axis] + (size[axis] * (i + 1)) / pieces;
      const skip = [...(i > 0 ? [`-${name}`] : []), ...(i < pieces - 1 ? [`+${name}`] : [])];
      this.box(low, high, color, shade, skip);
    }
  }

  /**
   * A box with rounded edges: a rounded rectangle in the plane across `axis`, lofted along it with a bevel of `radius`
   * at both ends.
   */
  roundedBox(min: Vec3, max: Vec3, radius: number, color: Rgb, shade = 1, axis: 0 | 1 | 2 = 1, steps = 3): void {
    const u = ((axis + 1) % 3) as 0 | 1 | 2;
    const v = ((axis + 2) % 3) as 0 | 1 | 2;
    const r = Math.min(radius, (max[u] - min[u]) / 2, (max[v] - min[v]) / 2, (max[axis] - min[axis]) / 2);
    const centre: Vec3 = scale(add(min, max), 0.5);
    const at = (along: number, inset: number): Ring =>
      roundedRect(
        min[u] + inset,
        max[u] - inset,
        min[v] + inset,
        max[v] - inset,
        Math.max(r - inset, r * 0.2),
        steps,
      ).map(([a, b]) => {
        const p: [number, number, number] = [0, 0, 0];
        p[axis] = along;
        p[u] = a;
        p[v] = b;
        return p;
      });
    const centreUp = [0, 0, 0] as [number, number, number];
    centreUp[axis] = 1;
    const centreDown = [0, 0, 0] as [number, number, number];
    centreDown[axis] = -1;
    // The bottom bevel from the flat cap out to the side, the side, and the top bevel mirrored.
    const bottom: Ring[] = [];
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * (Math.PI / 2);
      bottom.push(at(min[axis] + r * (1 - Math.cos(angle)), r * (1 - Math.sin(angle))));
    }
    const top = bottom.map((ring) => ring.map((p) => mirror(p, axis, min[axis] + max[axis])));
    this.cap(bottom[0] as Ring, centreDown, color, shade);
    for (let i = 0; i < steps; i++) this.loft(bottom[i] as Ring, bottom[i + 1] as Ring, { from: centre }, color, shade);
    this.loft(bottom[steps] as Ring, top[steps] as Ring, { from: centre }, color, shade);
    for (let i = steps; i > 0; i--) this.loft(top[i] as Ring, top[i - 1] as Ring, { from: centre }, color, shade);
    this.cap(top[0] as Ring, centreUp, color, shade);
  }

  /** A cylinder or cone from `a` to `b` with radii `ra` and `rb`; `caps` closes the ends. */
  cylinder(a: Vec3, b: Vec3, ra: number, rb: number, segments: number, color: Rgb, shade = 1, caps = true): void {
    const axis = normalize(sub(b, a));
    const [side, up] = basis(axis);
    const ring = (centre: Vec3, radius: number): Ring =>
      Array.from({ length: segments }, (_, i) => {
        const angle = (i / segments) * Math.PI * 2;
        return add(centre, add(scale(side, Math.cos(angle) * radius), scale(up, Math.sin(angle) * radius)));
      });
    const ringA = ring(a, ra);
    const ringB = ring(b, rb);
    const middle = scale(add(a, b), 0.5);
    this.loft(ringA, ringB, { from: middle }, color, shade);
    if (!caps) return;
    if (ra > 0) this.cap(ringA, scale(axis, -1), color, shade);
    if (rb > 0) this.cap(ringB, axis, color, shade);
  }

  /** A surface of revolution about the axis through `origin` along `axis`: `profile` is (radius, height) pairs. */
  lathe(
    origin: Vec3,
    axis: Vec3,
    profile: readonly (readonly [number, number])[],
    segments: number,
    color: Rgb,
    shade = 1,
  ): void {
    const n = normalize(axis);
    const [side, up] = basis(n);
    const rings = profile.map(([radius, height]) =>
      Array.from({ length: segments }, (_, i) => {
        const angle = (i / segments) * Math.PI * 2;
        return add(
          add(origin, scale(n, height)),
          add(scale(side, Math.cos(angle) * radius), scale(up, Math.sin(angle) * radius)),
        );
      }),
    );
    for (let i = 0; i + 1 < rings.length; i++) {
      const [r0, h0] = profile[i] as readonly [number, number];
      const [r1, h1] = profile[i + 1] as readonly [number, number];
      // Outward of the profile's own direction: the surface faces away from the axis at its mid height.
      const mid = add(origin, scale(n, (h0 + h1) / 2));
      if (r0 === 0 && r1 === 0) continue;
      this.loft(rings[i] as Ring, rings[i + 1] as Ring, { from: mid }, color, shade);
    }
  }

  /** A UV sphere. */
  sphere(centre: Vec3, radius: number, segments: number, color: Rgb, shade = 1): void {
    const stacks = Math.max(4, Math.round(segments / 2));
    const profile: [number, number][] = [];
    for (let i = 0; i <= stacks; i++) {
      const angle = (i / stacks) * Math.PI;
      profile.push([Math.max(0, Math.sin(angle)) * radius, -Math.cos(angle) * radius]);
    }
    const rings = profile.map(([r, h]) =>
      Array.from({ length: segments }, (_, i): Vec3 => {
        const angle = (i / segments) * Math.PI * 2;
        return [centre[0] + Math.cos(angle) * r, centre[1] + h, centre[2] + Math.sin(angle) * r];
      }),
    );
    for (let i = 0; i + 1 < rings.length; i++)
      this.loft(rings[i] as Ring, rings[i + 1] as Ring, { from: centre }, color, shade);
  }

  /** A crumpled ball: a sphere whose surface is pushed in and out by a seeded amount at every vertex. */
  blob(centre: Vec3, radius: number, segments: number, roughness: number, seed: number, color: Rgb, shade = 1): void {
    const stacks = Math.max(3, Math.round(segments / 2));
    const bump = (i: number, j: number): number => {
      const pole = i === 0 || i === stacks ? 0 : j % segments;
      let h = (Math.imul(i + 1, 73856093) ^ Math.imul(pole + 1, 19349663) ^ Math.imul(seed + 1, 83492791)) >>> 0;
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
      return 1 + (((h ^ (h >>> 13)) >>> 0) / 4294967296 - 0.5) * 2 * roughness;
    };
    const rings: Ring[] = [];
    for (let i = 0; i <= stacks; i++) {
      const polar = (i / stacks) * Math.PI;
      rings.push(
        Array.from({ length: segments }, (_, j): Vec3 => {
          const around = (j / segments) * Math.PI * 2;
          const r = radius * bump(i, j);
          return [
            centre[0] + Math.sin(polar) * Math.cos(around) * r,
            centre[1] - Math.cos(polar) * r,
            centre[2] + Math.sin(polar) * Math.sin(around) * r,
          ];
        }),
      );
    }
    for (let i = 0; i < stacks; i++) this.loft(rings[i] as Ring, rings[i + 1] as Ring, { from: centre }, color, shade);
  }

  /** The finished mesh, its normals smoothed across edges shallower than `creaseDegrees`. */
  finish(creaseDegrees = 38): MeshData {
    const positions = new Float32Array(this.positions);
    return {
      positions,
      normals: creasedNormals(positions, creaseDegrees),
      albedo: new Float32Array(this.albedo),
      shade: new Float32Array(this.shade),
    };
  }
}

function wanted(facing: Facing, centre: Vec3): Vec3 {
  if ('from' in facing) return sub(centre, facing.from);
  if ('towards' in facing) return sub(facing.towards, centre);
  return facing.along;
}

function mirror(p: Vec3, axis: 0 | 1 | 2, sum: number): Vec3 {
  const q: [number, number, number] = [p[0], p[1], p[2]];
  q[axis] = sum - q[axis];
  return q;
}

/** Two unit vectors that make a right-handed frame with `axis`. */
export function basis(axis: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const side = normalize(cross(helper, axis));
  return [side, cross(axis, side)];
}

/** A rounded rectangle as (a, b) pairs, counter-clockwise, `steps` segments a corner. */
export function roundedRect(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  radius: number,
  steps = 6,
): [number, number][] {
  const r = Math.max(0, Math.min(radius, (a1 - a0) / 2, (b1 - b0) / 2));
  const corners: [number, number, number][] = [
    [a1 - r, b0 + r, -Math.PI / 2],
    [a1 - r, b1 - r, 0],
    [a0 + r, b1 - r, Math.PI / 2],
    [a0 + r, b0 + r, Math.PI],
  ];
  const points: [number, number][] = [];
  for (const [ca, cb, start] of corners)
    for (let i = 0; i <= steps; i++) {
      const angle = start + (i / steps) * (Math.PI / 2);
      points.push([ca + Math.cos(angle) * r, cb + Math.sin(angle) * r]);
    }
  return points;
}

/**
 * Per-vertex normals for a triangle soup: each vertex takes the area-weighted normals of the triangles that share its
 * position and whose face turns less than `creaseDegrees` from its own.
 */
export function creasedNormals(positions: Float32Array, creaseDegrees: number): Float32Array {
  const count = positions.length / 3;
  const faces = new Float32Array(positions.length);
  for (let t = 0; t < count; t += 3) {
    const o = t * 3;
    const ax = (positions[o + 3] as number) - (positions[o] as number);
    const ay = (positions[o + 4] as number) - (positions[o + 1] as number);
    const az = (positions[o + 5] as number) - (positions[o + 2] as number);
    const bx = (positions[o + 6] as number) - (positions[o] as number);
    const by = (positions[o + 7] as number) - (positions[o + 1] as number);
    const bz = (positions[o + 8] as number) - (positions[o + 2] as number);
    const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx] as const;
    for (let k = 0; k < 3; k++) faces.set(n, o + k * 3);
  }
  // Vertices by position, on a 20 µm lattice.
  const groups = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const key = `${Math.round((positions[i * 3] as number) * 5e4)},${Math.round((positions[i * 3 + 1] as number) * 5e4)},${Math.round((positions[i * 3 + 2] as number) * 5e4)}`;
    const group = groups.get(key);
    if (group) group.push(i);
    else groups.set(key, [i]);
  }
  const limit = Math.cos((creaseDegrees * Math.PI) / 180);
  const normals = new Float32Array(positions.length);
  for (const group of groups.values()) {
    for (const i of group) {
      const [fx, fy, fz] = [faces[i * 3] as number, faces[i * 3 + 1] as number, faces[i * 3 + 2] as number];
      const fl = Math.hypot(fx, fy, fz) || 1;
      let [x, y, z] = [0, 0, 0];
      for (const j of group) {
        const [gx, gy, gz] = [faces[j * 3] as number, faces[j * 3 + 1] as number, faces[j * 3 + 2] as number];
        const gl = Math.hypot(gx, gy, gz) || 1;
        if ((fx * gx + fy * gy + fz * gz) / (fl * gl) < limit) continue;
        x += gx;
        y += gy;
        z += gz;
      }
      const l = Math.hypot(x, y, z) || 1;
      normals[i * 3] = x / l;
      normals[i * 3 + 1] = y / l;
      normals[i * 3 + 2] = z / l;
    }
  }
  return normals;
}
