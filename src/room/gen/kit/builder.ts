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
  private occlusion: ((point: Vec3) => number) | null = null;

  get triangles(): number {
    return this.positions.length / 9;
  }

  /**
   * Moves into this builder every triangle of `from`, from its triangle `first` on, whose three corners `inside`
   * holds: a part of a prop that must be a mesh of its own (the computer's monitor), whatever its generator added it to.
   */
  take(from: MeshBuilder, first: number, inside: (point: Vec3) => boolean): void {
    const kept = { positions: [] as number[], albedo: [] as number[], shade: [] as number[] };
    for (let triangle = first; triangle < from.triangles; triangle++) {
      const at = triangle * 9;
      let all = true;
      for (let corner = 0; corner < 3; corner++)
        all &&= inside(from.positions.slice(at + corner * 3, at + corner * 3 + 3) as unknown as Vec3);
      const [positions, albedo, shade] = all
        ? [this.positions, this.albedo, this.shade]
        : [kept.positions, kept.albedo, kept.shade];
      positions.push(...from.positions.slice(at, at + 9));
      albedo.push(...from.albedo.slice(at, at + 9));
      shade.push(...from.shade.slice(triangle * 3, triangle * 3 + 3));
    }
    from.positions.length = first * 9;
    from.albedo.length = first * 9;
    from.shade.length = first * 3;
    from.positions.push(...kept.positions);
    from.albedo.push(...kept.albedo);
    from.shade.push(...kept.shade);
  }

  /** Runs `build` with everything it adds placed by `placement` (nested placements compose). */
  placed(placement: Placement, build: () => void): void {
    const previous = this.placement;
    this.placement = compose(previous, placement);
    build();
    this.placement = previous;
  }

  /**
   * Runs `build` with the shade of every vertex it adds multiplied by `occlusion` at that vertex, in the coordinates
   * the primitives are given in (before any placement): the dark a moulded part gathers under itself, changing
   * smoothly over one surface.
   */
  shaded(occlusion: (point: Vec3) => number, build: () => void): void {
    const previous = this.occlusion;
    this.occlusion = previous ? (point) => occlusion(point) * previous(point) : occlusion;
    build();
    this.occlusion = previous;
  }

  tri(a: Vec3, b: Vec3, c: Vec3, color: Rgb, shade = 1): void {
    // A triangle without area (a lathe's pole, a ring that closes on its axis) has no normal and draws nothing.
    if (length(cross(sub(b, a), sub(c, a))) < 1e-12) return;
    for (const point of [a, b, c]) {
      const p = apply(this.placement, point);
      this.positions.push(p[0], p[1], p[2]);
      this.albedo.push(color[0], color[1], color[2]);
      this.shade.push(this.occlusion ? shade * this.occlusion(point) : shade);
    }
  }

  /**
   * A triangle with its own colour (and shade) at each corner: a tone that changes across one surface (a leaf's
   * midrib, a worn edge, cloth), which one colour a triangle would cut into facets.
   */
  gradient(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    colors: readonly [Rgb, Rgb, Rgb],
    shades: readonly [number, number, number] = [1, 1, 1],
  ): void {
    if (length(cross(sub(b, a), sub(c, a))) < 1e-12) return;
    [a, b, c].forEach((point, corner) => {
      const p = apply(this.placement, point);
      const color = colors[corner] as Rgb;
      const shade = shades[corner] as number;
      this.positions.push(p[0], p[1], p[2]);
      this.albedo.push(color[0], color[1], color[2]);
      this.shade.push(this.occlusion ? shade * this.occlusion(point) : shade);
    });
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

  /**
   * A skin over a run of rings of one length (a moulded grip, a pad's body): each joined to the next, facing away from
   * the run's own middle line, and the two ends closed with fans where `caps` asks.
   */
  skin(rings: readonly Ring[], color: Rgb, shade = 1, caps = true): void {
    const centres = rings.map(centroid);
    for (let i = 0; i + 1 < rings.length; i++) {
      const middle = scale(add(centres[i] as Vec3, centres[i + 1] as Vec3), 0.5);
      this.loft(rings[i] as Ring, rings[i + 1] as Ring, { from: middle }, color, shade);
    }
    const last = rings.length - 1;
    if (!caps || last < 1) return;
    this.cap(rings[0] as Ring, sub(centres[0] as Vec3, centres[1] as Vec3), color, shade);
    this.cap(rings[last] as Ring, sub(centres[last] as Vec3, centres[last - 1] as Vec3), color, shade);
  }

  /**
   * A round tube swept along `path` (a cable): a ring of `sides` points at every point of the path, carried along it
   * without twisting. `radius` is one number, or a function of how far along the path a point is (0–1 by count).
   */
  tube(
    path: readonly Vec3[],
    radius: number | ((along: number) => number),
    sides: number,
    color: Rgb,
    shade = 1,
    caps = true,
  ): void {
    const n = path.length;
    if (n < 2) return;
    const tangent = (i: number): Vec3 =>
      normalize(sub(path[Math.min(n - 1, i + 1)] as Vec3, path[Math.max(0, i - 1)] as Vec3));
    let side = basis(tangent(0))[0];
    const rings: Ring[] = [];
    for (let i = 0; i < n; i++) {
      const t = tangent(i);
      // The last ring's side, laid into this ring's plane: the frame turns only as much as the path does.
      const laid = sub(side, scale(t, dot(side, t)));
      side = length(laid) > 1e-6 ? normalize(laid) : basis(t)[0];
      const up = cross(t, side);
      const r = typeof radius === 'number' ? radius : radius(i / (n - 1));
      const centre = path[i] as Vec3;
      rings.push(
        Array.from({ length: sides }, (_, k): Vec3 => {
          const angle = (k / sides) * Math.PI * 2;
          return add(centre, add(scale(side, Math.cos(angle) * r), scale(up, Math.sin(angle) * r)));
        }),
      );
    }
    this.skin(rings, color, shade, caps);
  }

  /**
   * A flat shape with thickness (a guitar's body, a scratch plate): `outline`, (x, y) pairs that may turn inwards,
   * pulled along z from `z0` to `z1`, both rims rounded over `bevel` in `steps` rings, and both faces filled in rows
   * cut every `grid` metres, so light baked at the vertices can change across a face. `relief` moves the front
   * (`z1`) face along z, point by point (an arm's contour); `back: false` leaves the `z0` face open.
   */
  extrude(
    outline: readonly (readonly [number, number])[],
    z0: number,
    z1: number,
    color: Rgb,
    options: {
      readonly bevel?: number;
      readonly steps?: number;
      readonly grid?: number;
      readonly relief?: (x: number, y: number) => number;
      readonly back?: boolean;
    } = {},
    shade = 1,
  ): void {
    const { steps = 2, grid = Infinity, relief, back = true } = options;
    const bevel = Math.max(0, Math.min(options.bevel ?? 0, (z1 - z0) / 2));
    const ccw = signedArea(outline) >= 0 ? outline : [...outline].reverse();
    const front = (x: number, y: number, z: number): Vec3 => [x, y, z + (relief ? relief(x, y) : 0)];
    const rear = (x: number, y: number, z: number): Vec3 => [x, y, z];
    // The rings from the back face's rim, round its bevel, up the side and round the front's.
    const rings: Ring[] = [];
    const turns = bevel > 0 ? steps : 0;
    for (let i = 0; i <= turns; i++) {
      const angle = turns ? (i / turns) * (Math.PI / 2) : 0;
      const ring = inset(ccw, bevel * (1 - Math.sin(angle)));
      rings.push(ring.map(([x, y]) => rear(x, y, z0 + bevel * (1 - Math.cos(angle)))));
    }
    for (let i = turns; i >= 0; i--) {
      const angle = turns ? (i / turns) * (Math.PI / 2) : 0;
      const ring = inset(ccw, bevel * (1 - Math.sin(angle)));
      rings.push(ring.map(([x, y]) => front(x, y, z1 - bevel * (1 - Math.cos(angle)))));
    }
    const n = ccw.length;
    for (let r = 0; r + 1 < rings.length; r++) {
      const [a, b] = [rings[r] as Ring, rings[r + 1] as Ring];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.quad(a[i] as Vec3, a[j] as Vec3, b[j] as Vec3, b[i] as Vec3, color, shade);
      }
    }
    const face = inset(ccw, bevel);
    fillRows(face, grid, (p, q, r) =>
      this.tri(front(p[0], p[1], z1), front(q[0], q[1], z1), front(r[0], r[1], z1), color, shade),
    );
    if (back)
      fillRows(face, Infinity, (p, q, r) =>
        this.tri(rear(p[0], p[1], z0), rear(r[0], r[1], z0), rear(q[0], q[1], z0), color, shade),
      );
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

function centroid(ring: Ring): Vec3 {
  return scale(
    ring.reduce<Vec3>((sum, p) => add(sum, p), [0, 0, 0]),
    1 / ring.length,
  );
}

/**
 * A smooth path through `points` (a Catmull-Rom spline), `steps` pieces between each two: what a cable's few
 * hand-placed points become before `tube` sweeps them.
 */
export function spline(points: readonly Vec3[], steps: number): Vec3[] {
  const at = (i: number): Vec3 => points[Math.max(0, Math.min(points.length - 1, i))] as Vec3;
  const path: Vec3[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const [t2, t3] = [t * t, t * t * t];
      path.push(
        [0, 1, 2].map(
          (k) =>
            0.5 *
            (2 * (p1[k] as number) +
              ((p2[k] as number) - (p0[k] as number)) * t +
              (2 * (p0[k] as number) - 5 * (p1[k] as number) + 4 * (p2[k] as number) - (p3[k] as number)) * t2 +
              (3 * (p1[k] as number) - (p0[k] as number) - 3 * (p2[k] as number) + (p3[k] as number)) * t3),
        ) as unknown as Vec3,
      );
    }
  }
  if (points.length > 0) path.push(at(points.length - 1));
  return path;
}

type Point = readonly [number, number];

function signedArea(outline: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < outline.length; i++) {
    const [p, q] = [outline[i] as Point, outline[(i + 1) % outline.length] as Point];
    sum += p[0] * q[1] - q[0] * p[1];
  }
  return sum / 2;
}

/** A counter-clockwise outline moved `distance` inwards along its corners' bisectors (outwards: negative). */
export function inset(outline: readonly Point[], distance: number): Point[] {
  if (distance === 0) return [...outline];
  const n = outline.length;
  return outline.map((p, i) => {
    const [before, after] = [outline[(i + n - 1) % n] as Point, outline[(i + 1) % n] as Point];
    const a = unit(p[1] - before[1], before[0] - p[0]);
    const b = unit(after[1] - p[1], p[0] - after[0]);
    const mid = unit(a[0] + b[0], a[1] + b[1]);
    // A mitre, held to twice the distance at a sharp corner.
    const reach = distance / Math.max(0.5, mid[0] * a[0] + mid[1] * a[1]);
    return [p[0] - mid[0] * reach, p[1] - mid[1] * reach];
  });
}

function unit(x: number, y: number): Point {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

/**
 * Fills a counter-clockwise outline with triangles (counter-clockwise too), in rows between its corners' heights and
 * the lines of a `grid`: every row is a run of trapezoids, each cut at the grid's uprights, so no triangle is longer
 * than the grid and rows share their points.
 */
function fillRows(outline: readonly Point[], grid: number, emit: (p: Point, q: Point, r: Point) => void): void {
  const n = outline.length;
  const heights = outline.map((p) => p[1]);
  const [low, high] = [Math.min(...heights), Math.max(...heights)];
  if (Number.isFinite(grid))
    for (let y = Math.ceil(low / grid) * grid; y < high; y += grid) if (y > low) heights.push(y);
  heights.sort((a, b) => a - b);
  const levels = heights.filter((y, i) => i === 0 || y - (heights[i - 1] as number) > 1e-9);
  // A level's points between two walls: the walls, the grid's uprights and any corner of the outline lying between.
  const row = (y: number, from: number, to: number): Point[] => {
    const xs = [from, to];
    if (Number.isFinite(grid)) for (let x = Math.ceil(from / grid) * grid; x < to; x += grid) xs.push(x);
    for (const p of outline) if (Math.abs(p[1] - y) <= 1e-9) xs.push(p[0]);
    xs.sort((a, b) => a - b);
    const kept = xs.filter((x, i) => x >= from && x <= to && (i === 0 || x - (xs[i - 1] as number) > 1e-9));
    return kept.map((x) => [x, y]);
  };
  for (let l = 0; l + 1 < levels.length; l++) {
    const [y0, y1] = [levels[l] as number, levels[l + 1] as number];
    const middle = (y0 + y1) / 2;
    // The walls crossing this row: where each stands at its foot and at its head.
    const walls: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const [p, q] = [outline[i] as Point, outline[(i + 1) % n] as Point];
      if (Math.min(p[1], q[1]) > middle || Math.max(p[1], q[1]) <= middle) continue;
      const at = (y: number) => p[0] + ((q[0] - p[0]) * (y - p[1])) / (q[1] - p[1]);
      walls.push([at(y0), at(y1)]);
    }
    walls.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
    for (let w = 0; w + 1 < walls.length; w += 2) {
      const [left, right] = [walls[w] as [number, number], walls[w + 1] as [number, number]];
      const foot = row(y0, left[0], right[0]);
      const head = row(y1, left[1], right[1]);
      let [i, j] = [0, 0];
      while (i + 1 < foot.length || j + 1 < head.length) {
        const forward =
          j + 1 >= head.length || (i + 1 < foot.length && (foot[i + 1] as Point)[0] <= (head[j + 1] as Point)[0]);
        if (forward) emit(foot[i] as Point, foot[++i] as Point, head[j] as Point);
        else emit(foot[i] as Point, head[j + 1] as Point, head[j++] as Point);
      }
    }
  }
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
  // Vertices by position, on a 20 µm lattice: an open-addressed table of lattice points, each the head of a list of
  // its vertices in order (a Map of strings took most of the build's time).
  let size = 1024;
  while (size < count * 2) size *= 2;
  const slot = new Int32Array(size).fill(-1);
  const lattice = new Int32Array(count * 3);
  const tail = new Int32Array(count);
  const following = new Int32Array(count).fill(-1);
  const first = new Int32Array(count).fill(-1);
  for (let i = 0; i < count; i++) {
    const x = Math.round((positions[i * 3] as number) * 5e4);
    const y = Math.round((positions[i * 3 + 1] as number) * 5e4);
    const z = Math.round((positions[i * 3 + 2] as number) * 5e4);
    lattice[i * 3] = x;
    lattice[i * 3 + 1] = y;
    lattice[i * 3 + 2] = z;
    let at = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & (size - 1);
    for (;;) {
      const head = slot[at] as number;
      if (head < 0) {
        slot[at] = i;
        tail[i] = i;
        first[i] = i;
        break;
      }
      if (lattice[head * 3] === x && lattice[head * 3 + 1] === y && lattice[head * 3 + 2] === z) {
        following[tail[head] as number] = i;
        tail[head] = i;
        first[i] = head;
        break;
      }
      at = (at + 1) & (size - 1);
    }
  }
  const limit = Math.cos((creaseDegrees * Math.PI) / 180);
  const normals = new Float32Array(positions.length);
  const lengths = new Float32Array(count);
  for (let i = 0; i < count; i++)
    lengths[i] = Math.hypot(faces[i * 3] as number, faces[i * 3 + 1] as number, faces[i * 3 + 2] as number) || 1;
  for (let i = 0; i < count; i++) {
    const [fx, fy, fz] = [faces[i * 3] as number, faces[i * 3 + 1] as number, faces[i * 3 + 2] as number];
    const fl = lengths[i] as number;
    let [x, y, z] = [0, 0, 0];
    for (let j = first[i] as number; j >= 0; j = following[j] as number) {
      const [gx, gy, gz] = [faces[j * 3] as number, faces[j * 3 + 1] as number, faces[j * 3 + 2] as number];
      if ((fx * gx + fy * gy + fz * gz) / (fl * (lengths[j] as number)) < limit) continue;
      x += gx;
      y += gy;
      z += gz;
    }
    const l = Math.hypot(x, y, z) || 1;
    normals[i * 3] = x / l;
    normals[i * 3 + 1] = y / l;
    normals[i * 3 + 2] = z / l;
  }
  return normals;
}
